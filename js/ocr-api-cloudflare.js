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
     * Detect if running inside a Discord Activity iframe.
     * Uses multiple signals since the Discord SDK global may not be available.
     * @returns {boolean}
     */
    _isDiscordActivity() {
        if (typeof window === 'undefined') return false;

        // Signal 1: Discord integration already initialized successfully
        if (window.discordIntegration && window.discordIntegration.isInDiscord()) return true;

        // Signal 2: Discord SDK global exists
        if (typeof DiscordSDK !== 'undefined') return true;

        // Signal 3: Discord Activity iframe passes these query params
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.has('frame_id') && params.has('instance_id')) return true;
        } catch (_) { /* ignore */ }

        // Signal 4: Hostname matches Discord's Activity proxy domain
        try {
            if (window.location.hostname.endsWith('.discordsays.com')) return true;
        } catch (_) { /* ignore */ }

        // Signal 5: Running in a cross-origin iframe (Discord Activities are always cross-origin)
        try {
            if (window.self !== window.top) {
                // Try accessing parent — will throw SecurityError if cross-origin
                void window.top.location.href;
            }
        } catch (_) {
            // SecurityError means cross-origin iframe — likely Discord
            return true;
        }

        return false;
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
     * Build the request body for the OCR API call.
     * Always uses FormData (multipart/form-data) which the Cloudflare Worker accepts
     * and avoids the size inflation of URL-encoding base64 data.
     * @param {string} base64Image - Base64 encoded image
     * @param {number} keyIndex - Which API key to use
     * @param {boolean} useTable - Enable table detection
     * @returns {{body: FormData, headers: undefined}}
     */
    _buildRequestBody(base64Image, keyIndex, useTable) {
        const formData = new FormData();
        formData.append("base64Image", base64Image);
        formData.append("language", "eng");
        formData.append("isOverlayRequired", "false");
        formData.append("OCREngine", "2");
        formData.append("scale", "true");
        formData.append("keyIndex", keyIndex.toString());
        if (useTable) formData.append("isTable", "true");
        return { body: formData, headers: undefined };
    },

    /**
     * Attempt a single fetch to the given URL.
     * @param {string} url - Endpoint to call
     * @param {string} base64Image - Base64 encoded image
     * @param {number} keyIndex - Which API key to use
     * @param {boolean} useTable - Enable table detection
     * @returns {Promise<Response>} fetch Response
     */
    async _fetchOCR(url, base64Image, keyIndex, useTable) {
        const { body } = this._buildRequestBody(base64Image, keyIndex, useTable);
        return fetch(url, { method: "POST", body });
    },

    /**
     * Call OCR API via Cloudflare Worker proxy.
     * In Discord Activities, tries the proxy path first, then falls back to the
     * direct Worker URL (which succeeds if CSP connect-src allows it).
     * Outside Discord, tries the direct Worker URL first, then the proxy as fallback.
     * @param {string} base64Image - Base64 encoded image
     * @param {number} keyIndex - Which API key to use (0 or 1)
     * @param {boolean} useTable - Enable table detection
     * @param {boolean} isRetry - Whether this is a retry attempt
     * @returns {Promise<string>} Parsed text from image
     */
    async callAPI(base64Image, keyIndex = 0, useTable = false, isRetry = false) {
        const inDiscord = this._isDiscordActivity();

        // Build ordered list of URLs to try
        // In Discord: proxy first (same-origin, CSP-safe), then direct Worker
        // Outside Discord: direct Worker first, then proxy as fallback
        const urls = inDiscord
            ? [this.discordProxyPath, this.workerUrl]
            : [this.workerUrl, this.discordProxyPath];

        let response;
        let lastError;

        for (const url of urls) {
            try {
                response = await this._fetchOCR(url, base64Image, keyIndex, useTable);
            } catch (networkError) {
                // Network / CSP block — try the next URL
                console.warn(`OCR fetch to ${url} blocked (${networkError.message}), trying next...`);
                lastError = networkError;
                response = null;
                continue;
            }

            if (response.ok) {
                // Successful response — stop trying
                break;
            }

            // Non-OK status — log details and try the next URL
            let errorBody = '';
            try { errorBody = await response.text(); } catch (_) { /* ignore */ }
            console.warn(`OCR HTTP ${response.status} from ${url} — body: ${errorBody.slice(0, 200)}`);
            lastError = new Error(`OCR service returned HTTP ${response.status}`);
            response = null;
        }

        if (!response || !response.ok) {
            if (inDiscord) {
                throw new Error(
                    'OCR unavailable in Discord. Ensure the Cloudflare Worker is deployed ' +
                    '(see cloudflare-worker/ in this repo) and the Discord URL mapping is set: ' +
                    '/ocr-proxy → crusade-ocr-proxy.burni2001.workers.dev'
                );
            }
            throw lastError || new Error('OCR service unavailable');
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
