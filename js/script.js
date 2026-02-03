// ============================================================================
// CRUSADE SCORE CALCULATOR - Main Application Script
// Version: 7.3
// 
// A complete scoring system for Warhammer 40K Space Marine 2 missions
// with OCR capabilities, data persistence, and export functionality
// ============================================================================

"use strict";

// ============================================================================
// SECTION 1: SECURITY & INPUT SANITIZATION
// ============================================================================

/**
 * Sanitizes user input to prevent XSS attacks
 * Removes HTML tags, dangerous characters, and limits length
 */
function sanitizeInput(input, context = 'text') {
    if (typeof input !== 'string') return '';
    
    const cleaned = input
        .replace(/[<>"']/g, '')           // Remove HTML brackets and quotes
        .replace(/javascript:/gi, '')      // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '')       // Remove event handlers
        .trim();
    
    return cleaned.slice(0, 200);         // Limit length to prevent DoS
}

/**
 * Safely set text content (never uses innerHTML with user data)
 */
function safeSetText(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = sanitizeInput(value);
}

/**
 * Safely set input value
 */
function safeSetValue(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.value = sanitizeInput(value);
}

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(str) {
    if (typeof str !== 'string') return '';
    const escapeMap = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;',
        '/': '&#x2F;'
    };
    return str.replace(/[&<>"'/]/g, char => escapeMap[char]);
}

// ============================================================================
// SECTION 2: ERROR HANDLING SYSTEM
// ============================================================================

const ErrorHandler = {
    log: [],
    
    handle(error, context = 'Unknown', showUser = false) {
        const errorInfo = {
            timestamp: new Date().toISOString(),
            context: context,
            message: error.message || String(error),
            stack: error.stack || 'No stack trace',
            userAgent: navigator.userAgent
        };
        
        console.error(`[${context}]`, error);
        
        this.log.push(errorInfo);
        if (this.log.length > 50) this.log.shift();
        
        if (showUser) this.showUserError(context, error);
    },
    
    showUserError(context, error) {
        const statusEl = document.getElementById('upload-status');
        if (statusEl) {
            statusEl.textContent = `Error in ${context}. Please try again.`;
            statusEl.style.color = '#cc4444';
            setTimeout(() => statusEl.textContent = '', 5000);
        }
    },
    
    exportLog() {
        const blob = new Blob([JSON.stringify(this.log, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `error_log_${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
    }
};

// Catch unhandled errors globally
window.addEventListener('error', (e) => ErrorHandler.handle(e.error, 'Unhandled Error', false));
window.addEventListener('unhandledrejection', (e) => ErrorHandler.handle(e.reason, 'Promise Rejection', false));

// ============================================================================
// SECTION 3: OCR STATE (UI Layer)
// Note: OCR API logic is in ocr-api.js, parsing logic is in ocr-parser.js
// ============================================================================

// OCR State - holds data for modal display and user interaction
let pendingOCRResults = {}; // Parsed structured data from parseOCRText()
let rawOCRText = "";        // Raw OCR text for debug export

// ============================================================================
// SECTION 4: SCREENSHOT UPLOAD HANDLER
// ============================================================================

document.getElementById("screenshot-upload")?.addEventListener("change", async function (e) {
    const statusDiv = document.getElementById("upload-status");
    const progressDiv = document.getElementById("upload-progress");
    
    try {
        const files = e.target.files;
        if (files.length === 0) return;

        statusDiv.textContent = "Processing screenshots...";
        statusDiv.style.color = "var(--pip-green)";

        pendingOCRResults = {};
        rawOCRText = "";

        for (let i = 0; i < files.length; i++) {
            try {
                progressDiv.textContent = `Processing image ${i + 1} of ${files.length}...`;
                
                // Use external OCR API module
                const combinedText = await OCRApi.processScreenshot(
                    files[i],
                    (msg) => { statusDiv.textContent = msg; statusDiv.style.color = "var(--pip-green)"; },
                    (msg) => progressDiv.textContent = msg
                );
                
                rawOCRText += combinedText + "\n\n---\n\n";
                
            } catch (fileError) {
                ErrorHandler.handle(fileError, `Processing file ${i + 1}`, false);
                progressDiv.textContent = `Warning: File ${i + 1} failed, continuing...`;
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }

        // Parse combined OCR text using modular parser
        pendingOCRResults = parseOCRText(rawOCRText);

        statusDiv.textContent = "OCR complete - review results below";
        statusDiv.style.color = "#80cc80";
        progressDiv.textContent = "";

        showOCRModal();
        
    } catch (error) {
        ErrorHandler.handle(error, 'Screenshot Upload', true);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = "#cc2a00";
        progressDiv.textContent = "";
        
    } finally {
        e.target.value = "";
    }
});

// ============================================================================
// SECTION 5: OCR MODAL UI
// ============================================================================

/**
 * Map an OCR-detected mission name to a dropdown option value.
 * Returns { selectValue, customValue } where selectValue is the <option> value
 * and customValue is the freeform text (only used when selectValue is 'Custom').
 */
const KNOWN_MISSIONS = [
    'INFERNO', 'DECAPITATION', 'VOX LIBERATIS', 'RELIQUARY',
    'FALL OF ATREUS', 'BALLISTIC ENGINE', 'TERMINATION', 'OBELISK',
    'EXFILTRATION', 'VORTEX', 'RECLAMATION', 'DISRUPTION', 'FORTRESS (SIEGE)'
];

function mapToMissionDropdown(detectedName) {
    if (!detectedName) return { selectValue: '', customValue: '' };
    const upper = detectedName.toUpperCase().trim();

    // Direct match
    for (const m of KNOWN_MISSIONS) {
        if (upper === m) return { selectValue: m, customValue: '' };
    }

    // Fuzzy: check if the detected text contains a known mission keyword
    const keywords = [
        { key: 'INFERNO',           val: 'INFERNO' },
        { key: 'DECAPITATION',      val: 'DECAPITATION' },
        { key: 'VOX',               val: 'VOX LIBERATIS' },
        { key: 'RELIQUARY',         val: 'RELIQUARY' },
        { key: 'ATREUS',            val: 'FALL OF ATREUS' },
        { key: 'BALLISTIC',         val: 'BALLISTIC ENGINE' },
        { key: 'TERMINATION',       val: 'TERMINATION' },
        { key: 'OBELISK',           val: 'OBELISK' },
        { key: 'EXFILTRATION',      val: 'EXFILTRATION' },
        { key: 'VORTEX',            val: 'VORTEX' },
        { key: 'RECLAMATION',       val: 'RECLAMATION' },
        { key: 'DISRUPTION',        val: 'DISRUPTION' },
        { key: 'FORTRESS',          val: 'FORTRESS (SIEGE)' },
        { key: 'SIEGE',             val: 'FORTRESS (SIEGE)' },
    ];
    for (const { key, val } of keywords) {
        if (upper.includes(key)) return { selectValue: val, customValue: '' };
    }

    // No match → use Custom
    return { selectValue: 'Custom', customValue: detectedName };
}

function showOCRModal() {
    const modal = document.getElementById('ocr-modal-overlay');
    const grid = document.getElementById('ocr-detected-grid');
    const rawText = document.getElementById('ocr-raw-text');
    
    if (!modal || !grid) return;

    rawText.textContent = rawOCRText;
    
    const createRow = (id, type, label) => {
        let inputHtml = "";
        
        if (type === "yesno") {
            inputHtml = `<select data-target-id="${id}"><option value="0">No</option><option value="1">Yes</option></select>`;
        } else if (type === "mission") {
            inputHtml = `<select data-target-id="${id}">
                <option value="">—</option>
                <option value="INFERNO">Inferno</option>
                <option value="DECAPITATION">Decapitation</option>
                <option value="VOX LIBERATIS">Vox Liberatis</option>
                <option value="RELIQUARY">Reliquary</option>
                <option value="FALL OF ATREUS">Fall of Atreus</option>
                <option value="BALLISTIC ENGINE">Ballistic Engine</option>
                <option value="TERMINATION">Termination</option>
                <option value="OBELISK">Obelisk</option>
                <option value="EXFILTRATION">Exfiltration</option>
                <option value="VORTEX">Vortex</option>
                <option value="RECLAMATION">Reclamation</option>
                <option value="DISRUPTION">Disruption</option>
                <option value="FORTRESS (SIEGE)">Fortress (Siege)</option>
                <option value="Custom">Custom...</option>
            </select>`;
        } else if (type === "difficulty") {
            inputHtml = `<select data-target-id="${id}">
                <option value="Minimal">Minimal</option>
                <option value="Average">Average</option>
                <option value="Substantial">Substantial</option>
                <option value="Ruthless">Ruthless</option>
                <option value="Lethal">Lethal</option>
                <option value="Absolute">Absolute</option>
                <option value="Normal">Normal</option>
                <option value="Hard">Hard</option>
            </select>`;
        } else if (type === "class") {
            inputHtml = `<select data-target-id="${id}">
                <option value="Tactical">Tactical</option>
                <option value="Assault">Assault</option>
                <option value="Vanguard">Vanguard</option>
                <option value="Bulwark">Bulwark</option>
                <option value="Sniper">Sniper</option>
                <option value="Heavy">Heavy</option>
                <option value="Techmarine">Techmarine</option>
            </select>`;
        } else {
            inputHtml = `<input type="${type}" data-target-id="${id}" />`;
        }
        return `<div class="ocr-input-row"><label>${label}</label>${inputHtml}</div>`;
    };

    let html = "";

    // Mission Parameters Section
    html += `<div class="ocr-section">`;
    html += `<div class="ocr-section-title">MISSION PARAMETERS</div>`;
    html += `<div class="mission-info-flex">`;
    html += createRow("mission-name", "mission", "Mission");
    html += createRow("mission-difficulty", "difficulty", "Difficulty");
    html += createRow("global-objective", "yesno", "Objective");
    html += createRow("global-geneseed", "yesno", "Geneseed");
    html += createRow("global-armoury", "number", "Armoury Data");
    html += createRow("global-waves", "number", "Waves");
    html += `</div></div>`;

    // Player Sections (3 columns)
    for (let i = 1; i <= 3; i++) {
        html += `<div class="ocr-section">`;
        html += `<div class="ocr-section-title border-bottom-0 pb-0 mb-10">
                    <input type="text" class="player-header-input" data-target-id="p${i}-name" placeholder="Name ${i}" />
                 </div>`;
        html += createRow(`p${i}-class`, "class", "Class");
        html += `<div style="height:1px; background:#335533; margin:10px 0;"></div>`;
        html += createRow(`p${i}-tasks`, "number", "Tasks Completed");
        html += createRow(`p${i}-kills`, "number", "Kills");
        html += createRow(`p${i}-elite`, "number", "Special Kills");
        html += createRow(`p${i}-melee`, "number", "Melee Damage");
        html += createRow(`p${i}-ranged`, "number", "Ranged Damage");
        html += createRow(`p${i}-items`, "number", "Items Found");
        html += createRow(`p${i}-damage`, "number", "Damage Taken");
        html += createRow(`p${i}-death`, "number", "Incapacitations");
        html += createRow(`p${i}-revived`, "number", "Teammates Revived");
        html += `</div>`;
    }

    grid.innerHTML = html;

    // Fill detected values
    const inputs = grid.querySelectorAll('input, select');
    inputs.forEach(input => {
        const id = input.dataset.targetId;
        if (id && pendingOCRResults[id] !== undefined) {
            if (id === 'mission-name') {
                // Map OCR text to dropdown value
                const mapped = mapToMissionDropdown(String(pendingOCRResults[id]));
                input.value = mapped.selectValue;
            } else {
                input.value = sanitizeInput(String(pendingOCRResults[id]));
            }
        }
    });

    modal.classList.add('active');
}

function applyOCRResults() {
    try {
        const grid = document.getElementById('ocr-detected-grid');
        if (!grid) return;

        const inputs = grid.querySelectorAll('input, select');
        let appliedCount = 0;
        let errorCount = 0;

        inputs.forEach((input) => {
            const targetId = input.dataset.targetId;
            const newValue = input.value;

            if (targetId && newValue !== undefined) {
                // Validate based on field type
                let result;
                if (targetId.includes('name') && targetId.startsWith('p')) {
                    result = InputValidator.validatePlayerName(newValue);
                } else if (targetId === 'mission-name') {
                    result = InputValidator.validateMissionName(newValue);
                    if (result.valid) {
                        // Map OCR-detected mission name to dropdown value
                        const mapped = mapToMissionDropdown(result.value);
                        result.value = mapped.selectValue;
                        // If custom, populate the custom field
                        if (mapped.selectValue === 'Custom') {
                            const customEl = document.getElementById('mission-name-custom');
                            if (customEl) customEl.value = mapped.customValue;
                        }
                        // UI updates will be triggered by handleMissionSelect after apply
                    }
                } else if (targetId.includes('damage') || targetId.includes('melee') || targetId.includes('ranged')) {
                    result = InputValidator.validateDamage(newValue);
                } else if (targetId.includes('class')) {
                    result = InputValidator.validateClass(newValue);
                } else if (targetId === 'mission-difficulty') {
                    result = InputValidator.validateDifficulty(newValue);
                } else if (targetId.includes('objective') || targetId.includes('geneseed')) {
                    // Check if geneseed field is disabled (Siege mode)
                    if (targetId.includes('geneseed')) {
                        const geneseedEl = document.getElementById(targetId);
                        if (geneseedEl && geneseedEl.disabled) {
                            // Skip geneseed for Siege missions - don't validate or apply
                            result = { valid: false, value: '', skip: true };
                        } else {
                            result = InputValidator.validateYesNo(newValue);
                        }
                    } else {
                        result = InputValidator.validateYesNo(newValue);
                    }
                } else if (targetId.includes('armoury')) {
                    result = InputValidator.validateArmouryData(newValue);
                } else if (targetId.includes('waves')) {
                    result = InputValidator.validateWaves(newValue);
                } else {
                    result = InputValidator.validateStat(newValue);
                }

                // Only apply if result is valid and not marked to skip
                if (result && result.valid && !result.skip) {
                    const mainField = document.getElementById(targetId);
                    if (mainField) {
                        mainField.value = result.value;
                        
                        // Visual feedback
                        mainField.style.transition = "background-color 0.5s";
                        const originalBg = mainField.style.backgroundColor;
                        mainField.style.backgroundColor = "#1a331a";
                        setTimeout(() => mainField.style.backgroundColor = originalBg, 500);

                        appliedCount++;
                    }
                } else if (result && !result.valid && !result.skip) {
                    errorCount++;
                    console.warn(`Validation failed for ${targetId}: ${result.error}`);
                }
            }
        });

        const statusDiv = document.getElementById("upload-status");
        if (statusDiv) {
            if (errorCount > 0) {
                statusDiv.textContent = `Applied ${appliedCount} values (${errorCount} corrected due to validation)`;
            } else {
                statusDiv.textContent = `Successfully applied ${appliedCount} values.`;
            }
            statusDiv.style.color = "#80cc80";
        }

        try {
            // Update mission-dependent UI (custom row, waves/tasks, difficulty, geneseed)
            if (typeof handleMissionSelect === 'function') handleMissionSelect();
            calculate();
            saveData();
            if (typeof updateAdditionalStatsHeaders === "function") {
                updateAdditionalStatsHeaders();
            }
        } catch (calcError) {
            ErrorHandler.handle(calcError, 'Calculation after OCR apply', false);
        }

        // Navigate to Page 2 after applying OCR results
        if (typeof navigateToPage === 'function') {
            navigateToPage(2);
        }

    } catch (e) {
        ErrorHandler.handle(e, 'Apply OCR Results', true);
    } finally {
        closeOCRModal();
    }
}

function closeOCRModal() {
    const modal = document.getElementById("ocr-modal-overlay");
    if (modal) {
        modal.classList.remove("active");
    }
}

function exportOCRDebug() {
    const headerDecor = document.querySelector(".header-decor");
    const versionText = headerDecor?.textContent || "";
    const versionMatch = versionText.match(/V\s*(\d+\.\d+\.\d+)/i);
    const currentVersion = versionMatch ? versionMatch[1] : "6.0_Alpha11";

    const debugData = {
        version: currentVersion,
        timestamp: new Date().toISOString(),
        detectedValues: pendingOCRResults,
        rawOCRText: rawOCRText,
    };

    let output = "=== OCR DEBUG EXPORT ===\n";
    output += `Version: ${debugData.version}\n`;
    output += `Timestamp: ${debugData.timestamp}\n\n`;

    output += "=== DETECTED VALUES ===\n";
    for (const [key, value] of Object.entries(pendingOCRResults)) {
        output += `${key}: ${value}\n`;
    }

    output += "\n=== RAW OCR TEXT ===\n";
    output += rawOCRText;

    output += "\n\n=== ANALYSIS ===\n";
    const lines = rawOCRText.split(/[\r\n]+/);
    
    ['KILL', 'INCAP', 'DAMAGE'].forEach(keyword => {
        output += `\nLines containing '${keyword}' (case-insensitive):\n`;
        lines.forEach((line, i) => {
            if (new RegExp(keyword, 'i').test(line)) {
                output += `  Line ${i}: ${line}\n`;
                const nums = line.match(/\d+/g);
                output += `    Numbers found: ${nums ? nums.join(", ") : "NONE"}\n`;
            }
        });
    });

    const blob = new Blob([output], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ocr_debug_${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ============================================================================
// SECTION 6: CALCULATION FUNCTIONS (Using CalculationEngine Module)
// ============================================================================

function getVal(id) {
    const el = document.getElementById(id);
    if (!el) return 0;
    
    const rawValue = el.value;
    
    if (rawValue === '' || rawValue === null || rawValue === undefined) {
        return 0;
    }
    
    let result;
    
    // Check modifiers FIRST (most specific)
    if (id.startsWith('mod-')) {
        result = InputValidator.validateModifier(rawValue);
    }
    // Then check field types
    else if (id.includes('damage') || id.includes('melee') || id.includes('ranged')) {
        result = InputValidator.validateStat(rawValue);
    } 
    else if (id.includes('armoury')) {
        result = InputValidator.validateArmouryData(rawValue);
    } 
    else if (id.includes('waves')) {
        result = InputValidator.validateWaves(rawValue);
    } 
    else {
        result = InputValidator.validateStat(rawValue);
    }
    
    return result.value;
}

function getStr(id) {
    const el = document.getElementById(id);
    if (!el) return '';
    
    const rawValue = el.value.trim();
    
    if (rawValue === '') {
        return '';
    }
    
    let result;
    
    if (id.includes('name') && id.startsWith('p')) {
        result = InputValidator.validatePlayerName(rawValue);
    } else if (id === 'mission-name') {
        // Return the effective mission name (custom text when "Custom" is selected)
        const effectiveName = getEffectiveMissionName();
        return effectiveName || rawValue;
    } else {
        result = { valid: true, value: sanitizeInput(rawValue) };
    }
    
    return result.value;
}

function setTxt(id, txt) {
    const el = document.getElementById(id);
    if (el) el.textContent = txt;
}

function updateAdditionalStatsHeaders() {
    for (let i = 1; i <= 3; i++) {
        const nameInput = document.getElementById(`p${i}-name`);
        const header = document.getElementById(`addstats-p${i}-header`);
        if (header && nameInput) {
            const name = sanitizeInput(nameInput.value);
            header.textContent = name || `Battle Brother ${i}`;
        }
    }
}

/**
 * Main calculation function - now uses CalculationEngine module
 */
function calculate() {
    try {
        // Gather data from DOM
        const modifiers = {
            kills: getVal("mod-kills"),
            elite: getVal("mod-elite"),
            death: getVal("mod-death"),
            damage: getVal("mod-damage"),
            gene: getVal("mod-gene"),
            armoury: getVal("mod-armoury"),
            obj: getVal("mod-obj"),
            waves: getVal("mod-waves"),
            tasks: getVal("mod-tasks")
        };

        const globals = {
            objective: document.getElementById("global-objective").value === "" ? 0 : getVal("global-objective"),
            geneseed: document.getElementById("global-geneseed").disabled || document.getElementById("global-geneseed").value === "" ? 0 : getVal("global-geneseed"),
            armoury: getVal("global-armoury"),
            waves: getVal("global-waves")
        };

        const players = [
            {
                kills: getVal("p1-kills"),
                elite: getVal("p1-elite"),
                tasks: getVal("p1-tasks"),
                death: getVal("p1-death"),
                damage: getVal("p1-damage"),
                melee: getVal("p1-melee"),
                ranged: getVal("p1-ranged"),
                items: getVal("p1-items"),
                revived: getVal("p1-revived")
            },
            {
                kills: getVal("p2-kills"),
                elite: getVal("p2-elite"),
                tasks: getVal("p2-tasks"),
                death: getVal("p2-death"),
                damage: getVal("p2-damage"),
                melee: getVal("p2-melee"),
                ranged: getVal("p2-ranged"),
                items: getVal("p2-items"),
                revived: getVal("p2-revived")
            },
            {
                kills: getVal("p3-kills"),
                elite: getVal("p3-elite"),
                tasks: getVal("p3-tasks"),
                death: getVal("p3-death"),
                damage: getVal("p3-damage"),
                melee: getVal("p3-melee"),
                ranged: getVal("p3-ranged"),
                items: getVal("p3-items"),
                revived: getVal("p3-revived")
            }
        ];

        // Use CalculationEngine to calculate scores
        const results = CalculationEngine.calculateMissionScores({
            modifiers: modifiers,
            globals: globals,
            players: players
        });

        // Update player scores in DOM
        results.players.forEach((playerResult, index) => {
            const playerNum = index + 1;
            setTxt(`p${playerNum}-base`, playerResult.baseScore);
            setTxt(`p${playerNum}-mod`, playerResult.modifierScore);
            setTxt(`p${playerNum}-final`, playerResult.finalScore);

            // Update diff display
            const diffEl = document.getElementById(`p${playerNum}-diff`);
            if (diffEl) {
                diffEl.textContent = `(${CalculationEngine.formatDiff(playerResult.reviveDiff)})`;
                diffEl.style.color = CalculationEngine.getDiffColor(playerResult.reviveDiff);
            }
        });

        // Update totals in DOM
        const totals = results.totals;
        setTxt("total-kills", totals.kills);
        setTxt("total-elite", totals.elite);
        setTxt("total-tasks", totals.tasks);
        setTxt("total-death", totals.death);
        setTxt("total-damage", totals.damage);
        setTxt("total-melee", totals.melee);
        setTxt("total-ranged", totals.ranged);
        setTxt("total-items", totals.items);
        setTxt("total-revived", totals.revived);
        setTxt("total-base", totals.baseScore);
        setTxt("total-mod", totals.modifierScore);
        setTxt("total-final", totals.finalScore);

        // Update total diff
        const totalDiffEl = document.getElementById("total-diff");
        if (totalDiffEl) {
            totalDiffEl.textContent = `(${CalculationEngine.formatDiff(totals.reviveDiff)})`;
            totalDiffEl.style.color = CalculationEngine.getDiffColor(totals.reviveDiff);
        }

        updateAdditionalStatsHeaders();
        
    } catch (error) {
        ErrorHandler.handle(error, 'Calculate Function', true);
        console.error('Calculation failed:', error);
    }
}

function clearData() {
    if (!confirm("Clear all mission data? (Modifiers will be kept)")) return;

    const fieldsToClear = [
        "mission-name", "mission-difficulty", "global-objective", "global-geneseed",
        "global-armoury", "global-waves",
        "p1-name", "p2-name", "p3-name",
        "p1-class", "p2-class", "p3-class",
        "p1-kills", "p2-kills", "p3-kills",
        "p1-elite", "p2-elite", "p3-elite",
        "p1-death", "p2-death", "p3-death",
        "p1-damage", "p2-damage", "p3-damage",
        "p1-tasks", "p2-tasks", "p3-tasks",
        "p1-melee", "p2-melee", "p3-melee",
        "p1-ranged", "p2-ranged", "p3-ranged",
        "p1-items", "p2-items", "p3-items",
        "p1-revived", "p2-revived", "p3-revived",
    ];

    fieldsToClear.forEach((id) => {
        const el = document.getElementById(id);
        if (el) {
            if (el.tagName === "SELECT") {
                el.selectedIndex = 0;
            } else if (el.type === "number") {
                el.value = 0;
            } else {
                el.value = "";
            }
            el.dispatchEvent(new Event("change", { bubbles: true }));
        }
    });

    updateAdditionalStatsHeaders();
    calculate();
    saveData();
}

// ============================================================================
// SECTION 6.5: DYNAMIC DIFFICULTY SELECTOR
// ============================================================================

/**
 * Get the effective mission name from the dropdown (or custom field if "Custom" is selected)
 */
function getEffectiveMissionName() {
    const select = document.getElementById('mission-name');
    if (!select) return '';
    if (select.value === 'Custom') {
        const customInput = document.getElementById('mission-name-custom');
        return customInput ? customInput.value : '';
    }
    return select.value;
}

/**
 * Handle mission dropdown selection changes.
 * Shows/hides custom field, updates difficulty, waves/tasks availability.
 */
function handleMissionSelect() {
    const select = document.getElementById('mission-name');
    const customRow = document.getElementById('custom-mission-row');
    if (!select) return;

    const isCustom = select.value === 'Custom';
    if (customRow) {
        customRow.style.display = isCustom ? '' : 'none';
    }

    const missionName = getEffectiveMissionName();
    updateDifficultyOptions(missionName);
    updateWavesAndTasksFields(missionName);
    calculate();
}

/**
 * Update Total Waves and Tasks Completed fields based on mission type.
 * Only Siege missions have waves and tasks; all others show N/A.
 */
function updateWavesAndTasksFields(missionName) {
    const wavesInput = document.getElementById('global-waves');
    const taskIds = ['p1-tasks', 'p2-tasks', 'p3-tasks'];
    const isSiege = isSiegeMission(missionName);

    if (wavesInput) {
        wavesInput.disabled = !isSiege;
        if (!isSiege) {
            wavesInput.value = '';
            wavesInput.placeholder = 'N/A';
        } else {
            wavesInput.placeholder = '';
            if (wavesInput.value === '') wavesInput.value = '0';
        }
    }

    taskIds.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.disabled = !isSiege;
            if (!isSiege) {
                el.value = '';
                el.placeholder = 'N/A';
            } else {
                el.placeholder = '';
                if (el.value === '') el.value = '0';
            }
        }
    });
}

/**
 * Check if mission name indicates a Siege-type mission
 */
function isSiegeMission(missionName) {
    if (!missionName || typeof missionName !== 'string') return false;
    const normalized = missionName.toLowerCase().trim();
    return /siege|seige|fortress/i.test(normalized);
}

/**
 * Update difficulty dropdown options based on mission type
 */
function updateDifficultyOptions(missionName) {
    const difficultySelect = document.getElementById('mission-difficulty');
    if (!difficultySelect) return;
    
    const currentValue = difficultySelect.value;
    
    // Clear existing options (except placeholder)
    difficultySelect.innerHTML = '<option value="" disabled selected hidden>Select</option>';
    
    if (isSiegeMission(missionName)) {
        // Siege missions: Only Normal/Hard
        difficultySelect.innerHTML += `
            <option value="Normal">Normal</option>
            <option value="Hard">Hard</option>
        `;
        
        // Restore selection if valid for Siege
        if (currentValue === 'Normal' || currentValue === 'Hard') {
            difficultySelect.value = currentValue;
        }
    } else {
        // Regular missions: Full range
        difficultySelect.innerHTML += `
            <option value="Minimal">Minimal</option>
            <option value="Average">Average</option>
            <option value="Substantial">Substantial</option>
            <option value="Ruthless">Ruthless</option>
            <option value="Lethal">Lethal</option>
            <option value="Absolute">Absolute</option>
            <option value="Normal">Normal</option>
            <option value="Hard">Hard</option>
        `;
        
        if (currentValue) {
            difficultySelect.value = currentValue;
        }
    }

    // Update Gene-Seed field as well
    updateGeneseedField(missionName);
    
    // Trigger calculation if difficulty changed
    if (difficultySelect.value !== currentValue) {
        calculate();
        saveData();
    }
}

/**
 * Initialize difficulty selector with event listeners
 */
function initializeDifficultySelector() {
    const missionNameSelect = document.getElementById('mission-name');
    const customMissionInput = document.getElementById('mission-name-custom');

    if (!missionNameSelect) {
        console.warn('Mission name select not found');
        return;
    }

    // Listen for custom mission name changes (typing in the custom field)
    if (customMissionInput) {
        customMissionInput.addEventListener('input', function() {
            const missionName = getEffectiveMissionName();
            updateDifficultyOptions(missionName);
            updateWavesAndTasksFields(missionName);
        });
        customMissionInput.addEventListener('change', function() {
            const missionName = getEffectiveMissionName();
            updateDifficultyOptions(missionName);
            updateWavesAndTasksFields(missionName);
        });
    }

    // Initial update based on current selection
    const missionName = getEffectiveMissionName();
    updateDifficultyOptions(missionName);
    updateWavesAndTasksFields(missionName);

    // Show/hide custom row based on current value
    const customRow = document.getElementById('custom-mission-row');
    if (customRow && missionNameSelect.value === 'Custom') {
        customRow.style.display = '';
    }

    console.log('✅ Dynamic difficulty selector initialized');
}

/**
 * Update Gene-Seed field based on mission type
 * Siege missions don't have Gene-Seed, so disable and set to N/A
 */
function updateGeneseedField(missionName) {
    const geneseedSelect = document.getElementById('global-geneseed');
    if (!geneseedSelect) return;
    
    if (isSiegeMission(missionName)) {
        // Siege missions: No Gene-Seed available
        geneseedSelect.innerHTML = '<option value="" selected>N/A (Siege Mode)</option>';
        geneseedSelect.disabled = true;
        geneseedSelect.style.opacity = '0.5';
        geneseedSelect.style.cursor = 'not-allowed';
    } else {
        // Regular missions: Gene-Seed available
        const currentValue = geneseedSelect.value;
        geneseedSelect.disabled = false;
        geneseedSelect.style.opacity = '';
        geneseedSelect.style.cursor = '';
        
        // Restore full options if they're missing
        if (!geneseedSelect.querySelector('option[value="0"]')) {
            geneseedSelect.innerHTML = `
                <option value="" disabled selected hidden>Select</option>
                <option value="0">No</option>
                <option value="1">Yes</option>
            `;
            
            // Restore previous value if valid
            if (currentValue === '0' || currentValue === '1') {
                geneseedSelect.value = currentValue;
            }
        }
    }
}

// ============================================================================
// SECTION 7: DATA PERSISTENCE (LocalStorage)
// ============================================================================

const STORAGE_KEY = "missionDebriefData";

const inputIds = [
    "mod-kills", "mod-elite", "mod-death", "mod-damage", "mod-gene", "mod-armoury",
    "mod-obj", "mod-waves", "mod-tasks",
    "mission-name", "mission-name-custom", "mission-difficulty", "global-objective", "global-geneseed",
    "global-armoury", "global-waves",
    "p1-name", "p2-name", "p3-name",
    "p1-class", "p2-class", "p3-class",
    "p1-kills", "p2-kills", "p3-kills",
    "p1-elite", "p2-elite", "p3-elite",
    "p1-death", "p2-death", "p3-death",
    "p1-damage", "p2-damage", "p3-damage",
    "p1-items", "p2-items", "p3-items",
    "p1-revived", "p2-revived", "p3-revived",
    "p1-melee", "p2-melee", "p3-melee",
    "p1-ranged", "p2-ranged", "p3-ranged",
    "p1-tasks", "p2-tasks", "p3-tasks"
];

function saveData() {
    try {
        const data = {};
        let savedCount = 0;
        
        inputIds.forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                data[id] = sanitizeInput(String(el.value));
                savedCount++;
            }
        });
        
        if (savedCount === 0) {
            console.warn('saveData: No elements found');
            return false;
        }
        
        const jsonStr = JSON.stringify(data);
        
        if (jsonStr.length > 5 * 1024 * 1024) {
            console.error('Data too large');
            return false;
        }
        
        localStorage.setItem(STORAGE_KEY, jsonStr);
        
        const verification = localStorage.getItem(STORAGE_KEY);
        if (verification === jsonStr) {
            if (window.DEBUG_MODE) console.log(`✅ Saved ${savedCount} fields`);
            return true;
        } else {
            console.error('Save verification failed');
            return false;
        }
        
    } catch (e) {
        ErrorHandler.handle(e, 'Save Data', false);
        if (e.name === 'QuotaExceededError') {
            alert('Storage full. Please clear old mission data.');
        } else {
            console.error("saveData failed:", e.message);
        }
        return false;
    }
}

function loadData() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        
        if (!saved) {
            console.log('💾 No saved data (first visit)');
            return false;
        }
        
        let data;
        try {
            data = JSON.parse(saved);
        } catch (parseError) {
            ErrorHandler.handle(parseError, 'Parse Saved Data', false);
            console.error('Corrupted data, clearing');
            localStorage.removeItem(STORAGE_KEY);
            return false;
        }
        
        if (typeof data !== 'object' || data === null) {
            console.error('Invalid data format');
            localStorage.removeItem(STORAGE_KEY);
            return false;
        }
        
        let loadedCount = 0;
        
        inputIds.forEach((id) => {
            try {
                const el = document.getElementById(id);
                if (el && data[id] !== undefined && data[id] !== "") {
                    el.value = sanitizeInput(String(data[id]));
                    loadedCount++;
                }
            } catch (fieldError) {
                ErrorHandler.handle(fieldError, `Loading ${id}`, false);
            }
        });
        
        console.log(`✅ Loaded ${loadedCount} fields`);

        // Restore mission dropdown UI state (custom row visibility + waves/tasks)
        if (typeof handleMissionSelect === 'function') handleMissionSelect();

        if (typeof calculate === 'function') calculate();
        if (typeof updateAdditionalStatsHeaders === 'function') updateAdditionalStatsHeaders();

        return true;
        
    } catch (e) {
        ErrorHandler.handle(e, 'Load Data', false);
        console.error("loadData failed:", e.message);
        return false;
    }
}

// ============================================================================
// Aggregated State Persistence
// ============================================================================

const AGGREGATED_STATE_KEY = 'cogitator_aggregated_state';

/**
 * Saves the current importAppState to localStorage so aggregated tables
 * persist across app restarts.
 */
function saveAggregatedState() {
    try {
        if (!importAppState.playerOrder || importAppState.playerOrder.length === 0) {
            localStorage.removeItem(AGGREGATED_STATE_KEY);
            return;
        }
        localStorage.setItem(AGGREGATED_STATE_KEY, JSON.stringify(importAppState));
    } catch (e) {
        ErrorHandler.handle(e, 'Save Aggregated State', false);
    }
}

/**
 * Restores importAppState from localStorage and re-renders the aggregated
 * tables if data was previously saved.
 */
function loadAggregatedState() {
    try {
        const saved = localStorage.getItem(AGGREGATED_STATE_KEY);
        if (!saved) return false;

        const parsed = JSON.parse(saved);
        if (!parsed || !Array.isArray(parsed.playerOrder) || parsed.playerOrder.length === 0) {
            localStorage.removeItem(AGGREGATED_STATE_KEY);
            return false;
        }

        importAppState = parsed;
        renderImportUI();

        const statusEl = document.getElementById('import-status');
        if (statusEl) {
            statusEl.textContent = `RESTORED ${parsed.playerOrder.length} OPERATIVE(S) FROM MEMORY`;
            statusEl.style.color = 'var(--pip-green)';
        }

        console.log(`✅ Restored aggregated state (${parsed.playerOrder.length} players)`);
        return true;
    } catch (e) {
        ErrorHandler.handle(e, 'Load Aggregated State', false);
        localStorage.removeItem(AGGREGATED_STATE_KEY);
        return false;
    }
}

// Debug helpers
function debugStorage() {
    console.log('=== Storage Debug ===');
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        const data = JSON.parse(saved);
        console.log('Keys:', Object.keys(data).length);
        console.log('Sample:', {
            'mission-name': data['mission-name'],
            'p1-name': data['p1-name'],
            'mod-kills': data['mod-kills']
        });
    } else {
        console.log('❌ No data');
    }
}

function forceSave() {
    console.log('🔧 Force save...');
    const success = saveData();
    if (success) {
        console.log('✅ Done');
        debugStorage();
    } else {
        console.error('❌ Failed');
    }
}

function forceLoad() {
    console.log('🔧 Force load...');
    const success = loadData();
    if (success) {
        console.log('✅ Done');
    } else {
        console.error('❌ Failed');
    }
}

function clearSavedData() {
    if (confirm('Clear all saved data?')) {
        localStorage.removeItem(STORAGE_KEY);
        console.log('✅ Cleared');
        location.reload();
    }
}

// Expose helpers
window.debugStorage = debugStorage;
window.forceSave = forceSave;
window.forceLoad = forceLoad;
window.clearSavedData = clearSavedData;

// ============================================================================
// SECTION 8: INTERNAL DATA BANK (Mission Slots)
// ============================================================================

function generateCSVString() {
    // Helper to get select values
    const getSelect = (id) => {
        const el = document.getElementById(id);
        return el ? el.value : '';
    };
    
    // Use modular CSV handler
    return CSVHandler.generateFromState(getVal, getStr, getSelect);
}

function saveMissionInternal() {
    let savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");

    if (savedSlots.length >= 4) {
        alert("Memory Banks Full! Delete a Data Slate to make room.");
        return;
    }

    const csvContent = generateCSVString();
    const missionName = getEffectiveMissionName() || "Unknown Mission";
    const difficulty = document.getElementById("mission-difficulty").value || "Unknown";
    
    const newSlot = {
        id: Date.now(),
        name: missionName,
        difficulty: difficulty,
        csv: csvContent,
        timestamp: new Date().toLocaleTimeString()
    };

    savedSlots.push(newSlot);
    localStorage.setItem("cogitator_saved_missions", JSON.stringify(savedSlots));
    
    renderDataBankUI();
}

function renderDataBankUI() {
    const container = document.getElementById("data-bank-ui");
    const containerPage3 = document.getElementById("data-bank-ui-page3");
    
    const savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");
    
    // Update counter in all places
    const counterEl = document.getElementById("slots-count-display");
    if (counterEl) counterEl.textContent = `${savedSlots.length}/4`;
    
    // Render data bank for Page 2
    if (container) {
        container.innerHTML = "";
        renderSlotsToContainer(container, savedSlots);
    }
    
    // Render data bank for Page 3
    if (containerPage3) {
        containerPage3.innerHTML = "";
        renderSlotsToContainer(containerPage3, savedSlots);
    }
}

function renderSlotsToContainer(container, savedSlots) {
    for (let i = 0; i < 4; i++) {
        const slotData = savedSlots[i];
        const slotEl = document.createElement("div");
        
        if (slotData) {
            slotEl.className = `data-slot occupied`;
            slotEl.onclick = function() { openSlotOverlay(i); };

            const nameSpan = document.createElement('span');
            nameSpan.className = 'slot-name';
            nameSpan.textContent = sanitizeInput(slotData.name);
            slotEl.appendChild(nameSpan);

            const diffSpan = document.createElement('span');
            diffSpan.className = 'text-xs opacity-70';
            diffSpan.style.marginLeft = '10px';
            diffSpan.textContent = `[${sanitizeInput(slotData.difficulty)}]`;
            slotEl.appendChild(diffSpan);

            const deleteBtn = document.createElement('button');
            deleteBtn.className = 'delete-slot-btn';
            deleteBtn.textContent = 'X';
            deleteBtn.onclick = function(e) { 
                e.stopPropagation(); 
                deleteSlot(i); 
            };
            slotEl.appendChild(deleteBtn);

        } else {
            slotEl.className = `data-slot`;
            slotEl.innerHTML = `<span class="slot-name opacity-60">[ EMPTY SLOT ]</span>`;
        }
        container.appendChild(slotEl);
    }
}

function csvToHtmlTable(csvText, sectionTitle) {
    const lines = csvText.split('\n');
    const startIdx = lines.findIndex(line => line.includes(sectionTitle));
    
    if (startIdx === -1) return `<p>Data not found for ${sectionTitle}</p>`;

    let html = '<table class="csv-modal-table">';
    
    const headerLine = lines[startIdx + 1];
    if (headerLine) {
        const headers = headerLine.split(',');
        html += '<thead class="csv-modal-thead">';
        html += '<tr>';
        html += `<th class="csv-modal-th-left">METRIC</th>`;
        for (let i = 1; i < headers.length; i++) {
            html += `<th class="csv-modal-th-center">${escapeHtml(headers[i].trim())}</th>`;
        }
        html += '</tr></thead>';
    }

    html += '<tbody>';
    for (let i = startIdx + 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line === "ADDITIONAL STATISTICS" || line === "MODIFIERS") break;

        const cols = line.split(',');
        html += '<tr class="csv-modal-tr">';
        html += `<td class="csv-modal-td-label">${escapeHtml(cols[0].trim())}</td>`;
        
        for (let j = 1; j < cols.length; j++) {
            const isTotal = j === cols.length - 1;
            const tdClass = isTotal ? "csv-modal-td-total" : "csv-modal-td-value";
            html += `<td class="${tdClass}">${escapeHtml(cols[j].trim())}</td>`;
        }
        html += '</tr>';
    }
    html += '</tbody></table>';
    
    return html;
}

function openSlotOverlay(index) {
    const savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");
    const slot = savedSlots[index];
    if (!slot) return;

    let modal = document.getElementById('slot-modal-overlay');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'slot-modal-overlay';
        modal.className = 'modal-overlay';
        document.body.appendChild(modal);
    }

    const matrixTable = csvToHtmlTable(slot.csv, "SQUAD PERFORMANCE MATRIX");
    const statsTable = csvToHtmlTable(slot.csv, "ADDITIONAL STATISTICS");

    modal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h2 class="modal-title">${sanitizeInput(slot.name).toUpperCase()}</h2>
                <div class="modal-subtitle">
                    Difficulty: ${sanitizeInput(slot.difficulty)}
                </div>
            </div>
            <h3 class="modal-section-title">SQUAD PERFORMANCE MATRIX</h3>
            ${matrixTable}

            <h3 class="modal-section-title mt-20">ADDITIONAL STATISTICS</h3>
            ${statsTable}

            <div class="modal-actions">
                <button onclick="downloadSlotCSV(${index})" class="btn btn-sm">DOWNLOAD CSV</button>
                <button onclick="closeSlotModal()" class="btn btn-sm">CLOSE</button>
            </div>
        </div>
    `;

    requestAnimationFrame(() => modal.classList.add('active'));
}

function closeSlotModal() {
    const modal = document.getElementById('slot-modal-overlay');
    if (modal) modal.classList.remove('active');
}

function downloadSlotCSV(index) {
    const savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");
    const slot = savedSlots[index];
    if (!slot) return;

    const blob = new Blob([slot.csv], { type: 'text/csv;charset=utf-8;' });
    const safeName = slot.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const filename = `mission_data_${safeName}_${index+1}.csv`;

    const link = document.createElement("a");
    if (link.download !== undefined) {
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", filename);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    }
}

function deleteSlot(index) {
    if (!confirm("Purge this Data Slate from memory?")) return;
    
    let savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");
    savedSlots.splice(index, 1);
    localStorage.setItem("cogitator_saved_missions", JSON.stringify(savedSlots));
    renderDataBankUI();
}

function aggregateInternalData() {
    const statusEl = document.getElementById('import-status');
    let savedSlots = [];
    
    try {
        savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");
    } catch (e) {
        localStorage.removeItem("cogitator_saved_missions");
        statusEl.textContent = "MEMORY CORRUPTION DETECTED. BANKS PURGED.";
        statusEl.style.color = "#cc4444";
        return;
    }

    if (savedSlots.length === 0) {
        statusEl.textContent = "NO DATA SLATES FOUND IN MEMORY";
        statusEl.style.color = "#cc4444";
        return;
    }

    // Reset Global State
    importAppState = {
        mission: { name:'-', diff:'-', waves:'-', obj:'-', gene:'-', arm:'-' },
        modifiers: { kills:'-', specials:'-', incaps:'-', dmg:'-', gene:'-', arm:'-', obj:'-', waves:'-', tasks:'-' },
        players: {},      
        playerOrder: [],  
        matrixTotals: {}  
    };

    let successCount = 0;
    let corruptedCount = 0;
    const cleanSlots = [];
    
    savedSlots.forEach((slot, index) => {
        try {
            if (!slot.csv || typeof slot.csv !== 'string') {
                throw new Error("Invalid Format");
            }
            
            if (typeof processCSV !== "function") {
                throw new Error("processCSV function missing. Logic not loaded.");
            }

            processCSV(slot.csv);
            cleanSlots.push(slot);
            successCount++;
            
        } catch (err) {
            console.error(`Slot ${index+1} Corrupted:`, err);
            corruptedCount++;
        }
    });

    // Auto-repair: save back only clean slots
    if (corruptedCount > 0) {
        localStorage.setItem("cogitator_saved_missions", JSON.stringify(cleanSlots));
        renderDataBankUI();
    }

    renderImportUI();
    saveAggregatedState();

    if (successCount > 0) {
        statusEl.textContent = `AGGREGATED ${successCount} SLATE(S)` + (corruptedCount ? ` (${corruptedCount} PURGED)` : "");
        statusEl.style.color = "var(--pip-green)";
        const resultsEl = document.getElementById('results-container');
        const frame = document.querySelector('.cogitator-frame');
        if (resultsEl && frame) {
            frame.scrollTo({ top: resultsEl.offsetTop - frame.offsetTop, behavior: 'smooth' });
        }
    } else {
        statusEl.textContent = "ALL SLATES WERE CORRUPTED AND PURGED.";
        statusEl.style.color = "#cc4444";
    }
}

// ============================================================================
// SECTION 9: DATA IMPORT & AGGREGATION SYSTEM
// ============================================================================

let importAppState = {
    mission: { name:'-', diff:'-', waves:'-', obj:'-', gene:'-', arm:'-' },
    modifiers: { kills:'-', specials:'-', incaps:'-', dmg:'-', gene:'-', arm:'-', obj:'-', waves:'-', tasks:'-' },
    players: {},      
    playerOrder: [],  
    matrixTotals: {}  
};

const MATRIX_KEYS = [
    "Kills", "Special Kills", "Incapacitations", 
    "Damage Taken", "Base Score", "Tasks Completed", "Modifier Score", "TOTAL SCORE"
];

const ADD_STATS_KEYS = [
    "Melee Damage", "Ranged Damage", "Items Found", "Teammates Revived"
];

const csvUploadInput = document.getElementById('csv-upload');
if (csvUploadInput) {
    csvUploadInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files).slice(0, 3);
        if (!files.length) return;

        importAppState = {
            mission: { name:'-', diff:'-', waves:'-', obj:'-', gene:'-', arm:'-' },
            modifiers: { kills:'-', specials:'-', incaps:'-', dmg:'-', gene:'-', arm:'-', obj:'-', waves:'-', tasks:'-' },
            players: {},
            playerOrder: [],  
            matrixTotals: {}  
        };

        try {
            for (const file of files) {
                const text = await file.text();
                processCSV(text);
            }
            renderImportUI();
            saveAggregatedState();
            const statusEl = document.getElementById('import-status');
            statusEl.textContent = `PROCESSED ${files.length} FILES SUCCESSFULLY`;
            statusEl.style.color = "var(--pip-green)";
        } catch (err) {
            console.error(err);
            const statusEl = document.getElementById('import-status');
            statusEl.textContent = "ERROR READING FILES";
            statusEl.style.color = "#cc4444";
        }
    });
}

function resetImport() {
    if (!confirm("WARNING: This will purge ALL aggregated data and wipe the internal memory banks. \n\nAre you sure?")) {
        return;
    }

    const fileInput = document.getElementById('csv-upload');
    if (fileInput) fileInput.value = "";

    const results = document.getElementById('results-container');
    if (results) results.classList.remove('visible');

    const status = document.getElementById('import-status');
    if (status) status.textContent = "MEMORY BANKS FLUSHED.";

    importAppState = {
        mission: { name:'-', diff:'-', waves:'-', obj:'-', gene:'-', arm:'-' },
        modifiers: { kills:'-', specials:'-', incaps:'-', dmg:'-', gene:'-', arm:'-', obj:'-', waves:'-', tasks:'-' },
        players: {},      
        playerOrder: [],  
        matrixTotals: {}  
    };
    
    localStorage.removeItem("cogitator_saved_missions");
    localStorage.removeItem(AGGREGATED_STATE_KEY);
    renderDataBankUI();

    console.log("Aggregated data purged.");
}

function processCSV(text) {
    // Use modular CSV handler with validation
    const parsedData = CSVHandler.parseToStructure(text, InputValidator);
    
    // Merge parsed data into importAppState
    if (parsedData.mission.name !== '-') {
        Object.assign(importAppState.mission, parsedData.mission);
    }
    
    Object.assign(importAppState.modifiers, parsedData.modifiers);
    
    // Merge players (accumulate values across multiple CSVs)
    parsedData.playerOrder.forEach(pName => {
        if (!importAppState.players[pName]) {
            importAppState.players[pName] = {};
            importAppState.playerOrder.push(pName);
        }
        
        const playerData = parsedData.players[pName];
        Object.keys(playerData).forEach(key => {
            importAppState.players[pName][key] = 
                (importAppState.players[pName][key] || 0) + playerData[key];
        });
    });
    
    // Merge totals
    Object.keys(parsedData.matrixTotals).forEach(key => {
        importAppState.matrixTotals[key] = 
            (importAppState.matrixTotals[key] || 0) + parsedData.matrixTotals[key];
    });
}

// ============================================================================
// SECTION 10: IMPORT UI RENDERING
// ============================================================================

function renderImportUI() {
    document.getElementById('results-container').classList.add('visible');
    
    buildImportTable('matrix-table', MATRIX_KEYS);
    buildImportTable('stats-table', ADD_STATS_KEYS);
}

function buildImportTable(tableId, rowKeys) {
    const table = document.getElementById(tableId);
    table.innerHTML = '';
    
    const thead = document.createElement('thead');
    const headRow = document.createElement('tr');
    
    const thEmpty = document.createElement('th');
    thEmpty.textContent = 'METRIC';
    thEmpty.style.whiteSpace = 'nowrap';
    headRow.appendChild(thEmpty);
    
    importAppState.playerOrder.forEach(p => {
        const th = document.createElement('th');
        th.textContent = sanitizeInput(p);
        headRow.appendChild(th);
    });
    
    const thTotal = document.createElement('th');
    thTotal.textContent = 'TOTAL';
    headRow.appendChild(thTotal);
    
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    rowKeys.forEach(key => {
        const tr = document.createElement('tr');
        
        const tdLabel = document.createElement('td');
        tdLabel.className = 'row-label';
        tdLabel.style.textAlign = 'right';
        tdLabel.textContent = key;
        tr.appendChild(tdLabel);
        
        let rowSum = 0;

        importAppState.playerOrder.forEach(p => {
            let val = importAppState.players[p] ? importAppState.players[p][key] : 0;
            if (val === undefined) val = 0;

            const td = document.createElement('td');
            
            if (key === "Teammates Revived") {
                const revs = val;
                const incaps = importAppState.players[p] ? (importAppState.players[p]["Incapacitations"] || 0) : 0;
                const diff = revs - incaps;
                
                td.textContent = String(revs) + ' ';
                const span = document.createElement('span');
                span.style.fontSize = '0.8em';
                span.style.color = diff >= 0 ? '#80cc80' : '#cc5500';
                span.textContent = `(${diff >= 0 ? '+' : ''}${diff})`;
                td.appendChild(span);
                
                rowSum += revs;
            } else if (typeof val === 'number') {
                rowSum += val;
                if (!Number.isInteger(val)) val = val.toFixed(1);
                td.textContent = String(val);
            } else {
                td.textContent = String(val);
            }
            
            tr.appendChild(td);
        });

        const tdTotal = document.createElement('td');
        tdTotal.className = 'total-cell';
        
        if (key === "Teammates Revived") {
            const totalRevs = rowSum;
            const totalIncaps = importAppState.matrixTotals["Incapacitations"] || 0;
            const totalDiff = totalRevs - totalIncaps;
            
            tdTotal.textContent = String(totalRevs) + ' ';
            const span = document.createElement('span');
            span.style.fontSize = '0.8em';
            span.style.color = totalDiff >= 0 ? '#80cc80' : '#cc5500';
            span.textContent = `(${totalDiff >= 0 ? '+' : ''}${totalDiff})`;
            tdTotal.appendChild(span);
        } else {
            let t = importAppState.matrixTotals[key];
            if (t === undefined || t === null) t = rowSum;
            
            if (typeof t === 'number') {
                tdTotal.textContent = Number.isInteger(t) ? String(t) : t.toFixed(1);
            } else {
                tdTotal.textContent = String(t || 0);
            }
        }
        
        tr.appendChild(tdTotal);
        tbody.appendChild(tr);
    });
    table.appendChild(tbody);
}

function openCopyModal() {
    if (!importAppState.playerOrder.length) return;
    
    let maxScore = -Infinity;
    let maxRanged = -Infinity;
    let maxMelee = -Infinity;
    let maxDiff = -Infinity;

    importAppState.playerOrder.forEach(name => {
        const s = importAppState.players[name];
        const diff = (s['Teammates Revived'] || 0) - (s['Incapacitations'] || 0);
        if ((s['TOTAL SCORE'] || 0) > maxScore) maxScore = s['TOTAL SCORE'];
        if ((s['Ranged Damage'] || 0) > maxRanged) maxRanged = s['Ranged Damage'];
        if ((s['Melee Damage'] || 0) > maxMelee) maxMelee = s['Melee Damage'];
        if (diff > maxDiff) maxDiff = diff;
    });

    const squadScore = importAppState.matrixTotals['TOTAL SCORE'] || 0;
    let txt = `Total squad score: **${squadScore}**\n`;
    
    importAppState.playerOrder.forEach(name => {
        const stats = importAppState.players[name] || {};
        const tot = stats['TOTAL SCORE'] || 0;
        const ranged = stats['Ranged Damage'] || 0;
        const melee = stats['Melee Damage'] || 0;
        const incaps = stats['Incapacitations'] || 0;
        const revs = stats['Teammates Revived'] || 0;
        const diff = revs - incaps;

        const scoreStr = (tot === maxScore) ? `**${tot}**` : tot;
        const rangedStr = (ranged === maxRanged) ? `**${ranged}**` : ranged;
        const meleeStr = (melee === maxMelee) ? `**${melee}**` : melee;
        
        let diffVal = `${incaps}/${revs} (${diff >= 0 ? '+' : ''}${diff})`;
        if (diff === maxDiff) diffVal = `**${diffVal}**`;

        const safeName = sanitizeInput(name);
        txt += `@${safeName} score: ${scoreStr} ; Ranged damage: ${rangedStr} ; Melee damage: ${meleeStr} ; Incapacitations/revives: ${diffVal}\n`;
    });

    document.getElementById('copy-text').value = txt;
    document.getElementById('copy-modal').classList.add('active');
}

function copySummaryText() {
    const el = document.getElementById('copy-text');
    el.select();
    el.setSelectionRange(0, 99999);
    navigator.clipboard.writeText(el.value).then(() => {
        alert("Copied to clipboard!");
    }).catch(err => {
        console.error('Failed to copy:', err);
        alert("Failed to copy to clipboard. Please select and copy manually.");
    });
}

function downloadTransmissionLog() {
    const text = document.getElementById('copy-text').value;
    if (!text) {
        alert("No transmission data to save.");
        return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `Transmission_Log_${timestamp}.txt`;

    const blob = new Blob([text], { type: 'text/plain' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
}

// ============================================================================
// SECTION 11: PNG EXPORT FUNCTIONS
// Delegated to PNG Exporter module for DRY code
// ============================================================================

async function exportTopSectionPNG() {
    return PNGExporter.exportMissionScreen();
}

async function saveAsPNG() {
    return PNGExporter.exportAggregatedScreen();
}

// ============================================================================
// SECTION 12: EVENT SYSTEM (Mission Protocols)
// ============================================================================

const DB_URL = "https://raw.githubusercontent.com/burni2001/Crusade-Score-Calculator/refs/heads/Version7/data/events.json";
let cachedEvents = [];

function positionEventMenu() {
    const menu = document.getElementById('event-menu');
    const wrapper = document.querySelector('.gear-wrapper');
    if (!menu || !wrapper) return;

    const rect = wrapper.getBoundingClientRect();
    const margin = 12;
    const gap = 4;
    // Vertical layout: portrait-like aspect ratio or narrow viewport
    const isVertical = window.innerHeight > window.innerWidth || window.innerWidth <= 500;

    // Place below the button
    menu.style.top = (rect.bottom + gap) + 'px';

    // Update layout class for CSS transform-origin
    menu.classList.remove('layout-vertical', 'layout-horizontal');
    menu.classList.add(isVertical ? 'layout-vertical' : 'layout-horizontal');

    if (isVertical) {
        // Vertical layout: center on screen, below the button
        const menuWidth = Math.min(350, window.innerWidth - margin * 2);
        menu.style.width = menuWidth + 'px';
        menu.style.left = ((window.innerWidth - menuWidth) / 2) + 'px';
    } else {
        // Horizontal layout: anchor to button position
        const menuWidth = 350;
        menu.style.width = menuWidth + 'px';
        let left = rect.left;
        // Ensure it doesn't overflow the right edge
        if (left + menuWidth > window.innerWidth - margin) {
            left = window.innerWidth - margin - menuWidth;
        }
        // Ensure it doesn't overflow the left edge
        if (left < margin) {
            left = margin;
        }
        menu.style.left = left + 'px';
    }

    // Max-height: fill from menu top to bottom of viewport with breathing room
    menu.style.maxHeight = (window.innerHeight - rect.bottom - gap - margin) + 'px';
}

function closeEventMenu() {
    const menu = document.getElementById('event-menu');
    const wrapper = document.querySelector('.gear-wrapper');
    if (menu && menu.classList.contains('active')) {
        menu.classList.remove('active');
        if (wrapper) {
            wrapper.classList.remove('active');
            // Move menu back into the gear-wrapper
            wrapper.appendChild(menu);
        }
        document.querySelector('.cogitator-frame').style.overflow = '';
    }
}

function toggleEventMenu() {
    const menu = document.getElementById('event-menu');
    const wrapper = document.querySelector('.gear-wrapper');

    if (menu) {
        if (menu.classList.contains('active')) {
            closeEventMenu();
        } else {
            menu.classList.add('active');
            if (wrapper) wrapper.classList.add('active');
            // Move menu to body so it escapes overflow:clip and will-change containing blocks
            document.body.appendChild(menu);
            fetchEventList();
            positionEventMenu();
            // Prevent background scrolling when overlay is open
            document.querySelector('.cogitator-frame').style.overflow = 'hidden';
        }
    }
}

async function fetchEventList() {
    const container = document.getElementById('event-list-container');
    const status = document.getElementById('event-status');
    
    if (cachedEvents.length > 0 && container.children.length > 1) return;

    status.innerText = "Connecting...";
    status.style.color = "#cccc00";

    try {
        const response = await fetch(DB_URL);
        if (!response.ok) throw new Error("Network response was not ok");
        
        const data = await response.json();
        
        cachedEvents = []; 
        container.innerHTML = "";

        // Find the highest cycle number (most recent)
        let highestCycleIndex = 0;
        data.cycles.forEach((cycle, index) => {
            if (index > highestCycleIndex && cycle.name !== "Global Rules") {
                highestCycleIndex = index;
            }
        });

        data.cycles.forEach((cycle, cycleIndex) => {
            // Create cycle wrapper
            const cycleWrapper = document.createElement('div');
            cycleWrapper.className = 'cycle-wrapper';
            
            // Create header with collapse indicator
            const header = document.createElement('div');
            header.className = 'cycle-header collapsible';
            
            const headerText = document.createElement('span');
            headerText.textContent = cycle.name;
            
            const indicator = document.createElement('span');
            indicator.className = 'collapse-indicator';
            indicator.innerHTML = '&#9664;'; // Left-pointing triangle (closed)
            
            header.appendChild(headerText);
            header.appendChild(indicator);
            
            // Create events container
            const eventsContainer = document.createElement('div');
            eventsContainer.className = 'cycle-events';
            
            // Open the highest cycle number (most recent) by default
            if (cycleIndex === highestCycleIndex) {
                eventsContainer.classList.add('expanded');
                indicator.classList.add('expanded');
                indicator.innerHTML = '&#9660;'; // Down-pointing triangle
            }
            
            // Add click handler to toggle
            header.onclick = function() {
                eventsContainer.classList.toggle('expanded');
                indicator.classList.toggle('expanded');
                
                if (indicator.classList.contains('expanded')) {
                    indicator.innerHTML = '&#9660;'; // Down-pointing triangle
                } else {
                    indicator.innerHTML = '&#9664;'; // Left-pointing triangle
                }
            };

            cycle.events.forEach(event => {
                cachedEvents.push(event);

                const item = document.createElement('div');
                item.className = 'event-item';
                item.innerText = event.name;
                item.onclick = function(e) { 
                    e.stopPropagation(); // Prevent header toggle
                    selectEvent(event.id); 
                };

                eventsContainer.appendChild(item);
            });
            
            cycleWrapper.appendChild(header);
            cycleWrapper.appendChild(eventsContainer);
            container.appendChild(cycleWrapper);
        });

        status.innerText = "";

    } catch (error) {
        console.error("Fetch error:", error);
        container.innerHTML = `<div class="p-10 text-dim text-center" style="color:#cc4444;">Connection Failed.<br>Data not found.</div>`;
        status.innerText = "";
    }
}

function selectEvent(selectedId) {
    const status = document.getElementById('event-status');
    const eventData = cachedEvents.find(e => e.id === selectedId);
    
    if (eventData && eventData.modifiers) {
        document.getElementById('mod-kills').value = eventData.modifiers.kills;
        document.getElementById('mod-elite').value = eventData.modifiers.elite;
        document.getElementById('mod-tasks').value = eventData.modifiers.tasks;
        document.getElementById('mod-death').value = eventData.modifiers.death;
        document.getElementById('mod-damage').value = eventData.modifiers.damage;
        document.getElementById('mod-gene').value = eventData.modifiers.gene;
        document.getElementById('mod-armoury').value = eventData.modifiers.armoury;
        document.getElementById('mod-obj').value = eventData.modifiers.obj;
        document.getElementById('mod-waves').value = eventData.modifiers.waves;

        calculate();
        saveData();

        status.innerText = "Protocol Loaded.";
        status.style.color = "#80cc80";
        
        setTimeout(() => {
            closeEventMenu();
            status.innerText = "";
        }, 300);
    }
}

// ============================================================================
// SECTION 13: KEYBOARD & GLOBAL EVENT HANDLERS
// ============================================================================

document.addEventListener('keydown', function(event) {
    if (event.key === "Escape") {
        const ocrModal = document.getElementById('ocr-modal-overlay');
        if (ocrModal && ocrModal.classList.contains('active')) {
            ocrModal.classList.remove('active');
        }

        const copyModal = document.getElementById('copy-modal');
        if (copyModal && copyModal.classList.contains('active')) {
            copyModal.classList.remove('active');
        }

        const slotModal = document.getElementById('slot-modal-overlay');
        if (slotModal && slotModal.classList.contains('active')) {
            slotModal.classList.remove('active');
        }

        const creditsModal = document.getElementById('credits-modal');
        if (creditsModal && creditsModal.classList.contains('active')) {
            creditsModal.classList.remove('active');
        }

        closeEventMenu();
    }
});

document.addEventListener('click', function(event) {
    const insideWrapper = event.target.closest('.gear-wrapper');
    const insideMenu = event.target.closest('#event-menu');

    if (!insideWrapper && !insideMenu) {
        closeEventMenu();
    }
});

// Reposition event menu on resize/orientation change so it stays anchored
function repositionEventMenuIfOpen() {
    const menu = document.getElementById('event-menu');
    if (menu && menu.classList.contains('active')) {
        positionEventMenu();
    }
}
window.addEventListener('resize', repositionEventMenuIfOpen);
window.addEventListener('orientationchange', function() {
    // Delay slightly since dimensions update after the event fires
    setTimeout(repositionEventMenuIfOpen, 150);
});

// ============================================================================
// SECTION 14: MULTI-PAGE NAVIGATION SYSTEM
// ============================================================================

// Tracks the current active page (1, 2, or 3) - exposed for debugging via getCurrentPage()
let currentPage = 1;

/**
 * Get the current active page number
 * @returns {number} The current page number (1, 2, or 3)
 */
function getCurrentPage() {
    return currentPage;
}

/** Flag to prevent overlapping page transitions */
let isPageTransitioning = false;

/**
 * Navigate to a specific page (1, 2, or 3) with slide animation
 * @param {number} pageNum - The page number to navigate to
 */
function navigateToPage(pageNum) {
    if (pageNum < 1 || pageNum > 3) return;
    if (pageNum === currentPage) return;
    if (isPageTransitioning) return;

    const oldPage = document.getElementById(`page-${currentPage}`);
    const targetPage = document.getElementById(`page-${pageNum}`);
    if (!targetPage) return;

    const direction = pageNum > currentPage ? 'left' : 'right';
    const animDuration = 350; // matches CSS 0.35s

    // If there's no old page visible (initial load), just show directly
    if (!oldPage || !oldPage.classList.contains('active')) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        targetPage.classList.add('active');
        currentPage = pageNum;
        localStorage.setItem('cogitator_last_page', pageNum);
        document.querySelector('.cogitator-frame').scrollTo({ top: 0, behavior: 'smooth' });
        if (pageNum === 2 || pageNum === 3) renderDataBankUI();
        console.log(`📄 Navigated to Page ${pageNum}`);
        return;
    }

    isPageTransitioning = true;

    // Scroll to top instantly before animation starts
    document.querySelector('.cogitator-frame').scrollTo({ top: 0, behavior: 'instant' });

    // Clean any leftover swipe transforms
    oldPage.style.transform = '';
    oldPage.style.opacity = '';
    targetPage.style.transform = '';
    targetPage.style.opacity = '';

    // Lock container height so it doesn't collapse when both pages are absolute-positioned
    const pageContainer = document.querySelector('.page-container');
    pageContainer.style.minHeight = pageContainer.offsetHeight + 'px';

    // Animate old page out
    oldPage.classList.remove('active');
    oldPage.classList.add(direction === 'left' ? 'slide-out-left' : 'slide-out-right');

    // Animate new page in
    targetPage.classList.add(direction === 'left' ? 'slide-in-right' : 'slide-in-left');

    currentPage = pageNum;
    localStorage.setItem('cogitator_last_page', pageNum);

    // Update data bank UI during animation so it's ready when visible
    if (pageNum === 2 || pageNum === 3) {
        renderDataBankUI();
    }

    // Clean up after animation completes
    setTimeout(() => {
        oldPage.classList.remove('slide-out-left', 'slide-out-right');
        targetPage.classList.remove('slide-in-left', 'slide-in-right');
        targetPage.classList.add('active');
        pageContainer.style.minHeight = '';
        isPageTransitioning = false;
        console.log(`📄 Navigated to Page ${pageNum}`);
    }, animDuration);
}

/**
 * Toggle Custom Rules section in Event Selector dropdown
 */
function toggleCustomRules() {
    const content = document.getElementById('custom-rules-content');
    const indicator = document.getElementById('custom-rules-indicator');
    
    if (content && indicator) {
        content.classList.toggle('expanded');
        
        if (content.classList.contains('expanded')) {
            indicator.innerHTML = '&#9660;'; // Down-pointing triangle
            indicator.classList.add('expanded');
        } else {
            indicator.innerHTML = '&#9664;'; // Left-pointing triangle
            indicator.classList.remove('expanded');
        }
    }
}

/**
 * Record data screens as PNG (for Page 3)
 * Captures each individual saved mission and the aggregated tables
 */
async function recordAllDataScreens() {
    try {
        const statusEl = document.getElementById('import-status');
        const savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");

        if (savedSlots.length === 0) {
            if (statusEl) {
                statusEl.textContent = 'No saved missions to capture.';
                statusEl.style.color = '#cc4444';
            }
            return;
        }

        const btn = document.querySelector('button[onclick="recordAllDataScreens()"]');
        const originalText = btn ? btn.innerText : '';

        // Export each saved mission individually from its CSV data
        for (let i = 0; i < savedSlots.length; i++) {
            const slot = savedSlots[i];
            if (!slot || !slot.csv) continue;

            if (statusEl) {
                statusEl.textContent = `Capturing mission ${i + 1} of ${savedSlots.length}...`;
                statusEl.style.color = 'var(--pip-green)';
            }
            if (btn) btn.innerText = `CAPTURING ${i + 1}/${savedSlots.length}...`;

            await PNGExporter.exportMissionFromCSV(slot, i);
        }

        // Export aggregated data from page 3 (Aggregated Squad Matrix + Aggregated Statistics)
        if (statusEl) {
            statusEl.textContent = 'Capturing aggregated data...';
            statusEl.style.color = 'var(--pip-green)';
        }
        if (btn) btn.innerText = 'CAPTURING AGGREGATED...';

        await PNGExporter.exportAggregatedScreen();

        if (statusEl) {
            statusEl.textContent = `${savedSlots.length} mission(s) + aggregated data captured!`;
            statusEl.style.color = '#80cc80';
            setTimeout(() => {
                statusEl.textContent = '';
            }, 3000);
        }
        if (btn) {
            btn.innerText = '✓ CAPTURED';
            setTimeout(() => {
                if (btn) btn.innerText = originalText;
            }, 2000);
        }

    } catch (error) {
        console.error('Error recording data screens:', error);
        const statusEl = document.getElementById('import-status');
        if (statusEl) {
            statusEl.textContent = 'Error capturing screens. Please try again.';
            statusEl.style.color = '#cc4444';
        }
    }
}

// ============================================================================
// SECTION 15: PAGE INITIALIZATION
// ============================================================================

// Global variable to store Imperial Date interval ID
let imperialDateIntervalId = null;

window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Crusade Score Calculator...');
    loadData();
    calculate();
    updateAdditionalStatsHeaders();
    renderDataBankUI();
    loadAggregatedState();

    // Initialize input validation
    if (typeof InputValidator !== 'undefined') {
        InputValidator.initializeValidation();
    }
    
    // Initialize difficulty selector
    if (typeof initializeDifficultySelector === 'function') {
        initializeDifficultySelector();
    }
    
    // Initialize Imperial Date display
    if (typeof ImperialDate !== 'undefined') {
        imperialDateIntervalId = ImperialDate.startUpdating('imperial-date');
    } else {
        console.warn('⚠️ ImperialDate module not loaded - check that imperialDate.js is included before script.js');
    }
    
    // Initialize swipe navigation for mobile
    SwipeHandler.init();
    
    // Restore last viewed page, defaulting to Page 1
    const savedPage = parseInt(localStorage.getItem('cogitator_last_page')) || 1;
    navigateToPage(savedPage);
    
    console.log('✅ Ready');
});

window.addEventListener('beforeunload', function() {
    saveData();
    saveAggregatedState();
    // Clean up Imperial Date interval to prevent memory leaks
    if (typeof ImperialDate !== 'undefined') {
        if (imperialDateIntervalId) ImperialDate.stopUpdating(imperialDateIntervalId);
    }
});

console.log('💡 Debug Commands: debugStorage(), forceSave(), forceLoad(), clearSavedData()');

// ============================================================================
// SECTION 15: CREDITS MODAL
// ============================================================================
/**
 * Toggle the visibility of the credits modal
 */
function toggleCreditsModal() {
    const modal = document.getElementById('credits-modal');
    if (modal) {
        modal.classList.toggle('active');
    }
}

/**
 * Close credits modal when clicking on the backdrop (outside modal content)
 */
function closeCreditsOnBackdrop(event) {
    if (event.target.id === 'credits-modal') {
        toggleCreditsModal();
    }
}

// ============================================================================
// SECTION 16: SWIPE NAVIGATION FOR MOBILE & TRACKPAD
// ============================================================================

/**
 * Touch/trackpad swipe handler for page navigation
 * Detects horizontal swipes (touch) and trackpad gestures (wheel) to navigate between pages
 */
const SwipeHandler = {
    startX: 0,
    startY: 0,
    startTarget: null,
    isSwiping: false,
    swipeLocked: false,       // true once we commit to horizontal swipe
    scrollLocked: false,      // true once we commit to vertical scroll
    activePage: null,         // the current page element being dragged
    peekPage: null,           // the adjacent page peeking in
    minSwipeDistance: 50,
    maxVerticalDistance: 100,
    dragDamping: 0.55,        // how much the finger drag translates to page movement

    // Trackpad wheel gesture state
    wheelDeltaX: 0,
    wheelTimeout: null,
    wheelThreshold: 80,       // accumulated deltaX needed to trigger navigation
    wheelCooldown: false,

    init() {
        // Touch events for mobile
        document.addEventListener('touchstart', this.handleTouchStart.bind(this), { passive: true });
        document.addEventListener('touchmove', this.handleTouchMove.bind(this), { passive: false });
        document.addEventListener('touchend', this.handleTouchEnd.bind(this), { passive: true });
        document.addEventListener('touchcancel', this.handleTouchCancel.bind(this), { passive: true });
        // Wheel events for trackpad horizontal gestures
        document.querySelector('.cogitator-frame').addEventListener('wheel', this.handleWheel.bind(this), { passive: false });
        console.log('📱 Swipe & trackpad navigation initialized');
    },

    handleTouchStart(event) {
        if (event.touches.length !== 1) return;
        if (isPageTransitioning) return;

        this.startX = event.touches[0].clientX;
        this.startY = event.touches[0].clientY;
        this.startTarget = event.target;
        this.isSwiping = false;
        this.swipeLocked = false;
        this.scrollLocked = false;
        this.activePage = document.getElementById(`page-${currentPage}`);
        this.peekPage = null;
    },

    handleTouchMove(event) {
        if (event.touches.length !== 1) return;
        if (isPageTransitioning) return;
        if (this.scrollLocked) return;

        const touchX = event.touches[0].clientX;
        const touchY = event.touches[0].clientY;
        const deltaX = touchX - this.startX;
        const deltaY = touchY - this.startY;

        // Decide direction lock on first significant movement
        if (!this.swipeLocked && !this.scrollLocked) {
            if (Math.abs(deltaY) > 10 && Math.abs(deltaY) > Math.abs(deltaX)) {
                this.scrollLocked = true;
                return;
            }
            if (Math.abs(deltaX) > 10 && Math.abs(deltaX) > Math.abs(deltaY)) {
                // Check if swipe should be ignored
                if (this.isInteractiveElement(this.startTarget)) { this.scrollLocked = true; return; }
                if (this.isModalActive()) { this.scrollLocked = true; return; }
                if (this.isInsideScrollableElement(this.startTarget)) { this.scrollLocked = true; return; }
                this.swipeLocked = true;
            } else {
                return;
            }
        }

        // Prevent vertical scroll while swiping horizontally
        event.preventDefault();

        // Determine which adjacent page would peek in
        const goingLeft = deltaX < 0; // finger moves left = next page
        const targetPageNum = goingLeft ? currentPage + 1 : currentPage - 1;

        // Don't drag if there's no page in that direction
        if (targetPageNum < 1 || targetPageNum > 3) {
            // Rubber-band: allow tiny movement but heavily damped
            const rubberDelta = deltaX * 0.15;
            if (this.activePage) {
                this.activePage.style.transform = `translateX(${rubberDelta}px)`;
            }
            // Hide stale peek page if direction changed to an edge
            if (this.peekPage) {
                this.peekPage.classList.remove('swiping');
                this.peekPage.style.transform = '';
                this.peekPage.style.opacity = '';
                this.peekPage = null;
            }
            return;
        }

        // Set or update peek page (handles mid-swipe direction change)
        const newPeekPage = document.getElementById(`page-${targetPageNum}`);
        if (!this.isSwiping) {
            this.isSwiping = true;
            this.peekPage = newPeekPage;
            if (this.peekPage) {
                this.peekPage.classList.add('swiping');
            }
        } else if (newPeekPage !== this.peekPage) {
            // Direction changed mid-swipe: swap peek page
            if (this.peekPage) {
                this.peekPage.classList.remove('swiping');
                this.peekPage.style.transform = '';
                this.peekPage.style.opacity = '';
            }
            this.peekPage = newPeekPage;
            if (this.peekPage) {
                this.peekPage.classList.add('swiping');
            }
        }

        const dragX = deltaX * this.dragDamping;
        const containerWidth = this.activePage ? this.activePage.offsetWidth : window.innerWidth;

        // Move active page with finger
        if (this.activePage) {
            this.activePage.style.transform = `translateX(${dragX}px)`;
            this.activePage.style.opacity = Math.max(0.3, 1 - Math.abs(dragX) / containerWidth);
        }

        // Position peek page coming from the side
        if (this.peekPage) {
            const peekOffset = goingLeft
                ? containerWidth + dragX   // comes from right
                : -containerWidth + dragX; // comes from left
            this.peekPage.style.transform = `translateX(${peekOffset}px)`;
            this.peekPage.style.opacity = Math.min(1, Math.abs(dragX) / containerWidth + 0.3);
        }
    },

    handleTouchEnd(event) {
        if (event.changedTouches.length !== 1) return;

        const endX = event.changedTouches[0].clientX;
        const deltaX = endX - this.startX;

        // Capture state before cleanup resets it
        const wasSwipeLocked = this.swipeLocked;

        if (!wasSwipeLocked || isPageTransitioning || Math.abs(deltaX) < this.minSwipeDistance) {
            // Below threshold or not a valid swipe — smooth snap-back
            this.snapBack();
            return;
        }

        const targetPageNum = deltaX > 0 ? currentPage - 1 : currentPage + 1;
        if (targetPageNum < 1 || targetPageNum > 3) {
            this.snapBack();
            return;
        }

        // Complete the page transition from current drag position
        this.completeSwipeNavigation(targetPageNum, deltaX);
    },

    /**
     * Smoothly animate pages back to original position when swipe is cancelled
     */
    snapBack() {
        const transitionStyle = 'transform 0.25s ease-out, opacity 0.25s ease-out';
        if (this.activePage) {
            this.activePage.style.transition = transitionStyle;
            this.activePage.style.transform = 'translateX(0)';
            this.activePage.style.opacity = '1';
        }
        if (this.peekPage) {
            const containerWidth = this.activePage ? this.activePage.offsetWidth : window.innerWidth;
            // Determine which side the peek page came from
            const peekIsNext = this.peekPage.id > `page-${currentPage}`;
            this.peekPage.style.transition = transitionStyle;
            this.peekPage.style.transform = `translateX(${peekIsNext ? containerWidth : -containerWidth}px)`;
            this.peekPage.style.opacity = '0';
        }

        // Clean up after snap-back animation
        const activePage = this.activePage;
        const peekPage = this.peekPage;
        setTimeout(() => {
            if (activePage) {
                activePage.style.transition = '';
                activePage.style.transform = '';
                activePage.style.opacity = '';
            }
            if (peekPage) {
                peekPage.classList.remove('swiping');
                peekPage.style.transition = '';
                peekPage.style.transform = '';
                peekPage.style.opacity = '';
            }
        }, 260);

        this.isSwiping = false;
        this.swipeLocked = false;
        this.scrollLocked = false;
        this.peekPage = null;
    },

    /**
     * Complete page navigation from current drag position with a smooth finish
     */
    completeSwipeNavigation(targetPageNum, deltaX) {
        isPageTransitioning = true;

        const containerWidth = this.activePage ? this.activePage.offsetWidth : window.innerWidth;
        const goingLeft = deltaX < 0;
        const transitionStyle = 'transform 0.25s ease-out, opacity 0.25s ease-out';

        // Lock container height so it doesn't collapse during transition
        const pageContainer = document.querySelector('.page-container');
        pageContainer.style.minHeight = pageContainer.offsetHeight + 'px';

        // Scroll to top instantly
        document.querySelector('.cogitator-frame').scrollTo({ top: 0, behavior: 'instant' });

        // Take old page out of normal flow to prevent margin collapse
        // (its negative-margin header-nav can shift page-container position)
        if (this.activePage) {
            this.activePage.classList.remove('active');
            this.activePage.classList.add('swiping');
        }

        // Animate active page off-screen from its current drag position
        if (this.activePage) {
            this.activePage.style.transition = transitionStyle;
            this.activePage.style.transform = `translateX(${goingLeft ? -containerWidth : containerWidth}px)`;
            this.activePage.style.opacity = '0';
        }

        // Animate peek page to center from its current position
        if (this.peekPage) {
            this.peekPage.style.transition = transitionStyle;
            this.peekPage.style.transform = 'translateX(0)';
            this.peekPage.style.opacity = '1';
        }

        const oldPage = this.activePage;
        const newPage = this.peekPage;
        currentPage = targetPageNum;

        // Update data bank UI during animation so it's ready when visible
        if (targetPageNum === 2 || targetPageNum === 3) {
            renderDataBankUI();
        }

        // Clean up after transition completes
        setTimeout(() => {
            if (oldPage) {
                oldPage.classList.remove('active', 'swiping');
                oldPage.style.transition = '';
                oldPage.style.transform = '';
                oldPage.style.opacity = '';
            }
            if (newPage) {
                newPage.classList.remove('swiping');
                newPage.classList.add('active');
                newPage.style.transition = '';
                newPage.style.transform = '';
                newPage.style.opacity = '';
            }
            pageContainer.style.minHeight = '';
            isPageTransitioning = false;
            console.log(`📄 Navigated to Page ${targetPageNum}`);
        }, 260);

        this.isSwiping = false;
        this.swipeLocked = false;
        this.scrollLocked = false;
        this.peekPage = null;
    },

    /**
     * Handle trackpad horizontal wheel gestures (e.g. MacBook two-finger swipe)
     */
    handleWheel(event) {
        if (isPageTransitioning) return;
        if (this.wheelCooldown) return;
        if (this.isModalActive()) return;

        // Only respond to horizontal scroll (trackpad gestures produce deltaX)
        // Ignore mouse wheel events (mostly vertical with deltaY dominant)
        if (Math.abs(event.deltaX) < 2 || Math.abs(event.deltaY) > Math.abs(event.deltaX)) return;

        // Check if target is inside a horizontally scrollable element
        if (this.isInsideScrollableElement(event.target)) return;

        this.wheelDeltaX += event.deltaX;

        // Reset accumulated delta after a pause in gesture
        clearTimeout(this.wheelTimeout);
        this.wheelTimeout = setTimeout(() => {
            this.wheelDeltaX = 0;
        }, 200);

        // Check if threshold reached
        if (Math.abs(this.wheelDeltaX) >= this.wheelThreshold) {
            const direction = this.wheelDeltaX > 0 ? 1 : -1; // positive deltaX = swipe left = next page
            const targetPage = currentPage + direction;

            this.wheelDeltaX = 0;
            clearTimeout(this.wheelTimeout);

            if (targetPage >= 1 && targetPage <= 3) {
                this.wheelCooldown = true;
                navigateToPage(targetPage);
                // Cooldown prevents rapid repeated navigation
                setTimeout(() => { this.wheelCooldown = false; }, 500);
            }
        }
    },

    handleTouchCancel() {
        this.snapBack();
    },

    cleanupDrag() {
        if (this.activePage) {
            this.activePage.style.transform = '';
            this.activePage.style.opacity = '';
        }
        if (this.peekPage) {
            this.peekPage.classList.remove('swiping');
            this.peekPage.style.transform = '';
            this.peekPage.style.opacity = '';
            this.peekPage = null;
        }
        this.isSwiping = false;
        this.swipeLocked = false;
        this.scrollLocked = false;
    },

    isInteractiveElement(element) {
        if (!element || !(element instanceof Element)) return false;
        const tagName = element.tagName.toLowerCase();
        return ['input', 'textarea', 'select'].includes(tagName);
    },

    isModalActive() {
        return document.querySelector('.modal-overlay.active') !== null ||
               document.querySelector('#event-menu.active') !== null;
    },

    isInsideScrollableElement(element) {
        if (!element || !(element instanceof Element)) return false;
        let current = element;
        while (current && current !== document.body) {
            const style = window.getComputedStyle(current);
            const overflowX = style.getPropertyValue('overflow-x');
            if ((overflowX === 'auto' || overflowX === 'scroll') &&
                current.scrollWidth > current.clientWidth) {
                return true;
            }
            current = current.parentElement;
        }
        return false;
    },

    navigatePrevious() {
        const prevPage = currentPage - 1;
        if (prevPage >= 1) {
            navigateToPage(prevPage);
            console.log('👈 Swipe right - navigating to page', prevPage);
        }
    },

    navigateNext() {
        const nextPage = currentPage + 1;
        if (nextPage <= 3) {
            navigateToPage(nextPage);
            console.log('👉 Swipe left - navigating to page', nextPage);
        }
    }
};

// ============================================================================
// END OF SCRIPT
// ============================================================================

// ============================================================================
// DEVELOPER CONSOLE COMMANDS
// ============================================================================
// Available commands for debugging:
// 
// debugStorage()      - View LocalStorage contents
// forceSave()         - Manually trigger save
// forceLoad()         - Manually trigger load
// clearSavedData()    - Clear all saved data (with confirmation)
// navigateToPage(n)   - Navigate to page n (1, 2, or 3)
//
// ============================================================================
