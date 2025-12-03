/**
 * Cut Line Tournament Utilities
 * Shared logic for calculating cut lines and eliminations
 * 
 * SCORING SYSTEM:
 * - Players score points (+1) or penalties (-1) during rounds
 * - Each round has a scoreMultiplier (default: 1x, can be set by admin)
 * - Tournament Score = sum of (scoreEvent.delta × round.scoreMultiplier) for all rounds
 * - Round Score = sum of (scoreEvent.delta × round.scoreMultiplier) for current round only
 * - Table Round Score = sum of all 4 players' round scores at same table
 * 
 * RANKING ALGORITHM (tie-breaker hierarchy):
 * 1. Tournament Score (higher is better)
 * 2. Round Score (higher is better)
 * 3. Last Win Timestamp (more recent is better)
 * 4. Table Round Score (higher is better)
 * 5. Name (alphabetically as final tie-breaker)
 * 
 * GOLF-STYLE RANKING:
 * - Players with identical scores share the same rank
 * - Next rank skips appropriately: 1, 2, 3, 4, 4, 4, 4, 8
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
    // Note: activePlayers should already be sorted worst-first
    const splitsScoreGroup = (numRemaining) => {
        if (numRemaining <= 0 || numRemaining >= activePlayers.length) return false;
        
        const cutIndex = activePlayers.length - numRemaining;
        // Get tournament score for the player at cutline
        const cutlinePlayer = activePlayers[cutIndex - 1];
        const cutlineScore = cutlinePlayer?.tournamentScore || 0;
        
        // Check if there are players on both sides of the cut with this score
        let hasScoreInCut = false;
        let hasScoreInKeep = false;
        
        for (let i = 0; i < activePlayers.length; i++) {
            const playerScore = activePlayers[i].tournamentScore || 0;
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
 * Calculate tournament score from score events with round multipliers
 * @param {Object} participant - Player or participant object with scoreEvents
 * @param {Object} roundsMap - Map of roundNumber to round data (with scoreMultiplier)
 * @returns {number} Total tournament score
 */
export function calculateTournamentScore(participant, roundsMap = {}) {
    const scoreEvents = participant.scoreEvents || [];
    return scoreEvents.reduce((total, event) => {
        const roundData = roundsMap[event.roundNumber];
        const multiplier = roundData?.scoreMultiplier || 1;
        return total + (event.delta * multiplier);
    }, 0);
}

/**
 * Calculate round score for current round
 * @param {Object} participant - Player or participant object with scoreEvents
 * @param {number} currentRound - Current round number
 * @param {Object} roundsMap - Map of roundNumber to round data (with scoreMultiplier)
 * @returns {number} Score for this round only
 */
export function calculateRoundScore(participant, currentRound, roundsMap = {}) {
    const scoreEvents = participant.scoreEvents || [];
    const roundData = roundsMap[currentRound];
    const multiplier = roundData?.scoreMultiplier || 1;
    
    return scoreEvents
        .filter(event => event.roundNumber === currentRound)
        .reduce((total, event) => total + (event.delta * multiplier), 0);
}

/**
 * Calculate table round score (sum of all players at table for this round)
 * @param {Array} tablePlayers - Array of player objects at same table
 * @param {number} currentRound - Current round number
 * @param {Object} roundsMap - Map of roundNumber to round data (with scoreMultiplier)
 * @returns {number} Total table score for this round
 */
export function calculateTableRoundScore(tablePlayers, currentRound, roundsMap = {}) {
    return tablePlayers.reduce((total, player) => {
        return total + calculateRoundScore(player, currentRound, roundsMap);
    }, 0);
}

/**
 * Sort players for cut line elimination
 * Worst performers first (will be cut first)
 * 
 * Tie-breaking hierarchy:
 * 1. Tournament score (lower = cut first)
 * 2. Round score (lower = cut first)
 * 3. Last win timestamp (older = cut first)
 * 4. Table round score (lower = cut first)
 * 
 * @param {Array} players - Array of player objects
 * @param {number} currentRound - Current round number
 * @param {Object} roundsMap - Map of roundNumber to round data (with scoreMultiplier)
 * @param {Object} tablePlayersMap - Map of tableId to array of player objects
 * @returns {Array} Sorted array (worst first)
 */
export function sortPlayersForCutLine(players, currentRound = 0, roundsMap = {}, tablePlayersMap = {}) {
    return [...players].sort((a, b) => {
        // Primary: Tournament score (ascending - lower score = cut first)
        const aTournamentScore = calculateTournamentScore(a, roundsMap);
        const bTournamentScore = calculateTournamentScore(b, roundsMap);
        
        if (aTournamentScore !== bTournamentScore) {
            return aTournamentScore - bTournamentScore;
        }
        
        // Tie-breaker 1: Round score (ascending - lower round score = cut first)
        const aRoundScore = calculateRoundScore(a, currentRound, roundsMap);
        const bRoundScore = calculateRoundScore(b, currentRound, roundsMap);
        
        if (aRoundScore !== bRoundScore) {
            return aRoundScore - bRoundScore;
        }
        
        // Tie-breaker 2: Last win timestamp (ascending - older = cut first)
        const aLastWin = a.lastWinAt?.toMillis() || 0;
        const bLastWin = b.lastWinAt?.toMillis() || 0;
        
        if (aLastWin !== bLastWin) {
            return aLastWin - bLastWin;
        }
        
        // Tie-breaker 3: Table round score (ascending - table with lower total score = cut first)
        // Find which table group each player belongs to in the tablePlayersMap
        let aTablePlayers = [a];
        let bTablePlayers = [b];
        
        for (const [tableId, players] of Object.entries(tablePlayersMap)) {
            if (players.some(p => p.id === a.id)) {
                aTablePlayers = players;
            }
            if (players.some(p => p.id === b.id)) {
                bTablePlayers = players;
            }
        }
        
        const aTableScore = calculateTableRoundScore(aTablePlayers, currentRound, roundsMap);
        const bTableScore = calculateTableRoundScore(bTablePlayers, currentRound, roundsMap);
        
        if (aTableScore !== bTableScore) {
            return aTableScore - bTableScore;
        }
        
        // Final tie-breaker: Name (alphabetically)
        return a.name.localeCompare(b.name);
    });
}

/**
 * Sort players for leaderboard display
 * Best performers first (opposite of cut line sort)
 * 
 * Tie-breaking hierarchy:
 * 1. Tournament score (higher = ranked higher)
 * 2. Round score (higher = ranked higher)
 * 3. Last win timestamp (newer = ranked higher)
 * 4. Table round score (higher = ranked higher)
 * 
 * @param {Array} players - Array of player objects
 * @param {number} currentRound - Current round number
 * @param {Object} roundsMap - Map of roundNumber to round data (with scoreMultiplier)
 * @param {Object} tablePlayersMap - Map of tableId to array of player objects
 * @returns {Array} Sorted array (best first)
 */
export function sortPlayersForLeaderboard(players, currentRound = 0, roundsMap = {}, tablePlayersMap = {}) {
    return [...players].sort((a, b) => {
        // Primary: Tournament score (descending - higher score = ranked higher)
        const aTournamentScore = calculateTournamentScore(a, roundsMap);
        const bTournamentScore = calculateTournamentScore(b, roundsMap);
        
        if (bTournamentScore !== aTournamentScore) {
            return bTournamentScore - aTournamentScore;
        }
        
        // Tie-breaker 1: Round score (descending - higher round score = ranked higher)
        const aRoundScore = calculateRoundScore(a, currentRound, roundsMap);
        const bRoundScore = calculateRoundScore(b, currentRound, roundsMap);
        
        if (bRoundScore !== aRoundScore) {
            return bRoundScore - aRoundScore;
        }
        
        // Tie-breaker 2: Last win timestamp (descending - newer = ranked higher)
        const aLastWin = a.lastWinAt?.toMillis() || 0;
        const bLastWin = b.lastWinAt?.toMillis() || 0;
        
        if (bLastWin !== aLastWin) {
            return bLastWin - aLastWin;
        }
        
        // Tie-breaker 3: Table round score (descending - table with higher total score = ranked higher)
        // Find which table group each player belongs to in the tablePlayersMap
        let aTablePlayers = [a];
        let bTablePlayers = [b];
        
        for (const [tableId, players] of Object.entries(tablePlayersMap)) {
            if (players.some(p => p.id === a.id)) {
                aTablePlayers = players;
            }
            if (players.some(p => p.id === b.id)) {
                bTablePlayers = players;
            }
        }
        
        const aTableScore = calculateTableRoundScore(aTablePlayers, currentRound, roundsMap);
        const bTableScore = calculateTableRoundScore(bTablePlayers, currentRound, roundsMap);
        
        if (bTableScore !== aTableScore) {
            return bTableScore - aTableScore;
        }
        
        // Final tie-breaker: Name (alphabetically)
        return a.name.localeCompare(b.name);
    });
}




