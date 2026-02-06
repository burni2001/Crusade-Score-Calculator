// ============================================================================
// INPUT VALIDATION MODULE
// Centralized validation for all user inputs
// ============================================================================

"use strict";

import { sanitizeInput } from './utils/dom-sanitizer.js';
import { isSiegeMission } from './utils/mission-utils.js';

const rules = {
    // Validation rules
    playerName: {
        minLength: 1,
        maxLength: 50,
        pattern: /^[a-zA-Z0-9\s\u00C0-\u00FF\u0100-\u017F_-]+$/,
        errorMsg: 'Name must be 1-50 characters (letters, numbers, spaces, dashes)'
    },
    missionName: {
        minLength: 1,
        maxLength: 100,
        pattern: /^[a-zA-Z0-9\s\u00C0-\u00FF\u0100-\u017F:_()\-]+$/,
        errorMsg: 'Mission name must be 1-100 characters'
    },
    number: {
        min: 0,
        max: 999999,
        errorMsg: 'Number must be between 0 and 999,999'
    },
    decimal: {
        min: 0,
        max: 999999,
        decimals: 2,
        errorMsg: 'Number must be between 0 and 999,999 with max 2 decimals'
    },
    percentage: {
        min: -100,
        max: 100,
        decimals: 2,
        errorMsg: 'Percentage must be between -100 and 100'
    },
    modifier: {
        min: -10000,
        max: 10000,
        decimals: 2,
        errorMsg: 'Modifier must be between -10,000 and 10,000'
    },
    armouryData: {
        min: 0,
        max: 6,
        errorMsg: 'Armoury data must be between 0 and 6'
    },
    waves: {
        min: 0,
        max: 100,
        errorMsg: 'Waves must be between 0 and 100'
    }
};

/**
 * Validate a string input
 */
function validateString(value, ruleName) {
    const rule = rules[ruleName];
    if (!rule) return { valid: true, value: value };

    const str = String(value).trim();

    // Length validation
    if (str.length < rule.minLength || str.length > rule.maxLength) {
        return {
            valid: false,
            error: rule.errorMsg,
            value: str.slice(0, rule.maxLength)
        };
    }

    // Pattern validation
    if (rule.pattern && !rule.pattern.test(str)) {
        return {
            valid: false,
            error: rule.errorMsg,
            value: str.replace(/[^a-zA-Z0-9\s\u00C0-\u00FF\u0100-\u017F:_()\-]/g, '')
        };
    }

    return { valid: true, value: str };
}

/**
 * Validate a numeric input
 */
function validateNumber(value, ruleName) {
    const rule = rules[ruleName];
    if (!rule) return { valid: true, value: 0 };

    // Handle empty/null
    if (value === '' || value === null || value === undefined) {
        return { valid: true, value: 0 };
    }

    // Parse number
    let num = parseFloat(value);

    // Check if valid number
    if (isNaN(num) || !isFinite(num)) {
        return {
            valid: false,
            error: 'Invalid number',
            value: 0
        };
    }

    // Round to specified decimals
    if (rule.decimals !== undefined) {
        num = Math.round(num * Math.pow(10, rule.decimals)) / Math.pow(10, rule.decimals);
    } else {
        num = Math.round(num);
    }

    // Range validation
    if (num < rule.min) {
        return {
            valid: false,
            error: rule.errorMsg,
            value: rule.min
        };
    }

    if (num > rule.max) {
        return {
            valid: false,
            error: rule.errorMsg,
            value: rule.max
        };
    }

    return { valid: true, value: num };
}

/**
 * Validate select/dropdown input
 */
function validateSelect(value, allowedValues) {
    if (value === '' || value === null) {
        return { valid: true, value: '' };
    }

    if (!allowedValues.includes(value)) {
        return {
            valid: false,
            error: 'Invalid selection',
            value: allowedValues[0] || ''
        };
    }

    return { valid: true, value: value };
}

/**
 * Validate and sanitize player name
 */
export function validatePlayerName(name) {
    const sanitized = sanitizeInput(name);
    return validateString(sanitized, 'playerName');
}

/**
 * Validate mission name
 */
export function validateMissionName(name) {
    const sanitized = sanitizeInput(name);
    return validateString(sanitized, 'missionName');
}

/**
 * Validate stat input (kills, elite, etc.)
 */
export function validateStat(value) {
    return validateNumber(value, 'number');
}

/**
 * Validate damage input (can be decimal)
 */
export function validateDamage(value) {
    return validateNumber(value, 'decimal');
}

/**
 * Validate modifier input
 */
export function validateModifier(value) {
    return validateNumber(value, 'modifier');
}

/**
 * Validate armoury data
 */
export function validateArmouryData(value) {
    return validateNumber(value, 'armouryData');
}

/**
 * Validate waves
 */
export function validateWaves(value) {
    return validateNumber(value, 'waves');
}

/**
 * Validate class selection
 */
export function validateClass(value) {
    const allowedClasses = [
        '', 'Tactical', 'Assault', 'Vanguard',
        'Bulwark', 'Sniper', 'Heavy', 'Techmarine'
    ];
    return validateSelect(value, allowedClasses);
}

/**
 * Validate difficulty selection
 */
export function validateDifficulty(value) {
    const allowedDifficulties = [
        '', 'Minimal', 'Average', 'Substantial',
        'Ruthless', 'Lethal', 'Absolute', 'Normal', 'Hard'
    ];
    return validateSelect(value, allowedDifficulties);
}

/**
 * Validate yes/no selection
 */
export function validateYesNo(value) {
    const allowedValues = ['', '0', '1'];
    return validateSelect(value, allowedValues);
}

/**
 * Show validation error to user
 */
export function showValidationError(elementId, message) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Visual feedback
    element.style.borderColor = '#cc4444';
    element.style.boxShadow = '0 0 5px #cc4444';

    // Create tooltip if it doesn't exist
    let tooltip = element.nextElementSibling;
    if (!tooltip || !tooltip.classList.contains('validation-tooltip')) {
        tooltip = document.createElement('div');
        tooltip.className = 'validation-tooltip';
        element.parentNode.insertBefore(tooltip, element.nextSibling);
    }

    tooltip.textContent = message;
    tooltip.style.display = 'block';

    // Remove after 3 seconds
    setTimeout(() => {
        element.style.borderColor = '';
        element.style.boxShadow = '';
        if (tooltip) tooltip.style.display = 'none';
    }, 3000);
}

/**
 * Clear validation error
 */
export function clearValidationError(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    element.style.borderColor = '';
    element.style.boxShadow = '';

    const tooltip = element.nextElementSibling;
    if (tooltip && tooltip.classList.contains('validation-tooltip')) {
        tooltip.style.display = 'none';
    }
}

/**
 * Attach validation to input element
 */
export function attachValidator(elementId, validatorFunction) {
    const element = document.getElementById(elementId);
    if (!element) return;

    // Validate on blur
    element.addEventListener('blur', (e) => {
        const result = validatorFunction(e.target.value);

        if (!result.valid) {
            showValidationError(elementId, result.error);
            e.target.value = result.value;
        } else {
            clearValidationError(elementId);
        }
    });

    // Validate on change
    element.addEventListener('change', (e) => {
        const result = validatorFunction(e.target.value);

        if (!result.valid) {
            e.target.value = result.value;
        }

        clearValidationError(elementId);
    });
}

/**
 * Validate mandatory mission fields before saving
 * Returns { valid: boolean, errors: string[], invalidFields: string[] }
 */
export function validateMandatoryFields() {
    const errors = [];
    const invalidFields = [];

    // Get mission name (handles both dropdown and custom)
    const missionSelect = document.getElementById('mission-name');
    const customMissionInput = document.getElementById('mission-name-custom');
    const missionValue = missionSelect ? missionSelect.value : '';
    const isCustom = missionValue === 'Custom';
    const customValue = customMissionInput ? customMissionInput.value.trim() : '';

    // Determine effective mission name
    let effectiveMissionName = '';
    if (isCustom) {
        effectiveMissionName = customValue;
    } else {
        effectiveMissionName = missionValue;
    }

    const isSiege = isSiegeMission(effectiveMissionName); // Call the imported function

    // 1. Mission Played - always required
    if (!missionValue || missionValue === '') {
        errors.push('Please select a mission');
        invalidFields.push('mission-name');
    } else if (isCustom && !customValue) {
        errors.push('Please enter a custom mission name');
        invalidFields.push('mission-name-custom');
    }

    // 2. Difficulty - always required
    const difficultySelect = document.getElementById('mission-difficulty');
    const difficultyValue = difficultySelect ? difficultySelect.value : '';
    if (!difficultyValue || difficultyValue === '') {
        errors.push('Please select a difficulty');
        invalidFields.push('mission-difficulty');
    }

    // 3. Main Objective Completion - always required
    const objectiveSelect = document.getElementById('global-objective');
    const objectiveValue = objectiveSelect ? objectiveSelect.value : '';
    if (objectiveValue === '' || objectiveValue === null || objectiveValue === undefined) {
        errors.push('Please select Main Objective Completion');
        invalidFields.push('global-objective');
    }

    // 4. Gene-Seed Retrieved - required for NON-siege missions only
    if (!isSiege) {
        const geneseedSelect = document.getElementById('global-geneseed');
        const geneseedValue = geneseedSelect ? geneseedSelect.value : '';
        if (geneseedValue === '' || geneseedValue === null || geneseedValue === undefined) {
            errors.push('Please select Gene-Seed Retrieved');
            invalidFields.push('global-geneseed');
        }
    }

    // 5. Armoury Data Retrieved - always required (number, check if it has a value)
    const armouryInput = document.getElementById('global-armoury');
    const armouryValue = armouryInput ? armouryInput.value : '';
    if (armouryValue === '' || armouryValue === null || armouryValue === undefined) {
        errors.push('Please enter Armoury Data Retrieved count');
        invalidFields.push('global-armoury');
    }

    // 6. Total Waves Completed - required for SIEGE missions only
    if (isSiege) {
        const wavesInput = document.getElementById('global-waves');
        const wavesValue = wavesInput ? wavesInput.value : '';
        if (wavesValue === '' || wavesValue === null || wavesValue === undefined) {
            errors.push('Please enter Total Waves Completed');
            invalidFields.push('global-waves');
        }
    }

    return {
        valid: errors.length === 0,
        errors: errors,
        invalidFields: invalidFields
    };
}

/**
 * Show validation errors on multiple fields and display alert
 */
export function showMandatoryFieldErrors(invalidFields, errors) {
    // Clear any previous validation errors first
    clearAllValidationErrors();

    // Add validation-error class to all invalid fields
    invalidFields.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            element.classList.add('validation-error');

            // For parent containers (like mission-params divs), also highlight
            const parentDiv = element.closest('.mission-params');
            if (parentDiv) {
                parentDiv.classList.add('has-validation-error');
            }
        }
    });

    // Show alert with all errors
    const errorMessage = 'Please complete the following required fields:\n\n• ' + errors.join('\n• ');
    alert(errorMessage);

    // Scroll to first invalid field
    if (invalidFields.length > 0) {
        const firstInvalid = document.getElementById(invalidFields[0]);
        if (firstInvalid) {
            firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
            firstInvalid.focus();
        }
    }
}

/**
 * Clear all validation error styles
 */
export function clearAllValidationErrors() {
    // Remove validation-error class from all inputs/selects
    document.querySelectorAll('.validation-error').forEach(el => {
        el.classList.remove('validation-error');
    });

    // Remove has-validation-error from parent containers
    document.querySelectorAll('.has-validation-error').forEach(el => {
        el.classList.remove('has-validation-error');
    });
}

/**
 * Initialize validation for all form fields
 */
export function initializeValidation() {
    // Player names
    for (let i = 1; i <= 3; i++) {
        attachValidator(`p${i}-name`, (val) => validatePlayerName(val));
    }

    // Mission name
    attachValidator('mission-name', (val) => validateMissionName(val));

    // Stats
    const statFields = ['kills', 'elite', 'tasks', 'death', 'items', 'revived'];
    for (let i = 1; i <= 3; i++) {
        statFields.forEach(stat => {
            attachValidator(`p${i}-${stat}`, (val) => validateStat(val));
        });
    }

    // Damage (decimal)
    for (let i = 1; i <= 3; i++) {
        attachValidator(`p${i}-damage`, (val) => validateDamage(val));
        attachValidator(`p${i}-melee`, (val) => validateDamage(val));
        attachValidator(`p${i}-ranged`, (val) => validateDamage(val));
    }

    // Global fields
    attachValidator('global-armoury', (val) => validateArmouryData(val));
    attachValidator('global-waves', (val) => validateWaves(val));

    // Modifiers
    const modifiers = ['kills', 'elite', 'tasks', 'death', 'damage', 'gene', 'armoury', 'obj', 'waves'];
    modifiers.forEach(mod => {
        attachValidator(`mod-${mod}`, (val) => validateModifier(val));
    });

    // Initialize mandatory field validation listeners
    initializeMandatoryFieldListeners();

    console.log('✅ Input validation initialized');
}

/**
 * Initialize listeners to clear validation errors when mandatory fields change
 */
export function initializeMandatoryFieldListeners() {
    const mandatoryFieldIds = [
        'mission-name',
        'mission-name-custom',
        'mission-difficulty',
        'global-objective',
        'global-geneseed',
        'global-armoury',
        'global-waves'
    ];

    mandatoryFieldIds.forEach(fieldId => {
        const element = document.getElementById(fieldId);
        if (element) {
            // Clear validation error on this specific field when changed
            const clearFieldError = () => {
                element.classList.remove('validation-error');
                const parentDiv = element.closest('.mission-params');
                if (parentDiv) {
                    parentDiv.classList.remove('has-validation-error');
                }
            };

            element.addEventListener('change', clearFieldError);
            element.addEventListener('input', clearFieldError);
        }
    });
}