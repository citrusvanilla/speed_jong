/**
 * Cut Line Tournament Utilities
 * Shared logic for calculating cut lines and eliminations
 */

/**
 * Calculate the target number of players to keep after a cut line round
 * 
 * @param {number} originalPlayerCount - Total players at tournament start
 * @param {number} currentRound - Current round number (1-based)
 * @param {number} totalRounds - Total rounds in tournament
 * @param {Array} activePlayers - Array of active player objects (sorted worst-to-best)
 * @returns {Object} { targetRemaining, idealTarget, chosenOption }
 */
export function calculateCutLineTarget(originalPlayerCount, currentRound, totalRounds, activePlayers) {
    // Calculate target percentage (cumulative)
    // Round 1 → 75%, Round 2 → 50%, Round 3 → 25% of ORIGINAL
    const targetPercentage = 1 - (currentRound / totalRounds);
    const idealTarget = Math.floor(originalPlayerCount * targetPercentage);
    
    // Helper function to check if a target splits a score group
    const splitsScoreGroup = (numRemaining) => {
        if (numRemaining <= 0 || numRemaining >= activePlayers.length) return false;
        
        const cutIndex = activePlayers.length - numRemaining;
        const cutlineScore = activePlayers[cutIndex - 1]?.wins || 0;
        
        // Check if there are players on both sides of the cut with this score
        let hasScoreInCut = false;
        let hasScoreInKeep = false;
        
        for (let i = 0; i < activePlayers.length; i++) {
            const playerScore = activePlayers[i].wins || 0;
            if (playerScore === cutlineScore) {
                if (i < cutIndex) hasScoreInCut = true;
                else hasScoreInKeep = true;
            }
        }
        
        return hasScoreInCut && hasScoreInKeep;
    };
    
    // Adjust target to divisible by 4, considering score groups
    let targetRemaining;
    let chosenOption = '';
    
    const roundDown = Math.floor(idealTarget / 4) * 4;
    const roundUp = Math.ceil(idealTarget / 4) * 4;
    
    // Check if each option splits a score group
    const downSplits = splitsScoreGroup(roundDown);
    const upSplits = splitsScoreGroup(roundUp);
    
    const distDown = Math.abs(idealTarget - roundDown);
    const distUp = Math.abs(idealTarget - roundUp);
    
    // Decision logic:
    // 1. Prefer option that doesn't split a score group
    // 2. If both split or neither splits, prefer the one closer to idealTarget
    // 3. If equal distance, prefer keeping more players (roundUp)
    if (downSplits && !upSplits) {
        targetRemaining = roundUp;
        chosenOption = `(up to ${roundUp}, avoids splitting score groups)`;
    } else if (!downSplits && upSplits) {
        targetRemaining = roundDown;
        chosenOption = `(down to ${roundDown}, avoids splitting score groups)`;
    } else if (distDown < distUp) {
        targetRemaining = roundDown;
        chosenOption = `(down to ${roundDown}, closer to ideal)`;
    } else if (distUp < distDown) {
        targetRemaining = roundUp;
        chosenOption = `(up to ${roundUp}, closer to ideal)`;
    } else {
        // Equal distance - prefer keeping more players
        targetRemaining = roundUp;
        chosenOption = `(up to ${roundUp}, keeps more players)`;
    }
    
    return {
        targetRemaining,
        idealTarget,
        targetPercentage,
        chosenOption
    };
}

/**
 * Sort players for cut line elimination
 * Worst performers first (will be cut first)
 * 
 * @param {Array} players - Array of player objects
 * @param {Object} roundParticipants - Map of playerId to round start snapshot
 * @returns {Array} Sorted array (worst first)
 */
export function sortPlayersForCutLine(players, roundParticipants = {}) {
    return [...players].sort((a, b) => {
        const aWins = a.wins || 0;
        const bWins = b.wins || 0;
        
        // Primary sort: total tournament wins (ascending - worst first)
        if (aWins !== bWins) return aWins - bWins;
        
        // Tie-breaker 1: wins gained THIS ROUND (ascending - fewer round wins gets cut)
        const aRoundStart = roundParticipants[a.id]?.wins || 0;
        const bRoundStart = roundParticipants[b.id]?.wins || 0;
        const aRoundWins = aWins - aRoundStart;
        const bRoundWins = bWins - bRoundStart;
        
        if (aRoundWins !== bRoundWins) return aRoundWins - bRoundWins;
        
        // Tie-breaker 2: most recent win timestamp stays (oldest gets cut)
        const aLastWin = a.lastWinAt?.toMillis() || 0;
        const bLastWin = b.lastWinAt?.toMillis() || 0;
        return aLastWin - bLastWin; // Ascending: older timestamp = lower number = cut first
    });
}

/**
 * Sort players for leaderboard display
 * Best performers first (opposite of cut line sort)
 * 
 * @param {Array} players - Array of player objects
 * @param {Object} roundParticipants - Map of playerId to round start snapshot
 * @returns {Array} Sorted array (best first)
 */
export function sortPlayersForLeaderboard(players, roundParticipants = {}) {
    return [...players].sort((a, b) => {
        const aWins = a.wins || 0;
        const bWins = b.wins || 0;
        
        // Primary: Total wins (descending - most wins first)
        if (bWins !== aWins) return bWins - aWins;
        
        // Tie-breaker 1: Round wins (descending - most round wins first)
        const aRoundStart = roundParticipants[a.id]?.wins || 0;
        const bRoundStart = roundParticipants[b.id]?.wins || 0;
        const aRoundWins = aWins - aRoundStart;
        const bRoundWins = bWins - bRoundStart;
        
        if (bRoundWins !== aRoundWins) return bRoundWins - aRoundWins;
        
        // Tie-breaker 2: Most recent win first (descending - newest first)
        const aLastWin = a.lastWinAt?.toMillis() || 0;
        const bLastWin = b.lastWinAt?.toMillis() || 0;
        return bLastWin - aLastWin; // Descending: newer timestamp = higher number = shown first
    });
}




