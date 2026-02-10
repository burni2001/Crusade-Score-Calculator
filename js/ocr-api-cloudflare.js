// ============================================================================
// OCR API MODULE - CLOUDFLARE WORKER VERSION
// Handles communication with OCR.space API via Cloudflare Worker proxy
// API keys are stored server-side on Cloudflare - never exposed to clients
// ============================================================================

"use strict";

const OCRApi = {
    // Your Cloudflare Worker URL (replace with your actual worker URL)
    workerUrl: "https://crusade-ocr-proxy.burni2001.workers.dev/",

    // Discord Activity proxy path (must match URL mapping in Discord Developer Portal)
    // Configure in Developer Portal → Activities → URL Mappings:
    //   Prefix: /ocr-proxy  →  Target: crusade-ocr-proxy.burni2001.workers.dev
    discordProxyPath: "/.proxy/ocr-proxy/",

    /**
     * Get the appropriate API URL based on environment.
     * Discord Activities block external fetches via CSP — route through proxy.
     * @returns {string} The URL to use for OCR API calls
     */
    getApiUrl() {
        const isDiscord = (typeof window !== 'undefined' &&
            window.discordIntegration && window.discordIntegration.isInDiscord()) ||
            (typeof DiscordSDK !== 'undefined');
        return isDiscord ? this.discordProxyPath : this.workerUrl;
    },
    
    /**
     * Split image into left (mission header) and right (stats) halves
     * Right half is upscaled for better number recognition
     * @param {string} dataUrl - Base64 image data URL
     * @param {number} maxSizeKB - Maximum size per half in KB
     * @returns {Promise<{left: string, right: string}>} Split images as base64
     */
    async splitImage(dataUrl, maxSizeKB = 900) {
        return new Promise((resolve) => {
            const img = new Image();
            img.onload = function () {
                const origWidth = img.width;
                const origHeight = img.height;
                const splitX = Math.round(origWidth * 0.5);

                // LEFT HALF (mission header) - original size
                const leftCanvas = document.createElement("canvas");
                const leftCtx = leftCanvas.getContext("2d");
                leftCanvas.width = splitX;
                leftCanvas.height = origHeight;
                leftCtx.drawImage(img, 0, 0, splitX, origHeight, 0, 0, splitX, origHeight);
                
                let leftQuality = 0.85;
                let leftResult = leftCanvas.toDataURL("image/jpeg", leftQuality);
                while (leftResult.length > maxSizeKB * 1024 * 1.37 && leftQuality > 0.4) {
                    leftQuality -= 0.1;
                    leftResult = leftCanvas.toDataURL("image/jpeg", leftQuality);
                }

                // RIGHT HALF (stats panel) - cropped and upscaled
                const rightCanvas = document.createElement("canvas");
                const rightCtx = rightCanvas.getContext("2d");
                const rightWidth = origWidth - splitX;

                // Aggressive crop: keep only middle 80% vertically, right 90% horizontally
                const statsX = Math.round(rightWidth * 0.05);
                const statsY = Math.round(origHeight * 0.1);
                const statsWidth = Math.round(rightWidth * 0.9);
                const statsHeight = Math.round(origHeight * 0.75);

                // Upscale to 1200px width for better OCR
                const targetWidth = 1200;
                const scale = targetWidth / statsWidth;
                const targetHeight = Math.round(statsHeight * scale);

                rightCanvas.width = targetWidth;
                rightCanvas.height = targetHeight;
                rightCtx.drawImage(img, splitX + statsX, statsY, statsWidth, statsHeight, 
                                 0, 0, targetWidth, targetHeight);

                let rightQuality = 0.9;
                let rightResult = rightCanvas.toDataURL("image/jpeg", rightQuality);
                while (rightResult.length > maxSizeKB * 1024 * 1.37 && rightQuality > 0.4) {
                    rightQuality -= 0.1;
                    rightResult = rightCanvas.toDataURL("image/jpeg", rightQuality);
                }

                resolve({ left: leftResult, right: rightResult });
            };
            img.src = dataUrl;
        });
    },

    /**
     * Call OCR API via Cloudflare Worker proxy
     * @param {string} base64Image - Base64 encoded image
     * @param {number} keyIndex - Which API key to use (0 or 1)
     * @param {boolean} useTable - Enable table detection
     * @param {boolean} isRetry - Whether this is a retry attempt
     * @returns {Promise<string>} Parsed text from image
     */
    async callAPI(base64Image, keyIndex = 0, useTable = false, isRetry = false) {
        const formData = new FormData();
        formData.append("base64Image", base64Image);
        formData.append("language", "eng");
        formData.append("isOverlayRequired", "false");
        formData.append("OCREngine", "2");
        formData.append("scale", "true");
        formData.append("keyIndex", keyIndex.toString()); // Tell worker which key to use
        if (useTable) formData.append("isTable", "true");

        // Call Cloudflare Worker (via Discord proxy when in Activity iframe)
        const apiUrl = this.getApiUrl();
        let response;
        try {
            response = await fetch(apiUrl, {
                method: "POST",
                body: formData,
            });
        } catch (networkError) {
            // CSP or network block — common in Discord Activities if proxy is misconfigured
            const isDiscord = apiUrl === this.discordProxyPath;
            if (isDiscord) {
                throw new Error('OCR request blocked by Discord. Verify the /ocr-proxy URL mapping is configured in the Discord Developer Portal.');
            }
            throw new Error('Network error contacting OCR service. Please check your connection.');
        }

        if (!response.ok) {
            throw new Error(`OCR service returned HTTP ${response.status}`);
        }

        const result = await response.json();

        if (result.IsErroredOnProcessing) {
            const errorMsg = result.ErrorMessage || "OCR processing failed";
            if ((errorMsg.includes("limit") || errorMsg.includes("Invalid API")) && !isRetry) {
                throw new Error(`${errorMsg} [RETRY_WITH_FALLBACK]`);
            }
            throw new Error(errorMsg);
        }

        if (result.ParsedResults && result.ParsedResults.length > 0) {
            return result.ParsedResults[0].ParsedText;
        }
        return "";
    },

    /**
     * Process screenshot with dual-pass OCR
     * @param {File} file - Image file to process
     * @param {Function} statusCallback - Callback for status updates
     * @param {Function} progressCallback - Callback for progress updates
     * @returns {Promise<string>} Combined OCR text from both passes
     */
    async processScreenshot(file, statusCallback, progressCallback) {
        let keyIndex = 0;

        return new Promise((resolve, reject) => {
            // Validate file
            if (!file || !file.type.startsWith('image/')) {
                reject(new Error('Invalid file type. Please upload an image.'));
                return;
            }
            
            if (file.size > 10 * 1024 * 1024) {
                reject(new Error('File too large. Maximum size is 10MB.'));
                return;
            }

            const reader = new FileReader();
            
            // Set timeout BEFORE starting async work
            const timeout = setTimeout(() => {
                reader.abort();
                reject(new Error('OCR timeout. Please try a smaller image.'));
            }, 60000);
            
            reader.onload = async (e) => {
                try {
                    const base64Image = e.target.result;
                    if (!base64Image) throw new Error('Failed to read image file');

                    // Dual-pass OCR via Cloudflare Worker
                    progressCallback("Splitting image...");
                    const { left, right } = await this.splitImage(base64Image);

                    // Pass 1: Left half (headers)
                    progressCallback("OCR: left half (headers)...");
                    let leftText = "";
                    try {
                        leftText = await this.callAPI(left, keyIndex, false, false);
                    } catch (err) {
                        if (err.message.includes("RETRY_WITH_FALLBACK") && keyIndex === 0) {
                            keyIndex = 1;
                            progressCallback("Retrying with backup key...");
                            try {
                                leftText = await this.callAPI(left, keyIndex, false, true);
                            } catch (retryErr) {
                                throw new Error('OCR service unavailable. Please try again later.');
                            }
                        } else {
                            throw err;
                        }
                    }

                    // Pass 2: Right half (stats)
                    progressCallback("OCR: right half (stats)...");
                    let rightText = "";
                    try {
                        rightText = await this.callAPI(right, keyIndex, true, keyIndex > 0);
                    } catch (err) {
                        progressCallback("Warning: Stats detection may be incomplete");
                    }

                    const combinedText = `[LEFT]\n${leftText}\n[RIGHT]\n${rightText}`;
                    progressCallback("OCR complete");
                    
                    clearTimeout(timeout);
                    resolve(combinedText);
                    
                } catch (error) {
                    clearTimeout(timeout);
                    reject(error);
                }
            };

            reader.onerror = (error) => {
                clearTimeout(timeout);
                reject(new Error('Failed to read file. Please try again.'));
            };
            
            reader.readAsDataURL(file);
        });
    }
};

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { OCRApi };
} else {
    window.OCRApi = OCRApi;
}
