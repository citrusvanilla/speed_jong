/**
 * Tournament Service
 * Handles all tournament-related Firebase operations
 */

import { BaseService } from './base-service.js';
import { TOURNAMENT_TYPES, TOURNAMENT_STATUS } from '../config/constants.js';
import { validateTournamentCode } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

export class TournamentService extends BaseService {
    constructor(db) {
        super(db, 'tournaments');
    }
    
    /**
     * Create a new tournament
     * @param {Object} tournamentData - Tournament data
     * @returns {Promise<string>} Tournament ID
     */
    async createTournament(tournamentData) {
        const {
            name,
            tournamentCode,
            type = TOURNAMENT_TYPES.STANDARD,
            timerDuration = 5,
            maxPlayers = 0,
            totalRounds = 0
        } = tournamentData;
        
        // Validate tournament code
        const validation = validateTournamentCode(tournamentCode);
        ErrorHandler.validateOrThrow(validation, 'INVALID_TOURNAMENT_CODE');
        
        // Check if code already exists
        const exists = await this.isCodeUnique(tournamentCode);
        if (!exists) {
            throw ErrorHandler.createError(
                'Tournament code already exists',
                'DUPLICATE_CODE'
            );
        }
        
        const docId = await this.create({
            name,
            tournamentCode: tournamentCode.toUpperCase(),
            type,
            status: TOURNAMENT_STATUS.STAGING,
            timerDuration,
            maxPlayers,
            totalRounds,
            currentRound: 0,
            roundInProgress: false
        });
        
        return docId;
    }
    
    /**
     * Update tournament info
     * @param {string} tournamentId - Tournament ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateTournament(tournamentId, updates) {
        // If updating tournament code, validate it
        if (updates.tournamentCode) {
            const validation = validateTournamentCode(updates.tournamentCode);
            ErrorHandler.validateOrThrow(validation, 'INVALID_TOURNAMENT_CODE');
            
            const exists = await this.isCodeUnique(updates.tournamentCode, tournamentId);
            if (!exists) {
                throw ErrorHandler.createError(
                    'Tournament code already exists',
                    'DUPLICATE_CODE'
                );
            }
            
            updates.tournamentCode = updates.tournamentCode.toUpperCase();
        }
        
        await this.update(tournamentId, updates);
    }
    
    /**
     * Delete a tournament and all related data
     * @param {string} tournamentId - Tournament ID
     * @returns {Promise<void>}
     */
    async deleteTournament(tournamentId) {
        // Note: This deletes only the tournament document
        // Subcollections (players, tables, rounds) should be deleted separately
        // or use Cloud Functions for cascade delete
        await this.delete(tournamentId);
    }
    
    /**
     * Get tournament by code
     * @param {string} code - Tournament code
     * @returns {Promise<Object>} Tournament data
     */
    async getByCode(code) {
        const results = await this.query([
            ['tournamentCode', '==', code.toUpperCase()]
        ], { limitCount: 1 });
        
        if (results.length === 0) {
            throw ErrorHandler.createError(
                'Tournament not found with code: ' + code,
                'NOT_FOUND'
            );
        }
        
        return results[0];
    }
    
    /**
     * Check if tournament code is unique
     * @param {string} code - Tournament code
     * @param {string} excludeId - Tournament ID to exclude from check
     * @returns {Promise<boolean>} True if unique
     */
    async isCodeUnique(code, excludeId = null) {
        const results = await this.query([
            ['tournamentCode', '==', code.toUpperCase()]
        ]);
        
        if (excludeId) {
            return results.filter(t => t.id !== excludeId).length === 0;
        }
        
        return results.length === 0;
    }
    
    /**
     * Get all tournaments
     * @param {string} statusFilter - Filter by status (optional)
     * @returns {Promise<Array>} Array of tournaments
     */
    async getAllTournaments(statusFilter = null) {
        if (statusFilter) {
            return this.query([['status', '==', statusFilter]]);
        }
        return this.getAll();
    }
    
    /**
     * Get active tournaments
     * @returns {Promise<Array>} Array of active tournaments
     */
    async getActiveTournaments() {
        return this.getAllTournaments(TOURNAMENT_STATUS.ACTIVE);
    }
    
    /**
     * Start tournament (change status to active)
     * @param {string} tournamentId - Tournament ID
     * @returns {Promise<void>}
     */
    async startTournament(tournamentId) {
        await this.update(tournamentId, {
            status: TOURNAMENT_STATUS.ACTIVE
        });
    }
    
    /**
     * Complete tournament
     * @param {string} tournamentId - Tournament ID
     * @returns {Promise<void>}
     */
    async completeTournament(tournamentId) {
        await this.update(tournamentId, {
            status: TOURNAMENT_STATUS.COMPLETED
        });
    }
    
    /**
     * Archive tournament (soft delete)
     * @param {string} tournamentId - Tournament ID
     * @returns {Promise<void>}
     */
    async archiveTournament(tournamentId) {
        await this.update(tournamentId, {
            archived: true,
            archivedAt: BaseService.serverTimestamp()
        });
    }
    
    /**
     * Move to next round
     * @param {string} tournamentId - Tournament ID
     * @returns {Promise<number>} New round number
     */
    async moveToNextRound(tournamentId) {
        const tournament = await this.getById(tournamentId);
        const nextRound = tournament.currentRound + 1;
        
        await this.update(tournamentId, {
            currentRound: nextRound
        });
        
        return nextRound;
    }
    
    /**
     * Set round in progress status
     * @param {string} tournamentId - Tournament ID
     * @param {boolean} inProgress - True if round is in progress
     * @returns {Promise<void>}
     */
    async setRoundInProgress(tournamentId, inProgress) {
        await this.update(tournamentId, {
            roundInProgress: inProgress
        });
    }
    
    /**
     * Subscribe to tournament updates
     * @param {string} tournamentId - Tournament ID
     * @param {Function} callback - Callback function(tournament)
     * @returns {Function} Unsubscribe function
     */
    subscribeToTournament(tournamentId, callback) {
        return this.subscribeToDocument(tournamentId, callback);
    }
    
    /**
     * Subscribe to all tournaments
     * @param {Function} callback - Callback function(tournaments)
     * @returns {Function} Unsubscribe function
     */
    subscribeToAllTournaments(callback) {
        return this.subscribeToCollection(callback);
    }
}

