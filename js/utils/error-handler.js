/**
 * Error Handling Utilities
 * Centralized error handling and reporting
 */

/**
 * Error Handler Class
 * Provides consistent error handling across the application
 */
export class ErrorHandler {
    /**
     * Handle an async operation with automatic error catching and user notification
     * @param {Function} operation - Async function to execute
     * @param {string} context - Description of what operation is being performed
     * @param {Function} showToast - Toast notification function
     * @param {Object} options - Additional options
     * @returns {Promise<any>} Result of operation or null on error
     */
    static async handle(operation, context, showToast, options = {}) {
        const {
            successMessage = null,
            rethrow = false,
            fallbackValue = null
        } = options;
        
        try {
            const result = await operation();
            
            if (successMessage && showToast) {
                showToast(successMessage, 'success');
            }
            
            return result;
        } catch (error) {
            console.error(`Error in ${context}:`, error);
            
            const errorMessage = this.formatErrorMessage(error, context);
            
            if (showToast) {
                showToast(errorMessage, 'error');
            }
            
            if (rethrow) {
                throw error;
            }
            
            return fallbackValue;
        }
    }
    
    /**
     * Format error message for user display
     * @param {Error} error - Error object
     * @param {string} context - Operation context
     * @returns {string} Formatted error message
     */
    static formatErrorMessage(error, context) {
        // Firebase errors
        if (error.code) {
            return this.getFirebaseErrorMessage(error.code, context);
        }
        
        // Custom error messages
        if (error.message) {
            return `Error in ${context}: ${error.message}`;
        }
        
        // Generic fallback
        return `An unexpected error occurred in ${context}`;
    }
    
    /**
     * Get user-friendly Firebase error messages
     * @param {string} code - Firebase error code
     * @param {string} context - Operation context
     * @returns {string} User-friendly error message
     */
    static getFirebaseErrorMessage(code, context) {
        const firebaseErrors = {
            'permission-denied': `Permission denied. You don't have access to ${context}.`,
            'not-found': `The requested data was not found for ${context}.`,
            'already-exists': `This data already exists. Cannot ${context}.`,
            'resource-exhausted': 'Too many requests. Please try again later.',
            'unauthenticated': 'Authentication required. Please sign in.',
            'unavailable': 'Service temporarily unavailable. Please try again.',
            'network-request-failed': 'Network error. Please check your connection.',
            'cancelled': 'Operation was cancelled.',
            'deadline-exceeded': 'Operation timed out. Please try again.',
            'invalid-argument': 'Invalid data provided. Please check your input.'
        };
        
        return firebaseErrors[code] || `Firebase error (${code}) in ${context}`;
    }
    
    /**
     * Log error for debugging (future: could send to error tracking service)
     * @param {Error} error - Error object
     * @param {string} context - Operation context
     * @param {Object} metadata - Additional metadata for debugging
     */
    static log(error, context, metadata = {}) {
        const errorLog = {
            timestamp: new Date().toISOString(),
            context,
            message: error.message,
            code: error.code,
            stack: error.stack,
            metadata
        };
        
        console.error('Error Log:', errorLog);
        
        // Future: Send to error tracking service (Sentry, LogRocket, etc.)
        // if (window.errorTracker) {
        //     window.errorTracker.captureException(error, errorLog);
        // }
    }
    
    /**
     * Create a custom error
     * @param {string} message - Error message
     * @param {string} code - Error code
     * @returns {Error} Custom error object
     */
    static createError(message, code = 'CUSTOM_ERROR') {
        const error = new Error(message);
        error.code = code;
        return error;
    }
    
    /**
     * Validate and throw if invalid
     * @param {Object} validation - Validation result { valid, error }
     * @param {string} code - Error code
     * @throws {Error} If validation failed
     */
    static validateOrThrow(validation, code = 'VALIDATION_ERROR') {
        if (!validation.valid) {
            throw this.createError(validation.error, code);
        }
    }
}

/**
 * Retry an operation with exponential backoff
 * @param {Function} operation - Async function to retry
 * @param {number} maxAttempts - Maximum retry attempts
 * @param {number} initialDelay - Initial delay in ms
 * @returns {Promise<any>} Result of operation
 */
export async function retryWithBackoff(operation, maxAttempts = 3, initialDelay = 1000) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
            return await operation();
        } catch (error) {
            lastError = error;
            
            if (attempt === maxAttempts) {
                throw error;
            }
            
            // Exponential backoff: 1s, 2s, 4s, etc.
            const delay = initialDelay * Math.pow(2, attempt - 1);
            console.log(`Retry attempt ${attempt} failed, retrying in ${delay}ms...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    
    throw lastError;
}

/**
 * Wrap a function with error handling
 * @param {Function} fn - Function to wrap
 * @param {string} context - Operation context
 * @param {Function} showToast - Toast notification function
 * @returns {Function} Wrapped function
 */
export function withErrorHandling(fn, context, showToast) {
    return async (...args) => {
        return ErrorHandler.handle(
            () => fn(...args),
            context,
            showToast
        );
    };
}

/**
 * Assert a condition is true, throw error if false
 * @param {boolean} condition - Condition to check
 * @param {string} message - Error message
 * @param {string} code - Error code
 * @throws {Error} If condition is false
 */
export function assert(condition, message, code = 'ASSERTION_ERROR') {
    if (!condition) {
        throw ErrorHandler.createError(message, code);
    }
}

