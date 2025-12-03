/**
 * Table Service
 * Handles all table-related Firebase operations
 */

import { BaseService } from './base-service.js';
import { validateTableNumber } from '../utils/validators.js';
import { ErrorHandler } from '../utils/error-handler.js';

export class TableService extends BaseService {
    constructor(db, tournamentId) {
        super(db, `tournaments/${tournamentId}/tables`);
        this.tournamentId = tournamentId;
    }
    
    /**
     * Create a new table
     * @param {number} tableNumber - Table number
     * @param {Object} options - Additional options { mapX, mapY }
     * @returns {Promise<string>} Table ID
     */
    async createTable(tableNumber, options = {}) {
        const validation = validateTableNumber(tableNumber);
        ErrorHandler.validateOrThrow(validation, 'INVALID_TABLE_NUMBER');
        
        const tableId = await this.create({
            tableNumber,
            players: [],
            positions: {},
            active: true,
            mapX: options.mapX || null,
            mapY: options.mapY || null
        });
        
        return tableId;
    }
    
    /**
     * Create multiple tables
     * @param {number} count - Number of tables to create
     * @param {number} startNumber - Starting table number
     * @returns {Promise<Array>} Array of created table IDs
     */
    async createMultipleTables(count, startNumber = 1) {
        const promises = [];
        for (let i = 0; i < count; i++) {
            promises.push(this.createTable(startNumber + i));
        }
        return Promise.all(promises);
    }
    
    /**
     * Update table info
     * @param {string} tableId - Table ID
     * @param {Object} updates - Fields to update
     * @returns {Promise<void>}
     */
    async updateTable(tableId, updates) {
        if (updates.tableNumber) {
            const validation = validateTableNumber(updates.tableNumber);
            ErrorHandler.validateOrThrow(validation, 'INVALID_TABLE_NUMBER');
        }
        
        await this.update(tableId, updates);
    }
    
    /**
     * Delete a table
     * @param {string} tableId - Table ID
     * @returns {Promise<void>}
     */
    async deleteTable(tableId) {
        await this.delete(tableId);
    }
    
    /**
     * Toggle table active status
     * @param {string} tableId - Table ID
     * @returns {Promise<boolean>} New active status
     */
    async toggleActive(tableId) {
        const table = await this.getById(tableId);
        const newStatus = !(table.active !== false);
        await this.update(tableId, { active: newStatus });
        return newStatus;
    }
    
    /**
     * Set table active status
     * @param {string} tableId - Table ID
     * @param {boolean} active - Active status
     * @returns {Promise<void>}
     */
    async setActive(tableId, active) {
        await this.update(tableId, { active });
    }
    
    /**
     * Assign player to table position
     * @param {string} tableId - Table ID
     * @param {string} playerId - Player ID
     * @param {string} position - Position (East, South, West, North)
     * @returns {Promise<void>}
     */
    async assignPlayerToPosition(tableId, playerId, position) {
        const table = await this.getById(tableId);
        const players = table.players || [];
        const positions = table.positions || {};
        
        // Remove player from any existing position
        const filteredPlayers = players.filter(p => p !== playerId);
        
        // Add player to new position
        filteredPlayers.push(playerId);
        positions[position] = playerId;
        
        await this.update(tableId, {
            players: filteredPlayers,
            positions
        });
    }
    
    /**
     * Remove player from table
     * @param {string} tableId - Table ID
     * @param {string} playerId - Player ID
     * @returns {Promise<void>}
     */
    async removePlayer(tableId, playerId) {
        const table = await this.getById(tableId);
        const players = (table.players || []).filter(p => p !== playerId);
        const positions = { ...table.positions };
        
        // Remove from positions object
        Object.keys(positions).forEach(pos => {
            if (positions[pos] === playerId) {
                delete positions[pos];
            }
        });
        
        await this.update(tableId, { players, positions });
    }
    
    /**
     * Clear all players from table
     * @param {string} tableId - Table ID
     * @returns {Promise<void>}
     */
    async clearPlayers(tableId) {
        await this.update(tableId, {
            players: [],
            positions: {}
        });
    }
    
    /**
     * Clear all tables (remove all player assignments)
     * @returns {Promise<void>}
     */
    async clearAllTables() {
        const tables = await this.getAllTables();
        const updates = tables.map(table => ({
            docId: table.id,
            data: { players: [], positions: {} }
        }));
        
        await this.batchUpdate(updates);
    }
    
    /**
     * Update table position on map
     * @param {string} tableId - Table ID
     * @param {number} x - X coordinate
     * @param {number} y - Y coordinate
     * @returns {Promise<void>}
     */
    async updateMapPosition(tableId, x, y) {
        await this.update(tableId, { mapX: x, mapY: y });
    }
    
    /**
     * Get all tables
     * @returns {Promise<Array>} Array of tables
     */
    async getAllTables() {
        return this.getAll();
    }
    
    /**
     * Get active tables
     * @returns {Promise<Array>} Array of active tables
     */
    async getActiveTables() {
        return this.query([['active', '==', true]]);
    }
    
    /**
     * Get table by number
     * @param {number} tableNumber - Table number
     * @returns {Promise<Object>} Table data
     */
    async getByNumber(tableNumber) {
        const results = await this.query([
            ['tableNumber', '==', tableNumber]
        ], { limitCount: 1 });
        
        if (results.length === 0) {
            throw ErrorHandler.createError(
                `Table not found with number: ${tableNumber}`,
                'NOT_FOUND'
            );
        }
        
        return results[0];
    }
    
    /**
     * Get table count
     * @returns {Promise<number>} Number of tables
     */
    async getTableCount() {
        const tables = await this.getAllTables();
        return tables.length;
    }
    
    /**
     * Get next available table number
     * @returns {Promise<number>} Next available table number
     */
    async getNextTableNumber() {
        const tables = await this.getAllTables();
        if (tables.length === 0) return 1;
        
        const maxNumber = Math.max(...tables.map(t => t.tableNumber || 0));
        return maxNumber + 1;
    }
    
    /**
     * Check if table is full (has 4 players)
     * @param {string} tableId - Table ID
     * @returns {Promise<boolean>} True if table is full
     */
    async isFull(tableId) {
        const table = await this.getById(tableId);
        return (table.players || []).length >= 4;
    }
    
    /**
     * Get tables sorted by number
     * @returns {Promise<Array>} Array of tables sorted by number
     */
    async getTablesSorted() {
        const tables = await this.getAllTables();
        return tables.sort((a, b) => a.tableNumber - b.tableNumber);
    }
    
    /**
     * Subscribe to tables
     * @param {Function} callback - Callback function(tables)
     * @returns {Function} Unsubscribe function
     */
    subscribeToTables(callback) {
        return this.subscribeToCollection(callback);
    }
    
    /**
     * Subscribe to a single table
     * @param {string} tableId - Table ID
     * @param {Function} callback - Callback function(table)
     * @returns {Function} Unsubscribe function
     */
    subscribeToTable(tableId, callback) {
        return this.subscribeToDocument(tableId, callback);
    }
}

