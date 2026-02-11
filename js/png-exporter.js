// ============================================================================
// PNG EXPORT MODULE
// Handles screenshot generation for mission data and aggregated statistics
// Uses html2canvas to capture DOM sections and export as downloadable images
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

            // 12. Download
            const safeName = (slot.name || 'mission').replace(/[^a-z0-9]/gi, '_').toLowerCase();
            this._downloadCanvas(canvas, `Run_${index + 1}_${safeName}`);

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
     * @param {Object} options - Export configuration
     * @param {Array} options.sectionSelectors - Array of {containerSelector, titleMatch}
     * @param {string} options.filenamePrefix - Prefix for downloaded file
     * @param {string} options.buttonSelector - CSS selector for feedback button
     * @param {Object} options.buttonText - Button text states
     * @param {boolean} options.useStandardWidth - Force standard width (default: false)
     * @returns {Promise<void>}
     */
    async _exportScreen(options) {
        const { sectionSelectors, filenamePrefix, buttonSelector, buttonText, useStandardWidth = false } = options;
        
        let btn = null;
        let originalText = "";
        let captureContainer = null;
        let originalBodyWidth = "";

        try {
            // 1. Setup button feedback (skip if buttonSelector is explicitly null)
            if (buttonSelector !== null) {
                btn = document.querySelector(buttonSelector) ||
                      document.getElementById('export-png-btn');
            }

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

            // 8. Download image
            this._downloadCanvas(canvas, filenamePrefix);

            // 9. Success feedback
            if (btn) {
                btn.innerText = buttonText.success;
                setTimeout(() => {
                    if (btn) btn.innerText = originalText;
                }, 2000);
            }

        } catch (err) {
            // Error handling
            this._handleError(err, 'PNG Export');
            // Use status element feedback instead of alert() which may be blocked in Discord iframe
            if (this._isDiscord()) {
                var statusEl = document.getElementById('import-status');
                if (statusEl) {
                    statusEl.textContent = 'PNG capture failed. Please try again.';
                    statusEl.style.color = '#cc4444';
                    setTimeout(function() { statusEl.textContent = ''; }, 4000);
                }
            } else {
                alert("Failed to capture screen. Please try again or check your browser permissions.");
            }
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
     * @param {Array} sectionSelectors - Array of {containerSelector, titleMatch}
     * @returns {Array<Element>} - Array of found DOM elements
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
     * 
     * This method clones DOM sections and places them in a temporary container
     * for html2canvas capture. When useStandardWidth=true, it normalizes all
     * width-affecting styles to ensure consistent PNG dimensions.
     * 
     * Width consistency fix: Cloned sections have their padding removed to prevent
     * double-padding issues (container already has padding: 20px). This ensures
     * both Mission Summary and Aggregated Data exports produce identical widths.
     * 
     * @private
     * @param {Array<Element>} sections - DOM elements to capture
     * @param {boolean} useStandardWidth - Force standard width normalization
     * @returns {Element} - Container element ready for capture
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
                // Normalize cloned section padding to prevent width calculation differences
                // The container already has padding, so we remove section padding for consistency
                cloned.style.padding = '0';
                cloned.style.margin = index === 0 ? '0 0 0 0' : '15px 0 0 0';
                
                const tables = cloned.querySelectorAll('table');
                tables.forEach(table => {
                    table.style.width = '100%';
                    table.style.tableLayout = 'fixed';
                });
                
                // Also normalize any nested containers that might affect width
                const tableContainers = cloned.querySelectorAll('.score-table-container');
                tableContainers.forEach(container => {
                    container.style.width = '100%';
                    container.style.overflow = 'visible';
                });
            } else {
                // When not using standard width, only adjust spacing
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
     * Download canvas as PNG file
     * @private
     * @param {HTMLCanvasElement} canvas - Canvas to download
     * @param {string} filenamePrefix - Prefix for filename
     */
    _downloadCanvas(canvas, filenamePrefix) {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const filename = `${filenamePrefix}_${timestamp}.png`;
        const dataUrl = canvas.toDataURL('image/png');

        if (this._isDiscord()) {
            // In Discord's iframe, programmatic downloads are silently blocked.
            // Collect images to display in a modal where users can long-press/right-click to save.
            this._pendingImages.push({ dataUrl, filename });
        } else {
            const link = document.createElement('a');
            link.download = filename;
            link.href = dataUrl;
            link.click();
        }
    },

    /**
     * Check if running inside Discord's embedded webview
     * @private
     * @returns {boolean}
     */
    _isDiscord() {
        return !!(window.discordIntegration && window.discordIntegration.isDiscordEnvironment);
    },

    /**
     * Show a modal with all pending export images.
     * Used in Discord where programmatic downloads don't work.
     * Provides per-image "Copy Image" buttons with clipboard API + fallback instructions.
     * No-op if there are no pending images (i.e., not in Discord or nothing captured).
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

        let imagesHtml = '';
        images.forEach((img, idx) => {
            const escapedFilename = this._escapeHtml(img.filename);
            imagesHtml += `
                <div class="png-export-item">
                    <div class="png-export-item-header">
                        <span class="png-export-counter">${idx + 1} / ${total}</span>
                        <span class="png-export-filename">${escapedFilename}</span>
                    </div>
                    <img src="${img.dataUrl}" alt="${escapedFilename}" class="png-export-image" />
                    <div class="png-export-item-actions">
                        <button class="btn btn-primary btn-sm btn-copy-image" data-index="${idx}">Copy Image</button>
                        <span class="png-copy-feedback" data-feedback-index="${idx}"></span>
                    </div>
                </div>
            `;
        });

        const fallbackTip = isMobile
            ? 'Tap "Copy Image" to copy, or long-press an image to save directly.'
            : 'Click "Copy Image" to copy, or right-click an image to save directly.';

        modal.innerHTML = `
            <div class="modal-content png-export-modal-content">
                <h3 class="text-center text-primary border-bottom pb-10 mt-0 uppercase letter-spacing-2 glow">
                    CAPTURED DATA SCREENS
                </h3>
                <p class="png-export-instructions">${total} image${total !== 1 ? 's' : ''} captured. ${fallbackTip}</p>
                <div class="png-export-gallery">
                    ${imagesHtml}
                </div>
                <div class="modal-buttons">
                    <button id="btn-close-png-modal" class="btn btn-danger">Close</button>
                </div>
            </div>
        `;

        // Bind per-image copy buttons
        const self = this;
        modal.querySelectorAll('.btn-copy-image').forEach(function(btn) {
            btn.addEventListener('click', function() {
                const idx = parseInt(btn.getAttribute('data-index'), 10);
                self._copyImageToClipboard(images[idx].dataUrl, idx);
            });
        });

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
     * Copy a PNG data URL to clipboard as an image blob.
     * Falls back to selecting the image element if Clipboard API is unavailable.
     * @private
     * @param {string} dataUrl - PNG data URL
     * @param {number} index - Image index (for feedback element)
     */
    async _copyImageToClipboard(dataUrl, index) {
        const feedbackEl = document.querySelector(`[data-feedback-index="${index}"]`);
        const btnEl = document.querySelector(`.btn-copy-image[data-index="${index}"]`);

        const showFeedback = function(message, success) {
            if (feedbackEl) {
                feedbackEl.textContent = message;
                feedbackEl.className = 'png-copy-feedback ' + (success ? 'feedback-success' : 'feedback-error');
                setTimeout(function() {
                    feedbackEl.textContent = '';
                    feedbackEl.className = 'png-copy-feedback';
                }, 2500);
            }
        };

        try {
            // Convert data URL to blob
            const response = await fetch(dataUrl);
            const blob = await response.blob();

            // Try Clipboard API with ClipboardItem
            if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
                await navigator.clipboard.write([
                    new ClipboardItem({ 'image/png': blob })
                ]);
                showFeedback('Copied!', true);
                return;
            }

            // Fallback: try copying the data URL as text (can be pasted in some apps)
            if (navigator.clipboard && navigator.clipboard.writeText) {
                await navigator.clipboard.writeText(dataUrl);
                showFeedback('URL copied (paste in browser)', true);
                return;
            }

            showFeedback('Long-press image to save', false);
        } catch (err) {
            console.warn('Image copy failed:', err);
            showFeedback('Long-press image to save', false);
        }
    },

    /**
     * Cleanup temporary DOM modifications
     * @private
     * @param {Element} container - Temporary container to remove
     * @param {string} originalBodyWidth - Original body width to restore
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
     * @param {number} ms - Milliseconds to wait
     * @returns {Promise<void>}
     */
    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    },

    /**
     * Parse mission parameters from CSV lines
     * @private
     * @param {Array<string>} lines - CSV lines
     * @returns {Object} - Mission parameters
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
     * @param {Array<string>} lines - All CSV lines
     * @param {string} sectionTitle - Section title to find
     * @returns {string} - HTML table string
     */
    _csvSectionToHtml(lines, sectionTitle) {
        const startIdx = lines.findIndex(line => line.includes(sectionTitle));
        if (startIdx === -1) return '<p>Data not found</p>';

        // Table styling to match Page 2 live tables
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
            // Row label cell (matches .row-label styling)
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
     * @param {string} title - Section title
     * @param {string} tableHtml - HTML table string
     * @returns {Element} - Section DOM element
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
     * @param {string} str - String to escape
     * @returns {string} - Escaped string
     */
    _escapeHtml(str) {
        const div = document.createElement('div');
        div.appendChild(document.createTextNode(str));
        return div.innerHTML;
    },

    /**
     * Error handling wrapper
     * @private
     * @param {Error} error - Error object
     * @param {string} context - Context description
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
    console.log('📸 PNG Exporter loaded');
}

// Node.js / CommonJS (for testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { PNGExporter };
}
