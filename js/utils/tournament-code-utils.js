// js/utils/tournament-code-utils.js
// Tournament code generation and validation utilities

/**
 * Generate a random 4-character alphanumeric tournament code
 * @returns {string} A random tournament code (e.g., "A3K9")
 */
export function generateTournamentCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // All alphanumeric
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

/**
 * Validate and sanitize tournament code
 * @param {string} code - The code to validate
 * @returns {Object} { valid: boolean, sanitized: string, error?: string }
 */
export function validateTournamentCode(code) {
    const sanitized = code.trim().toUpperCase();
    
    // Must be exactly 4 characters
    if (sanitized.length !== 4) {
        return { valid: false, sanitized, error: 'Tournament code must be exactly 4 characters' };
    }
    
    // Must be alphanumeric
    if (!/^[A-Z0-9]{4}$/.test(sanitized)) {
        return { valid: false, sanitized, error: 'Tournament code must contain only letters and numbers' };
    }
    
    return { valid: true, sanitized };
}

