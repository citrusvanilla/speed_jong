/**
 * Player Service
 * Handles all player-related Firebase operations
 */

import { collection, doc, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { BaseService } from './base-service.js';
import { validatePlayerName } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

export class PlayerService extends BaseService {
    constructor(db, tournamentId) {
        super(db, `tournaments/${tournamentId}/players`);
        this.tournamentId = tournamentId;
    }
    
    /**
     * Add a new player to tournament
     * @param {string} name - Player name
     * @returns {Promise<string>} Player ID
     */
    async addPlayer(name) {
        const validation = validatePlayerName(name);
        ErrorHandler.validateOrThrow(validation, 'INVALID_PLAYER_NAME');
        
        const playerId = await this.create({
            name: name.trim(),
            wins: 0,
            points: 0,
            scoreEvents: [],
            tableId: null,
            position: null,
            eliminated: false,
            eliminatedInRound: null,
            lastWinAt: null
        });
        
        return playerId;
    }
    
    /**
     * Update player info
     * @param {string} playerId - Player ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updatePlayer(playerId, updates) {
        if (updates.name) {
            const validation = validatePlayerName(updates.name);
            ErrorHandler.validateOrThrow(validation, 'INVALID_PLAYER_NAME');
            updates.name = updates.name.trim();
        }
        
        await this.update(playerId, updates);
    }
    
    /**
     * Delete a player
     * @param {string} playerId - Player ID
     * @returns {Promise<void>}
     */
    async deletePlayer(playerId) {
        await this.delete(playerId);
    }
    
    /**
     * Assign player to table
     * @param {string} playerId - Player ID
     * @param {string} tableId - Table ID
     * @param {string} position - Position (East, South, West, North)
     * @returns {Promise<void>}
     */
    async assignToTable(playerId, tableId, position) {
        await this.update(playerId, {
            tableId,
            position
        });
    }
    
    /**
     * Unassign player from table
     * @param {string} playerId - Player ID
     * @returns {Promise<void>}
     */
    async unassignFromTable(playerId) {
        await this.update(playerId, {
            tableId: null,
            position: null
        });
    }
    
    /**
     * Add score event to player
     * @param {string} playerId - Player ID
     * @param {Object} scoreEvent - Score event data { delta, timestamp, roundNumber }
     * @returns {Promise<void>}
     */
    async addScoreEvent(playerId, scoreEvent) {
        await this.update(playerId, {
            wins: BaseService.increment(scoreEvent.delta),
            scoreEvents: BaseService.arrayUnion(scoreEvent),
            ...(scoreEvent.delta > 0 && { lastWinAt: scoreEvent.timestamp })
        });
    }
    
    /**
     * Remove score event from player
     * @param {string} playerId - Player ID
     * @param {Object} scoreEvent - Score event to remove
     * @param {number} delta - Delta to subtract
     * @returns {Promise<void>}
     */
    async removeScoreEvent(playerId, scoreEvent, delta) {
        const player = await this.getById(playerId);
        const scoreEvents = player.scoreEvents || [];
        
        // Remove the event
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
        
        await this.update(playerId, updates);
    }
    
    /**
     * Eliminate player
     * @param {string} playerId - Player ID
     * @param {number} roundNumber - Round number of elimination
     * @returns {Promise<void>}
     */
    async eliminatePlayer(playerId, roundNumber) {
        await this.update(playerId, {
            eliminated: true,
            eliminatedInRound: roundNumber,
            tableId: null,
            position: null
        });
    }
    
    /**
     * Un-eliminate player (reinstate)
     * @param {string} playerId - Player ID
     * @returns {Promise<void>}
     */
    async reinstatePlayer(playerId) {
        await this.update(playerId, {
            eliminated: false,
            eliminatedInRound: null
        });
    }
    
    /**
     * Get all players
     * @returns {Promise<Array>} Array of players
     */
    async getAllPlayers() {
        return this.getAll();
    }
    
    /**
     * Get active (non-eliminated) players
     * @returns {Promise<Array>} Array of active players
     */
    async getActivePlayers() {
        return this.query([['eliminated', '==', false]]);
    }
    
    /**
     * Get eliminated players
     * @returns {Promise<Array>} Array of eliminated players
     */
    async getEliminatedPlayers() {
        return this.query([['eliminated', '==', true]]);
    }
    
    /**
     * Get players at a specific table
     * @param {string} tableId - Table ID
     * @returns {Promise<Array>} Array of players at table
     */
    async getPlayersByTable(tableId) {
        return this.query([['tableId', '==', tableId]]);
    }
    
    /**
     * Get unassigned players
     * @returns {Promise<Array>} Array of unassigned players
     */
    async getUnassignedPlayers() {
        return this.query([
            ['tableId', '==', null],
            ['eliminated', '==', false]
        ]);
    }
    
    /**
     * Bulk assign players to tables
     * @param {Array} assignments - Array of { playerId, tableId, position }
     * @returns {Promise<void>}
     */
    async bulkAssignToTables(assignments) {
        const updates = assignments.map(({ playerId, tableId, position }) => ({
            docId: playerId,
            data: { tableId, position }
        }));
        
        await this.batchUpdate(updates);
    }
    
    /**
     * Clear all table assignments
     * @returns {Promise<void>}
     */
    async clearAllAssignments() {
        const players = await this.getAllPlayers();
        const updates = players.map(player => ({
            docId: player.id,
            data: { tableId: null, position: null }
        }));
        
        await this.batchUpdate(updates);
    }
    
    /**
     * Get player count
     * @returns {Promise<number>} Number of players
     */
    async getPlayerCount() {
        const players = await this.getAllPlayers();
        return players.length;
    }
    
    /**
     * Get active player count
     * @returns {Promise<number>} Number of active players
     */
    async getActivePlayerCount() {
        const players = await this.getActivePlayers();
        return players.length;
    }
    
    /**
     * Subscribe to players
     * @param {Function} callback - Callback function(players)
     * @returns {Function} Unsubscribe function
     */
    subscribeToPlayers(callback) {
        return this.subscribeToCollection(callback);
    }
    
    /**
     * Subscribe to a single player
     * @param {string} playerId - Player ID
     * @param {Function} callback - Callback function(player)
     * @returns {Function} Unsubscribe function
     */
    subscribeToPlayer(playerId, callback) {
        return this.subscribeToDocument(playerId, callback);
    }
}

