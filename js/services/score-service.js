/**
 * Score Service
 * Handles score event operations across players and rounds
 */

import { collection, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { BaseService } from './base-service.js';
import { validateScoreDelta, validateTimeOffset } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

export class ScoreService {
    constructor(db, tournamentId) {
        this.db = db;
        this.tournamentId = tournamentId;
    }
    
    /**
     * Create a score event object
     * @param {number} roundNumber - Round number
     * @param {number} delta - Score delta (+1 or -1)
     * @param {Object} timestamp - Firebase Timestamp
     * @returns {Object} Score event object
     */
    createScoreEvent(roundNumber, delta, timestamp) {
        const validation = validateScoreDelta(delta);
        ErrorHandler.validateOrThrow(validation, 'INVALID_SCORE_DELTA');
        
        return {
            roundNumber,
            delta,
            timestamp,
            addedAt: BaseService.Timestamp.now()
        };
    }
    
    /**
     * Add score event to player
     * @param {string} playerId - Player ID
     * @param {Object} scoreEvent - Score event object
     * @returns {Promise<void>}
     */
    async addToPlayer(playerId, scoreEvent) {
        const playerRef = doc(this.db, `tournaments/${this.tournamentId}/players`, playerId);
        
        const updates = {
            wins: BaseService.increment(scoreEvent.delta),
            scoreEvents: BaseService.arrayUnion(scoreEvent)
        };
        
        // Update lastWinAt for positive deltas
        if (scoreEvent.delta > 0) {
            updates.lastWinAt = scoreEvent.timestamp;
        }
        
        await updateDoc(playerRef, updates);
    }
    
    /**
     * Add score event to round participant
     * @param {string} roundId - Round ID
     * @param {string} participantId - Participant ID
     * @param {Object} scoreEvent - Score event object
     * @returns {Promise<void>}
     */
    async addToParticipant(roundId, participantId, scoreEvent) {
        const participantRef = doc(
            this.db,
            `tournaments/${this.tournamentId}/rounds/${roundId}/participants`,
            participantId
        );
        
        const updates = {
            wins: BaseService.increment(scoreEvent.delta),
            scoreEvents: BaseService.arrayUnion(scoreEvent)
        };
        
        if (scoreEvent.delta > 0) {
            updates.lastWinAt = scoreEvent.timestamp;
        }
        
        await updateDoc(participantRef, updates);
    }
    
    /**
     * Add score event to both player and participant
     * @param {string} playerId - Player ID
     * @param {string} roundId - Round ID
     * @param {string} participantId - Participant ID
     * @param {Object} scoreEvent - Score event object
     * @returns {Promise<void>}
     */
    async addScoreEvent(playerId, roundId, participantId, scoreEvent) {
        await Promise.all([
            this.addToPlayer(playerId, scoreEvent),
            this.addToParticipant(roundId, participantId, scoreEvent)
        ]);
    }
    
    /**
     * Remove score event from player
     * @param {string} playerId - Player ID
     * @param {Object} scoreEvent - Score event to remove
     * @param {number} delta - Delta to subtract
     * @returns {Promise<void>}
     */
    async removeFromPlayer(playerId, scoreEvent, delta) {
        const playerRef = doc(this.db, `tournaments/${this.tournamentId}/players`, playerId);
        const playerDoc = await getDoc(playerRef);
        
        if (!playerDoc.exists()) {
            throw ErrorHandler.createError('Player not found', 'NOT_FOUND');
        }
        
        const playerData = playerDoc.data();
        const scoreEvents = playerData.scoreEvents || [];
        
        // Filter out the event
        const updatedEvents = scoreEvents.filter(e =>
            e.timestamp.toMillis() !== scoreEvent.timestamp.toMillis()
        );
        
        const updates = {
            wins: BaseService.increment(-delta),
            scoreEvents: updatedEvents
        };
        
        // Update lastWinAt if we removed a win
        if (delta > 0) {
            const remainingWins = updatedEvents.filter(e => e.delta > 0);
            if (remainingWins.length > 0) {
                const sortedWins = [...remainingWins].sort((a, b) =>
                    b.timestamp.toMillis() - a.timestamp.toMillis()
                );
                updates.lastWinAt = sortedWins[0].timestamp;
            } else {
                updates.lastWinAt = null;
            }
        }
        
        await updateDoc(playerRef, updates);
    }
    
    /**
     * Remove score event from round participant
     * @param {string} roundId - Round ID
     * @param {string} participantId - Participant ID
     * @param {Object} scoreEvent - Score event to remove
     * @param {number} delta - Delta to subtract
     * @returns {Promise<void>}
     */
    async removeFromParticipant(roundId, participantId, scoreEvent, delta) {
        const participantRef = doc(
            this.db,
            `tournaments/${this.tournamentId}/rounds/${roundId}/participants`,
            participantId
        );
        const participantDoc = await getDoc(participantRef);
        
        if (!participantDoc.exists()) {
            throw ErrorHandler.createError('Participant not found', 'NOT_FOUND');
        }
        
        const participantData = participantDoc.data();
        const scoreEvents = participantData.scoreEvents || [];
        
        const updatedEvents = scoreEvents.filter(e =>
            e.timestamp.toMillis() !== scoreEvent.timestamp.toMillis()
        );
        
        const updates = {
            wins: BaseService.increment(-delta),
            scoreEvents: updatedEvents
        };
        
        if (delta > 0) {
            const remainingWins = updatedEvents.filter(e => e.delta > 0);
            if (remainingWins.length > 0) {
                const sortedWins = [...remainingWins].sort((a, b) =>
                    b.timestamp.toMillis() - a.timestamp.toMillis()
                );
                updates.lastWinAt = sortedWins[0].timestamp;
            } else {
                updates.lastWinAt = null;
            }
        }
        
        await updateDoc(participantRef, updates);
    }
    
    /**
     * Remove score event from both player and participant
     * @param {string} playerId - Player ID
     * @param {string} roundId - Round ID
     * @param {string} participantId - Participant ID
     * @param {Object} scoreEvent - Score event to remove
     * @param {number} delta - Delta value
     * @returns {Promise<void>}
     */
    async removeScoreEvent(playerId, roundId, participantId, scoreEvent, delta) {
        await Promise.all([
            this.removeFromPlayer(playerId, scoreEvent, delta),
            this.removeFromParticipant(roundId, participantId, scoreEvent, delta)
        ]);
    }
    
    /**
     * Update score event timestamp
     * @param {string} playerId - Player ID
     * @param {string} roundId - Round ID
     * @param {string} participantId - Participant ID
     * @param {Object} oldEvent - Old score event
     * @param {Object} newTimestamp - New timestamp
     * @returns {Promise<void>}
     */
    async updateTimestamp(playerId, roundId, participantId, oldEvent, newTimestamp) {
        // Remove old event and add new one with updated timestamp
        await this.removeScoreEvent(playerId, roundId, participantId, oldEvent, oldEvent.delta);
        
        const newEvent = {
            ...oldEvent,
            timestamp: newTimestamp
        };
        
        await this.addScoreEvent(playerId, roundId, participantId, newEvent);
    }
    
    /**
     * Calculate score with timestamp offset
     * @param {Object} roundStartTime - Round start time (Date object)
     * @param {number} offsetMinutes - Offset in minutes from round start
     * @param {number} roundDuration - Round duration in minutes
     * @returns {Object} Timestamp
     */
    calculateTimestampWithOffset(roundStartTime, offsetMinutes, roundDuration) {
        const validation = validateTimeOffset(offsetMinutes, roundDuration);
        ErrorHandler.validateOrThrow(validation, 'INVALID_TIME_OFFSET');
        
        const offsetMs = offsetMinutes * 60000;
        const newDate = new Date(roundStartTime.getTime() + offsetMs);
        return BaseService.Timestamp.fromDate(newDate);
    }
    
    /**
     * Get all score events for a player
     * @param {string} playerId - Player ID
     * @returns {Promise<Array>} Array of score events
     */
    async getPlayerScoreEvents(playerId) {
        const playerRef = doc(this.db, `tournaments/${this.tournamentId}/players`, playerId);
        const playerDoc = await getDoc(playerRef);
        
        if (!playerDoc.exists()) {
            throw ErrorHandler.createError('Player not found', 'NOT_FOUND');
        }
        
        return playerDoc.data().scoreEvents || [];
    }
    
    /**
     * Get all score events for a round participant
     * @param {string} roundId - Round ID
     * @param {string} participantId - Participant ID
     * @returns {Promise<Array>} Array of score events
     */
    async getParticipantScoreEvents(roundId, participantId) {
        const participantRef = doc(
            this.db,
            `tournaments/${this.tournamentId}/rounds/${roundId}/participants`,
            participantId
        );
        const participantDoc = await getDoc(participantRef);
        
        if (!participantDoc.exists()) {
            throw ErrorHandler.createError('Participant not found', 'NOT_FOUND');
        }
        
        return participantDoc.data().scoreEvents || [];
    }
}


