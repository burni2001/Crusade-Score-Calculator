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

    // ========================================================================
    // PUBLIC API
    // ========================================================================

    /**
     * Export mission data screen (Squad Performance Matrix + Additional Statistics)
     * @param {string} buttonSelector - CSS selector for the export button (for feedback)
     * @returns {Promise<void>}
     */
    async exportMissionScreen(buttonSelector = 'button[onclick="exportTopSectionPNG()"]') {
        return this._exportScreen({
            sectionSelectors: [
                { 
                    containerSelector: '#top-wrapper .section',
                    titleMatch: 'SQUAD PERFORMANCE MATRIX'
                },
                { 
                    containerSelector: '#top-wrapper .section',
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
     * Export aggregated data screen (Aggregated Squad Matrix + Aggregated Statistics)
     * @param {string} buttonSelector - CSS selector for the export button (for feedback)
     * @returns {Promise<void>}
     */
    async exportAggregatedScreen(buttonSelector = 'button[onclick="saveAsPNG()"]') {
        return this._exportScreen({
            sectionSelectors: [
                { 
                    containerSelector: '#import-wrapper .section',
                    titleMatch: 'AGGREGATED SQUAD MATRIX'
                },
                { 
                    containerSelector: '#import-wrapper .section',
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
        const link = document.createElement('a');
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        link.download = `${filenamePrefix}_${timestamp}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
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
