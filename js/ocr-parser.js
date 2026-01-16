// ========================================
// OCR PARSER MODULE
// Modular, testable OCR text parsing
// ========================================

/**
 * Main entry point - parses OCR text and returns structured data
 * @param {string} rawText - Raw OCR output
 * @returns {object} - Structured game data
 */
function parseOCRText(rawText) {
    const normalized = normalizeOCRText(rawText);
    const lines = normalized.split(/[\r\n]+/).map(l => l.trim()).filter(l => l.length > 0);
    const upperText = normalized.toUpperCase();
    const upperSingleLine = upperText.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ');

    const results = {};

    // 1. Mission Info
    results['mission-name'] = detectMissionName(upperSingleLine, upperText);
    results['mission-difficulty'] = detectDifficulty(upperText);
    results['global-objective'] = detectObjectiveStatus(upperText);
    results['global-geneseed'] = detectGeneseed(upperText, upperSingleLine);
    results['global-armoury'] = detectArmouryData(rawText, upperText);
    results['global-waves'] = detectWaves(upperText);

    // 2. Players
    const players = detectPlayers(lines);
    players.forEach((player, index) => {
        const slot = index + 1;
        if (slot <= 3) {
            results[`p${slot}-name`] = player.name;
            results[`p${slot}-class`] = player.class;
        }
    });

    // 3. Stats
    const statsExtractors = [
        { key: 'kills', fn: extractKills },
        { key: 'elite', fn: extractSpecialKills },
        { key: 'death', fn: extractIncapacitations },
        { key: 'damage', fn: extractDamageTaken },
        { key: 'melee', fn: extractMeleeDamage },
        { key: 'ranged', fn: extractRangedDamage },
        { key: 'items', fn: extractItemsFound },
        { key: 'revived', fn: extractTeammatesRevived }
    ];

    statsExtractors.forEach(({ key, fn }) => {
        const nums = fn(lines);
        if (nums) {
            if (nums[0] !== null) results[`p1-${key}`] = nums[0];
            if (nums[1] !== null) results[`p2-${key}`] = nums[1];
            if (nums[2] !== null) results[`p3-${key}`] = nums[2];
        }
    });

    return results;
}

// ========================================
// TEXT NORMALIZATION
// ========================================

function normalizeOCRText(text) {
    return text
        .replace(/[★☆✦✧⭐\u2605\u2606]/g, '') // Remove stars
        .replace(/[|©®™]/g, ' ') // Remove special chars
        .replace(/xp\s*\d+/gi, ' ') // Remove XP badges
        .replace(/xb\s*\d+/gi, ' ') // Remove XB misreads
        .replace(/7k\b/gi, '') // Remove 7k artifact
        .replace(/[''`]/g, "'") // Normalize quotes
        .replace(/[""]/g, '"');
}

// ========================================
// MISSION DETECTION
// ========================================

function detectMissionName(upperSingleLine, upperText) {
    const knownMissions = [
        'RECLAMATION', 'INFERNO', 'BALLISTIC', 'DECAPITATION', 'SERVO',
        'SKULL', 'VANGUARD', 'VOIDSONG', 'RELIQUARY', 'TERMINATION',
        'EXTRACTION', 'ATHENA'
    ];

    // Try pattern matching first
    const match = upperSingleLine.match(/MISSION\s*[:\-=]?\s*([A-Z][A-Z\s\-']{2,30})/);
    if (match) {
        let name = match[1].trim().replace(/\s*STATUS.*$/i, '').trim();
        if (name.length > 2) {
            return name.charAt(0) + name.slice(1).toLowerCase();
        }
    }

    // Fallback: search for known missions
    for (const mission of knownMissions) {
        if (upperText.includes(mission)) {
            return mission.charAt(0) + mission.slice(1).toLowerCase();
        }
    }

    return null;
}

function detectDifficulty(upperText) {
    const difficulties = [
        'MINIMAL', 'AVERAGE', 'SUBSTANTIAL', 'RUTHLESS', 'LETHAL', 'ABSOLUTE'
    ];
    
    for (const diff of difficulties) {
        if (upperText.includes(diff)) {
            return diff.charAt(0) + diff.slice(1).toLowerCase();
        }
    }
    
    return null;
}

function detectObjectiveStatus(upperText) {
    if (/STATUS\s*[:\-=]?\s*SUCCESS/i.test(upperText) || /\bVICTORY\b/i.test(upperText)) {
        return '1';
    }
    return null;
}

function detectGeneseed(upperText, upperSingleLine) {
    const hasGeneseed = /GENE.?SEED/i.test(upperText);
    const hasFound = /FOUND|RETRIEVED/i.test(upperText);
    const hasSecondaryObj = /SECONDARY\s*OBJECTIVES/i.test(upperText);
    const geneseedWithXP = /GENE.?SEED.*?XP\s*\d+/i.test(upperSingleLine);

    if (hasGeneseed && (hasFound || geneseedWithXP || hasSecondaryObj)) {
        return '1';
    }
    
    // Default to No if not mentioned
    if (!hasGeneseed) {
        return '0';
    }
    
    return null;
}

function detectArmouryData(rawText, upperText) {
    let armouryCount = null;

    // Strategy 1: Look in REWARDS section
    const rewardsIdx = upperText.indexOf('REWARDS');
    if (rewardsIdx !== -1) {
        const afterRewards = rawText.substring(rewardsIdx, rewardsIdx + 150);
        const afterRewardsUpper = afterRewards.toUpperCase();
        const progressIdx = afterRewardsUpper.indexOf('CHARACTER');
        const cleanText = progressIdx > 0 ? afterRewards.substring(0, progressIdx) : afterRewards;

        const tokens = cleanText.split(/[\r\n\t]+/).map(t => t.trim()).filter(t => t);
        const numbersFound = [];
        
        for (const token of tokens) {
            const nums = token.match(/\d+/g);
            if (nums) {
                nums.forEach(n => numbersFound.push(parseInt(n)));
            }
        }

        for (const num of numbersFound) {
            if (num >= 0 && num <= 3) {
                const hasRequisition = numbersFound.some(n => n >= 100 && n <= 500);
                if (hasRequisition || numbersFound.length >= 1) {
                    return num.toString();
                }
            }
        }

        const tabMatch = cleanText.match(/([0-3])[\t\s]+(\d{2,3})/);
        if (tabMatch && parseInt(tabMatch[2]) >= 100) {
            return tabMatch[1];
        }
    }

    // Strategy 2: Look near "ARMOURY" keyword
    const armouryIdx = upperText.indexOf('ARMOURY');
    if (armouryIdx !== -1) {
        const nearArmoury = rawText.substring(
            Math.max(0, armouryIdx - 50),
            armouryIdx + 100
        );
        const armouryMatch = nearArmoury.match(/([0-3])[\s\t]+(?:XP|\d{2,}|.*)/i);
        if (armouryMatch) {
            return armouryMatch[1];
        }
    }

    return null;
}

function detectWaves(upperText) {
    const waveMatch = upperText.match(/STATUS\s*[:\-=]?\s*WAVE\s+(\d+)/i);
    if (waveMatch) {
        return waveMatch[1];
    }
    return null;
}

// ========================================
// PLAYER DETECTION
// ========================================

/**
 * Levenshtein distance for fuzzy class matching
 */
function levenshtein(a, b) {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;
    
    const matrix = [];
    for (let i = 0; i <= b.length; i++) matrix[i] = [i];
    for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
    
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            matrix[i][j] = b[i - 1] === a[j - 1]
                ? matrix[i - 1][j - 1]
                : Math.min(
                    matrix[i - 1][j - 1] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j] + 1
                );
        }
    }
    
    return matrix[b.length][a.length];
}

/**
 * Match OCR text to canonical class name
 */
function matchClass(word) {
    const canonicalClasses = [
        'BULWARK', 'ASSAULT', 'VANGUARD', 'TACTICAL', 'SNIPER', 'HEAVY', 'TECHMARINE'
    ];
    
    const ocrClassFixes = {
        ANGUNRO: 'VANGUARD', ANGUARD: 'VANGUARD', VANGUNRD: 'VANGUARD',
        VANGURD: 'VANGUARD', BULWAR: 'BULWARK', BÜLWARK: 'BULWARK',
        ASSAUL: 'ASSAULT', ASSAUT: 'ASSAULT', TACTIAL: 'TACTICAL',
        SNIPE: 'SNIPER', TECHMAR: 'TECHMARINE', ECHMAR: 'TECHMARINE'
    };
    
    const upper = word.toUpperCase();
    
    // Direct match
    if (canonicalClasses.includes(upper)) return upper;
    
    // Known fixes
    if (ocrClassFixes[upper]) return ocrClassFixes[upper];
    
    // Fuzzy match
    let bestMatch = null;
    let bestDist = 3;
    
    for (const cls of canonicalClasses) {
        const dist = levenshtein(upper, cls);
        if (dist < bestDist) {
            bestDist = dist;
            bestMatch = cls;
        }
    }
    
    return bestDist <= 2 ? bestMatch : null;
}

/**
 * Format class name (Title Case)
 */
function formatClass(cls) {
    return cls.charAt(0).toUpperCase() + cls.slice(1).toLowerCase();
}

/**
 * Extract valid player name from a line
 */
function extractPlayerName(line) {
    // Helper: Check if a name is valid
    function isValidName(name) {
        if (!name || name.length < 3) return false;
        
        const gameTerms = /^(Kills|Special|Melee|Ranged|Damage|Items|Total|Score|Next|Status|Mission|Rewards|Character|Progress|Primary|Secondary|Objectives|Found|Taken|Revived|Incap|Success|Assault|Vanguard|Bulwark|Tactical|Sniper|Heavy|TRUER|SYREN)$/i;
        if (gameTerms.test(name)) return false;
        
        if (/^(.)\1+$/i.test(name)) return false; // Reject "EEE"
        
        const midUppers = (name.slice(1, -1).match(/[A-Z]/g) || []).length;
        if (name.length <= 5 && midUppers > 1) return false;
        
        // Allow longer all-caps (gamer tags)
        if (name === name.toUpperCase() && name.length < 4) return false;
        
        const letterCount = (name.match(/[a-zA-ZäöüÄÖÜß\u00C0-\u00FF]/g) || []).length;
        if (letterCount < name.length * 0.4) return false;
        
        return true;
    }
    
    // Strategy A: Extract from brackets
    const bracketContent = line.match(
        /\[(?:jr\s+)?([A-ZÄÖÜ][a-zäöüß\u00E0-\u00FF0-9]+(?:\s+[A-Za-zäöüß\u00E0-\u00FF0-9]+)*)\s*[qQ\]®]/i
    );
    
    if (bracketContent && bracketContent[1].length >= 3) {
        const extracted = bracketContent[1].trim().replace(/\s+[a-zA-Z]$/g, '').trim();
        
        // Ignore OCR markers
        if (/^(RIGHT|LEFT)$/i.test(extracted)) return null;
        
        if (!/^(Kills|Special|Heavy|Assault|Bulwark|Vanguard|Tactical|Sniper)/i.test(extracted)) {
            return extracted;
        }
    }
    
    // Remove brackets and clean
    const cleanLine = line.replace(/\[.*?\]/g, '').trim();
    
    // Ignore OCR markers
    if (/^\[?(LEFT|RIGHT)\]?$/i.test(cleanLine)) return null;
    
    // Strategy B: Proper case names (with digits)
    const properMatch = cleanLine.match(
        /\b([A-ZÄÖÜ][a-zäöüß\u00E0-\u00FF0-9]{2,}(?:\s+[A-ZÄÖÜ]?[a-zäöüß\u00E0-\u00FF0-9]{2,})*)\b/
    );
    
    if (properMatch && isValidName(properMatch[1])) {
        let cleaned = properMatch[1].replace(/\s+[a-z]{1,2}$/i, '').trim();
        cleaned = cleaned.replace(/\s+\S{1,2}$/g, '').trim();
        return cleaned;
    }
    
    // Strategy C: Mixed case names (with digits)
    const mixedMatch = cleanLine.match(
        /\b([A-ZÄÖÜ][A-Za-zäöüß\u00C0-\u00FF0-9]{3,})\b/
    );
    
    if (mixedMatch && isValidName(mixedMatch[1])) {
        return mixedMatch[1];
    }
    
    return null;
}

/**
 * Detect players using multiple strategies
 */
function detectPlayers(lines) {
    const foundPlayers = [];
    
    // Strategy 1: Look for class names with [a] or [i] markers
    for (let i = 0; i < lines.length && foundPlayers.length < 3; i++) {
        const line = lines[i];
        const markerMatch = line.match(/([A-Za-zÄÖÜäöü]{4,})\s*\[([aieAIEof0-9]{1,2})\]/i);
        
        if (markerMatch) {
            const potentialClass = markerMatch[1];
            const matchedClass = matchClass(potentialClass);
            
            if (matchedClass) {
                const beforeMatch = line.substring(0, line.indexOf(markerMatch[0]));
                if (/MAX\b/i.test(beforeMatch)) continue;
                
                let foundName = null;
                
                // Try same line first
                if (beforeMatch.trim()) {
                    const sameLine = beforeMatch.replace(/[|:$#\[\]0-9]/g, ' ').trim();
                    const sameLineName = extractPlayerName(sameLine);
                    if (sameLineName && !foundPlayers.some(p => p.name === sameLineName)) {
                        foundName = sameLineName;
                    }
                }
                
                // Look backwards
                if (!foundName) {
                    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
                        const name = extractPlayerName(lines[j]);
                        if (name && !foundPlayers.some(p => p.name === name)) {
                            foundName = name;
                            break;
                        }
                    }
                }
                
                if (foundName) {
                    foundPlayers.push({ name: foundName, class: formatClass(matchedClass) });
                }
            }
        }
    }
    
    // Strategy 2: name [i] pattern
    if (foundPlayers.length < 3) {
        for (let i = 0; i < lines.length && foundPlayers.length < 3; i++) {
            const line = lines[i];
            const nameMarkerMatch = line.match(
                /([A-ZÄÖÜ][a-zäöüß\u00E0-\u00FF0-9]+(?:\s+[A-Za-zäöüß\u00E0-\u00FF0-9]+)*)\s*\[i\]/i
            );
            
            if (nameMarkerMatch) {
                const candidateName = nameMarkerMatch[1].trim();
                if (candidateName.length >= 3) {
                    for (let j = i + 1; j <= Math.min(lines.length - 1, i + 3); j++) {
                        const classLine = lines[j];
                        const classMatch = classLine.match(/([A-Za-zÄÖÜäöü]{4,})\s*\[a\]/i);
                        
                        if (classMatch) {
                            const matchedClass = matchClass(classMatch[1]);
                            if (matchedClass && !foundPlayers.some(p => p.name === candidateName)) {
                                foundPlayers.push({ 
                                    name: candidateName, 
                                    class: formatClass(matchedClass) 
                                });
                                break;
                            }
                        }
                    }
                }
            }
        }
    }
    
    // Strategy 3: Flex pattern (class with any bracket)
    if (foundPlayers.length < 3) {
        for (let i = 0; i < lines.length && foundPlayers.length < 3; i++) {
            const line = lines[i];
            if (/\bMAX\b/i.test(line)) continue;
            
            const flexMatch = line.match(/\b([A-Za-zÄÖÜäöü]{5,})\s*\[[^\]]{0,3}\]/i);
            
            if (flexMatch) {
                const potentialClass = flexMatch[1];
                const matchedClass = matchClass(potentialClass);
                
                if (matchedClass) {
                    const classAlreadyFound = foundPlayers.some(
                        p => p.class.toLowerCase() === matchedClass.toLowerCase()
                    );
                    if (classAlreadyFound) continue;
                    
                    let foundName = null;
                    const beforeMatch = line.substring(0, line.indexOf(flexMatch[0]));
                    
                    if (beforeMatch.trim()) {
                        const sameLine = beforeMatch.replace(/[|:$#\[\]0-9]/g, ' ').trim();
                        foundName = extractPlayerName(sameLine);
                        if (foundName && foundPlayers.some(p => p.name === foundName)) {
                            foundName = null;
                        }
                    }
                    
                    if (!foundName) {
                        for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
                            const name = extractPlayerName(lines[j]);
                            if (name && !foundPlayers.some(p => p.name === name)) {
                                foundName = name;
                                break;
                            }
                        }
                    }
                    
                    if (foundName) {
                        foundPlayers.push({ 
                            name: foundName, 
                            class: formatClass(matchedClass) 
                        });
                    }
                }
            }
        }
    }
    
    // Strategy 4: Standalone class names
    if (foundPlayers.length < 3) {
        for (let i = 0; i < lines.length && foundPlayers.length < 3; i++) {
            const line = lines[i].trim();
            if (/\bMAX\b/i.test(line)) continue;
            
            const words = line.match(/[A-Za-zÄÖÜäöü]{5,}/g) || [];
            
            for (const word of words) {
                const matchedClass = matchClass(word);
                
                if (matchedClass) {
                    const classAlreadyFound = foundPlayers.some(
                        p => p.class.toLowerCase() === matchedClass.toLowerCase()
                    );
                    if (classAlreadyFound) continue;
                    
                    for (let j = i - 1; j >= Math.max(0, i - 6); j--) {
                        const name = extractPlayerName(lines[j]);
                        if (name && !foundPlayers.some(p => p.name === name)) {
                            foundPlayers.push({ 
                                name: name, 
                                class: formatClass(matchedClass) 
                            });
                            break;
                        }
                    }
                    break;
                }
            }
        }
    }
    
    // Strategy 5: CLASS MAX pattern
    if (foundPlayers.length < 3) {
        for (let i = 0; i < lines.length && foundPlayers.length < 3; i++) {
            const line = lines[i].trim();
            const maxMatch = line.match(/\b([A-Za-z]{5,})\s+MAX\b/i);
            
            if (maxMatch) {
                const potentialClass = maxMatch[1];
                const matchedClass = matchClass(potentialClass);
                
                if (matchedClass) {
                    const classAlreadyFound = foundPlayers.some(
                        p => p.class.toLowerCase() === matchedClass.toLowerCase()
                    );
                    if (classAlreadyFound) continue;
                    
                    let foundName = null;
                    
                    function isHighConfidenceName(name) {
                        if (!name) return false;
                        if (name.length >= 5) return true;
                        if (/^B[oö]rni$/i.test(name)) return true;
                        return false;
                    }
                    
                    // Look backwards
                    for (let j = i - 1; j >= Math.max(0, i - 8); j--) {
                        const candidateLine = lines[j];
                        if (/^[\s\[\]\(\)\{\}|\\\/\-\.\,\;\:\#\@\!\?\*\&\%\$\=\+\<\>\~\`\'\"0-9]+$/.test(candidateLine)) {
                            continue;
                        }
                        
                        const name = extractPlayerName(candidateLine);
                        if (isHighConfidenceName(name) && !foundPlayers.some(p => p.name === name)) {
                            foundName = name;
                            break;
                        }
                    }
                    
                    // Look forward
                    if (!foundName) {
                        for (let j = i + 1; j <= Math.min(lines.length - 1, i + 4); j++) {
                            const candidateLine = lines[j];
                            if (/^[\s\[\]\(\)\{\}|\\\/\-\.\,\;\:\#\@\!\?\*\&\%\$\=\+\<\>\~\`\'\"0-9]+$/.test(candidateLine)) {
                                continue;
                            }
                            
                            const name = extractPlayerName(candidateLine);
                            if (isHighConfidenceName(name) && !foundPlayers.some(p => p.name === name)) {
                                foundName = name;
                                break;
                            }
                        }
                    }
                    
                    foundPlayers.push({ 
                        name: foundName || '', 
                        class: formatClass(matchedClass) 
                    });
                }
            }
        }
    }
    
    // Strategy 6: Name\nCLASS pattern
    if (foundPlayers.length < 3) {
        for (let i = 0; i < lines.length - 1 && foundPlayers.length < 3; i++) {
            const line = lines[i].trim();
            const nextLine = lines[i + 1].trim().toUpperCase();
            
            const matchedClass = matchClass(nextLine);
            
            if (matchedClass) {
                const classAlreadyFound = foundPlayers.some(
                    p => p.class.toLowerCase() === matchedClass.toLowerCase()
                );
                if (classAlreadyFound) continue;
                
                const name = extractPlayerName(line);
                if (name && name.length >= 3 && !foundPlayers.some(p => p.name === name)) {
                    foundPlayers.push({ 
                        name: name, 
                        class: formatClass(matchedClass) 
                    });
                }
            }
        }
    }
    
    return foundPlayers;
}

// ========================================
// STATS EXTRACTION
// ========================================

/**
 * Extract last three numbers from lines matching patterns
 */
function extractLastThreeNumbers(lines, labelPatterns, excludeRegex = null, defaultToZero = false) {
    const patterns = Array.isArray(labelPatterns) ? labelPatterns : [labelPatterns];
    let labelFound = false;
    
    for (const labelRegex of patterns) {
        for (const line of lines) {
            const upperLine = line.toUpperCase();
            
            if (labelRegex.test(upperLine)) {
                if (excludeRegex && excludeRegex.test(upperLine)) continue;
                
                labelFound = true;
                const nums = line.match(/\d+/g);
                
                if (nums && nums.length >= 1) {
                    const lastNums = nums
                        .slice(-Math.min(3, nums.length))
                        .map(n => parseInt(n));
                    
                    if (lastNums.every(n => !isNaN(n) && n >= 0 && n < 1000000)) {
                        while (lastNums.length < 3) {
                            lastNums.push(null);
                        }
                        return lastNums;
                    }
                }
            }
        }
    }
    
    if (labelFound && defaultToZero) {
        return [0, 0, 0];
    }
    
    return null;
}

function extractKills(lines) {
    return extractLastThreeNumbers(
        lines,
        [/\bKILLS\b/, /K[I1l]{1,2}[L1]{1,2}S/i, /KILLS/],
        /SPECIAL|SPECIA/i
    );
}

function extractSpecialKills(lines) {
    return extractLastThreeNumbers(
        lines,
        [/SPECIAL\s*KILLS/, /SPEC[I1]AL\s*K[I1]LLS/i, /SPECIA.*KILLS/i]
    );
}

function extractIncapacitations(lines) {
    const incapPatterns = [/INCAPACITATION/i, /INCAP/i];
    
    for (const pattern of incapPatterns) {
        for (const line of lines) {
            if (pattern.test(line.toUpperCase())) {
                const fixedLine = line.replace(/\b[UO]\b/g, '0');
                const nums = fixedLine.match(/\d+/g);
                
                if (nums && nums.length >= 1) {
                    const lastNums = nums
                        .slice(-Math.min(3, nums.length))
                        .map(n => parseInt(n));
                    
                    if (lastNums.every(n => !isNaN(n) && n >= 0 && n < 100)) {
                        while (lastNums.length < 3) lastNums.push(null);
                        return lastNums;
                    }
                }
            }
        }
    }
    
    return null;
}

function extractDamageTaken(lines) {
    return extractLastThreeNumbers(
        lines,
        [/DAMAGE\s*TAKEN/, /DAMAGE.*TAKEN/i, /DAM.*TAK/i]
    );
}

function extractMeleeDamage(lines) {
    return extractLastThreeNumbers(
        lines,
        [/MELEE\s*DAMAGE/i, /MELEE.*DAMAGE/i, /MELEE.*DAM/i]
    );
}

function extractRangedDamage(lines) {
    return extractLastThreeNumbers(
        lines,
        [/RANGED\s*DAMAGE/i, /RANGED.*DAMAGE/i, /RANGED.*DAM/i]
    );
}

function extractItemsFound(lines) {
    return extractLastThreeNumbers(
        lines,
        [/ITEMS\s*FOUND/i, /ITEMS.*FOUND/i, /ITEM.*FOUND/i]
    );
}

function extractTeammatesRevived(lines) {
    return extractLastThreeNumbers(
        lines,
        [/TEAMMATES\s*REVIVED/i, /TEAMMATE.*REVIVE/i, /TEAM.*REVIVE/i]
    );
}

// ========================================
// EXPORTS (for use in main script)
// ========================================

// Main parser function
if (typeof module !== 'undefined' && module.exports) {
    // Node.js environment
    module.exports = { parseOCRText };
} else {
    // Browser environment - expose globally
    window.parseOCRText = parseOCRText;
}
