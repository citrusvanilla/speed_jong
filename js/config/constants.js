/**
 * Application Constants
 * Centralized configuration values used throughout the app
 */

// Tournament Types
export const TOURNAMENT_TYPES = {
    STANDARD: 'standard',
    CUTLINE: 'cutline'
};

// Tournament Status
export const TOURNAMENT_STATUS = {
    STAGING: 'staging',
    ACTIVE: 'active',
    COMPLETED: 'completed'
};

// Round Status
export const ROUND_STATUS = {
    STAGING: 'staging',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed'
};

// Timer Defaults
export const TIMER_DEFAULTS = {
    DEFAULT_DURATION: 5,           // minutes
    WARNING_THRESHOLD: 0.25,       // 25% remaining
    DANGER_THRESHOLD: 0.10,        // 10% remaining
    UPDATE_INTERVAL: 1000          // 1 second in ms
};

// Score Defaults
export const SCORE_DEFAULTS = {
    DEFAULT_MULTIPLIER: 1,
    WIN_DELTA: 1,
    PENALTY_DELTA: -1
};

// Player Positions
export const POSITIONS = ['East', 'South', 'West', 'North'];

// Wind Symbols
export const WIND_SYMBOLS = {
    East: '東',
    South: '南',
    West: '西',
    North: '北'
};

// Position Colors (for UI)
export const POSITION_COLORS = {
    East: '#ef4444',    // red
    South: '#10b981',   // green
    West: '#3b82f6',    // blue
    North: '#f59e0b'    // amber
};

// Table Constraints
export const TABLE_CONSTRAINTS = {
    PLAYERS_PER_TABLE: 4,
    MIN_TABLES: 1,
    MAX_TABLES: 100
};

// Player Constraints
export const PLAYER_CONSTRAINTS = {
    MIN_PLAYERS: 4,
    MAX_PLAYERS: 400,
    NAME_MIN_LENGTH: 1,
    NAME_MAX_LENGTH: 100
};

// Tournament Code
export const TOURNAMENT_CODE = {
    LENGTH: 4,
    ALLOWED_CHARS: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    MAX_GENERATION_ATTEMPTS: 10
};

// Cut Line Percentages (by round for 4-round tournament)
export const CUTLINE_PERCENTAGES = {
    4: [1.0, 0.75, 0.50, 0.25],  // 100%, 75%, 50%, 25%
    3: [1.0, 0.67, 0.33],        // 100%, 67%, 33%
    2: [1.0, 0.50]               // 100%, 50%
};

// Toast Durations
export const TOAST_DURATION = {
    SHORT: 3000,   // 3 seconds
    NORMAL: 5000,  // 5 seconds
    LONG: 8000     // 8 seconds
};

// Modal Types
export const MODAL_TYPES = {
    CONFIRM: 'confirm',
    TYPE_TO_CONFIRM: 'type-to-confirm',
    PROMPT: 'prompt',
    INFO: 'info'
};

// DataTable Defaults
export const DATATABLE_DEFAULTS = {
    PAGE_LENGTH: 25,
    LENGTH_MENU: [
        [10, 25, 50, -1],
        [10, 25, 50, 'All']
    ]
};

// Local Storage Keys
export const STORAGE_KEYS = {
    ADMIN_TOURNAMENT_ID: 'adminSelectedTournamentId',
    TIMER_DURATION: 'timerDuration',
    TIMER_SOUND: 'timerSound',
    TIMER_VIBRATE: 'timerVibrate'
};

// Error Messages
export const ERROR_MESSAGES = {
    TOURNAMENT_NOT_FOUND: 'Tournament not found',
    PLAYER_NOT_FOUND: 'Player not found',
    TABLE_NOT_FOUND: 'Table not found',
    ROUND_NOT_FOUND: 'Round not found',
    INVALID_PLAYER_COUNT: 'Number of players must be divisible by 4',
    DUPLICATE_TOURNAMENT_CODE: 'Tournament code already exists',
    INVALID_MULTIPLIER: 'Multiplier must be a positive number',
    INVALID_TIMER: 'Timer duration must be a positive number'
};

// Success Messages
export const SUCCESS_MESSAGES = {
    TOURNAMENT_CREATED: 'Tournament created successfully!',
    TOURNAMENT_UPDATED: 'Tournament updated successfully!',
    TOURNAMENT_DELETED: 'Tournament deleted successfully!',
    PLAYER_ADDED: 'Player added successfully!',
    PLAYER_UPDATED: 'Player updated successfully!',
    PLAYER_DELETED: 'Player deleted successfully!',
    TABLE_CREATED: 'Table created successfully!',
    TABLE_DELETED: 'Table deleted successfully!',
    ROUND_STARTED: 'Round started successfully!',
    ROUND_ENDED: 'Round ended successfully!',
    SCORE_UPDATED: 'Score updated successfully!'
};

// API Endpoints (if needed in future)
export const API_ENDPOINTS = {
    // Placeholder for future API integration
};

// Feature Flags (for gradual rollout of features)
export const FEATURES = {
    ENABLE_TABLE_MAP: true,
    ENABLE_PLAYOFF_ROUNDS: true,
    ENABLE_ROUND_MULTIPLIERS: true,
    ENABLE_AUTO_ASSIGN: true
};


