// js/utils/data-utils.js
// Utility functions for building data maps and structures

import { collection, getDocs } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { ROUND_STATUS } from '../config/constants.js';

/**
 * Build rounds map with multipliers and metadata
 * @param {import("@firebase/firestore").Firestore} db - Firestore instance
 * @param {string} tournamentId - Tournament ID
 * @returns {Promise<Object>} Map of roundNumber to round data, with _lastCompletedRound property
 */
export async function buildRoundsMap(db, tournamentId) {
    const roundsMap = {};
    let lastCompletedRound = 0;
    
    try {
        const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
        roundsSnap.forEach(doc => {
            const roundData = doc.data();
            roundsMap[roundData.roundNumber] = {
                scoreMultiplier: roundData.scoreMultiplier || 1,
                timerDuration: roundData.timerDuration,
                status: roundData.status
            };
            
            // Track the highest completed round number
            if (roundData.status === ROUND_STATUS.COMPLETED && roundData.roundNumber > lastCompletedRound) {
                lastCompletedRound = roundData.roundNumber;
            }
        });
    } catch (error) {
        console.error('Error building rounds map:', error);
    }
    
    roundsMap._lastCompletedRound = lastCompletedRound;
    return roundsMap;
}

/**
 * Build table players map from round participants (for historical table groupings)
 * @param {import("@firebase/firestore").Firestore} db - Firestore instance
 * @param {string} tournamentId - Tournament ID
 * @param {number} roundNumber - Which round to get table groupings from
 * @param {Object} playersData - Map of playerId to player data
 * @returns {Promise<Object>} Map of tableId to array of player objects (from that round)
 */
export async function buildTablePlayersMapFromRound(db, tournamentId, roundNumber, playersData) {
    const tablePlayersMap = {};
    
    if (roundNumber <= 0) return tablePlayersMap;
    
    try {
        // Find the round document for this round number
        const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
        let targetRoundId = null;
        
        for (const roundDoc of roundsSnap.docs) {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === roundNumber) {
                targetRoundId = roundDoc.id;
                break;
            }
        }
        
        if (!targetRoundId) return tablePlayersMap;
        
        // Get participants from that round (snapshot of player data at round start)
        const participantsSnap = await getDocs(
            collection(db, 'tournaments', tournamentId, 'rounds', targetRoundId, 'participants')
        );
        
        // Build map of tableId to players who were at that table during this round
        participantsSnap.forEach(doc => {
            const participant = doc.data();
            const tableId = participant.tableId || 'unassigned';
            
            if (!tablePlayersMap[tableId]) {
                tablePlayersMap[tableId] = [];
            }
            
            // Use the full player data (with scoreEvents) for calculations
            const fullPlayer = playersData[participant.playerId];
            if (fullPlayer) {
                tablePlayersMap[tableId].push(fullPlayer);
            }
        });
    } catch (error) {
        console.error('Error building table players map from round:', error);
    }
    
    return tablePlayersMap;
}

