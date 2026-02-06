// ============================================================================
// DOM Sanitization Utilities
// ============================================================================

/**
 * Sanitizes user input to prevent XSS attacks
 * Removes HTML tags, dangerous characters, and limits length
 */
export function sanitizeInput(input) {
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
export function safeSetText(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.textContent = sanitizeInput(value);
}

/**
 * Safely set input value
 */
export function safeSetValue(elementId, value) {
    const el = document.getElementById(elementId);
    if (el) el.value = sanitizeInput(value);
}

/**
 * Escapes HTML special characters to prevent XSS
 */
export function escapeHtml(str) {
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
