/**
 * Validation Utilities
 * Pure functions for validating user input and data
 */

import {
    PLAYER_CONSTRAINTS,
    TABLE_CONSTRAINTS,
    TOURNAMENT_CODE,
    ERROR_MESSAGES
} from '../config/constants.js';

/**
 * Validate player name
 * @param {string} name - Player name
 * @returns {Object} { valid: boolean, error: string }
 */
export function validatePlayerName(name) {
    if (!name || typeof name !== 'string') {
        return { valid: false, error: 'Player name is required' };
    }
    
    const trimmed = name.trim();
    
    if (trimmed.length < PLAYER_CONSTRAINTS.NAME_MIN_LENGTH) {
        return { valid: false, error: 'Player name cannot be empty' };
    }
    
    if (trimmed.length > PLAYER_CONSTRAINTS.NAME_MAX_LENGTH) {
        return { valid: false, error: `Player name cannot exceed ${PLAYER_CONSTRAINTS.NAME_MAX_LENGTH} characters` };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate player count for table creation
 * @param {number} count - Number of players
 * @returns {Object} { valid: boolean, error: string }
 */
export function validatePlayerCount(count) {
    if (!Number.isInteger(count) || count < PLAYER_CONSTRAINTS.MIN_PLAYERS) {
        return {
            valid: false,
            error: `Need at least ${PLAYER_CONSTRAINTS.MIN_PLAYERS} players`
        };
    }
    
    if (count % TABLE_CONSTRAINTS.PLAYERS_PER_TABLE !== 0) {
        return {
            valid: false,
            error: ERROR_MESSAGES.INVALID_PLAYER_COUNT
        };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate tournament code format
 * @param {string} code - Tournament code
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateTournamentCode(code) {
    if (!code || typeof code !== 'string') {
        return { valid: false, error: 'Tournament code is required' };
    }
    
    const upperCode = code.toUpperCase();
    
    if (upperCode.length !== TOURNAMENT_CODE.LENGTH) {
        return {
            valid: false,
            error: `Tournament code must be exactly ${TOURNAMENT_CODE.LENGTH} characters`
        };
    }
    
    const validChars = new RegExp(`^[${TOURNAMENT_CODE.ALLOWED_CHARS}]+$`);
    if (!validChars.test(upperCode)) {
        return {
            valid: false,
            error: 'Tournament code can only contain letters and numbers'
        };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate score multiplier
 * @param {number} multiplier - Score multiplier value
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateMultiplier(multiplier) {
    const num = parseFloat(multiplier);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Multiplier must be a number' };
    }
    
    if (num <= 0) {
        return { valid: false, error: ERROR_MESSAGES.INVALID_MULTIPLIER };
    }
    
    if (num > 100) {
        return { valid: false, error: 'Multiplier cannot exceed 100' };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate timer duration
 * @param {number} duration - Duration in minutes
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateTimerDuration(duration) {
    const num = parseFloat(duration);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Timer duration must be a number' };
    }
    
    if (num <= 0) {
        return { valid: false, error: ERROR_MESSAGES.INVALID_TIMER };
    }
    
    if (num > 180) {
        return { valid: false, error: 'Timer duration cannot exceed 180 minutes (3 hours)' };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate score delta
 * @param {number} delta - Score change (+1 or -1)
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateScoreDelta(delta) {
    const num = parseInt(delta);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Score delta must be a number' };
    }
    
    if (num !== 1 && num !== -1) {
        return { valid: false, error: 'Score delta must be +1 or -1' };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate time offset for score event
 * @param {number} offsetMinutes - Offset in minutes from round start
 * @param {number} roundDuration - Round duration in minutes
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateTimeOffset(offsetMinutes, roundDuration) {
    const offset = parseFloat(offsetMinutes);
    
    if (isNaN(offset)) {
        return { valid: false, error: 'Time offset must be a number' };
    }
    
    if (offset < 0) {
        return { valid: false, error: 'Time offset cannot be negative' };
    }
    
    if (offset > roundDuration) {
        return {
            valid: false,
            error: `Time offset cannot exceed round duration of ${roundDuration} minutes`
        };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate max players limit
 * @param {number} maxPlayers - Maximum number of players
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateMaxPlayers(maxPlayers) {
    const num = parseInt(maxPlayers);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Max players must be a number' };
    }
    
    if (num < PLAYER_CONSTRAINTS.MIN_PLAYERS) {
        return {
            valid: false,
            error: `Max players must be at least ${PLAYER_CONSTRAINTS.MIN_PLAYERS}`
        };
    }
    
    if (num > PLAYER_CONSTRAINTS.MAX_PLAYERS) {
        return {
            valid: false,
            error: `Max players cannot exceed ${PLAYER_CONSTRAINTS.MAX_PLAYERS}`
        };
    }
    
    if (num % TABLE_CONSTRAINTS.PLAYERS_PER_TABLE !== 0) {
        return {
            valid: false,
            error: 'Max players must be divisible by 4'
        };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate total rounds
 * @param {number} totalRounds - Total number of rounds
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateTotalRounds(totalRounds) {
    const num = parseInt(totalRounds);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Total rounds must be a number' };
    }
    
    if (num < 1) {
        return { valid: false, error: 'Total rounds must be at least 1' };
    }
    
    if (num > 20) {
        return { valid: false, error: 'Total rounds cannot exceed 20' };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate table number
 * @param {number} tableNumber - Table number
 * @returns {Object} { valid: boolean, error: string }
 */
export function validateTableNumber(tableNumber) {
    const num = parseInt(tableNumber);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Table number must be a number' };
    }
    
    if (num < 1) {
        return { valid: false, error: 'Table number must be at least 1' };
    }
    
    if (num > TABLE_CONSTRAINTS.MAX_TABLES) {
        return {
            valid: false,
            error: `Table number cannot exceed ${TABLE_CONSTRAINTS.MAX_TABLES}`
        };
    }
    
    return { valid: true, error: null };
}

/**
 * Validate position
 * @param {string} position - Player position
 * @returns {Object} { valid: boolean, error: string }
 */
export function validatePosition(position) {
    const validPositions = ['East', 'South', 'West', 'North'];
    
    if (!validPositions.includes(position)) {
        return {
            valid: false,
            error: 'Position must be East, South, West, or North'
        };
    }
    
    return { valid: true, error: null };
}

/**
 * Check if a value is a valid Firebase timestamp
 * @param {*} timestamp - Value to check
 * @returns {boolean} True if valid timestamp
 */
export function isValidTimestamp(timestamp) {
    return timestamp &&
           typeof timestamp === 'object' &&
           typeof timestamp.toDate === 'function';
}

/**
 * Validate playoff player count
 * @param {number} playoffCount - Number of players for playoff
 * @param {number} remainingPlayers - Number of remaining active players
 * @returns {Object} { valid: boolean, error: string }
 */
export function validatePlayoffCount(playoffCount, remainingPlayers) {
    const num = parseInt(playoffCount);
    
    if (isNaN(num)) {
        return { valid: false, error: 'Playoff player count must be a number' };
    }
    
    if (num < TABLE_CONSTRAINTS.PLAYERS_PER_TABLE) {
        return {
            valid: false,
            error: `Playoff requires at least ${TABLE_CONSTRAINTS.PLAYERS_PER_TABLE} players`
        };
    }
    
    if (num > remainingPlayers) {
        return {
            valid: false,
            error: `Cannot have more playoff players than remaining players (${remainingPlayers})`
        };
    }
    
    if (num % TABLE_CONSTRAINTS.PLAYERS_PER_TABLE !== 0) {
        return {
            valid: false,
            error: 'Playoff player count must be divisible by 4'
        };
    }
    
    return { valid: true, error: null };
}


