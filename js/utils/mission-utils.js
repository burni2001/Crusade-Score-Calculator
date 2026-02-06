// ============================================================================
// MISSION UTILITIES MODULE
// Contains utility functions related to mission data
// ============================================================================

"use strict";

/**
 * Check if mission name indicates a Siege-type mission
 * @param {string} missionName - The name of the mission
 * @returns {boolean} True if it's a Siege mission, false otherwise
 */
export function isSiegeMission(missionName) {
    if (!missionName || typeof missionName !== 'string') return false;
    const normalized = missionName.toLowerCase().trim();
    return /siege|seige|fortress/i.test(normalized);
}
