/**
 * Formatting Utilities
 * Pure functions for formatting data for display
 */

import { WIND_SYMBOLS } from '../config/constants.js';

/**
 * Format seconds into MM:SS format
 * @param {number} seconds - Total seconds
 * @returns {string} Formatted time string (e.g., "5:03")
 */
export function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration in minutes
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "5 min", "30 min")
 */
export function formatDuration(minutes) {
    if (!minutes) return 'N/A';
    return `${minutes} min${minutes !== 1 ? '' : ''}`;
}

/**
 * Get wind symbol for a position
 * @param {string} position - Player position (East, South, West, North)
 * @returns {string} Wind symbol (東, 南, 西, 北)
 */
export function getWindSymbol(position) {
    return WIND_SYMBOLS[position] || '';
}

/**
 * Format Firebase timestamp to locale string
 * @param {Object} timestamp - Firebase Timestamp object
 * @param {Object} options - Intl.DateTimeFormat options
 * @returns {string} Formatted date/time string
 */
export function formatFirebaseTimestamp(timestamp, options = {}) {
    if (!timestamp) return 'N/A';
    try {
        return new Date(timestamp.toDate()).toLocaleString('en-US', options);
    } catch (error) {
        console.error('Error formatting timestamp:', error);
        return 'Invalid Date';
    }
}

/**
 * Format timestamp to date only
 * @param {Object} timestamp - Firebase Timestamp object
 * @returns {string} Formatted date (e.g., "12/3/2025")
 */
export function formatDate(timestamp) {
    if (!timestamp) return 'N/A';
    return formatFirebaseTimestamp(timestamp, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    });
}

/**
 * Format timestamp to time only
 * @param {Object} timestamp - Firebase Timestamp object
 * @returns {string} Formatted time (e.g., "3:45 PM")
 */
export function formatTimeOnly(timestamp) {
    if (!timestamp) return 'N/A';
    return formatFirebaseTimestamp(timestamp, {
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * Format timestamp to full date and time
 * @param {Object} timestamp - Firebase Timestamp object
 * @returns {string} Formatted date and time
 */
export function formatDateTime(timestamp) {
    if (!timestamp) return 'N/A';
    return formatFirebaseTimestamp(timestamp, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

/**
 * Format score with +/- prefix
 * @param {number} score - Score value
 * @param {boolean} showZero - Whether to show +0 for zero scores
 * @returns {string} Formatted score (e.g., "+5", "-2", "0")
 */
export function formatScore(score, showZero = false) {
    if (score === 0) {
        return showZero ? '+0' : '0';
    }
    return score > 0 ? `+${score}` : `${score}`;
}

/**
 * Format score multiplier
 * @param {number} multiplier - Score multiplier
 * @returns {string} Formatted multiplier (e.g., "✕1", "✕2", "✕1.5")
 */
export function formatMultiplier(multiplier) {
    return `✕${multiplier}`;
}

/**
 * Format player count
 * @param {number} count - Number of players
 * @returns {string} Formatted player count (e.g., "1 player", "4 players")
 */
export function formatPlayerCount(count) {
    return `${count} player${count !== 1 ? 's' : ''}`;
}

/**
 * Format table count
 * @param {number} count - Number of tables
 * @returns {string} Formatted table count (e.g., "1 table", "4 tables")
 */
export function formatTableCount(count) {
    return `${count} table${count !== 1 ? 's' : ''}`;
}

/**
 * Format percentage
 * @param {number} value - Decimal value (e.g., 0.75)
 * @param {number} decimals - Number of decimal places
 * @returns {string} Formatted percentage (e.g., "75%", "66.7%")
 */
export function formatPercentage(value, decimals = 0) {
    return `${(value * 100).toFixed(decimals)}%`;
}

/**
 * Format round status for display
 * @param {string} status - Round status (staging, in_progress, completed)
 * @returns {string} Display-friendly status
 */
export function formatRoundStatus(status) {
    const statusMap = {
        'staging': 'Staging',
        'in_progress': 'In Progress',
        'completed': 'Completed'
    };
    return statusMap[status] || status;
}

/**
 * Format tournament type for display
 * @param {string} type - Tournament type (standard, cutline)
 * @returns {string} Display-friendly type
 */
export function formatTournamentType(type) {
    const typeMap = {
        'standard': 'Standard',
        'cutline': 'Cut Line'
    };
    return typeMap[type] || type;
}

/**
 * Truncate text with ellipsis
 * @param {string} text - Text to truncate
 * @param {number} maxLength - Maximum length
 * @returns {string} Truncated text
 */
export function truncate(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
}

/**
 * Capitalize first letter
 * @param {string} text - Text to capitalize
 * @returns {string} Capitalized text
 */
export function capitalize(text) {
    if (!text) return '';
    return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Format ordinal number (1st, 2nd, 3rd, etc.)
 * @param {number} num - Number
 * @returns {string} Ordinal string
 */
export function formatOrdinal(num) {
    const suffixes = ['th', 'st', 'nd', 'rd'];
    const value = num % 100;
    return num + (suffixes[(value - 20) % 10] || suffixes[value] || suffixes[0]);
}

/**
 * Format score delta for display
 * @param {number} delta - Score delta (+1 or -1)
 * @returns {string} Formatted delta ("+1" or "-1")
 */
export function formatScoreDelta(delta) {
    return delta > 0 ? '+1' : '-1';
}

/**
 * Format score event type
 * @param {number} delta - Score delta
 * @returns {string} Event type ("Win" or "Penalty")
 */
export function formatScoreEventType(delta) {
    return delta > 0 ? 'Win' : 'Penalty';
}


