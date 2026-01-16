// ============================================================================
// CSV HANDLER MODULE
// RFC 4180 compliant CSV parsing and generation
// ============================================================================
// 
// Purpose: Centralized CSV operations for export, import, and validation
// Features:
// - RFC 4180 compliant escaping (handles commas, quotes, newlines)
// - Robust parsing with edge case handling
// - Built-in test suite for validation
// - Decoupled from DOM for reusability
//
// Usage:
//   const csv = CSVHandler.generateFromState(getVal, getStr);
//   const data = CSVHandler.parseToStructure(csvText);
// ============================================================================

"use strict";

const CSVHandler = {
    
    // ========================================================================
    // PARSING FUNCTIONS
    // ========================================================================
    
    /**
     * Parse CSV row with proper quote handling according to RFC 4180
     * 
     * @param {string} rowStr - CSV row to parse
     * @returns {string[]} - Array of field values
     * 
     * @example
     * parseRow('a,b,c') → ['a', 'b', 'c']
     * parseRow('"Smith, John",Tactical,150') → ['Smith, John', 'Tactical', '150']
     * parseRow('"He said ""hello"""') → ['He said "hello"']
     */
    parseRow(rowStr) {
        const res = [];
        let cur = '';
        let inQuotes = false;
        let i = 0;
        
        while (i < rowStr.length) {
            const c = rowStr[i];
            const next = rowStr[i + 1];
            
            if (c === '"') {
                if (inQuotes && next === '"') {
                    // Escaped quote: "" inside quoted field → becomes single "
                    cur += '"';
                    i += 2; // Skip both quotes
                    continue;
                }
                // Toggle quote mode (start or end of quoted field)
                inQuotes = !inQuotes;
                i++;
                continue;
            }
            
            if (c === ',' && !inQuotes) {
                // Field delimiter (only when not inside quotes)
                res.push(cur.trim());
                cur = '';
                i++;
                continue;
            }
            
            // Regular character - add to current field
            cur += c;
            i++;
        }
        
        // Push final field
        res.push(cur.trim());
        
        // Validation: warn if quotes weren't properly closed
        if (inQuotes) {
            console.warn('⚠️ CSV parsing warning: Unclosed quotes in row:', rowStr.substring(0, 50) + '...');
        }
        
        return res;
    },

    /**
     * Escape CSV field value according to RFC 4180
     * - Wraps in quotes if contains comma, quote, or newline
     * - Escapes internal quotes by doubling them
     * 
     * @param {any} value - Value to escape
     * @returns {string} - Properly escaped CSV field
     * 
     * @example
     * escapeField('Normal') → 'Normal'
     * escapeField('Smith, John') → '"Smith, John"'
     * escapeField('He said "hello"') → '"He said ""hello"""'
     */
    escapeField(value) {
        // Convert to string and handle null/undefined
        if (value === null || value === undefined) {
            return '';
        }
        
        const str = String(value);
        
        // Check if escaping needed
        const needsEscape = str.includes(',') || 
                           str.includes('"') || 
                           str.includes('\n') || 
                           str.includes('\r');
        
        if (needsEscape) {
            // Escape quotes by doubling them, then wrap in quotes
            return '"' + str.replace(/"/g, '""') + '"';
        }
        
        return str;
    },

    // ========================================================================
    // GENERATION FUNCTIONS
    // ========================================================================

    /**
     * Generate complete CSV string from mission state
     * Uses callback functions to access form values (decoupled from DOM)
     * 
     * @param {Function} getVal - Function to get numeric values by field ID
     * @param {Function} getStr - Function to get string values by field ID
     * @param {Function} getSelect - Function to get select values by field ID
     * @returns {string} - Complete RFC 4180 compliant CSV
     */
    generateFromState(getVal, getStr, getSelect) {
        const csv = [];

        // ====================================================================
        // MISSION PARAMETERS
        // ====================================================================
        csv.push("MISSION PARAMETERS");
        csv.push(`Mission Played:,${this.escapeField(getStr("mission-name"))}`);
        csv.push(`Difficulty:,${this.escapeField(getSelect("mission-difficulty"))}`);
        csv.push(`Waves Reached:,${getVal("global-waves")}`);
        csv.push(`Objective Completion:,${getSelect("global-objective") === "1" ? "Yes" : "No"}`);
        csv.push(`Geneseed Retrieved:,${getSelect("global-geneseed") === "1" ? "Yes" : "No"}`);
        csv.push(`Armoury Data Retrieved:,${getVal("global-armoury")}`);
        csv.push("");

        // ====================================================================
        // MODIFIERS
        // ====================================================================
        csv.push("MODIFIERS");
        csv.push(`Kills:,${getVal("mod-kills")}`);
        csv.push(`Special Kills:,${getVal("mod-elite")}`);
        csv.push(`Incapacitations:,${getVal("mod-death")}`);
        csv.push(`Damage Taken:,${getVal("mod-damage")}`);
        csv.push(`Geneseed:,${getVal("mod-gene")}`);
        csv.push(`Armoury:,${getVal("mod-armoury")}`);
        csv.push(`Objective:,${getVal("mod-obj")}`);
        csv.push(`Waves:,${getVal("mod-waves")}`);
        csv.push(`Tasks:,${getVal("mod-tasks")}`);
        csv.push("");

        // ====================================================================
        // PLAYER NAMES & CLASSES
        // ====================================================================
        const p1Name = getStr("p1-name") || "Battle Brother 1";
        const p2Name = getStr("p2-name") || "Battle Brother 2";
        const p3Name = getStr("p3-name") || "Battle Brother 3";

        const p1Class = getSelect("p1-class");
        const p2Class = getSelect("p2-class");
        const p3Class = getSelect("p3-class");

        // ====================================================================
        // SQUAD PERFORMANCE MATRIX
        // ====================================================================
        csv.push("SQUAD PERFORMANCE MATRIX");
        csv.push(`,${this.escapeField(p1Name)},${this.escapeField(p2Name)},${this.escapeField(p3Name)},TOTAL`);
        csv.push(`Class,${this.escapeField(p1Class)},${this.escapeField(p2Class)},${this.escapeField(p3Class)},`);

        // Helper to get text content from DOM element
        const getTxt = (id) => {
            if (typeof document !== 'undefined') {
                const el = document.getElementById(id);
                return el ? el.textContent : '0';
            }
            return '0';
        };

        csv.push(`Kills,${getVal("p1-kills")},${getVal("p2-kills")},${getVal("p3-kills")},${getTxt("total-kills")}`);
        csv.push(`Special Kills,${getVal("p1-elite")},${getVal("p2-elite")},${getVal("p3-elite")},${getTxt("total-elite")}`);
        csv.push(`Incapacitations,${getVal("p1-death")},${getVal("p2-death")},${getVal("p3-death")},${getTxt("total-death")}`);
        csv.push(`Damage Taken,${getVal("p1-damage")},${getVal("p2-damage")},${getVal("p3-damage")},${getTxt("total-damage")}`);
        csv.push(`Tasks Completed,${getVal("p1-tasks")},${getVal("p2-tasks")},${getVal("p3-tasks")},${getTxt("total-tasks")}`);
        csv.push(`Base Score,${getTxt("p1-base")},${getTxt("p2-base")},${getTxt("p3-base")},${getTxt("total-base")}`);
        csv.push(`Modifier Score,${getTxt("p1-mod")},${getTxt("p2-mod")},${getTxt("p3-mod")},${getTxt("total-mod")}`);
        csv.push(`TOTAL SCORE,${getTxt("p1-final")},${getTxt("p2-final")},${getTxt("p3-final")},${getTxt("total-final")}`);
        csv.push("");

        // ====================================================================
        // ADDITIONAL STATISTICS
        // ====================================================================
        csv.push("ADDITIONAL STATISTICS");
        csv.push(`,${this.escapeField(p1Name)},${this.escapeField(p2Name)},${this.escapeField(p3Name)},TOTAL`);
        csv.push(`Melee Damage,${getVal("p1-melee")},${getVal("p2-melee")},${getVal("p3-melee")},${getTxt("total-melee")}`);
        csv.push(`Ranged Damage,${getVal("p1-ranged")},${getVal("p2-ranged")},${getVal("p3-ranged")},${getTxt("total-ranged")}`);
        csv.push(`Items Found,${getVal("p1-items")},${getVal("p2-items")},${getVal("p3-items")},${getTxt("total-items")}`);

        // Revives with diff calculation
        const p1Revived = getVal("p1-revived");
        const p2Revived = getVal("p2-revived");
        const p3Revived = getVal("p3-revived");
        const p1Deaths = getVal("p1-death");
        const p2Deaths = getVal("p2-death");
        const p3Deaths = getVal("p3-death");
        const p1Diff = p1Revived - p1Deaths;
        const p2Diff = p2Revived - p2Deaths;
        const p3Diff = p3Revived - p3Deaths;
        const totalRevived = p1Revived + p2Revived + p3Revived;
        const totalDeaths = p1Deaths + p2Deaths + p3Deaths;
        const totalDiff = totalRevived - totalDeaths;
        
        csv.push(`Teammates Revived,${p1Revived} (${p1Diff >= 0 ? "+" : ""}${p1Diff}),${p2Revived} (${p2Diff >= 0 ? "+" : ""}${p2Diff}),${p3Revived} (${p3Diff >= 0 ? "+" : ""}${p3Diff}),${totalRevived} (${totalDiff >= 0 ? "+" : ""}${totalDiff})`);

        return csv.join("\n");
    },

    /**
     * Parse CSV text into structured mission data
     * Used for aggregating multiple mission CSVs
     * 
     * @param {string} text - CSV text to parse
     * @param {Object} validator - InputValidator instance for number validation
     * @returns {Object} - Parsed mission data structure
     */
    parseToStructure(text, validator) {
        const lines = text.split(/\r?\n/);
        const data = {
            mission: { name:'-', diff:'-', waves:'-', obj:'-', gene:'-', arm:'-', tasks:'-' },
            modifiers: { kills:'-', specials:'-', incaps:'-', dmg:'-', gene:'-', arm:'-', obj:'-', waves:'-', tasks:'-' },
            players: {},
            playerOrder: [],
            matrixTotals: {}
        };

        // Helper: Validate CSV numbers
        const validateCSVNumber = (value, fieldType) => {
            if (value === null || value === undefined || value === '') {
                return 0;
            }
            
            let result;
            if (fieldType === 'stat') {
                result = validator.validateStat(value);
            } else if (fieldType === 'damage') {
                result = validator.validateDamage(value);
            } else if (fieldType === 'modifier') {
                result = validator.validateModifier(value);
            }
            
            if (!result.valid) {
                console.warn(`CSV validation corrected: ${value} → ${result.value} (${result.error})`);
            }
            
            return result.valid ? result.value : 0;
        };

        // Helper: Match value with regex
        const matchVal = (line, regex) => {
            const m = line.match(regex);
            return m ? m[1].replace(/,/g, '').trim() : null;
        };

        // ====================================================================
        // PARSE MISSION PARAMETERS & MODIFIERS
        // ====================================================================
        for (let i = 0; i < Math.min(lines.length, 60); i++) {
            const line = lines[i].trim();
            if (!line) continue;

            // Mission parameters
            if (data.mission.name === '-') data.mission.name = matchVal(line, /^[, \t]*Mission Played[:,\s]+(.+)/i) || '-';
            if (data.mission.diff === '-') data.mission.diff = matchVal(line, /^[, \t]*Difficulty[:,\s]+(.+)/i) || '-';
            if (data.mission.obj === '-') data.mission.obj = matchVal(line, /^[, \t]*Objective Completion[:,\s]+(.+)/i) || '-';
            if (data.mission.gene === '-') data.mission.gene = matchVal(line, /^[, \t]*Geneseed Retrieved[:,\s]+(.+)/i) || '-';
            if (data.mission.arm === '-') data.mission.arm = matchVal(line, /^[, \t]*Armoury Data Retrieved[:,\s]+(.+)/i) || '-';
            if (data.mission.waves === '-') data.mission.waves = matchVal(line, /^[, \t]*Waves Reached[:,\s]+(.+)/i) || '-';
            if (data.mission.tasks === '-') data.mission.tasks = matchVal(line, /^[, \t]*Tasks Completed[:,\s]+(.+)/i) || '-';

            // Modifiers (format: "Key:,Value")
            if (line.includes(':,')) {
                const parts = line.split(':,');
                if (parts.length >= 2) {
                    const key = parts[0].trim();
                    const val = parts[1].split(',')[0].trim();

                    if (key === 'Kills') data.modifiers.kills = val;
                    if (key === 'Special Kills') data.modifiers.specials = val;
                    if (key === 'Incapacitations') data.modifiers.incaps = val;
                    if (key === 'Damage Taken') data.modifiers.dmg = val;
                    if (key === 'Geneseed') data.modifiers.gene = val;
                    if (key === 'Armoury') data.modifiers.arm = val;
                    if (key === 'Waves') data.modifiers.waves = val;
                    if (key === 'Objective') data.modifiers.obj = val;
                    if (key === 'Tasks') data.modifiers.tasks = val;
                }
            }
        }

        // ====================================================================
        // PARSE MATRIX & STATS SECTIONS
        // ====================================================================
        const MATRIX_KEYS = [
            "Kills", "Special Kills", "Incapacitations", 
            "Damage Taken", "Base Score", "Tasks Completed", "Modifier Score", "TOTAL SCORE"
        ];

        const ADD_STATS_KEYS = [
            "Melee Damage", "Ranged Damage", "Items Found", "Teammates Revived"
        ];

        const parseSection = (sectionName, keysToExtract) => {
            const idx = lines.findIndex(l => l.toUpperCase().includes(sectionName));
            if (idx === -1) return;

            const header = this.parseRow(lines[idx + 1]);
            const colMap = {};
            let totalColIdx = -1;

            // Map columns to player names
            header.forEach((h, col) => {
                const hh = h.toUpperCase().trim();
                if (hh === 'TOTAL') {
                    totalColIdx = col;
                } else if (hh.length > 0) {
                    colMap[col] = h.trim();
                    const pName = h.trim();
                    if (!data.players[pName]) {
                        data.players[pName] = {}; 
                        data.playerOrder.push(pName);
                    }
                }
            });

            // Find label column
            let labelCol = 0;
            for (let r = idx + 2; r < Math.min(idx + 15, lines.length); r++) {
                const rowData = this.parseRow(lines[r]);
                if (rowData.some(cell => keysToExtract.includes(cell.trim()))) {
                    labelCol = rowData.findIndex(cell => keysToExtract.includes(cell.trim()));
                    break;
                }
            }

            // Parse data rows
            for (let r = idx + 2; r < lines.length; r++) {
                const rowData = this.parseRow(lines[r]);
                if (rowData.length < 2) continue;
                
                const label = rowData[labelCol] ? rowData[labelCol].trim() : "";
                if (label === "" || label === "ADDITIONAL STATISTICS") continue;

                if (keysToExtract.includes(label)) {
                    // Parse player values
                    for (const [col, pName] of Object.entries(colMap)) {
                        const rawVal = rowData[col];
                        let val = 0;
            
                        if (label === "Teammates Revived") {
                            const parsedVal = parseInt(rawVal) || 0;
                            val = validateCSVNumber(parsedVal, 'stat');
                            data.players[pName][label] = (data.players[pName][label] || 0) + val;
                        } else {
                            const parsedVal = parseFloat(rawVal.replace(/[^\d\.\-]/g, '')) || 0;
                            const fieldType = ['Kills', 'Special Kills', 'Incapacitations', 'Tasks Completed'].includes(label) ? 'stat' : 'damage';
                            val = validateCSVNumber(parsedVal, fieldType);
                            data.players[pName][label] = (data.players[pName][label] || 0) + val;
                        }
                    }
                    
                    // Parse total column
                    if (label !== "Teammates Revived") {
                        if (totalColIdx !== -1) {
                            const parsedVal = parseFloat(rowData[totalColIdx].replace(/[^\d\.\-]/g, '')) || 0;
                            const fieldType = ['Kills', 'Special Kills', 'Incapacitations', 'Tasks Completed'].includes(label) ? 'stat' : 'damage';
                            const val = validateCSVNumber(parsedVal, fieldType);
                            data.matrixTotals[label] = (data.matrixTotals[label] || 0) + val;
                        }
                    }
                }
            }
        };

        parseSection("SQUAD PERFORMANCE MATRIX", MATRIX_KEYS);
        parseSection("ADDITIONAL STATISTICS", ADD_STATS_KEYS);

        return data;
    },

    // ========================================================================
    // TESTING & VALIDATION
    // ========================================================================

    /**
     * Test CSV parsing with edge cases
     * @returns {Object} - Test results { passed, failed }
     */
    testParsing() {
        const tests = [
            // [input, expected_output, description]
            ['a,b,c', ['a', 'b', 'c'], 'Simple unquoted fields'],
            ['"a,b",c', ['a,b', 'c'], 'Quoted field with comma'],
            ['"Player said ""hello""",123', ['Player said "hello"', '123'], 'Escaped quotes inside quoted field'],
            ['a,"b""c",d', ['a', 'b"c', 'd'], 'Quote in middle of quoted field'],
            ['"",empty,"value"', ['', 'empty', 'value'], 'Empty quoted field'],
            ['unquoted,"quoted,comma",end', ['unquoted', 'quoted,comma', 'end'], 'Mixed quoted/unquoted'],
            ['"Smith, John",Tactical,150', ['Smith, John', 'Tactical', '150'], 'Player name with comma'],
            ['"The ""Last Stand"" Mission",Ruthless', ['The "Last Stand" Mission', 'Ruthless'], 'Mission name with quotes'],
            ['a,  ,c', ['a', '', 'c'], 'Whitespace-only field'],
            ['"  spaces  ","more spaces"', ['spaces', 'more spaces'], 'Trimming inside quotes'],
        ];
        
        console.log('=== CSV PARSING TESTS ===');
        let passed = 0;
        let failed = 0;
        
        tests.forEach(([input, expected, description]) => {
            const result = this.parseRow(input);
            const pass = JSON.stringify(result) === JSON.stringify(expected);
            
            if (pass) {
                console.log('✅', description);
                passed++;
            } else {
                console.log('❌', description);
                console.log('   Input:', input);
                console.log('   Expected:', expected);
                console.log('   Got:', result);
                failed++;
            }
        });
        
        console.log(`\n${passed} passed, ${failed} failed`);
        return { passed, failed };
    },

    /**
     * Test CSV escaping round-trip
     * @returns {Object} - Test results
     */
    testEscaping() {
        console.log('=== CSV ESCAPING TESTS ===');
        
        const testCases = [
            ['Normal text', 'Normal text'],
            ['Text, with comma', '"Text, with comma"'],
            ['Text "with quotes"', '"Text ""with quotes"""'],
            ['Text with\nnewline', '"Text with\nnewline"'],
            ["O'Brien", "O'Brien"],
        ];
        
        let errors = 0;
        testCases.forEach(([input, expected]) => {
            const result = this.escapeField(input);
            const pass = result === expected;
            console.log(pass ? '✅' : '❌', `"${input}" → ${result}`, pass ? '' : `(expected: ${expected})`);
            if (!pass) errors++;
        });
        
        console.log(errors === 0 ? '\n✅ All escaping tests passed' : `\n❌ ${errors} errors found`);
        return { errors, success: errors === 0 };
    },

    /**
     * Run all CSV tests
     */
    runAllTests() {
        console.log('\n' + '='.repeat(60));
        console.log('CSV HANDLER TEST SUITE');
        console.log('='.repeat(60) + '\n');
        
        const parseResults = this.testParsing();
        console.log('');
        const escapeResults = this.testEscaping();
        
        console.log('\n' + '='.repeat(60));
        const allPassed = parseResults.failed === 0 && escapeResults.errors === 0;
        console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
        console.log('='.repeat(60) + '\n');
        
        return {
            parsing: parseResults,
            escaping: escapeResults,
            success: allPassed
        };
    }
};

// ============================================================================
// EXPORTS
// ============================================================================

// Node.js / CommonJS
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { CSVHandler };
}

// Browser / Global
if (typeof window !== 'undefined') {
    window.CSVHandler = CSVHandler;
    
    // Expose test function to console
    window.testCSV = () => CSVHandler.runAllTests();
    console.log('💡 CSV Handler loaded. Run: testCSV()');
}
