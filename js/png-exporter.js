// ============================================================================
// PNG EXPORT MODULE
// Handles screenshot generation for mission data and aggregated statistics
// Uses html2canvas to capture DOM sections and export as downloadable images
//
// Discord flow: PNG → upload to Cloudflare Worker → short URL → open in browser
// Web flow:     PNG → direct download via anchor tag
// ============================================================================

"use strict";

const PNGExporter = {
    // ========================================================================
    // CONFIGURATION
    // Width consistency: All exports use captureWidth (1100px) as the standard
    // container width to ensure identical PNG dimensions regardless of content.
    // ========================================================================

    config: {
        captureWidth: 1100,        // Standard container width for all PNG exports
        bodyWidth: 1120,           // Temporary body width during capture
        windowWidth: 1100,         // html2canvas window width (matches captureWidth)
        scale: 2,                  // Image quality multiplier (2x for quality)
        backgroundColor: '#000000', // Background color for canvas
        settleDelay: 150           // ms to wait for DOM settling after modifications
    },

    // Cloudflare Worker image host URLs
    // Direct URL is used for non-Discord and returned in upload responses
    // Proxy path is used inside Discord Activity iframe (CSP-safe same-origin)
    imageHost: {
        workerUrl: "https://crusade-image-host.burni2001.workers.dev",
        discordProxyPath: "/.proxy/image-host"
    },

    // Pending images collected in Discord mode (programmatic downloads don't work in iframe)
    _pendingImages: [],

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Export mission data screen (Squad Performance Matrix + Additional Statistics)
     * @param {string} buttonSelector - CSS selector for the export button (for feedback)
     * @returns {Promise<void>}
     */
    async exportMissionScreen(buttonSelector = null) {
        return this._exportScreen({
            sectionSelectors: [
                {
                    containerSelector: '#page-2 .section',
                    titleMatch: 'SQUAD PERFORMANCE MATRIX'
                },
                {
                    containerSelector: '#page-2 .section',
                    titleMatch: 'ADDITIONAL STATISTICS'
                }
            ],
            filenamePrefix: 'Mission_Summary',
            buttonSelector: buttonSelector,
            buttonText: {
                processing: 'CAPTURING...',
                success: '✓ CAPTURED',
                fallback: 'Export Mission (PNG)'
            },
            // Match aggregated screen width for consistency
            useStandardWidth: true
        });
    },

    /**
     * Export a single mission's data from its stored CSV string.
     * Builds off-screen DOM with mission parameters and tables, then captures as PNG.
     * @param {Object} slot - Mission slot object {name, difficulty, csv, ...}
     * @param {number} index - Mission index (for filename)
     * @returns {Promise<void>}
     */
    async exportMissionFromCSV(slot, index) {
        let captureContainer = null;
        let originalBodyWidth = "";

        try {
            // 1. Build mission parameter info from CSV
            const lines = slot.csv.split('\n');
            const missionParams = this._parseMissionParams(lines);

            // 2. Build HTML tables from CSV
            const matrixHtml = this._csvSectionToHtml(lines, "SQUAD PERFORMANCE MATRIX");
            const statsHtml = this._csvSectionToHtml(lines, "ADDITIONAL STATISTICS");

            // 3. Create off-screen container
            captureContainer = document.createElement('div');
            captureContainer.style.cssText = `
                position: fixed;
                top: -9999px;
                left: -9999px;
                width: ${this.config.captureWidth}px;
                min-width: ${this.config.captureWidth}px;
                max-width: ${this.config.captureWidth}px;
                background-color: #050a05;
                border: 4px solid #3d4c3d;
                padding: 20px;
                box-sizing: border-box;
                font-family: 'VT323', monospace;
                color: #80cc80;
            `;

            // 4. Add mission header
            const header = document.createElement('div');
            header.style.cssText = `
                background-color: #040a04;
                color: #20c020;
                padding: 8px;
                font-weight: bold;
                text-align: center;
                margin-bottom: 12px;
                border: 1px solid #20c020;
                font-size: 18px;
            `;
            header.textContent = `RUN ${index + 1}: ${(slot.name || 'Unknown Mission').toUpperCase()}`;
            captureContainer.appendChild(header);

            // 5. Add mission parameters
            const paramsDiv = document.createElement('div');
            paramsDiv.style.cssText = `
                margin-bottom: 15px;
                padding: 8px 12px;
                border: 1px solid #3d4c3d;
                background-color: #0a140a;
                font-size: 14px;
                line-height: 1.6;
            `;
            paramsDiv.innerHTML = `
                <span style="color:#20c020;">Difficulty:</span> ${this._escapeHtml(missionParams.difficulty)} &nbsp;|&nbsp;
                <span style="color:#20c020;">Waves:</span> ${this._escapeHtml(missionParams.waves)} &nbsp;|&nbsp;
                <span style="color:#20c020;">Objective:</span> ${this._escapeHtml(missionParams.objective)} &nbsp;|&nbsp;
                <span style="color:#20c020;">Geneseed:</span> ${this._escapeHtml(missionParams.geneseed)} &nbsp;|&nbsp;
                <span style="color:#20c020;">Armoury:</span> ${this._escapeHtml(missionParams.armoury)}
            `;
            captureContainer.appendChild(paramsDiv);

            // 6. Add Squad Performance Matrix section
            const matrixSection = this._buildTableSection('SQUAD PERFORMANCE MATRIX', matrixHtml);
            captureContainer.appendChild(matrixSection);

            // 7. Add Additional Statistics section
            const statsSection = this._buildTableSection('ADDITIONAL STATISTICS', statsHtml);
            statsSection.style.marginTop = '15px';
            captureContainer.appendChild(statsSection);

            document.body.appendChild(captureContainer);

            // 8. Temporarily adjust body width
            originalBodyWidth = document.body.style.width;
            document.body.style.width = `${this.config.bodyWidth}px`;

            // 9. Wait for DOM to settle
            await this._delay(this.config.settleDelay);

            // 10. Verify html2canvas
            if (typeof html2canvas === 'undefined') {
                throw new Error('Screenshot library not loaded. Please refresh the page.');
            }

            // 11. Capture
            const canvas = await html2canvas(captureContainer, {
                scale: this.config.scale,
                backgroundColor: this.config.backgroundColor,
                windowWidth: this.config.windowWidth,
                useCORS: true,
                logging: false
            });

            // 12. Download (awaits upload in Discord mode)
            const safeName = (slot.name || 'mission').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            await this._downloadCanvas(canvas, `Run_${index + 1}_${safeName}`);

        } catch (err) {
            this._handleError(err, `PNG Export Mission ${index + 1}`);
            throw err;
        } finally {
            this._cleanup(captureContainer, originalBodyWidth);
        }
    },

    /**
     * Export aggregated data screen (Aggregated Squad Matrix + Aggregated Statistics)
     * @param {string} buttonSelector - CSS selector for the export button (for feedback)
     * @returns {Promise<void>}
     */
    async exportAggregatedScreen(buttonSelector = '#btn-record-png') {
        return this._exportScreen({
            sectionSelectors: [
                {
                    containerSelector: '#page-3 .section',
                    titleMatch: 'AGGREGATED SQUAD MATRIX'
                },
                {
                    containerSelector: '#page-3 .section',
                    titleMatch: 'AGGREGATED STATISTICS'
                }
            ],
            filenamePrefix: 'Aggregated_Data',
            buttonSelector: buttonSelector,
            buttonText: {
                processing: 'CAPTURING...',
                success: '✓ CAPTURED',
                fallback: 'Record Aggregated Data'
            },
            // Match mission screen width for consistency
            useStandardWidth: true
        });
    },

    // ========================================================================
    // CORE EXPORT LOGIC
    // ========================================================================

    /**
     * Core screenshot export logic (DRY - used by both public methods)
     * @private
     */
    async _exportScreen(options) {
        const { sectionSelectors, filenamePrefix, buttonSelector, buttonText, useStandardWidth = false } = options;

        let btn = null;
        let originalText = "";
        let captureContainer = null;
        let originalBodyWidth = "";

        try {
            // 1. Setup button feedback
            btn = document.querySelector(buttonSelector) ||
                  document.getElementById('export-png-btn');

            originalText = btn ? btn.innerText : buttonText.fallback;
            if (btn) btn.innerText = buttonText.processing;

            // 2. Find target sections
            const sections = this._findSections(sectionSelectors);

            if (sections.length !== sectionSelectors.length) {
                throw new Error(`Required sections not found. Found ${sections.length}/${sectionSelectors.length}`);
            }

            // 3. Create temporary capture container with appropriate width
            captureContainer = this._createCaptureContainer(sections, useStandardWidth);
            document.body.appendChild(captureContainer);

            // 4. Temporarily adjust body width for consistent capture
            originalBodyWidth = document.body.style.width;
            document.body.style.width = `${this.config.bodyWidth}px`;

            // 5. Wait for DOM to settle
            await this._delay(this.config.settleDelay);

            // 6. Verify html2canvas is loaded
            if (typeof html2canvas === 'undefined') {
                throw new Error('Screenshot library not loaded. Please refresh the page.');
            }

            // 7. Capture screenshot
            const canvas = await html2canvas(captureContainer, {
                scale: this.config.scale,
                backgroundColor: this.config.backgroundColor,
                windowWidth: this.config.windowWidth,
                useCORS: true,
                logging: false
            });

            // 8. Download image (awaits upload in Discord mode)
            await this._downloadCanvas(canvas, filenamePrefix);

            // 9. Show modal in Discord (after upload is complete)
            if (this._isDiscord() && this._pendingImages.length > 0) {
                this.showExportModal();
            }

            // 10. Success feedback
            if (btn) {
                btn.innerText = buttonText.success;
                setTimeout(() => {
                    if (btn) btn.innerText = originalText;
                }, 2000);
            }

        } catch (err) {
            // Error handling
            this._handleError(err, 'PNG Export');
            alert("Failed to capture screen. Please try again or check your browser permissions.");
            if (btn) btn.innerText = originalText || buttonText.fallback;

        } finally {
            // Cleanup
            this._cleanup(captureContainer, originalBodyWidth);
        }
    },

    // ========================================================================
    // HELPER FUNCTIONS
    // ========================================================================

    /**
     * Find DOM sections matching the provided selectors
     * @private
     */
    _findSections(sectionSelectors) {
        const foundSections = [];

        sectionSelectors.forEach(({ containerSelector, titleMatch }) => {
            const allSections = document.querySelectorAll(containerSelector);

            for (const section of allSections) {
                const header = section.querySelector('.section-header');
                if (header && header.textContent.includes(titleMatch)) {
                    foundSections.push(section);
                    break;
                }
            }
        });

        return foundSections;
    },

    /**
     * Create temporary container for capturing sections
     * @private
     */
    _createCaptureContainer(sections, useStandardWidth = false) {
        const container = document.createElement('div');

        // Force exact width for consistency
        if (useStandardWidth) {
            container.style.cssText = `
                position: fixed;
                top: -9999px;
                left: -9999px;
                width: ${this.config.captureWidth}px;
                min-width: ${this.config.captureWidth}px;
                max-width: ${this.config.captureWidth}px;
                background-color: #050a05;
                border: 4px solid #3d4c3d;
                padding: 20px;
                box-sizing: border-box;
            `;
        } else {
            container.style.cssText = `
                position: fixed;
                top: -9999px;
                left: -9999px;
                width: ${this.config.captureWidth}px;
                background-color: #050a05;
                border: 4px solid #3d4c3d;
                padding: 20px;
                box-sizing: border-box;
            `;
        }

        // Clone sections and add to container
        sections.forEach((section, index) => {
            const cloned = section.cloneNode(true);

            // Force table to fill container width when using standard width
            if (useStandardWidth) {
                cloned.style.padding = '0';
                cloned.style.margin = index === 0 ? '0 0 0 0' : '15px 0 0 0';

                const tables = cloned.querySelectorAll('table');
                tables.forEach(table => {
                    table.style.width = '100%';
                    table.style.tableLayout = 'fixed';
                });

                const tableContainers = cloned.querySelectorAll('.score-table-container');
                tableContainers.forEach(container => {
                    container.style.width = '100%';
                    container.style.overflow = 'visible';
                });
            } else {
                if (index === 0) {
                    cloned.style.marginBottom = '0';
                } else {
                    cloned.style.marginTop = '15px';
                }
            }

            container.appendChild(cloned);
        });

        return container;
    },

    /**
     * Download canvas as PNG file.
     * - Web: direct download via anchor tag
     * - Discord: upload to Cloudflare Worker for short URL, store in _pendingImages
     *   Returns a Promise so callers can await the upload before showing the modal.
     * @private
     * @param {HTMLCanvasElement} canvas - Canvas to download
     * @param {string} filenamePrefix - Prefix for filename
     * @returns {Promise<void>|undefined}
     */
    _downloadCanvas(canvas, filenamePrefix) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${filenamePrefix}_${timestamp}.png`;
        const dataUrl = canvas.toDataURL('image/png');

        if (this._isDiscord()) {
            var self = this;
            // Return a Promise that resolves after upload completes (or fails).
            // The caller is responsible for calling showExportModal() when ready.
            return new Promise(function(resolve) {
                canvas.toBlob(function(blob) {
                    var image = {
                        dataUrl: dataUrl,      // For thumbnail preview in modal
                        blob: blob,            // For Web Share API fallback
                        filename: filename,
                        hostedUrl: null,       // Will be set after upload
                        uploadFailed: false
                    };
                    self._pendingImages.push(image);

                    // Upload to Cloudflare Worker, then resolve
                    self._uploadImage(blob).then(function(result) {
                        if (result && result.url) {
                            image.hostedUrl = result.url;
                            console.log('Image hosted at:', result.url);
                        } else {
                            image.uploadFailed = true;
                            console.warn('Image upload failed, will use fallback sharing');
                        }
                        resolve();
                    }).catch(function(err) {
                        image.uploadFailed = true;
                        console.warn('Image upload error:', err);
                        resolve(); // Resolve even on error so the flow continues
                    });
                }, 'image/png');
            });
        } else {
            const link = document.createElement('a');
            link.download = filename;
            link.href = dataUrl;
            link.click();
        }
    },

    // ========================================================================
    // IMAGE HOST (CLOUDFLARE WORKER)
    // ========================================================================

    /**
     * Get the upload URL for the image host.
     * In Discord Activity: use proxy path (same-origin, CSP-safe).
     * Outside Discord: use direct Worker URL.
     * @private
     * @returns {string} Upload endpoint URL
     */
    _getImageHostUploadUrl() {
        if (this._isDiscord()) {
            // In Discord, try proxy first (configured in URL Mappings)
            return this.imageHost.discordProxyPath + "/upload";
        }
        return this.imageHost.workerUrl + "/upload";
    },

    /**
     * Upload a PNG blob to the Cloudflare Worker image host.
     * Returns the hosted URL (direct Worker URL, not proxy) or null on failure.
     * Tries Discord proxy first, then direct Worker URL as fallback.
     * @private
     * @param {Blob} blob - PNG image blob
     * @returns {Promise<{url: string, id: string}|null>}
     */
    async _uploadImage(blob) {
        const urls = this._isDiscord()
            ? [this.imageHost.discordProxyPath + "/upload", this.imageHost.workerUrl + "/upload"]
            : [this.imageHost.workerUrl + "/upload"];

        for (const uploadUrl of urls) {
            try {
                const response = await fetch(uploadUrl, {
                    method: "POST",
                    headers: { "Content-Type": "image/png" },
                    body: blob
                });

                if (!response.ok) {
                    console.warn('Image host returned HTTP ' + response.status + ' from ' + uploadUrl);
                    continue;
                }

                const result = await response.json();
                if (result && result.url) {
                    return result;
                }
            } catch (err) {
                console.warn('Image upload to ' + uploadUrl + ' failed:', err.message);
                continue;
            }
        }

        return null;
    },

    // ========================================================================
    // DISCORD DETECTION
    // ========================================================================

    /**
     * Check if running inside Discord's embedded webview
     * @private
     * @returns {boolean}
     */
    _isDiscord() {
        // Method 1: Check DiscordIntegration flag (set during SDK initialization)
        if (window.discordIntegration && window.discordIntegration.isDiscordEnvironment) {
            return true;
        }

        // Method 2: Check for Discord SDK global
        if (typeof DiscordSDK !== 'undefined') {
            return true;
        }

        // Method 3: Check URL parameters (Discord Activity iframe)
        try {
            const params = new URLSearchParams(window.location.search);
            if (params.has('frame_id') && params.has('instance_id')) {
                return true;
            }
        } catch (_) { /* ignore */ }

        // Method 4: Check Discord Activity proxy hostname
        try {
            if (window.location.hostname.endsWith('.discordsays.com')) {
                return true;
            }
        } catch (_) { /* ignore */ }

        // Method 5: Check for cross-origin iframe (Discord Activities are always cross-origin)
        try {
            if (window.self !== window.top) {
                void window.top.location.href;
                try {
                    if (window.parent && window.parent.location) {
                        const parentHref = window.parent.location.href;
                        if (parentHref && (parentHref.includes('discord') || parentHref.includes('discordsays'))) {
                            return true;
                        }
                    }
                } catch (_) { /* ignore */ }
            }
        } catch (_) {
            const ua = navigator.userAgent;
            if (ua.includes('Discord') || ua.includes('Mobile')) {
                return true;
            }
        }

        return false;
    },

    // ========================================================================
    // EXPORT MODAL (DISCORD)
    // ========================================================================

    /**
     * Show the export modal with "Open in Browser" buttons.
     * Primary path: openExternalLink with hosted URL (opens in user's browser).
     * Fallback: Web Share API / clipboard copy.
     */
    showExportModal() {
        if (this._pendingImages.length === 0) return;

        let modal = document.getElementById('png-export-modal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'png-export-modal';
            modal.className = 'modal-overlay';
            document.body.appendChild(modal);
        }

        const images = this._pendingImages;
        const total = images.length;
        const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

        // Check if any images have hosted URLs (upload succeeded)
        const anyHosted = images.some(function(img) { return img.hostedUrl; });
        const anyFailed = images.some(function(img) { return img.uploadFailed; });

        let imagesHtml = '';
        images.forEach((img, idx) => {
            const escapedFilename = this._escapeHtml(img.filename);
            const hasUrl = !!img.hostedUrl;

            imagesHtml += `
                <div class="png-export-item">
                    <div class="png-export-item-header">
                        <span class="png-export-counter">${idx + 1} / ${total}</span>
                        <span class="png-export-filename">${escapedFilename}</span>
                    </div>
                    <img src="${img.dataUrl}" alt="${escapedFilename}" class="png-export-image" />
                    <div class="png-export-item-actions">
                        ${hasUrl
                            ? `<button class="btn btn-primary btn-sm btn-open-browser" data-index="${idx}">Open in Browser</button>`
                            : `<button class="btn btn-primary btn-sm btn-share-image" data-index="${idx}">Share</button>`
                        }
                        <span class="png-copy-feedback" data-feedback-index="${idx}"></span>
                    </div>
                </div>
            `;
        });

        // Instruction text based on what's available
        let instructionText;
        if (anyHosted) {
            instructionText = `${total} image${total !== 1 ? 's' : ''} captured. ` +
                (isMobile
                    ? 'Tap "Open in Browser" to view and save.'
                    : 'Click "Open in Browser" to view full-size and save.');
        } else if (anyFailed) {
            instructionText = `${total} image${total !== 1 ? 's' : ''} captured. ` +
                (isMobile
                    ? 'Tap "Share" to save or send.'
                    : 'Click "Share" to copy or download.');
        } else {
            // Still uploading
            instructionText = `${total} image${total !== 1 ? 's' : ''} captured. Uploading...`;
        }

        // "Open All in Browser" button if multiple images all have URLs
        const allHosted = images.every(function(img) { return img.hostedUrl; });
        const openAllBtn = (allHosted && total > 1)
            ? `<button id="btn-open-all-browser" class="btn btn-primary" style="margin-right:auto;">Open All in Browser</button>`
            : '';

        modal.innerHTML = `
            <div class="modal-content png-export-modal-content">
                <h3 class="text-center text-primary border-bottom pb-10 mt-0 uppercase letter-spacing-2 glow">
                    CAPTURED DATA SCREENS
                </h3>
                <p class="png-export-instructions">${instructionText}</p>
                <div class="png-export-gallery">
                    ${imagesHtml}
                </div>
                <div class="modal-buttons">
                    ${openAllBtn}
                    <button id="btn-close-png-modal" class="btn btn-danger">Close</button>
                </div>
            </div>
        `;

        // Bind event handlers
        const self = this;

        // "Open in Browser" — uses Discord SDK openExternalLink to open hosted URL
        modal.querySelectorAll('.btn-open-browser').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                const image = images[idx];
                const feedbackEl = document.querySelector('[data-feedback-index="' + idx + '"]');

                if (!image.hostedUrl) return;

                try {
                    // Try Discord SDK openExternalLink first
                    const sdk = window.discordIntegration && window.discordIntegration.discordSDK;
                    if (sdk && sdk.commands && sdk.commands.openExternalLink) {
                        await sdk.commands.openExternalLink({ url: image.hostedUrl });
                        self._showFeedback(feedbackEl, 'Opened!', true);
                        return;
                    }

                    // Fallback: window.open (may work in some contexts)
                    var win = window.open(image.hostedUrl, '_blank');
                    if (win) {
                        self._showFeedback(feedbackEl, 'Opened!', true);
                        return;
                    }

                    // Last resort: copy URL to clipboard
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        await navigator.clipboard.writeText(image.hostedUrl);
                        self._showFeedback(feedbackEl, 'URL copied! Paste in browser', true);
                        return;
                    }

                    self._showFeedback(feedbackEl, 'Could not open link', false);
                } catch (err) {
                    console.warn('Open in browser failed:', err);
                    // Try clipboard as last resort
                    try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                            await navigator.clipboard.writeText(image.hostedUrl);
                            self._showFeedback(feedbackEl, 'URL copied! Paste in browser', true);
                            return;
                        }
                    } catch (_) { /* ignore */ }
                    self._showFeedback(feedbackEl, 'Could not open link', false);
                }
            });
        });

        // "Share" fallback — Web Share API (when upload failed)
        modal.querySelectorAll('.btn-share-image').forEach(function(btn) {
            btn.addEventListener('click', async function() {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                const image = images[idx];
                const feedbackEl = document.querySelector('[data-feedback-index="' + idx + '"]');

                try {
                    var blob = image.blob;
                    var file = new File([blob], image.filename, { type: 'image/png' });

                    // Method 1: Web Share API with file
                    if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
                        await navigator.share({ files: [file], title: 'Crusade Score' });
                        self._showFeedback(feedbackEl, 'Shared!', true);
                        return;
                    }

                    // Method 2: Clipboard copy
                    if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
                        self._showFeedback(feedbackEl, 'Copied! Paste in chat', true);
                        return;
                    }

                    self._showFeedback(feedbackEl, 'Long-press image to save', false);
                } catch (err) {
                    if (err.name === 'AbortError') {
                        self._showFeedback(feedbackEl, 'Cancelled', false);
                    } else {
                        console.warn('Share failed:', err);
                        self._showFeedback(feedbackEl, 'Long-press image to save', false);
                    }
                }
            });
        });

        // "Open All in Browser" — opens each image sequentially via openExternalLink
        var openAllBtnEl = modal.querySelector('#btn-open-all-browser');
        if (openAllBtnEl) {
            openAllBtnEl.addEventListener('click', async function() {
                var sdk = window.discordIntegration && window.discordIntegration.discordSDK;
                var opened = 0;

                for (var i = 0; i < images.length; i++) {
                    var img = images[i];
                    if (!img.hostedUrl) continue;

                    try {
                        if (sdk && sdk.commands && sdk.commands.openExternalLink) {
                            await sdk.commands.openExternalLink({ url: img.hostedUrl });
                            opened++;
                        } else {
                            window.open(img.hostedUrl, '_blank');
                            opened++;
                        }
                        // Small delay between opens to avoid rate limiting
                        if (i < images.length - 1) {
                            await self._delay(300);
                        }
                    } catch (err) {
                        console.warn('Failed to open image ' + (i + 1) + ':', err);
                    }
                }

                openAllBtnEl.textContent = opened + ' opened!';
                setTimeout(function() {
                    openAllBtnEl.textContent = 'Open All in Browser';
                }, 2000);
            });
        }

        // Close modal
        modal.querySelector('#btn-close-png-modal').addEventListener('click', function() {
            modal.classList.remove('active');
            self._pendingImages = [];
        });

        modal.addEventListener('click', function(e) {
            if (e.target === modal) {
                modal.classList.remove('active');
                self._pendingImages = [];
            }
        });

        requestAnimationFrame(function() { modal.classList.add('active'); });
    },

    /**
     * Show feedback text next to a button
     * @private
     */
    _showFeedback(feedbackEl, message, success) {
        if (!feedbackEl) return;
        feedbackEl.textContent = message;
        feedbackEl.className = 'png-copy-feedback ' + (success ? 'feedback-success' : 'feedback-error');
        setTimeout(function() {
            feedbackEl.textContent = '';
            feedbackEl.className = 'png-copy-feedback';
        }, 3000);
    },

    // ========================================================================
    // DOM / UTILITY HELPERS
    // ========================================================================

    /**
     * Cleanup temporary DOM modifications
     * @private
     */
    _cleanup(container, originalBodyWidth) {
        try {
            if (container && container.parentNode) {
                document.body.removeChild(container);
            }
            document.body.style.width = originalBodyWidth;
        } catch (cleanupErr) {
            console.error('Cleanup error in PNG export:', cleanupErr);
        }
    },

    /**
     * Promise-based delay helper
     * @private
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Parse mission parameters from CSV lines
     * @private
     */
    _parseMissionParams(lines) {
        const params = { difficulty: '-', waves: '-', objective: '-', geneseed: '-', armoury: '-' };
        for (let i = 0; i < Math.min(lines.length, 30); i++) {
            const line = lines[i].trim();
            if (!line) continue;
            const matchVal = (regex) => { const m = line.match(regex); return m ? m[1].trim() : null; };
            params.difficulty = matchVal(/Difficulty[:,\s]+(.+)/i) || params.difficulty;
            params.waves = matchVal(/Waves Reached[:,\s]+(.+)/i) || params.waves;
            params.objective = matchVal(/Objective Completion[:,\s]+(.+)/i) || params.objective;
            params.geneseed = matchVal(/Geneseed Retrieved[:,\s]+(.+)/i) || params.geneseed;
            params.armoury = matchVal(/Armoury Data Retrieved[:,\s]+(.+)/i) || params.armoury;
        }
        return params;
    },

    /**
     * Convert a CSV section into an HTML table string
     * @private
     */
    _csvSectionToHtml(lines, sectionTitle) {
        const startIdx = lines.findIndex(line => line.includes(sectionTitle));
        if (startIdx === -1) return '<p>Data not found</p>';

        const cellBase = 'border:1px solid #1a331a;background-color:#0f1e0f;padding:4px;vertical-align:middle;';
        const headerBase = 'border:1px solid #1a331a;background-color:#000;padding:10px;vertical-align:middle;color:#20c020;font-size:0.9rem;line-height:1.1;';

        let html = '<table style="width:100%;border-collapse:separate;border-spacing:5px;table-layout:fixed;font-family:VT323,monospace;">';

        const headerLine = lines[startIdx + 1];
        if (headerLine) {
            const headers = headerLine.split(',');
            html += '<thead><tr>';
            html += `<th style="${headerBase}text-align:right;width:180px;padding-right:15px;">METRIC</th>`;
            for (let i = 1; i < headers.length; i++) {
                const isTotal = i === headers.length - 1;
                html += `<th style="${headerBase}text-align:center;${isTotal ? 'width:120px;' : ''}">${this._escapeHtml(headers[i].trim())}</th>`;
            }
            html += '</tr></thead>';
        }

        html += '<tbody>';
        for (let i = startIdx + 2; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line || line === "ADDITIONAL STATISTICS" || line === "MODIFIERS") break;

            const cols = line.split(',');
            const metricName = cols[0].trim();
            const isFinalScore = metricName.toLowerCase().includes('final score');
            const isScoreRow = metricName.toLowerCase().includes('base score') || metricName.toLowerCase().includes('modifier score');

            html += '<tr>';
            if (isFinalScore) {
                html += `<td style="${cellBase}text-align:right;width:180px;font-weight:bold;padding-right:15px;background-color:#000;border-top:2px solid #20c020;border-bottom:2px double #20c020;font-size:1.5rem;color:#80cc80;text-shadow:0 0 8px #20c020;">${this._escapeHtml(metricName)}</td>`;
            } else {
                html += `<td style="${cellBase}text-align:right;width:180px;font-weight:bold;padding-right:15px;background-color:#000;">${this._escapeHtml(metricName)}</td>`;
            }
            for (let j = 1; j < cols.length; j++) {
                const isTotal = j === cols.length - 1;
                if (isFinalScore) {
                    html += `<td style="${cellBase}text-align:center;font-weight:bold;font-size:1.5rem;color:#80cc80;text-shadow:0 0 8px #20c020;border-top:2px solid #20c020;border-bottom:2px double #20c020;${isTotal ? 'background-color:#000;width:120px;' : ''}">${this._escapeHtml(cols[j].trim())}</td>`;
                } else if (isTotal) {
                    html += `<td style="${cellBase}text-align:center;font-weight:bold;background-color:#000;width:120px;">${this._escapeHtml(cols[j].trim())}</td>`;
                } else if (isScoreRow) {
                    html += `<td style="${cellBase}text-align:center;font-weight:bold;">${this._escapeHtml(cols[j].trim())}</td>`;
                } else {
                    html += `<td style="${cellBase}text-align:center;">${this._escapeHtml(cols[j].trim())}</td>`;
                }
            }
            html += '</tr>';
        }
        html += '</tbody></table>';
        return html;
    },

    /**
     * Build a section element with header and table content
     * @private
     */
    _buildTableSection(title, tableHtml) {
        const section = document.createElement('div');
        const sectionHeader = document.createElement('div');
        sectionHeader.style.cssText = `
            background-color: #040a04;
            color: #20c020;
            padding: 6px;
            font-weight: bold;
            text-align: center;
            margin-bottom: 10px;
            border: 1px solid #20c020;
            font-size: 15px;
        `;
        sectionHeader.textContent = title;
        section.appendChild(sectionHeader);

        const tableContainer = document.createElement('div');
        tableContainer.style.cssText = 'width:100%;overflow:visible;';
        tableContainer.innerHTML = tableHtml;
        section.appendChild(tableContainer);

        return section;
    },

    /**
     * Escape HTML special characters
     * @private
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    },

    /**
     * Error handling wrapper
     * @private
     */
    _handleError(error, context) {
        if (typeof ErrorHandler !== 'undefined') {
            ErrorHandler.handle(error, context, false);
        } else {
            console.error(`[${context}]`, error);
        }
    }
};

// ============================================================================
// EXPORTS
// ============================================================================

// Browser / Global
if (typeof window !== 'undefined') {
    window.PNGExporter = PNGExporter;
    console.log('PNG Exporter loaded');
}

// Node.js / CommonJS (for testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PNGExporter };
}
