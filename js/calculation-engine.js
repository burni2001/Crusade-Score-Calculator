// ============================================================================
// CALCULATION ENGINE MODULE
// Pure calculation logic for mission scoring
// No DOM dependencies - easy to test and reuse
// ============================================================================

"use strict";

import { ErrorHandler } from './script.js'; // Assuming ErrorHandler will be exported from script.js

const CalculationEngine = {
    // ========================================================================
    // CORE CALCULATION FUNCTIONS
    // ========================================================================

    /**
     * Calculate complete mission scores for all players
     * @param {Object} data - Mission data
     * @param {Object} data.modifiers - Score modifiers (kills, elite, death, etc.)
     * @param {Object} data.globals - Global mission parameters (objective, geneseed, armoury, waves)
     * @param {Array} data.players - Array of player stats
     * @returns {Object} - Calculated scores and totals
     */
    calculateMissionScores(data) {
        const { modifiers, globals, players } = data;
        
        // Validate inputs
        if (!this._validateInputs(modifiers, globals, players)) {
            throw new Error('Invalid calculation inputs');
        }

        // Calculate wave bonus
        const waveScore = this.calculateWaveBonus(globals.waves, modifiers.waves);

        // Calculate player scores
        const playerResults = players.map(player => 
            this.calculatePlayerScore(player, modifiers, globals, waveScore)
        );

        // Calculate squad totals (passing modifiers, globals, and waveScore)
        const totals = this.calculateSquadTotals(playerResults, players, modifiers, globals, waveScore);

        return {
            players: playerResults,
            totals: totals,
            waveScore: waveScore
        };
    },

    /**
     * Calculate scores for a single player
     * @param {Object} player - Player stats
     * @param {Object} modifiers - Score modifiers
     * @param {Object} globals - Global mission parameters
     * @param {number} waveScore - Pre-calculated wave bonus
     * @returns {Object} - Player's calculated scores
     */
    calculatePlayerScore(player, modifiers, globals, waveScore) {
        // Base score calculation
        const baseScore = this.calculateBaseScore(
            player.kills,
            player.elite,
            globals.objective,
            modifiers
        );

        // Modifier score calculation
        const modifierScore = this.calculateModifierScore(
            player.death,
            player.damage,
            globals.geneseed,
            globals.armoury,
            player.tasks,
            modifiers,
            waveScore
        );

        // Final score
        const finalScore = Math.round(baseScore + modifierScore);

        // Revive diff
        const reviveDiff = player.revived - player.death;

        return {
            baseScore: Math.round(baseScore * 10) / 10,
            modifierScore: parseFloat(modifierScore.toFixed(1)),
            finalScore: finalScore,
            reviveDiff: reviveDiff
        };
    },

    /**
     * Calculate base score (kills + elite + objective)
     */
    calculateBaseScore(kills, elite, objective, modifiers) {
        const k = Math.max(0, kills || 0);
        const e = Math.max(0, elite || 0);
        const o = objective === 1 ? 1 : 0;

        return (k * modifiers.kills) + 
               (e * modifiers.elite) + 
               (o * modifiers.obj);
    },

    /**
     * Calculate modifier score (penalties and bonuses)
     */
    calculateModifierScore(death, damage, geneseed, armoury, tasks, modifiers, waveScore) {
        const d = Math.max(0, death || 0);
        const dmg = Math.max(0, damage || 0);
        const gene = geneseed === 1 ? 1 : 0;
        const arm = Math.max(0, armoury || 0);
        const t = Math.max(0, tasks || 0);

        return (d * modifiers.death) +
               (dmg * modifiers.damage) +
               (gene * modifiers.gene) +
               (arm * modifiers.armoury) +
               waveScore +
               (t * modifiers.tasks);
    },

    /**
     * Calculate wave bonus (only for waves > 15)
     */
    calculateWaveBonus(waves, waveModifier) {
        const w = Math.max(0, waves || 0);
        return w > 15 ? (w - 15) * waveModifier : 0;
    },

    /**
     * Calculate squad totals across all players
     * NOTE: Global bonuses (objective, geneseed, armoury, waves) are only added ONCE to the squad total,
     * not summed from individual players (which would count them 3 times).
     */
    calculateSquadTotals(playerResults, playerStats, modifiers, globals, waveScore) {
        const totals = {
            kills: 0,
            elite: 0,
            death: 0,
            damage: 0,
            tasks: 0,
            melee: 0,
            ranged: 0,
            items: 0,
            revived: 0,
            baseScore: 0,
            modifierScore: 0,
            finalScore: 0,
            reviveDiff: 0
        };

        // Sum player stats
        playerStats.forEach((player, index) => {
            totals.kills += Math.max(0, player.kills || 0);
            totals.elite += Math.max(0, player.elite || 0);
            totals.death += Math.max(0, player.death || 0);
            totals.damage += Math.max(0, player.damage || 0);
            totals.tasks += Math.max(0, player.tasks || 0);
            totals.melee += Math.max(0, player.melee || 0);
            totals.ranged += Math.max(0, player.ranged || 0);
            totals.items += Math.max(0, player.items || 0);
            totals.revived += Math.max(0, player.revived || 0);
        });

        // Calculate SQUAD base score (global objective counted ONCE, not 3 times)
        totals.baseScore = this.calculateBaseScore(
            totals.kills,
            totals.elite,
            globals.objective,
            modifiers
        );

        // Calculate SQUAD modifier score (global bonuses counted ONCE, not 3 times)
        totals.modifierScore = this.calculateModifierScore(
            totals.death,
            totals.damage,
            globals.geneseed,
            globals.armoury,
            totals.tasks,
            modifiers,
            waveScore
        );

        // Calculate final score
        const finalScore = totals.baseScore + totals.modifierScore;
        totals.finalScore = Math.round(finalScore);

        // Calculate total revive diff
        totals.reviveDiff = totals.revived - totals.death;

        // Round totals
        totals.baseScore = Math.round(totals.baseScore * 10) / 10;
        totals.modifierScore = parseFloat(totals.modifierScore.toFixed(1));

        return totals;
    },

    // ========================================================================
    // VALIDATION HELPERS
    // ========================================================================

    /**
     * Validate calculation inputs
     * @private
     */
    _validateInputs(modifiers, globals, players) {
        // Check modifiers
        const requiredModifiers = ['kills', 'elite', 'death', 'damage', 'gene', 'armoury', 'obj', 'waves', 'tasks'];
        for (const key of requiredModifiers) {
            if (typeof modifiers[key] !== 'number' || !isFinite(modifiers[key])) {
                console.error(`Invalid modifier: ${key}`);
                return false;
            }
        }

        // Check globals
        if (globals.objective !== 0 && globals.objective !== 1) {
            console.error('Invalid objective value');
            return false;
        }
        if (globals.geneseed !== 0 && globals.geneseed !== 1) {
            console.error('Invalid geneseed value');
            return false;
        }
        if (typeof globals.armoury !== 'number' || globals.armoury < 0) {
            console.error('Invalid armoury value');
            return false;
        }
        if (typeof globals.waves !== 'number' || globals.waves < 0) {
            console.error('Invalid waves value');
            return false;
        }

        // Check players array
        if (!Array.isArray(players) || players.length === 0) {
            console.error('Invalid players array');
            return false;
        }

        return true;
    },

    /**
     * Safe wrapper for calculations with error boundaries
     */
    safeCalculate(calculationFn, fallbackValue = null) {
        try {
            return calculationFn();
        } catch (error) {
            console.error('Calculation error:', error);
            if (ErrorHandler) { // Check if ErrorHandler is imported/available
                ErrorHandler.handle(error, 'Calculation Engine', false);
            }
            return fallbackValue;
        }
    },

    // ========================================================================
    // UTILITY FUNCTIONS
    // ========================================================================

    /**
     * Format score for display (rounds to 1 decimal if needed)
     */
    formatScore(score) {
        if (Number.isInteger(score)) {
            return score.toString();
        }
        return score.toFixed(1);
    },

    /**
     * Format diff for display (with +/- sign)
     */
    formatDiff(diff) {
        return `${diff >= 0 ? '+' : ''}${diff}`;
    },

    /**
     * Calculate color for diff display
     */
    getDiffColor(diff) {
        return diff >= 0 ? '#80cc80' : '#cc5500';
    }
};

export default CalculationEngine;
