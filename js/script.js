// ============================================================================
// CRUSADE SCORE CALCULATOR - Main Application Script
// Version: 6.0
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
            statusEl.style.color = '#ff5555';
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
        statusDiv.style.color = "#afffa6";
        progressDiv.textContent = "";

        showOCRModal();
        
    } catch (error) {
        ErrorHandler.handle(error, 'Screenshot Upload', true);
        statusDiv.textContent = `Error: ${error.message}`;
        statusDiv.style.color = "#ff3300";
        progressDiv.textContent = "";
        
    } finally {
        e.target.value = "";
    }
});

// ============================================================================
// SECTION 5: OCR MODAL UI
// ============================================================================

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
    html += createRow("mission-name", "text", "Mission");
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
            input.value = sanitizeInput(String(pendingOCRResults[id]));
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
                        updateDifficultyOptions(result.value);
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
            statusDiv.style.color = "#afffa6";
        }

        try {
            calculate();
            saveData();
            if (typeof updateAdditionalStatsHeaders === "function") {
                updateAdditionalStatsHeaders();
            }
        } catch (calcError) {
            ErrorHandler.handle(calcError, 'Calculation after OCR apply', false);
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
        result = InputValidator.validateMissionName(rawValue);
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
    const missionNameInput = document.getElementById('mission-name');
    
    if (!missionNameInput) {
        console.warn('Mission name input not found');
        return;
    }
    
    // Update as user types
    missionNameInput.addEventListener('input', function() {
        updateDifficultyOptions(this.value);
    });
    
    // Update on field change
    missionNameInput.addEventListener('change', function() {
        updateDifficultyOptions(this.value);
    });
    
    // Initial update
    updateDifficultyOptions(missionNameInput.value);
    
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
    "mission-name", "mission-difficulty", "global-objective", "global-geneseed",
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
        
        if (typeof calculate === 'function') calculate();
        if (typeof updateAdditionalStatsHeaders === 'function') updateAdditionalStatsHeaders();
        
        return true;
        
    } catch (e) {
        ErrorHandler.handle(e, 'Load Data', false);
        console.error("loadData failed:", e.message);
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
    const missionName = getStr("mission-name") || "Unknown Mission";
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
    if (!container) {
        console.warn('renderDataBankUI: data-bank-ui element not found');
        return;
    }
    
    const savedSlots = JSON.parse(localStorage.getItem("cogitator_saved_missions") || "[]");
    
    const counterEl = document.getElementById("slots-count-display");
    if (counterEl) counterEl.textContent = `${savedSlots.length}/4`;

    container.innerHTML = "";

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
        statusEl.style.color = "#ff5555";
        return;
    }

    if (savedSlots.length === 0) {
        statusEl.textContent = "NO DATA SLATES FOUND IN MEMORY";
        statusEl.style.color = "#ff5555";
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
    
    if (successCount > 0) {
        statusEl.textContent = `AGGREGATED ${successCount} SLATE(S)` + (corruptedCount ? ` (${corruptedCount} PURGED)` : "");
        statusEl.style.color = "var(--pip-green)";
        document.getElementById('results-container').scrollIntoView({ behavior: 'smooth' });
    } else {
        statusEl.textContent = "ALL SLATES WERE CORRUPTED AND PURGED.";
        statusEl.style.color = "#ff5555";
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
            const statusEl = document.getElementById('import-status');
            statusEl.textContent = `PROCESSED ${files.length} FILES SUCCESSFULLY`;
            statusEl.style.color = "var(--pip-green)";
        } catch (err) {
            console.error(err);
            const statusEl = document.getElementById('import-status');
            statusEl.textContent = "ERROR READING FILES";
            statusEl.style.color = "#ff5555";
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
                span.style.color = diff >= 0 ? '#afffa6' : '#ff6600';
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
            span.style.color = totalDiff >= 0 ? '#afffa6' : '#ff6600';
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

const DB_URL = "https://raw.githubusercontent.com/burni2001/Crusade-Score-Calculator/refs/heads/Version6/data/events.json";
let cachedEvents = [];

function toggleEventMenu() {
    const menu = document.getElementById('event-menu');
    const otherMenu = document.getElementById('modifiers-menu');
    const wrapper = document.querySelector('.gear-wrapper:first-child'); // Event selector wrapper
    
    if (otherMenu && otherMenu.classList.contains('active')) {
        otherMenu.classList.remove('active');
        const otherWrapper = document.querySelector('.gear-wrapper:last-child');
        if (otherWrapper) otherWrapper.classList.remove('active');
    }

    if (menu) {
        menu.classList.toggle('active');
        if (wrapper) wrapper.classList.toggle('active');
        
        if (menu.classList.contains('active')) {
            fetchEventList();
        }
    }
}

async function fetchEventList() {
    const container = document.getElementById('event-list-container');
    const status = document.getElementById('event-status');
    
    if (cachedEvents.length > 0 && container.children.length > 1) return;

    status.innerText = "Connecting...";
    status.style.color = "#ffff00";

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
        container.innerHTML = `<div class="p-10 text-dim text-center" style="color:#f55;">Connection Failed.<br>Data not found.</div>`;
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
        status.style.color = "#afffa6";
        
        setTimeout(() => {
            document.getElementById('event-menu').classList.remove('active');
            status.innerText = "";
        }, 300);
    }
}

function toggleModifiersMenu() {
    const menu = document.getElementById('modifiers-menu');
    const eventMenu = document.getElementById('event-menu');
    const wrapper = document.querySelector('.gear-wrapper:last-child'); // Modifiers wrapper
    
    if (eventMenu && eventMenu.classList.contains('active')) {
        eventMenu.classList.remove('active');
        const eventWrapper = document.querySelector('.gear-wrapper:first-child');
        if (eventWrapper) eventWrapper.classList.remove('active');
    }

    if (menu) {
        menu.classList.toggle('active');
        if (wrapper) wrapper.classList.toggle('active');
        
        if (!menu.classList.contains('active')) {
            calculate();
        }
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

        const modMenu = document.getElementById('modifiers-menu');
        const modWrapper = document.querySelector('.gear-wrapper:last-child');
        if (modMenu && modMenu.classList.contains('active')) {
            modMenu.classList.remove('active');
            if (modWrapper) modWrapper.classList.remove('active');
        }

        const eventMenu = document.getElementById('event-menu');
        const eventWrapper = document.querySelector('.gear-wrapper:first-child');
        if (eventMenu && eventMenu.classList.contains('active')) {
            eventMenu.classList.remove('active');
            if (eventWrapper) eventWrapper.classList.remove('active');
        }
    }
});

document.addEventListener('click', function(event) {
    const insideWrapper = event.target.closest('.gear-wrapper');

    if (!insideWrapper) {
        const eventMenu = document.getElementById('event-menu');
        const eventWrapper = document.querySelector('.gear-wrapper:first-child');
        if (eventMenu && eventMenu.classList.contains('active')) {
            eventMenu.classList.remove('active');
            if (eventWrapper) eventWrapper.classList.remove('active');
        }

        const modMenu = document.getElementById('modifiers-menu');
        const modWrapper = document.querySelector('.gear-wrapper:last-child');
        if (modMenu && modMenu.classList.contains('active')) {
            modMenu.classList.remove('active');
            if (modWrapper) modWrapper.classList.remove('active');
        }
    }
});

// ============================================================================
// SECTION 14: PAGE INITIALIZATION
// ============================================================================

// Global variable to store Imperial Date interval ID
let imperialDateIntervalId = null;

window.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Crusade Score Calculator...');
    loadData();
    calculate();
    updateAdditionalStatsHeaders();
    renderDataBankUI();

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
    
    console.log('✅ Ready');
});

window.addEventListener('beforeunload', function() {
    saveData();
    // Clean up Imperial Date interval to prevent memory leaks
    // Only clean up if ImperialDate was successfully initialized
    if (imperialDateIntervalId && typeof ImperialDate !== 'undefined') {
        ImperialDate.stopUpdating(imperialDateIntervalId);
    }
});

console.log('💡 Debug Commands: debugStorage(), forceSave(), forceLoad(), clearSavedData()');

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
//
// ============================================================================
