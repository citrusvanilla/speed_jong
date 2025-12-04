// js/utils/assignment-utils.js
// Player assignment and sorting utilities

/**
 * Sort players by tournament ranking (wins, points, lastWinAt, name)
 * @param {Array} players - Array of player objects
 * @returns {Array} Sorted array of players
 */
export function sortPlayersByRanking(players) {
    return [...players].sort((a, b) => {
        // 1. Wins (descending)
        if (b.wins !== a.wins) return b.wins - a.wins;
        
        // 2. Points (descending)
        if (b.points !== a.points) return b.points - a.points;
        
        // 3. Last win timestamp (descending - more recent wins first)
        const aTime = a.lastWinAt ? (a.lastWinAt.seconds || 0) : 0;
        const bTime = b.lastWinAt ? (b.lastWinAt.seconds || 0) : 0;
        if (bTime !== aTime) return bTime - aTime;
        
        // 4. Name (alphabetically)
        return a.name.localeCompare(b.name);
    });
}

/**
 * Assign players to table groups based on selected algorithm
 * @param {Array} players - Array of player objects
 * @param {string} algorithm - 'random', 'ranking', or 'round_robin'
 * @returns {Array} Array of arrays, where each inner array is 4 players for one table
 */
export function assignPlayersByAlgorithm(players, algorithm) {
    const numTables = Math.floor(players.length / 4);
    const playersToAssign = players.slice(0, numTables * 4); // Only take players we can seat
    
    if (algorithm === 'random') {
        // Algorithm 1: Random shuffle
        const shuffled = [...playersToAssign].sort(() => Math.random() - 0.5);
        const tables = [];
        for (let i = 0; i < numTables; i++) {
            tables.push(shuffled.slice(i * 4, (i + 1) * 4));
        }
        return tables;
    }
    
    if (algorithm === 'ranking') {
        // Algorithm 2: By ranking - top 4 in table 1, next 4 in table 2, etc.
        const sorted = sortPlayersByRanking(playersToAssign);
        const tables = [];
        for (let i = 0; i < numTables; i++) {
            tables.push(sorted.slice(i * 4, (i + 1) * 4));
        }
        return tables;
    }
    
    if (algorithm === 'round_robin') {
        // Algorithm 3: Round robin - distribute ranks evenly
        // Rank 1,5,9,13 at table 1, rank 2,6,10,14 at table 2, etc.
        const sorted = sortPlayersByRanking(playersToAssign);
        const tables = Array.from({ length: numTables }, () => []);
        sorted.forEach((player, i) => {
            const tableIdx = i % numTables;
            tables[tableIdx].push(player);
        });
        return tables;
    }
    
    // Default to random
    const shuffled = [...playersToAssign].sort(() => Math.random() - 0.5);
    const tables = [];
    for (let i = 0; i < numTables; i++) {
        tables.push(shuffled.slice(i * 4, (i + 1) * 4));
    }
    return tables;
}

