// ============================================================================
// INPUT VALIDATION MODULE
// Centralized validation for all user inputs
// ============================================================================

"use strict";

const InputValidator = {
    // Validation rules
    rules: {
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
    },

    /**
     * Validate a string input
     */
    validateString(value, ruleName) {
        const rule = this.rules[ruleName];
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
    },

    /**
     * Validate a numeric input
     */
    validateNumber(value, ruleName) {
        const rule = this.rules[ruleName];
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
    },

    /**
     * Validate select/dropdown input
     */
    validateSelect(value, allowedValues) {
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
    },

    /**
     * Validate and sanitize player name
     */
    validatePlayerName(name) {
        // Use sanitizeInput if available, otherwise do basic sanitization
        const sanitized = typeof sanitizeInput === 'function' 
            ? sanitizeInput(name, 'text')
            : String(name).replace(/[<>"']/g, '').trim().slice(0, 200);
        return this.validateString(sanitized, 'playerName');
    },

    /**
     * Validate mission name
     */
    validateMissionName(name) {
        const sanitized = typeof sanitizeInput === 'function' 
            ? sanitizeInput(name, 'text')
            : String(name).replace(/[<>"']/g, '').trim().slice(0, 200);
        return this.validateString(sanitized, 'missionName');
    },

    /**
     * Validate stat input (kills, elite, etc.)
     */
    validateStat(value) {
        return this.validateNumber(value, 'number');
    },

    /**
     * Validate damage input (can be decimal)
     */
    validateDamage(value) {
        return this.validateNumber(value, 'decimal');
    },

    /**
     * Validate modifier input
     */
    validateModifier(value) {
        return this.validateNumber(value, 'modifier');
    },

    /**
     * Validate armoury data
     */
    validateArmouryData(value) {
        return this.validateNumber(value, 'armouryData');
    },

    /**
     * Validate waves
     */
    validateWaves(value) {
        return this.validateNumber(value, 'waves');
    },

    /**
     * Validate class selection
     */
    validateClass(value) {
        const allowedClasses = [
            '', 'Tactical', 'Assault', 'Vanguard', 
            'Bulwark', 'Sniper', 'Heavy', 'Techmarine'
        ];
        return this.validateSelect(value, allowedClasses);
    },

    /**
     * Validate difficulty selection
     */
    validateDifficulty(value) {
        const allowedDifficulties = [
            '', 'Minimal', 'Average', 'Substantial', 
            'Ruthless', 'Lethal', 'Absolute', 'Normal', 'Hard'
        ];
        return this.validateSelect(value, allowedDifficulties);
    },

    /**
     * Validate yes/no selection
     */
    validateYesNo(value) {
        const allowedValues = ['', '0', '1'];
        return this.validateSelect(value, allowedValues);
    },

    /**
     * Show validation error to user
     */
    showValidationError(elementId, message) {
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
    },

    /**
     * Clear validation error
     */
    clearValidationError(elementId) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.style.borderColor = '';
        element.style.boxShadow = '';

        const tooltip = element.nextElementSibling;
        if (tooltip && tooltip.classList.contains('validation-tooltip')) {
            tooltip.style.display = 'none';
        }
    },

    /**
     * Attach validation to input element
     */
    attachValidator(elementId, validatorFunction) {
        const element = document.getElementById(elementId);
        if (!element) return;

        // Validate on blur
        element.addEventListener('blur', (e) => {
            const result = validatorFunction(e.target.value);
            
            if (!result.valid) {
                this.showValidationError(elementId, result.error);
                e.target.value = result.value;
            } else {
                this.clearValidationError(elementId);
            }
        });

        // Validate on change
        element.addEventListener('change', (e) => {
            const result = validatorFunction(e.target.value);
            
            if (!result.valid) {
                e.target.value = result.value;
            }
            
            this.clearValidationError(elementId);
        });
    },

    /**
     * Check if a mission is a Siege-type mission
     */
    isSiegeMission(missionName) {
        if (!missionName || typeof missionName !== 'string') return false;
        const normalized = missionName.toLowerCase().trim();
        return /siege|seige|fortress/i.test(normalized);
    },

    /**
     * Validate mandatory mission fields before saving
     * Returns { valid: boolean, errors: string[], invalidFields: string[] }
     */
    validateMandatoryFields() {
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

        const isSiege = this.isSiegeMission(effectiveMissionName);

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
    },

    /**
     * Show validation errors on multiple fields and display alert
     */
    showMandatoryFieldErrors(invalidFields, errors) {
        // Clear any previous validation errors first
        this.clearAllValidationErrors();

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
        if (typeof showAlertModal === 'function') {
            showAlertModal(errorMessage);
        } else {
            alert(errorMessage);
        }

        // Scroll to first invalid field
        if (invalidFields.length > 0) {
            const firstInvalid = document.getElementById(invalidFields[0]);
            if (firstInvalid) {
                firstInvalid.scrollIntoView({ behavior: 'smooth', block: 'center' });
                firstInvalid.focus();
            }
        }
    },

    /**
     * Clear all validation error styles
     */
    clearAllValidationErrors() {
        // Remove validation-error class from all inputs/selects
        document.querySelectorAll('.validation-error').forEach(el => {
            el.classList.remove('validation-error');
        });

        // Remove has-validation-error from parent containers
        document.querySelectorAll('.has-validation-error').forEach(el => {
            el.classList.remove('has-validation-error');
        });
    },

    /**
     * Initialize validation for all form fields
     */
    initializeValidation() {
        // Player names
        for (let i = 1; i <= 3; i++) {
            this.attachValidator(`p${i}-name`, (val) => this.validatePlayerName(val));
        }

        // Mission name
        this.attachValidator('mission-name', (val) => this.validateMissionName(val));

        // Stats
        const statFields = ['kills', 'elite', 'tasks', 'death', 'items', 'revived'];
        for (let i = 1; i <= 3; i++) {
            statFields.forEach(stat => {
                this.attachValidator(`p${i}-${stat}`, (val) => this.validateStat(val));
            });
        }

        // Damage (decimal)
        for (let i = 1; i <= 3; i++) {
            this.attachValidator(`p${i}-damage`, (val) => this.validateDamage(val));
            this.attachValidator(`p${i}-melee`, (val) => this.validateDamage(val));
            this.attachValidator(`p${i}-ranged`, (val) => this.validateDamage(val));
        }

        // Global fields
        this.attachValidator('global-armoury', (val) => this.validateArmouryData(val));
        this.attachValidator('global-waves', (val) => this.validateWaves(val));

        // Modifiers
        const modifiers = ['kills', 'elite', 'tasks', 'death', 'damage', 'gene', 'armoury', 'obj', 'waves'];
        modifiers.forEach(mod => {
            this.attachValidator(`mod-${mod}`, (val) => this.validateModifier(val));
        });

        // Initialize mandatory field validation listeners
        this.initializeMandatoryFieldListeners();

        console.log('✅ Input validation initialized');
    },

    /**
     * Initialize listeners to clear validation errors when mandatory fields change
     */
    initializeMandatoryFieldListeners() {
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
};

// Export for use in main script
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { InputValidator };
} else {
    window.InputValidator = InputValidator;
}
