// ============================================================================
// IMPERIAL DATE CALCULATOR MODULE
// Version: 2.0 (Modularized)
//
// Calculates Imperial Date based on UTC time (date only, no time component).
// Format: 0.XXX.YYY.MZ
//
// Imperial Date System:
// - CHECK: Always 0 for events occurring on Terra (Earth)
// - YEAR FRACTION: Year divided into 1000 equal fractions (000-999)
//   Formula: floor((day_of_year * 24) * Makr_Constant)
//   Makr Constant = 0.11407955263862231501532129004257
// - YEAR: Last 3 digits of current year (e.g., 2026 → 026)
// - MILLENNIUM: Derived from year (e.g., 2026 → M3)
//
// Updates once per day for efficiency, as the Imperial Date only changes daily.
// ============================================================================

"use strict";

// Makr Constant for year fraction calculation
const MAKR_CONSTANT = 0.11407955263862231501532129004257;

// Cached date to track daily changes
let lastCalculatedDate = null;
let cachedImperialDate = null;

// Toggle state: true = Imperial Date, false = real date
let showingImperial = true;

// localStorage key for persisting date format preference
const STORAGE_KEY = "cogitator_date_format";

/**
 * Calculate the Imperial Date based on current UTC date
 * @returns {string} Formatted Imperial Date (e.g., "0.959.026.M3")
 */
function calculate() {
    const now = new Date();

    // Check digit: Always 0 for Terra (Earth)
    const checkDigit = "0";

    // Calculate Year Fraction (000-999)
    const yearFraction = calculateYearFraction(now);
    const yearFractionStr = String(yearFraction).padStart(3, '0');

    // Calculate year (last 3 digits)
    const currentYear = now.getUTCFullYear();
    const yearStr = String(currentYear).slice(-3).padStart(3, '0');

    // Calculate millennium
    const millennium = calculateMillennium(currentYear);

    // Format: 0.FRACTION.YEAR.MILLENNIUM
    return `${checkDigit}.${yearFractionStr}.${yearStr}.${millennium}`;
}

/**
 * Calculate the year fraction based on day of year
 * @param {Date} date - Current date
 * @returns {number} Year fraction (0-999)
 */
function calculateYearFraction(date) {
    // Get day of year (1-366)
    const dayOfYear = getDayOfYear(date);

    // Calculate hours that have passed in the year
    // Day 1 (Jan 1) = 1 * 24 = 24 hours
    // Day 2 (Jan 2) = 2 * 24 = 48 hours, etc.
    const hoursOfYear = dayOfYear * 24;

    // Apply Makr Constant and floor the result
    const yearFraction = Math.floor(hoursOfYear * MAKR_CONSTANT);

    // Ensure the result is within valid range (0-999)
    return Math.min(999, Math.max(0, yearFraction));
}

/**
 * Get day of year (1-366) for a given date
 * @param {Date} date - Date to calculate from
 * @returns {number} Day of year (1 for January 1st, etc.)
 */
function getDayOfYear(date) {
    const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const diff = date - start;
    const oneDay = 1000 * 60 * 60 * 24;
    return Math.floor(diff / oneDay) + 1;
}

/**
 * Calculate millennium from year
 * @param {number} year - Current year (e.g., 2026)
 * @returns {string} Millennium designation (e.g., "M3")
 */
function calculateMillennium(year) {
    // Millennium calculation: year 1-1000 = M1, 1001-2000 = M2, 2001-3000 = M3, etc.
    const millennium = Math.ceil(year / 1000);
    return `M${millennium}`;
}

/**
 * Get current date string for comparison (UTC date only, no time)
 * @returns {string} Date string in YYYY-MM-DD format
 */
function getCurrentDateString() {
    const now = new Date();
    return now.toISOString().split('T')[0]; // Returns YYYY-MM-DD
}

/**
 * Initialize the Imperial Date display
 * Updates the element once immediately and sets up daily updates
 * @param {string} elementId - ID of the element to update (default: "imperial-date")
 * @returns {number} Interval ID for cleanup
 */
export function startUpdating(elementId = "imperial-date") {
    const element = document.getElementById(elementId);

    if (!element) {
        console.error(`ImperialDate: Element with id "${elementId}" not found`);
        return null;
    }

    // Restore saved date format preference
    loadDateFormatPreference();

    // Make element clickable and add toggle handler
    element.style.cursor = 'pointer';
    element.addEventListener('click', () => toggleDateDisplay());

    // Initial update
    updateDisplay(element);

    // Check for date change every hour (efficient enough)
    // This is much more efficient than checking every second
    const intervalId = setInterval(() => {
        checkAndUpdate(element);
    }, 3600000); // Check every hour (3600000ms)

    console.log('✅ Imperial Date calculator initialized (checking for date changes hourly)');

    return intervalId;
}

/**
 * Check if date has changed and update if needed
 * @param {HTMLElement} element - Element to update
 */
function checkAndUpdate(element) {
    const currentDateString = getCurrentDateString();

    // Only recalculate if the date has changed
    if (currentDateString !== lastCalculatedDate) {
        updateDisplay(element);
    }
}

/**
 * Update the display element with current Imperial Date
 * @param {HTMLElement} element - Element to update
 */
function updateDisplay(element) {
    if (element) {
        const imperialDate = calculate();

        // Cache the date and result
        lastCalculatedDate = getCurrentDateString();
        cachedImperialDate = imperialDate;

        // Update text based on current format preference
        if (showingImperial) {
            element.textContent = `DAT: ${imperialDate}`;
        } else {
            element.textContent = `DAT: ${getRealDate()}`;
        }

        console.log(`Imperial Date updated: ${imperialDate}`);
    }
}

/**
 * Get the current real-world date formatted as DD.MM.YYYY
 * @returns {string} Formatted real date
 */
function getRealDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}.${month}.${year}`;
}

/**
 * Toggle between Imperial Date and real date display
 * Updates all registered display elements
 */
function toggleDateDisplay() {
    showingImperial = !showingImperial;
    saveDateFormatPreference();
    const elements = document.querySelectorAll('[id^="imperial-date"]');
    elements.forEach(el => {
        if (showingImperial) {
            const imperialDate = cachedImperialDate || calculate();
            el.textContent = `DAT: ${imperialDate}`;
        } else {
            el.textContent = `DAT: ${getRealDate()}`;
        }
    });
}

/**
 * Save date format preference to localStorage
 */
function saveDateFormatPreference() {
    try {
        localStorage.setItem(STORAGE_KEY, showingImperial ? "imperial" : "real");
    } catch (e) {
        // Silently fail if localStorage is unavailable
    }
}

/**
 * Load date format preference from localStorage
 */
function loadDateFormatPreference() {
    try {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved !== null) {
            showingImperial = saved === "imperial";
        }
    } catch (e) {
        // Silently fail if localStorage is unavailable
    }
}

/**
 * Stop updating the Imperial Date
 * @param {number} intervalId - Interval ID returned from startUpdating()
 */
export function stopUpdating(intervalId) {
    if (intervalId) {
        clearInterval(intervalId);
        console.log('Imperial Date updates stopped');
    }
}