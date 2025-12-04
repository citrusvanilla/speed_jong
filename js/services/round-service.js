/**
 * Round Service
 * Handles all round-related Firebase operations
 */

import { collection, doc, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { BaseService } from './base-service.js';
import { ROUND_STATUS } from '../config/constants.js';
import { validateTimerDuration, validateMultiplier } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

export class RoundService extends BaseService {
    constructor(db, tournamentId) {
        super(db, `tournaments/${tournamentId}/rounds`);
        this.tournamentId = tournamentId;
    }
    
    /**
     * Create a new round
     * @param {number} roundNumber - Round number
     * @param {Object} options - Round options { timerDuration, scoreMultiplier, isPlayoff }
     * @returns {Promise<string>} Round ID
     */
    async createRound(roundNumber, options = {}) {
        const {
            timerDuration = 5,
            scoreMultiplier = 1,
            isPlayoff = false
        } = options;
        
        const timerValidation = validateTimerDuration(timerDuration);
        ErrorHandler.validateOrThrow(timerValidation, 'INVALID_TIMER');
        
        const multiplierValidation = validateMultiplier(scoreMultiplier);
        ErrorHandler.validateOrThrow(multiplierValidation, 'INVALID_MULTIPLIER');
        
        const roundId = await this.create({
            roundNumber,
            status: ROUND_STATUS.STAGING,
            timerDuration,
            scoreMultiplier,
            isPlayoff,
            startedAt: null,
            endedAt: null
        });
        
        return roundId;
    }
    
    /**
     * Start a round
     * @param {string} roundId - Round ID
     * @returns {Promise<void>}
     */
    async startRound(roundId) {
        await this.update(roundId, {
            status: ROUND_STATUS.IN_PROGRESS,
            startedAt: BaseService.serverTimestamp()
        });
    }
    
    /**
     * End a round
     * @param {string} roundId - Round ID
     * @returns {Promise<void>}
     */
    async endRound(roundId) {
        await this.update(roundId, {
            status: ROUND_STATUS.COMPLETED,
            endedAt: BaseService.serverTimestamp()
        });
    }
    
    /**
     * Restart a round (set back to in progress)
     * @param {string} roundId - Round ID
     * @returns {Promise<void>}
     */
    async restartRound(roundId) {
        await this.update(roundId, {
            status: ROUND_STATUS.IN_PROGRESS,
            endedAt: null
        });
    }
    
    /**
     * Update round timer duration
     * @param {string} roundId - Round ID
     * @param {number} duration - Duration in minutes
     * @returns {Promise<void>}
     */
    async updateTimer(roundId, duration) {
        const validation = validateTimerDuration(duration);
        ErrorHandler.validateOrThrow(validation, 'INVALID_TIMER');
        
        await this.update(roundId, { timerDuration: duration });
    }
    
    /**
     * Update round score multiplier
     * @param {string} roundId - Round ID
     * @param {number} multiplier - Score multiplier
     * @returns {Promise<void>}
     */
    async updateMultiplier(roundId, multiplier) {
        const validation = validateMultiplier(multiplier);
        ErrorHandler.validateOrThrow(validation, 'INVALID_MULTIPLIER');
        
        await this.update(roundId, { scoreMultiplier: multiplier });
    }
    
    /**
     * Get round by number
     * @param {number} roundNumber - Round number
     * @returns {Promise<Object>} Round data
     */
    async getByNumber(roundNumber) {
        const results = await this.query([
            ['roundNumber', '==', roundNumber]
        ], { limitCount: 1 });
        
        if (results.length === 0) {
            throw ErrorHandler.createError(
                `Round not found with number: ${roundNumber}`,
                'NOT_FOUND'
            );
        }
        
        return results[0];
    }
    
    /**
     * Get all rounds sorted by number
     * @returns {Promise<Array>} Array of rounds
     */
    async getAllRounds() {
        return this.query([], { orderByField: 'roundNumber', orderDirection: 'asc' });
    }
    
    /**
     * Get completed rounds
     * @returns {Promise<Array>} Array of completed rounds
     */
    async getCompletedRounds() {
        return this.query([
            ['status', '==', ROUND_STATUS.COMPLETED]
        ], { orderByField: 'roundNumber', orderDirection: 'asc' });
    }
    
    /**
     * Get current (in progress) round
     * @returns {Promise<Object|null>} Current round or null
     */
    async getCurrentRound() {
        const results = await this.query([
            ['status', '==', ROUND_STATUS.IN_PROGRESS]
        ], { limitCount: 1 });
        
        return results.length > 0 ? results[0] : null;
    }
    
    /**
     * Get last completed round
     * @returns {Promise<Object|null>} Last completed round or null
     */
    async getLastCompletedRound() {
        const completed = await this.getCompletedRounds();
        return completed.length > 0 ? completed[completed.length - 1] : null;
    }
    
    /**
     * Get all participants for a specific round
     * @param {string} roundId - The round ID
     * @returns {Promise<Array>} Array of participant data
     */
    async getParticipants(roundId) {
        try {
            const participantsRef = this.firestore.collection(this.db, 'tournaments', this.tournamentId, 'rounds', roundId, 'participants');
            const snapshot = await this.firestore.getDocs(participantsRef);
            return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error(`Error getting participants for round ${roundId}:`, error);
            return [];
        }
    }
    
    /**
     * Get a specific participant from a round
     * @param {string} roundId - The round ID
     * @param {string} participantId - The participant ID (usually same as playerId)
     * @returns {Promise<Object|null>} Participant data or null if not found
     */
    async getParticipantById(roundId, participantId) {
        try {
            const participantRef = this.firestore.doc(this.db, 'tournaments', this.tournamentId, 'rounds', roundId, 'participants', participantId);
            const participantDoc = await this.firestore.getDoc(participantRef);
            
            if (!participantDoc.exists()) {
                return null;
            }
            
            return { id: participantDoc.id, ...participantDoc.data() };
        } catch (error) {
            console.error(`Error getting participant ${participantId} from round ${roundId}:`, error);
            return null;
        }
    }
    
    /**
     * Create a participant snapshot for a round
     * @param {string} roundId - The round ID
     * @param {Object} playerData - Player data to snapshot
     * @returns {Promise<string>} Created participant ID
     */
    async createParticipant(roundId, playerData) {
        try {
            const participantRef = this.firestore.doc(this.firestore.collection(this.db, 'tournaments', this.tournamentId, 'rounds', roundId, 'participants'));
            await this.firestore.setDoc(participantRef, {
                playerId: playerData.id,
                name: playerData.name,
                wins: playerData.wins || 0,
                points: playerData.points || 0,
                tableId: playerData.tableId || null,
                position: playerData.position || null,
                lastWinAt: playerData.lastWinAt || null,
                scoreEvents: [], // Initialize empty scoreEvents array for new round
                snapshotAt: this.firestore.serverTimestamp()
            });
            return participantRef.id;
        } catch (error) {
            console.error(`Error creating participant for player ${playerData.id}:`, error);
            throw error;
        }
    }
    
    /**
     * Delete all participants for a round
     * @param {string} roundId - The round ID
     * @returns {Promise<void>}
     */
    async deleteAllParticipants(roundId) {
        try {
            const participants = await this.getParticipants(roundId);
            const deletePromises = participants.map(p => {
                const participantRef = this.firestore.doc(this.db, 'tournaments', this.tournamentId, 'rounds', roundId, 'participants', p.id);
                return this.firestore.deleteDoc(participantRef);
            });
            await Promise.all(deletePromises);
        } catch (error) {
            console.error(`Error deleting participants for round ${roundId}:`, error);
            throw error;
        }
    }
    
    /**
     * Update a participant in a round
     * @param {string} roundId - The round ID
     * @param {string} participantId - The participant ID
     * @param {Object} data - Data to update
     * @returns {Promise<void>}
     */
    async updateParticipant(roundId, participantId, data) {
        try {
            const participantRef = this.firestore.doc(this.db, 'tournaments', this.tournamentId, 'rounds', roundId, 'participants', participantId);
            await this.firestore.updateDoc(participantRef, {
                ...data,
                updatedAt: this.firestore.serverTimestamp()
            });
        } catch (error) {
            console.error(`Error updating participant ${participantId} in round ${roundId}:`, error);
            throw error;
        }
    }
    
    /**
     * Get round participants
     * @param {string} roundId - Round ID
     * @returns {Promise<Array>} Array of participants
     */
    async getParticipants(roundId) {
        const participantsRef = collection(
            this.db,
            `tournaments/${this.tournamentId}/rounds/${roundId}/participants`
        );
        const snapshot = await getDocs(participantsRef);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    }
    
    /**
     * Snapshot participants at round start
     * @param {string} roundId - Round ID
     * @param {Array} players - Array of player objects
     * @returns {Promise<void>}
     */
    async snapshotParticipants(roundId, players) {
        const promises = players.map(player => {
            const participantRef = doc(
                this.db,
                `tournaments/${this.tournamentId}/rounds/${roundId}/participants`,
                player.id
            );
            
            return BaseService.prototype.create.call(
                { db: this.db, collectionPath: `tournaments/${this.tournamentId}/rounds/${roundId}/participants` },
                {
                    playerId: player.id,
                    name: player.name,
                    wins: player.wins || 0,
                    points: player.points || 0,
                    scoreEvents: player.scoreEvents || [],
                    tableId: player.tableId,
                    position: player.position,
                    lastWinAt: player.lastWinAt || null,
                    snapshotAt: BaseService.serverTimestamp()
                },
                player.id
            );
        });
        
        await Promise.all(promises);
    }
    
    /**
     * Build rounds map with multipliers
     * @returns {Promise<Object>} Map of roundNumber to round data
     */
    async buildRoundsMap() {
        const rounds = await this.getAllRounds();
        const map = {};
        let lastCompletedRound = 0;
        
        rounds.forEach(round => {
            map[round.roundNumber] = {
                scoreMultiplier: round.scoreMultiplier || 1,
                timerDuration: round.timerDuration,
                status: round.status
            };
            
            if (round.status === ROUND_STATUS.COMPLETED && round.roundNumber > lastCompletedRound) {
                lastCompletedRound = round.roundNumber;
            }
        });
        
        map._lastCompletedRound = lastCompletedRound;
        return map;
    }
    
    /**
     * Subscribe to rounds
     * @param {Function} callback - Callback function(rounds)
     * @returns {Function} Unsubscribe function
     */
    subscribeToRounds(callback) {
        return this.subscribeToCollection(callback);
    }
    
    /**
     * Subscribe to a single round
     * @param {string} roundId - Round ID
     * @param {Function} callback - Callback function(round)
     * @returns {Function} Unsubscribe function
     */
    subscribeToRound(roundId, callback) {
        return this.subscribeToDocument(roundId, callback);
    }
}


