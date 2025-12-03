// Admin Panel - Tournament Management
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
    getFirestore, 
    collection, 
    doc, 
    setDoc, 
    getDoc, 
    getDocs, 
    deleteDoc, 
    addDoc,
    onSnapshot,
    query,
    orderBy,
    serverTimestamp,
    updateDoc,
    writeBatch,
    Timestamp,
    increment,
    arrayUnion
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";
import { 
    calculateCutLineTarget, 
    sortPlayersForCutLine, 
    sortPlayersForLeaderboard,
    calculateTournamentScore,
    calculateRoundScore,
    calculateTableRoundScore
} from './cutline-utils.js';

// Firebase config
const firebaseConfig = {
    apiKey: "AIzaSyDI0fUdOj9fLT92VEBQCs0rGPWm0cgIEhQ",
    authDomain: "speedjong-285c0.firebaseapp.com",
    projectId: "speedjong-285c0",
    storageBucket: "speedjong-285c0.firebasestorage.app",
    messagingSenderId: "282851961282",
    appId: "1:282851961282:web:942a04667587d5ee320e5b",
    measurementId: "G-GYKFD28ZLH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// ============================================================================
// ASSIGNMENT ALGORITHM UTILITIES
// ============================================================================

/**
 * Sort players by tournament ranking (for ranking-based algorithms)
 * Sorting criteria (best to worst):
 * 1. Most wins (descending)
 * 2. Most points (descending)
 * 3. Most recent win timestamp (descending)
 * 4. Name (alphabetically as tie-breaker)
 */
function sortPlayersByRanking(players) {
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
function assignPlayersByAlgorithm(players, algorithm) {
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

// ============================================================================
// HELPER FUNCTIONS FOR SCORING SYSTEM
// ============================================================================

/**
 * Build rounds map with score multipliers
 * @param {string} tournamentId
 * @returns {Object} Map of roundNumber to round data, plus lastCompletedRound
 */
async function buildRoundsMap(tournamentId) {
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
            if (roundData.status === 'completed' && roundData.roundNumber > lastCompletedRound) {
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
 * @param {string} tournamentId
 * @param {number} roundNumber - Which round to get table groupings from
 * @returns {Object} Map of tableId to array of player objects (from that round)
 */
async function buildTablePlayersMapFromRound(tournamentId, roundNumber) {
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

// ============================================================================
// Toast Notification System
// ============================================================================
function showToast(message, type = 'info', duration = 5000) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    
    // Icon and color based on type
    const styles = {
        success: { icon: '✅', bg: '#10b981', border: '#059669' },
        error: { icon: '❌', bg: '#ef4444', border: '#dc2626' },
        warning: { icon: '⚠️', bg: '#f59e0b', border: '#d97706' },
        info: { icon: 'ℹ️', bg: '#3b82f6', border: '#2563eb' }
    };
    
    const style = styles[type] || styles.info;
    
    toast.innerHTML = `
        <div style="
            background: ${style.bg};
            color: white;
            padding: 16px 20px;
            border-radius: 8px;
            border-left: 4px solid ${style.border};
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            display: flex;
            align-items: start;
            gap: 12px;
            min-width: 300px;
            animation: slideIn 0.3s ease-out;
            font-family: 'Press Start 2P', monospace;
            font-size: 11px;
            line-height: 1.6;
        ">
            <span style="font-size: 16px; flex-shrink: 0;">${style.icon}</span>
            <div style="flex: 1; word-wrap: break-word;">${message}</div>
            <button onclick="this.parentElement.parentElement.remove()" style="
                background: rgba(255,255,255,0.2);
                border: none;
                color: white;
                cursor: pointer;
                padding: 4px 8px;
                border-radius: 4px;
                font-size: 14px;
                line-height: 1;
                flex-shrink: 0;
            ">×</button>
        </div>
    `;
    
    container.appendChild(toast);
    
    // Auto-remove after duration
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease-out';
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// Add CSS animations
if (!document.getElementById('toastStyles')) {
    const style = document.createElement('style');
    style.id = 'toastStyles';
    style.textContent = `
        @keyframes slideIn {
            from {
                transform: translateX(400px);
                opacity: 0;
            }
            to {
                transform: translateX(0);
                opacity: 1;
            }
        }
        @keyframes slideOut {
            from {
                transform: translateX(0);
                opacity: 1;
            }
            to {
                transform: translateX(400px);
                opacity: 0;
            }
        }
    `;
    document.head.appendChild(style);
}

// State
let currentTournamentId = null;
let currentEditingPlayerId = null;
let currentEditingTableId = null;
let playersData = {};
let tablesData = {};
let unsubscribePlayers = null;
let unsubscribeTables = null;
let unsubscribeRounds = null;

// DOM Elements
const tournamentSelect = document.getElementById('tournamentSelect');
const createTournamentBtn = document.getElementById('createTournamentBtn');
const noTournamentSelected = document.getElementById('noTournamentSelected');
const tournamentContent = document.getElementById('tournamentContent');
const tournamentInfo = document.getElementById('tournamentInfo');
const playerCount = document.getElementById('playerCount');
const tableCount = document.getElementById('tableCount');
const playersList = document.getElementById('playersList');
const tablesList = document.getElementById('tablesList');
const archiveTournamentBtn = document.getElementById('archiveTournamentBtn');
const deleteTournamentBtn = document.getElementById('deleteTournamentBtn');
const roundInfo = document.getElementById('roundInfo');
const moveToNextRoundBtn = document.getElementById('moveToNextRoundBtn');
const startRoundBtn = document.getElementById('startRoundBtn');
const endRoundBtn = document.getElementById('endRoundBtn');
const addTimeBtn = document.getElementById('addTimeBtn');
const createPlayoffBtnMain = document.getElementById('createPlayoffBtnMain');
const completeTournamentBtn = document.getElementById('completeTournamentBtn');

// Timer state
let adminTimerInterval = null;
let adminServerSyncInterval = null;
let currentRoundData = null;
const roundsHistory = document.getElementById('roundsHistory');

// Modal elements
const tournamentModal = document.getElementById('tournamentModal');
const playerModal = document.getElementById('playerModal');
const bulkPlayerModal = document.getElementById('bulkPlayerModal');

// Initialize
loadTournaments();

// Tournament Management
async function loadTournaments() {
    try {
        const tournamentsSnap = await getDocs(collection(db, 'tournaments'));
        tournamentSelect.innerHTML = '<option value="">Select Tournament...</option>';
        
        // Convert to array and sort by status and date
        const tournaments = [];
        tournamentsSnap.forEach((doc) => {
            tournaments.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort: active/setup first, then by date descending
        tournaments.sort((a, b) => {
            const statusPriority = { 'active': 0, 'in_progress': 0, 'staging': 1, 'completed': 2 };
            const aPriority = statusPriority[a.status] || 3;
            const bPriority = statusPriority[b.status] || 3;
            
            if (aPriority !== bPriority) {
                return aPriority - bPriority;
            }
            
            const aTime = a.createdAt?.toMillis() || 0;
            const bTime = b.createdAt?.toMillis() || 0;
            return bTime - aTime;
        });
        
        tournaments.forEach((tournament) => {
            const option = document.createElement('option');
            option.value = tournament.id;
            
            // Add emoji indicators for status
            const statusEmoji = {
                'active': '🟢',
                'setup': '🟡',
                'completed': '⚫'
            }[tournament.status] || '';
            
            option.textContent = `${statusEmoji} ${tournament.name} (${tournament.status})`;
            tournamentSelect.appendChild(option);
        });
        
        // Check for saved tournament selection
        const savedTournamentId = localStorage.getItem('adminSelectedTournamentId');
        if (savedTournamentId) {
            // Verify the tournament still exists
            const tournamentExists = tournaments.find(t => t.id === savedTournamentId);
            if (tournamentExists) {
                tournamentSelect.value = savedTournamentId;
                selectTournament(savedTournamentId);
            } else {
                // Tournament no longer exists, clear localStorage
                localStorage.removeItem('adminSelectedTournamentId');
            }
        }
        
        // Tournaments loaded
    } catch (error) {
        console.error('Error loading tournaments:', error);
        showToast('Error loading tournaments: ' + error.message, 'error');
    }
}

tournamentSelect.addEventListener('change', (e) => {
    if (e.target.value) {
        selectTournament(e.target.value);
    } else {
        deselectTournament();
    }
});

async function selectTournament(tournamentId) {
    currentTournamentId = tournamentId;
    
    // Save to localStorage for persistence across page reloads
    localStorage.setItem('adminSelectedTournamentId', tournamentId);
    
    noTournamentSelected.classList.add('hidden');
    tournamentContent.classList.remove('hidden');
    
    // Load tournament info
    const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
    if (tournamentDoc.exists()) {
        window.currentTournamentData = tournamentDoc.data(); // Store for player count display
        displayTournamentInfo(window.currentTournamentData);
        await displayRoundInfo(window.currentTournamentData);
        
        // Update archive button text based on status
        if (window.currentTournamentData.status === 'completed') {
            archiveTournamentBtn.textContent = 'Reactivate';
            archiveTournamentBtn.classList.remove('btn-secondary');
            archiveTournamentBtn.classList.add('btn-success');
        } else {
            archiveTournamentBtn.textContent = 'Archive';
            archiveTournamentBtn.classList.remove('btn-success');
            archiveTournamentBtn.classList.add('btn-secondary');
        }
    }
    
    // Set up real-time listeners
    setupPlayersListener();
    setupTablesListener();
    setupRoundsListener();
}

function deselectTournament() {
    currentTournamentId = null;
    
    // Clear from localStorage
    localStorage.removeItem('adminSelectedTournamentId');
    
    noTournamentSelected.classList.remove('hidden');
    tournamentContent.classList.add('hidden');
    
    // Unsubscribe from listeners
    if (unsubscribePlayers) unsubscribePlayers();
    if (unsubscribeTables) unsubscribeTables();
    if (unsubscribeRounds) unsubscribeRounds();
}

function displayTournamentInfo(data) {
    const statusClass = `status-${data.status}`;
    const maxPlayers = data.maxPlayers || 0;
    const type = data.type || 'standard';
    const totalRounds = data.totalRounds || 0;
    
    let typeSpecificHTML = '';
    if (type === 'cutline') {
        typeSpecificHTML = `
            <div class="info-item">
                <div class="info-label">Tournament Type</div>
                <div class="info-value" style="color: #ef4444; font-weight: bold;">Cut Line</div>
            </div>
            <div class="info-item">
                <div class="info-label">Total Rounds</div>
                <div class="info-value">
                    <input type="number" id="totalRoundsInput" min="2" max="10" value="${totalRounds}" 
                        style="width: 60px; padding: 5px 10px; border-radius: 6px; border: 2px solid #e5e7eb; font-size: 14px; font-weight: 600;"
                        onblur="updateTotalRounds(this.value, ${totalRounds})">
                </div>
            </div>
        `;
    } else {
        typeSpecificHTML = `
            <div class="info-item">
                <div class="info-label">Tournament Type</div>
                <div class="info-value">Standard</div>
            </div>
        `;
    }
    
    tournamentInfo.innerHTML = `
        <div class="info-item">
            <div class="info-label">Name</div>
            <div class="info-value">${data.name}</div>
        </div>
        <div class="info-item">
            <div class="info-label">Tournament Code</div>
            <div class="info-value">
                <input type="text" 
                       id="tournamentCodeInput" 
                       value="${data.tournamentCode || ''}" 
                       maxlength="4"
                       style="width: 100px; padding: 8px 12px; border-radius: 6px; border: 2px solid #e5e7eb; font-size: 16px; font-weight: bold; letter-spacing: 3px; text-align: center; text-transform: uppercase; color: #667eea;"
                       oninput="this.value = this.value.toUpperCase()"
                       onblur="updateTournamentCode(this.value, '${data.tournamentCode || ''}')"
                       placeholder="XXXX">
            </div>
        </div>
        ${typeSpecificHTML}
        <div class="info-item">
            <div class="info-label">Status</div>
            <div class="info-value">
                <select id="statusSelect" style="padding: 5px 10px; border-radius: 6px; border: 2px solid #e5e7eb; font-size: 14px; font-weight: 600;">
                    <option value="staging" ${data.status === 'staging' ? 'selected' : ''}>Staging</option>
                    <option value="active" ${data.status === 'active' ? 'selected' : ''}>Active</option>
                    <option value="completed" ${data.status === 'completed' ? 'selected' : ''}>Completed</option>
                </select>
            </div>
        </div>
        <div class="info-item">
            <div class="info-label">Timer Duration</div>
            <div class="info-value">
                <select id="durationSelect" style="padding: 5px 10px; border-radius: 6px; border: 2px solid #e5e7eb; font-size: 14px; font-weight: 600;">
                    <option value="3" ${data.timerDuration === 3 ? 'selected' : ''}>3 seconds</option>
                    <option value="4" ${data.timerDuration === 4 ? 'selected' : ''}>4 seconds</option>
                    <option value="5" ${data.timerDuration === 5 ? 'selected' : ''}>5 seconds</option>
                    <option value="6" ${data.timerDuration === 6 ? 'selected' : ''}>6 seconds</option>
                    <option value="7" ${data.timerDuration === 7 ? 'selected' : ''}>7 seconds</option>
                    <option value="8" ${data.timerDuration === 8 ? 'selected' : ''}>8 seconds</option>
                    <option value="9" ${data.timerDuration === 9 ? 'selected' : ''}>9 seconds</option>
                    <option value="10" ${data.timerDuration === 10 ? 'selected' : ''}>10 seconds</option>
                </select>
            </div>
        </div>
        <div class="info-item">
            <div class="info-label">Max Players</div>
            <div class="info-value">
                <input type="number" id="maxPlayersInput" min="0" value="${maxPlayers}" 
                    style="width: 80px; padding: 5px 10px; border-radius: 6px; border: 2px solid #e5e7eb; font-size: 14px; font-weight: 600;"
                    onblur="updateMaxPlayers(this.value, ${maxPlayers})">
                <span style="font-size: 12px; color: #6b7280; margin-left: 5px;">(0 = unlimited)</span>
            </div>
        </div>
        <div class="info-item">
            <div class="info-label">Created</div>
            <div class="info-value">${data.createdAt ? new Date(data.createdAt.toDate()).toLocaleDateString() : 'N/A'}</div>
        </div>
    `;
    
    // Add event listener for status change
    document.getElementById('statusSelect').addEventListener('change', async (e) => {
        const newStatus = e.target.value;
        const oldStatus = data.status;
        
        showConfirmAction(
            'Change Tournament Status',
            `<p>Change tournament status to <strong>"${newStatus}"</strong>?</p>`,
            async () => {
            try {
                await updateDoc(doc(db, 'tournaments', currentTournamentId), {
                    status: newStatus
                });
                await loadTournaments();
                    showToast('Tournament status updated.', 'success');
            } catch (error) {
                console.error('Error updating status:', error);
                    showToast('Error updating status: ' + error.message, 'error');
                    e.target.value = oldStatus;
                }
            },
            () => {
                // Revert selection on cancel
                e.target.value = oldStatus;
            }
        );
    });
    
    // Add event listener for duration change
    document.getElementById('durationSelect').addEventListener('change', async (e) => {
        const newDuration = parseInt(e.target.value);
        const oldDuration = data.timerDuration;
        
        showConfirmAction(
            'Change Timer Duration',
            `<p>Change default timer duration to <strong>${newDuration} minutes</strong>?</p>` +
            `<p style="margin-top: 10px; color: #6b7280; font-size: 13px;">This will affect new rounds created after this change.</p>`,
            async () => {
            try {
                await updateDoc(doc(db, 'tournaments', currentTournamentId), {
                    timerDuration: newDuration
                });
                    showToast('Timer duration updated!', 'success');
            } catch (error) {
                console.error('Error updating duration:', error);
                    showToast('Error updating duration: ' + error.message, 'error');
                    e.target.value = oldDuration;
                }
            },
            () => {
                // Revert selection on cancel
                e.target.value = oldDuration;
            }
        );
    });
}

// Create Tournament
createTournamentBtn.addEventListener('click', () => {
    document.getElementById('tournamentName').value = '';
    document.getElementById('tournamentTournamentCode').value = '';
    document.getElementById('tournamentTimer').value = '5';
    tournamentModal.classList.remove('hidden');
});

// Import Tournament from JSON
document.getElementById('importTournamentBtn').addEventListener('click', () => {
    document.getElementById('importFileInput').click();
});

document.getElementById('importFileInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        showToast('Reading JSON file...', 'info');
        
        const text = await file.text();
        const importData = JSON.parse(text);
        
        // Validate JSON structure
        if (!importData.tournament || !importData.exportVersion) {
            showToast('Invalid tournament JSON file.', 'error');
            e.target.value = ''; // Reset file input
            return;
        }
        
        // Check if tournament name already exists
        let tournamentName = importData.tournament.name;
        const existingTournaments = await getDocs(collection(db, 'tournaments'));
        const existingNames = existingTournaments.docs.map(doc => doc.data().name);
        
        if (existingNames.includes(tournamentName)) {
            // Suggest new name with timestamp
            const timestamp = Date.now();
            const suggestedName = `${tournamentName} (${timestamp})`;
            const originalName = tournamentName;
            
            try {
                await new Promise((resolve, reject) => {
                    showConfirmAction(
                        'Duplicate Tournament Name',
                        `<p>A tournament named <strong>"${originalName}"</strong> already exists.</p>` +
                        `<p style="margin-top: 15px;">Import as:</p>` +
                        `<p style="margin-top: 5px; padding: 10px; background: #f3f4f6; border-radius: 6px; font-family: monospace; font-size: 13px;"><strong>${suggestedName}</strong></p>`,
                        () => {
                            tournamentName = suggestedName;
                            resolve();
                        },
                        () => {
                            reject(new Error('Import cancelled'));
                        }
                    );
                });
            } catch (cancelError) {
                showToast('Import cancelled.', 'info');
                e.target.value = '';
                return;
            }
        }
        
        showToast('Importing tournament...', 'info');
        
        // Helper function to convert ISO strings to Firestore Timestamps
        const toTimestamp = (isoString) => {
            if (!isoString) return null;
            return Timestamp.fromDate(new Date(isoString));
        };
        
        // Create tournament document
        const tournamentRef = doc(collection(db, 'tournaments'));
        const tournamentData = { ...importData.tournament };
        delete tournamentData.id; // Remove old ID
        tournamentData.name = tournamentName; // Use new name if changed
        
        // Generate new tournament code (always generate new for imports to avoid conflicts)
        tournamentData.tournamentCode = await generateUniqueTournamentCode();
        
        // Convert timestamps
        if (tournamentData.createdAt) {
            tournamentData.createdAt = toTimestamp(tournamentData.createdAt);
        } else {
            tournamentData.createdAt = serverTimestamp();
        }
        
        await setDoc(tournamentRef, tournamentData);
        const newTournamentId = tournamentRef.id;
        
        // Import players (batch write)
        if (importData.players && importData.players.length > 0) {
            let playerBatch = writeBatch(db);
            let playerCount = 0;
            
            for (const player of importData.players) {
                const playerRef = doc(collection(db, 'tournaments', newTournamentId, 'players'));
                const playerData = { ...player };
                delete playerData.id; // Remove old ID
                
                // Convert timestamps
                if (playerData.lastWinAt) {
                    playerData.lastWinAt = toTimestamp(playerData.lastWinAt);
                }
                
                playerBatch.set(playerRef, playerData);
                playerCount++;
                
                // Firestore batch limit is 500 operations
                if (playerCount % 500 === 0) {
                    await playerBatch.commit();
                    playerBatch = writeBatch(db); // Create new batch
                }
            }
            
            if (playerCount % 500 !== 0) {
                await playerBatch.commit();
            }
        }
        
        // Import tables (batch write)
        if (importData.tables && importData.tables.length > 0) {
            let tableBatch = writeBatch(db);
            let tableCount = 0;
            
            for (const table of importData.tables) {
                const tableRef = doc(collection(db, 'tournaments', newTournamentId, 'tables'));
                const tableData = { ...table };
                delete tableData.id; // Remove old ID
                
                tableBatch.set(tableRef, tableData);
                tableCount++;
                
                if (tableCount % 500 === 0) {
                    await tableBatch.commit();
                    tableBatch = writeBatch(db); // Create new batch
                }
            }
            
            if (tableCount % 500 !== 0) {
                await tableBatch.commit();
            }
        }
        
        // Import rounds with participants
        if (importData.rounds && importData.rounds.length > 0) {
            for (const round of importData.rounds) {
                const roundRef = doc(collection(db, 'tournaments', newTournamentId, 'rounds'));
                const roundData = { ...round };
                delete roundData.id; // Remove old ID
                const participants = roundData.participants || [];
                delete roundData.participants; // Remove participants from round doc
                
                // Convert timestamps
                if (roundData.startedAt) {
                    roundData.startedAt = toTimestamp(roundData.startedAt);
                }
                if (roundData.endedAt) {
                    roundData.endedAt = toTimestamp(roundData.endedAt);
                }
                if (roundData.createdAt) {
                    roundData.createdAt = toTimestamp(roundData.createdAt);
                } else {
                    roundData.createdAt = serverTimestamp();
                }
                
                await setDoc(roundRef, roundData);
                
                // Import participants for this round (batch write)
                if (participants.length > 0) {
                    let participantBatch = writeBatch(db);
                    let participantCount = 0;
                    
                    for (const participant of participants) {
                        const participantRef = doc(collection(db, 'tournaments', newTournamentId, 'rounds', roundRef.id, 'participants'));
                        const participantData = { ...participant };
                        delete participantData.id; // Remove old ID
                        
                        // Convert timestamps
                        if (participantData.snapshotAt) {
                            participantData.snapshotAt = toTimestamp(participantData.snapshotAt);
                        } else {
                            participantData.snapshotAt = serverTimestamp();
                        }
                        
                        participantBatch.set(participantRef, participantData);
                        participantCount++;
                        
                        if (participantCount % 500 === 0) {
                            await participantBatch.commit();
                            participantBatch = writeBatch(db); // Create new batch
                        }
                    }
                    
                    if (participantCount % 500 !== 0) {
                        await participantBatch.commit();
                    }
                }
            }
        }
        
        showToast(`Tournament "${tournamentName}" imported successfully!`, 'success');
        
        // Reload tournaments and select the new one
        await loadTournaments();
        selectTournament(newTournamentId);
        
        // Reset file input
        e.target.value = '';
        
    } catch (error) {
        console.error('Error importing tournament:', error);
        showToast('Error importing tournament: ' + error.message, 'error');
        e.target.value = '';
    }
});

document.getElementById('cancelTournamentBtn').addEventListener('click', () => {
    tournamentModal.classList.add('hidden');
});

// Generate a unique 4-character tournament code
function generateTournamentCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; // All alphanumeric
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Check if tournament code already exists (case-insensitive)
async function isTournamentCodeUnique(tournamentCode, excludeTournamentId = null) {
    const tournamentsSnap = await getDocs(collection(db, 'tournaments'));
    const existingCodes = tournamentsSnap.docs
        .filter(doc => doc.id !== excludeTournamentId) // Exclude current tournament when editing
        .map(doc => doc.data().tournamentCode?.toUpperCase())
        .filter(Boolean);
    return !existingCodes.includes(tournamentCode.toUpperCase());
}

// Generate unique tournament code
async function generateUniqueTournamentCode() {
    let tournamentCode;
    let attempts = 0;
    const maxAttempts = 20;
    
    do {
        tournamentCode = generateTournamentCode();
        attempts++;
        if (attempts > maxAttempts) {
            throw new Error('Failed to generate unique tournament code');
        }
    } while (!(await isTournamentCodeUnique(tournamentCode)));

    return tournamentCode;
}

// Validate and sanitize tournament code
function validateTournamentCode(code) {
    const sanitized = code.trim().toUpperCase();
    
    // Must be exactly 4 characters
    if (sanitized.length !== 4) {
        return { valid: false, error: 'Tournament code must be exactly 4 characters' };
    }
    
    // Must be alphanumeric only
    if (!/^[A-Z0-9]{4}$/.test(sanitized)) {
        return { valid: false, error: 'Tournament code must contain only letters and numbers' };
    }
    
    return { valid: true, code: sanitized };
}

document.getElementById('tournamentForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('tournamentName').value.trim();
    const customTournamentCode = document.getElementById('tournamentTournamentCode').value.trim();
    const type = document.getElementById('tournamentType').value;
    const timerDuration = parseInt(document.getElementById('tournamentTimer').value);
    const maxPlayers = parseInt(document.getElementById('tournamentMaxPlayers').value) || 0;
    const totalRounds = type === 'cutline' ? parseInt(document.getElementById('tournamentRounds').value) : 0;
    
    if (!name) {
        showToast('Please enter a tournament name.', 'warning');
        return;
    }
    
    try {
        // Check if tournament name already exists
        const existingTournaments = await getDocs(collection(db, 'tournaments'));
        const existingNames = existingTournaments.docs.map(doc => doc.data().name);
        
        if (existingNames.includes(name)) {
            showToast(`A tournament named "${name}" already exists. Please choose a different name.`, 'error');
            return;
        }
        
        // Determine tournament code (custom or auto-generated)
        let tournamentCode;
        if (customTournamentCode) {
            // Validate custom tournament code
            const validation = validateTournamentCode(customTournamentCode);
            if (!validation.valid) {
                showToast(validation.error, 'error');
                return;
            }
            
            // Check if custom code is unique
            if (!(await isTournamentCodeUnique(validation.code))) {
                showToast('This tournament code is already in use. Please choose a different code.', 'error');
                return;
            }
            
            tournamentCode = validation.code;
        } else {
            // Auto-generate unique tournament code
            tournamentCode = await generateUniqueTournamentCode();
        }
        
        const tournamentRef = doc(collection(db, 'tournaments'));
        await setDoc(tournamentRef, {
            name,
            type,
            timerDuration,
            maxPlayers,
            totalRounds,
            tournamentCode,
            status: 'staging',
            currentRound: 0,
            roundInProgress: false,
            createdAt: serverTimestamp()
        });
        
        tournamentModal.classList.add('hidden');
        document.getElementById('tournamentTournamentCode').value = ''; // Clear for next time
        showToast(`Tournament "${name}" created successfully! Tournament Code: ${tournamentCode}`, 'success');
        await loadTournaments();
        tournamentSelect.value = tournamentRef.id;
        selectTournament(tournamentRef.id);
    } catch (error) {
        console.error('Error creating tournament:', error);
        showToast('Error creating tournament: ' + error.message, 'error');
    }
});

// Players Management
function setupPlayersListener() {
    if (unsubscribePlayers) unsubscribePlayers();
    
    const playersRef = collection(db, 'tournaments', currentTournamentId, 'players');
    unsubscribePlayers = onSnapshot(playersRef, async (snapshot) => {
        playersData = {};
        snapshot.forEach((doc) => {
            playersData[doc.id] = { id: doc.id, ...doc.data() };
        });
        displayPlayers();
        
        // Update round info to show correct active player count
        if (window.currentTournamentData) {
            await displayRoundInfo(window.currentTournamentData);
        }
    });
}

function displayPlayers() {
    const allPlayers = Object.values(playersData);
    const activePlayers = allPlayers.filter(p => !p.eliminated);
    const eliminatedPlayers = allPlayers.filter(p => p.eliminated);
    const maxPlayers = window.currentTournamentData?.maxPlayers || 0;
    
    if (maxPlayers > 0) {
        // Show: "active / max" or "active / max (X eliminated)" if there are eliminated players
        if (eliminatedPlayers.length > 0) {
            playerCount.textContent = `${activePlayers.length} / ${maxPlayers} (${eliminatedPlayers.length} eliminated)`;
        } else {
        playerCount.textContent = `${activePlayers.length} / ${maxPlayers}`;
        }
        // Add warning color if at limit
        if (allPlayers.length >= maxPlayers) {
            playerCount.style.color = '#ef4444';
            playerCount.style.fontWeight = 'bold';
        } else {
            playerCount.style.color = '';
            playerCount.style.fontWeight = '';
        }
    } else {
        // No max limit - show total active players
        playerCount.textContent = `${activePlayers.length}`;
        if (eliminatedPlayers.length > 0) {
            playerCount.textContent += ` (${eliminatedPlayers.length} eliminated)`;
        }
        playerCount.style.color = '';
        playerCount.style.fontWeight = '';
    }
    
    if (allPlayers.length === 0) {
        playersList.innerHTML = '<div class="empty-message">No players registered yet. Click "+ Add Player" to get started.</div>';
        document.getElementById('playerStatsTableContainer').style.display = 'none';
        return;
    }
    
    // Display player stats table (replaces player cards)
    displayPlayerStatsTable(allPlayers); // Async but no need to await (fire and forget)
    
    // Show/hide "Eliminate Players" button based on tournament state
    const eliminateBtn = document.getElementById('eliminatePlayersBtn');
    if (eliminateBtn && window.currentTournamentData) {
        const type = window.currentTournamentData.type;
        const currentRound = window.currentTournamentData.currentRound || 0;
        const totalRounds = window.currentTournamentData.totalRounds || 0;
        const status = window.currentTournamentData.status;
        
        // Show button for cutline tournaments when:
        // - There are active rounds
        // - Tournament is not completed
        // - There are active players
        if (type === 'cutline' && currentRound > 0 && status !== 'completed' && activePlayers.length > 0) {
            eliminateBtn.style.display = 'inline-block';
        } else {
            eliminateBtn.style.display = 'none';
        }
    }
}

async function displayPlayerStatsTable(allPlayers) {
    // Build rounds map for score multipliers
    const roundsMap = await buildRoundsMap(currentTournamentId);
    
    // Use last COMPLETED round for tie-breaking, not current round
    // If tournament is in Round 2 staging, we want Round 1 scores for tie-breaking
    const lastCompletedRound = roundsMap._lastCompletedRound || 0;
    const currentRound = window.currentTournamentData?.currentRound || 0;
    
    // Build table players map FROM the last completed round (historical table groupings)
    const tablePlayersMap = await buildTablePlayersMapFromRound(currentTournamentId, lastCompletedRound);
    
    // Sort players using leaderboard logic with LAST COMPLETED round for tie-breaking
    const sortedPlayers = sortPlayersForLeaderboard(allPlayers, lastCompletedRound, roundsMap, tablePlayersMap);
    
    // Calculate golf-style ranks with proper tie detection
    const playersWithRanks = [];
    let currentRank = 1;
    
    for (let i = 0; i < sortedPlayers.length; i++) {
        const player = sortedPlayers[i];
        
        // Check if this player is tied with previous player across ALL criteria
        if (i > 0) {
            const prevPlayer = sortedPlayers[i - 1];
            
            const playerTournamentScore = calculateTournamentScore(player, roundsMap);
            const prevTournamentScore = calculateTournamentScore(prevPlayer, roundsMap);
            const playerRoundScore = calculateRoundScore(player, lastCompletedRound, roundsMap);
            const prevRoundScore = calculateRoundScore(prevPlayer, lastCompletedRound, roundsMap);
            const playerLastWin = player.lastWinAt?.toMillis() || 0;
            const prevLastWin = prevPlayer.lastWinAt?.toMillis() || 0;
            
            // Get table scores - find which table group each player belongs to
            let playerTablePlayers = [player];
            let prevTablePlayers = [prevPlayer];
            
            for (const [tableId, players] of Object.entries(tablePlayersMap)) {
                if (players.some(p => p.id === player.id)) {
                    playerTablePlayers = players;
                }
                if (players.some(p => p.id === prevPlayer.id)) {
                    prevTablePlayers = players;
                }
            }
            
            const playerTableScore = calculateTableRoundScore(playerTablePlayers, lastCompletedRound, roundsMap);
            const prevTableScore = calculateTableRoundScore(prevTablePlayers, lastCompletedRound, roundsMap);
            
            // Players are tied ONLY if ALL criteria match
            const isTied = (
                playerTournamentScore === prevTournamentScore &&
                playerRoundScore === prevRoundScore &&
                playerLastWin === prevLastWin &&
                playerTableScore === prevTableScore
            );
            
            if (isTied) {
                playersWithRanks.push({ ...player, rank: playersWithRanks[i - 1].rank });
            } else {
                playersWithRanks.push({ ...player, rank: currentRank });
            }
        } else {
            playersWithRanks.push({ ...player, rank: currentRank });
        }
        
        currentRank = i + 2; // Next available rank (golf scoring: 1,2,3,4,4,4,4,8)
    }
    
    // Prepare table data
    const tableData = playersWithRanks.map((player) => {
        const rank = player.rank;
        const name = player.name || 'Unknown';
        const tournamentScore = calculateTournamentScore(player, roundsMap);
        // Show last completed round score (for tie-breaking display)
        const roundScore = lastCompletedRound > 0 ? calculateRoundScore(player, lastCompletedRound, roundsMap) : 0;
        const isEliminated = player.eliminated || false;
        
        // Last win time (only +1 events, not penalties)
        let lastWinTime = '-';
        const scoreEvents = player.scoreEvents || [];
        const winEvents = scoreEvents.filter(e => e.delta > 0);
        if (winEvents.length > 0) {
            // Sort by timestamp descending to get most recent
            const sortedWins = [...winEvents].sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
            const lastWin = sortedWins[0];
            const date = lastWin.timestamp.toDate();
            lastWinTime = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
        }
        
        // Table round score (from last completed round)
        let tableRoundScore = 0;
        if (lastCompletedRound > 0) {
            // Find which table group this player belongs to
            let playerTablePlayers = [player];
            for (const [tableId, players] of Object.entries(tablePlayersMap)) {
                if (players.some(p => p.id === player.id)) {
                    playerTablePlayers = players;
                    break;
                }
            }
            tableRoundScore = calculateTableRoundScore(playerTablePlayers, lastCompletedRound, roundsMap);
        }
        
        // Table assignment
        let tableInfo = '<span style="color: #9ca3af;">Unassigned</span>';
        if (player.tableId && tablesData[player.tableId]) {
            tableInfo = `Table ${tablesData[player.tableId].tableNumber}`;
        }
        
        // Position
        const position = player.position || '-';
        
        // Status
        let status = '<span style="color: #10b981; font-weight: bold;">Active</span>';
        if (isEliminated) {
            status = `<span style="color: #ef4444; font-weight: bold;">Eliminated (R${player.eliminatedInRound || '?'})</span>`;
        }
        
        // Actions button
        const actionsBtn = `<button class="btn btn-small btn-secondary" onclick="openPlayerActions('${player.id}', ${isEliminated})">Actions</button>`;
        
        return [
            rank,
            name,
            tournamentScore,
            roundScore,
            lastWinTime,
            tableRoundScore,
            tableInfo,
            position,
            status,
            actionsBtn
        ];
    });
    
    // Destroy existing DataTable if it exists
    if ($.fn.DataTable.isDataTable('#playerStatsTable')) {
        $('#playerStatsTable').DataTable().destroy();
    }
    
    // Initialize DataTable
    $('#playerStatsTable').DataTable({
        data: tableData,
        order: [[0, 'asc']], // Default sort by Rank ascending
        pageLength: 25,
        lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
        language: {
            search: 'Search players:',
            lengthMenu: 'Show _MENU_ players'
        },
        columnDefs: [
            { className: 'dt-center', targets: [0, 2, 3, 4, 5, 6, 7, 8, 9] }, // Center all except name
            { orderable: false, targets: [8, 9] } // Status and Actions columns not sortable
        ]
    });
    
    document.getElementById('playerStatsTableContainer').style.display = 'block';
}

document.getElementById('addPlayerBtn').addEventListener('click', async () => {
    // Check player limit
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const tournamentData = tournamentDoc.data();
    const maxPlayers = tournamentData.maxPlayers || 0;
    const currentPlayerCount = Object.keys(playersData).length;
    
    if (maxPlayers > 0 && currentPlayerCount >= maxPlayers) {
        showToast(`Cannot add more players. Tournament limit is ${maxPlayers} players.`, 'warning');
        return;
    }
    
    // Warn if adding during active round
    const roundInProgress = tournamentData.roundInProgress || false;
    const currentRound = tournamentData.currentRound || 0;
    
    const openPlayerModal = () => {
    currentEditingPlayerId = null;
    document.getElementById('playerModalTitle').textContent = 'Add Player';
    document.getElementById('playerName').value = '';
    playerModal.classList.remove('hidden');
    document.getElementById('playerName').focus();
    };
    
    if (roundInProgress) {
        showConfirmAction(
            'Round In Progress',
            `<p style="color: #f59e0b; font-weight: bold;">⚠️ Round ${currentRound} is currently in progress.</p>` +
            `<p style="margin-top: 15px;">Adding a player now means:</p>` +
            `<ul style="margin-top: 10px; padding-left: 20px; line-height: 1.8;">` +
            `<li>They won't be assigned to a table for this round</li>` +
            `<li>You'll need to manually assign them before the next round</li>` +
            `</ul>` +
            `<p style="margin-top: 15px;">Continue?</p>`,
            openPlayerModal
        );
    } else {
        openPlayerModal();
    }
});

// Bulk player import
let bulkPlayerNames = [];

// Eliminate Players Button
document.getElementById('eliminatePlayersBtn').addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    try {
        const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
        const tournamentData = tournamentDoc.data();
        const currentRound = tournamentData.currentRound || 0;
        const type = tournamentData.type || 'standard';
        const totalRounds = tournamentData.totalRounds || 0;
        
        if (type !== 'cutline') {
            showToast('This is only available for cutline tournaments.', 'warning');
            return;
        }
        
        if (currentRound === 0) {
            showToast('No rounds have been played yet.', 'warning');
            return;
        }
        
        // Check if current round is in staging - if so, we're eliminating based on LAST completed round
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        let lastCompletedRound = 0;
        let roundParticipants = {};
        
        for (const roundDoc of roundsSnap.docs) {
            const roundData = roundDoc.data();
            // Find the most recent completed round
            if (roundData.status === 'completed' && roundData.roundNumber > lastCompletedRound) {
                lastCompletedRound = roundData.roundNumber;
            }
            // Get participants from the last completed round for scoring
            if (roundData.roundNumber === lastCompletedRound && roundData.status === 'completed') {
                const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundDoc.id, 'participants'));
                participantsSnap.forEach(pDoc => {
                    const pData = pDoc.data();
                    roundParticipants[pData.playerId] = pData;
                });
            }
        }
        
        if (lastCompletedRound === 0) {
            showToast('No rounds have been completed yet. Cannot eliminate players.', 'warning');
            return;
        }
        
        const activePlayers = Object.values(playersData).filter(p => !p.eliminated);
        const allPlayers = Object.values(playersData);
        
        // Use shared cut line algorithm with new scoring system
        const originalPlayerCount = allPlayers.length;
        
        // Build rounds map and table players map for scoring
        const roundsMap = await buildRoundsMap(currentTournamentId);
        const tablePlayersMap = await buildTablePlayersMapFromRound(currentTournamentId, lastCompletedRound);
        
        // Sort players for cutting (worst first) using new scoring algorithm
        const sortedPlayers = sortPlayersForCutLine(activePlayers, lastCompletedRound, roundsMap, tablePlayersMap);
        
        // Add tournament scores to sorted players for use in modal display
        sortedPlayers.forEach(p => {
            p.tournamentScore = calculateTournamentScore(p, roundsMap);
            p.roundScore = calculateRoundScore(p, lastCompletedRound, roundsMap);
        });
        
        // Calculate target based on LAST COMPLETED round
        const { targetRemaining, idealTarget, targetPercentage, chosenOption } = calculateCutLineTarget(
            originalPlayerCount,
            lastCompletedRound,
            totalRounds,
            sortedPlayers
        );
        
        // Calculate how many to cut to reach target
        const cutCount = activePlayers.length - targetRemaining;
        
        if (cutCount <= 0) {
            showToast('No players need to be eliminated at this stage.', 'info');
            return;
        }
        
        const playersToCut = sortedPlayers.slice(0, cutCount);
        const remainingCount = sortedPlayers.slice(cutCount).length;
        
        // Show elimination preview modal
        const summaryHTML = `
            <p style="margin-bottom: 15px; padding-bottom: 10px; border-bottom: 1px solid #d1d5db;">
                <strong>Eliminating based on Round ${lastCompletedRound} results</strong>
            </p>
            <p><strong>Original Players:</strong> ${originalPlayerCount}</p>
            <p><strong>Current Active:</strong> ${activePlayers.length} players</p>
            <p><strong>Ideal Target:</strong> ${idealTarget} players (${Math.round(targetPercentage * 100)}% of ${originalPlayerCount})</p>
            <p><strong>Adjusted Target:</strong> ${targetRemaining} players ${chosenOption}</p>
            <p><strong>To Eliminate:</strong> ${playersToCut.length} player(s)</p>
            <p><strong>Will Remain:</strong> ${remainingCount} players</p>
        `;
        
        // Group players by tournament score and round score for better display
        const scoreMap = new Map();
        playersToCut.forEach(p => {
            const tournamentScore = p.tournamentScore || 0;
            const roundScore = p.roundScore || 0;
            const key = `${tournamentScore}-${roundScore}`;
            
            if (!scoreMap.has(key)) {
                scoreMap.set(key, { tournamentScore, roundScore, names: [] });
            }
            scoreMap.get(key).names.push(p.name);
        });
        
        const playersListHTML = Array.from(scoreMap.values())
            .sort((a, b) => {
                if (a.tournamentScore !== b.tournamentScore) return a.tournamentScore - b.tournamentScore;
                return a.roundScore - b.roundScore;
            })
            .map(group => {
                const tournamentScoreText = group.tournamentScore > 0 ? `+${group.tournamentScore}` : group.tournamentScore;
                const roundScoreText = group.roundScore > 0 ? `+${group.roundScore}` : group.roundScore;
                return `
                    <div style="margin: 8px 0; padding: 8px; background: white; border-radius: 6px;">
                        <strong>${tournamentScoreText} pts (${roundScoreText} this round):</strong>
                        <div style="margin-top: 4px; color: #991b1b;">
                            ${group.names.join(', ')}
                        </div>
                    </div>
                `;
            }).join('');
        
        document.getElementById('eliminateSummary').innerHTML = summaryHTML;
        document.getElementById('eliminatePlayersList').innerHTML = playersListHTML;
        
        // Store for confirmation handler - use lastCompletedRound for elimination round number
        window.pendingEliminationData = { playersToCut, eliminationRound: lastCompletedRound };
        
        document.getElementById('eliminatePlayersModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error preparing elimination:', error);
        showToast('Error: ' + error.message, 'error');
    }
});

// Cancel Eliminate
document.getElementById('cancelEliminateBtn').addEventListener('click', () => {
    document.getElementById('eliminatePlayersModal').classList.add('hidden');
    window.pendingEliminationData = null;
});

// Confirm Eliminate
document.getElementById('confirmEliminateBtn').addEventListener('click', async () => {
    if (!window.pendingEliminationData) return;
    
    const { playersToCut, eliminationRound } = window.pendingEliminationData;
    
    document.getElementById('eliminatePlayersModal').classList.add('hidden');
    
    try {
        // Use batch write for efficiency
        const batch = writeBatch(db);
        
        for (const player of playersToCut) {
            if (player.id) {
                const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
                batch.update(playerRef, {
                    eliminated: true,
                    eliminatedInRound: eliminationRound
                });
            }
        }
        
        await batch.commit();
        
        showToast(`${playersToCut.length} player(s) eliminated successfully!`, 'success');
        window.pendingEliminationData = null;
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error eliminating players:', error);
        showToast('Error eliminating players: ' + error.message, 'error');
    }
});

document.getElementById('bulkAddPlayersBtn').addEventListener('click', () => {
    if (!currentTournamentId) {
        showToast('Please select a tournament first.', 'warning');
        return;
    }
    
    // Reset modal
    document.getElementById('bulkPlayerFile').value = '';
    document.getElementById('bulkPlayerText').value = '';
    document.getElementById('bulkPlayerPreview').style.display = 'none';
    document.getElementById('importBulkPlayerBtn').style.display = 'none';
    bulkPlayerNames = [];
    
    bulkPlayerModal.classList.remove('hidden');
});

document.getElementById('cancelBulkPlayerBtn').addEventListener('click', () => {
    bulkPlayerModal.classList.add('hidden');
});

document.getElementById('bulkPlayerFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    try {
        const text = await file.text();
        // Handle CSV files - parse and clean up
        let processedText = text;
        
        // If it's a CSV, try to extract names (handle comma-separated values)
        if (file.name.endsWith('.csv')) {
            const lines = text.split('\n');
            const names = [];
            
            for (let line of lines) {
                // Skip empty lines
                if (!line.trim()) continue;
                
                // Take first column (split by comma, handle quotes)
                const match = line.match(/^"?([^",]+)"?/);
                if (match && match[1].trim()) {
                    names.push(match[1].trim());
                }
            }
            
            processedText = names.join('\n');
        }
        
        document.getElementById('bulkPlayerText').value = processedText;
        
        // Auto-trigger preview if file loaded successfully
        if (processedText.trim()) {
            showToast('File loaded successfully. Click Preview to review.', 'success');
        }
    } catch (error) {
        console.error('Error reading file:', error);
        showToast('Error reading file: ' + error.message, 'error');
    }
});

document.getElementById('previewBulkPlayerBtn').addEventListener('click', () => {
    const text = document.getElementById('bulkPlayerText').value.trim();
    
    if (!text) {
        showToast('Please enter player names or upload a file.', 'warning');
        return;
    }
    
    // Parse names (one per line, trim whitespace, filter empty)
    const names = text.split('\n')
        .map(name => name.trim())
        .filter(name => name.length > 0);
    
    if (names.length === 0) {
        showToast('No valid player names found.', 'warning');
        return;
    }
    
    // Check for duplicates within the import
    const uniqueNames = [...new Set(names.map(n => n.toLowerCase()))];
    if (uniqueNames.length !== names.length) {
        const duplicateCount = names.length - uniqueNames.length;
        showToast(`Warning: Found ${duplicateCount} duplicate name(s) in the import. Duplicates will be skipped.`, 'warning');
    }
    
    // Check against existing players
    const existingNames = Object.values(playersData).map(p => p.name.toLowerCase());
    const newNames = [];
    const skippedNames = [];
    
    names.forEach(name => {
        const nameLower = name.toLowerCase();
        if (existingNames.includes(nameLower)) {
            skippedNames.push(name);
        } else if (!newNames.some(n => n.toLowerCase() === nameLower)) {
            newNames.push(name);
        }
    });
    
    bulkPlayerNames = newNames;
    
    // Show preview
    let previewHTML = `<strong style="color: #10b981;">${newNames.length} player(s) will be imported:</strong><br><br>`;
    previewHTML += newNames.map((name, i) => `${i + 1}. ${name}`).join('<br>');
    
    if (skippedNames.length > 0) {
        previewHTML += `<br><br><strong style="color: #ef4444;">${skippedNames.length} player(s) will be skipped (already exist):</strong><br>`;
        previewHTML += skippedNames.map(name => `• ${name}`).join('<br>');
    }
    
    document.getElementById('bulkPlayerPreviewList').innerHTML = previewHTML;
    document.getElementById('bulkPlayerPreview').style.display = 'block';
    document.getElementById('importBulkPlayerBtn').style.display = 'inline-block';
});

document.getElementById('importBulkPlayerBtn').addEventListener('click', async () => {
    if (bulkPlayerNames.length === 0) {
        showToast('No players to import.', 'warning');
        return;
    }
    
    if (!currentTournamentId) {
        showToast('No tournament selected.', 'error');
        return;
    }
    
    // Check player limit
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    if (!tournamentDoc.exists()) {
        showToast('Tournament not found.', 'error');
        return;
    }
    
    const tournamentData = tournamentDoc.data();
    const maxPlayers = tournamentData.maxPlayers || 0;
    const currentPlayerCount = Object.keys(playersData).length;
    
    // Handle player limit exceeded
    if (maxPlayers > 0 && (currentPlayerCount + bulkPlayerNames.length) > maxPlayers) {
        const available = maxPlayers - currentPlayerCount;
        const excess = (currentPlayerCount + bulkPlayerNames.length) - maxPlayers;
        
        const limitWarning = `<p style="color: #f59e0b; font-weight: bold;">Warning: Tournament limit is ${maxPlayers} players.</p>` +
            `<p style="margin-top: 10px;"><strong>Currently:</strong> ${currentPlayerCount} players<br>` +
            `<strong>Importing:</strong> ${bulkPlayerNames.length} players<br>` +
            `<strong>Would exceed limit by:</strong> ${excess}</p>` +
            `<p style="margin-top: 10px; padding: 10px; background: #fef3c7; border-radius: 6px;">` +
            `Only <strong>${available}</strong> player(s) can be added.<br>Import first ${available} players?</p>`;
        
        try {
            await new Promise((resolve, reject) => {
                showConfirmAction(
                    'Player Limit Exceeded',
                    limitWarning,
                    () => {
                        bulkPlayerNames = bulkPlayerNames.slice(0, available);
                        resolve();
                    },
                    () => {
                        reject(new Error('Import cancelled'));
                    }
                );
            });
        } catch (cancelError) {
            return;
        }
    }
    
    // No confirmation needed - user already previewed and clicked Import
    // Directly import the players
    try {
        // Use batch write for all players - single network call
        const batch = writeBatch(db);
        
        for (const name of bulkPlayerNames) {
            const playerRef = doc(collection(db, 'tournaments', currentTournamentId, 'players'));
            batch.set(playerRef, {
                name,
                registeredAt: serverTimestamp(),
                tableId: null,
                position: null,
                wins: 0,
                points: 0,
                lastWinAt: null,
                scoreEvents: [], // Initialize empty scoreEvents array
                eliminated: false,
                eliminatedInRound: null
            });
        }
        
        // Commit all players in one batch
        await batch.commit();
        
        bulkPlayerModal.classList.add('hidden');
        showToast(`Successfully imported ${bulkPlayerNames.length} player(s)!`, 'success');
    } catch (error) {
        console.error('Error importing players:', error);
        showToast('Error importing players: ' + error.message, 'error');
    }
});

document.getElementById('cancelPlayerBtn').addEventListener('click', () => {
    playerModal.classList.add('hidden');
});

document.getElementById('playerForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('playerName').value.trim();
    if (!name) return;
    
    try {
        // Check for duplicate names
        const existingPlayer = Object.values(playersData).find(p => 
            p.name.toLowerCase() === name.toLowerCase() && 
            p.id !== currentEditingPlayerId
        );
        
        if (existingPlayer) {
            showToast(`A player named "${existingPlayer.name}" already exists!`, 'warning');
            return;
        }
        
        if (currentEditingPlayerId) {
            // Update existing player
            await updateDoc(doc(db, 'tournaments', currentTournamentId, 'players', currentEditingPlayerId), {
                name
            });
        } else {
            // Create new player - double check limit (in case it changed)
            const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
            const tournamentData = tournamentDoc.data();
            const maxPlayers = tournamentData.maxPlayers || 0;
            const currentPlayerCount = Object.keys(playersData).length;
            
            if (maxPlayers > 0 && currentPlayerCount >= maxPlayers) {
                showToast(`Cannot add more players. Tournament limit is ${maxPlayers} players.`, 'warning');
                return;
            }
            
            const playerRef = doc(collection(db, 'tournaments', currentTournamentId, 'players'));
            await setDoc(playerRef, {
                name,
                registeredAt: serverTimestamp(),
                tableId: null,
                position: null,
                wins: 0,
                points: 0,
                lastWinAt: null,
                scoreEvents: [], // Initialize empty scoreEvents array
                eliminated: false,
                eliminatedInRound: null
            });
        }
        
        playerModal.classList.add('hidden');
    } catch (error) {
        console.error('Error saving player:', error);
        showToast('Error saving player: ' + error.message, 'error');
    }
});

window.editPlayer = function(playerId) {
    currentEditingPlayerId = playerId;
    const player = playersData[playerId];
    document.getElementById('playerModalTitle').textContent = 'Edit Player';
    document.getElementById('playerName').value = player.name;
    playerModal.classList.remove('hidden');
    document.getElementById('playerName').focus();
};

// Open player actions modal
window.openPlayerActions = function(playerId, isEliminated) {
    const player = playersData[playerId];
    if (!player) return;
    
    const currentRound = window.currentTournamentData?.currentRound || 0;
    
    // Populate modal
    document.getElementById('playerActionsName').textContent = player.name;
    document.getElementById('playerActionsWins').textContent = player.wins || 0;
    
    const assignmentText = player.tableId 
        ? `Table ${tablesData[player.tableId]?.tableNumber || '?'} - ${player.position || '?'}`
        : 'Not assigned';
    const statusText = isEliminated ? `ELIMINATED (Round ${player.eliminatedInRound})` : assignmentText;
    document.getElementById('playerActionsStatus').textContent = statusText;
    
    // Show/hide appropriate buttons
    if (isEliminated) {
        document.getElementById('playerActionEliminate').style.display = 'none';
        document.getElementById('playerActionRestore').style.display = 'block';
    } else {
        document.getElementById('playerActionEliminate').style.display = 'block';
        document.getElementById('playerActionRestore').style.display = 'none';
    }
    
    // Set up button handlers
    document.getElementById('playerActionChangeScore').onclick = () => {
        document.getElementById('playerActionsModal').classList.add('hidden');
        changePlayerScore(playerId, player.name);
    };
    
    document.getElementById('playerActionEliminate').onclick = () => {
        document.getElementById('playerActionsModal').classList.add('hidden');
        eliminatePlayer(playerId, currentRound);
    };
    
    document.getElementById('playerActionRestore').onclick = () => {
        document.getElementById('playerActionsModal').classList.add('hidden');
        uneliminatePlayer(playerId);
    };
    
    document.getElementById('playerActionEdit').onclick = () => {
        document.getElementById('playerActionsModal').classList.add('hidden');
        editPlayer(playerId);
    };
    
    document.getElementById('playerActionDelete').onclick = () => {
        document.getElementById('playerActionsModal').classList.add('hidden');
        deletePlayer(playerId);
    };
    
    document.getElementById('playerActionsModal').classList.remove('hidden');
};

// Close player actions modal
document.getElementById('closePlayerActionsBtn').addEventListener('click', () => {
    document.getElementById('playerActionsModal').classList.add('hidden');
});

// Show confirmation modal
function showConfirmAction(title, message, onConfirm, onCancel) {
    const modal = document.getElementById('confirmActionModal');
    
    if (!modal) {
        console.error('confirmActionModal not found!');
        return;
    }
    
    document.getElementById('confirmActionTitle').textContent = title;
    document.getElementById('confirmActionMessage').innerHTML = message;
    
    // Set up confirm button
    const confirmBtn = document.getElementById('confirmConfirmActionBtn');
    confirmBtn.onclick = () => {
        modal.classList.add('hidden');
        onConfirm();
    };
    
    // Set up cancel button (with optional callback)
    const cancelBtn = document.getElementById('cancelConfirmActionBtn');
    cancelBtn.onclick = () => {
        modal.classList.add('hidden');
        if (onCancel) {
            onCancel();
        }
    };
    
    modal.classList.remove('hidden');
}

// Show type-to-confirm modal (for dangerous actions requiring exact text input)
function showTypeToConfirm(title, message, expectedText, onConfirm) {
    document.getElementById('typeToConfirmTitle').textContent = title;
    document.getElementById('typeToConfirmMessage').innerHTML = message;
    document.getElementById('typeToConfirmLabel').textContent = `Type "${expectedText}" to confirm:`;
    document.getElementById('typeToConfirmInput').value = '';
    
    const confirmBtn = document.getElementById('confirmTypeToConfirmBtn');
    const input = document.getElementById('typeToConfirmInput');
    
    confirmBtn.onclick = () => {
        const enteredText = input.value.trim();
        if (enteredText === expectedText) {
            document.getElementById('typeToConfirmModal').classList.add('hidden');
            onConfirm();
        } else {
            showToast(`Please type "${expectedText}" exactly to confirm.`, 'warning');
        }
    };
    
    document.getElementById('typeToConfirmModal').classList.remove('hidden');
    input.focus();
}

// Cancel type-to-confirm modal
document.getElementById('cancelTypeToConfirmBtn').addEventListener('click', () => {
    document.getElementById('typeToConfirmModal').classList.add('hidden');
    showToast('Action cancelled.', 'info');
});

// Eliminate a player
window.eliminatePlayer = async function(playerId, currentRound) {
    const player = playersData[playerId];
    if (!player) return;
    
    showConfirmAction(
        'Eliminate Player',
        `<p>Eliminate <strong>${player.name}</strong>?</p><p style="margin-top: 10px;">This will mark them as eliminated in Round ${currentRound}.</p>`,
        async () => {
            try {
                await updateDoc(doc(db, 'tournaments', currentTournamentId, 'players', playerId), {
                    eliminated: true,
                    eliminatedInRound: currentRound
                });
                
                showToast(`${player.name} has been eliminated.`, 'success');
            } catch (error) {
                console.error('Error eliminating player:', error);
                showToast('Error eliminating player: ' + error.message, 'error');
            }
        }
    );
};

// Uneliminate a player
window.uneliminatePlayer = async function(playerId) {
    const player = playersData[playerId];
    if (!player) return;
    
    showConfirmAction(
        'Restore Player',
        `<p>Restore <strong>${player.name}</strong>?</p><p style="margin-top: 10px;">This will remove their eliminated status.</p>`,
        async () => {
            try {
                await updateDoc(doc(db, 'tournaments', currentTournamentId, 'players', playerId), {
                    eliminated: false,
                    eliminatedInRound: null
                });
                
                showToast(`${player.name} has been restored.`, 'success');
            } catch (error) {
                console.error('Error restoring player:', error);
                showToast('Error restoring player: ' + error.message, 'error');
            }
        }
    );
};

// Change player score for a specific round
let currentChangeScoreData = null;

window.changePlayerScore = async function(playerId, playerName) {
    const player = playersData[playerId];
    if (!player) return;
    
    currentChangeScoreData = { playerId, playerName };
    
    // Populate modal
    document.getElementById('changeScorePlayerName').textContent = playerName;
    document.getElementById('changeScoreCurrentWins').textContent = player.wins || 0;
    
    // Load all rounds
    const roundSelect = document.getElementById('changeScoreRound');
    roundSelect.innerHTML = '<option value="">Select a round...</option>';
    
    try {
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        const rounds = [];
        roundsSnap.forEach(doc => {
            rounds.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by round number
        rounds.sort((a, b) => a.roundNumber - b.roundNumber);
        
        // Populate dropdown
        rounds.forEach(round => {
            const option = document.createElement('option');
            option.value = round.id;
            option.textContent = `Round ${round.roundNumber}${round.isPlayoff ? ' (PLAYOFF)' : ''} - ${round.status}`;
            roundSelect.appendChild(option);
        });
        
        // Store rounds data
        currentChangeScoreData.rounds = rounds;
        
        document.getElementById('changeScoreModal').classList.remove('hidden');
    } catch (error) {
        console.error('Error loading rounds:', error);
        showToast('Error loading rounds: ' + error.message, 'error');
    }
};

// Handle round selection in change score modal
document.getElementById('changeScoreRound').addEventListener('change', async (e) => {
    const roundId = e.target.value;
    const eventsContainer = document.getElementById('changeScoreEventsContainer');
    
    if (!roundId) {
        eventsContainer.style.display = 'none';
        return;
    }
    
    try {
        // Find round data
        const round = currentChangeScoreData.rounds.find(r => r.id === roundId);
        
        // Get participant data for this round
        const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants'));
        
        let participantData = null;
        participantsSnap.forEach(doc => {
            const data = doc.data();
            if (data.playerId === currentChangeScoreData.playerId) {
                participantData = { id: doc.id, ...data };
            }
        });
        
        if (!participantData) {
            showToast('Player did not participate in this round.', 'warning');
            eventsContainer.style.display = 'none';
            return;
        }
        
        // Store selected round data
        currentChangeScoreData.selectedRound = {
            roundId,
            roundNumber: round.roundNumber,
            participantId: participantData.id,
            roundData: round
        };
        
        // Display score events
        displayPlayerScoreEvents();
        eventsContainer.style.display = 'block';
        
    } catch (error) {
        console.error('Error loading round data:', error);
        showToast('Error loading round data: ' + error.message, 'error');
    }
});

// Display player's score events for selected round
async function displayPlayerScoreEvents() {
    if (!currentChangeScoreData?.selectedRound) return;
    
    const { roundId, participantId, roundNumber, roundData } = currentChangeScoreData.selectedRound;
    
    try {
        // Get fresh participant data
        const participantRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants', participantId);
        const participantDoc = await getDoc(participantRef);
        
        if (!participantDoc.exists()) return;
        
        const participantData = participantDoc.data();
        const scoreEvents = participantData.scoreEvents || [];
        
        // Get round start time for display
        const roundStartTime = roundData.startedAt ? roundData.startedAt.toDate() : null;
        
        let eventsHTML = '';
        if (scoreEvents.length === 0) {
            eventsHTML = '<p style="color: #9ca3af; font-size: 13px; padding: 20px; text-align: center;">No score events for this round.</p>';
        } else {
            // Sort events chronologically
            const sortedEvents = [...scoreEvents].map((event, index) => ({ ...event, originalIndex: index }))
                .sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            let runningTotal = 0;
            
            eventsHTML = sortedEvents.map(event => {
                const eventDate = new Date(event.timestamp.toDate());
                const clockTime = eventDate.toLocaleTimeString();
                
                // Calculate offset from round start
                let offsetStr = '';
                if (roundStartTime) {
                    const offsetMs = eventDate - roundStartTime;
                    const offsetMin = Math.floor(offsetMs / 60000);
                    const offsetSec = Math.floor((offsetMs % 60000) / 1000);
                    offsetStr = `+${offsetMin}m ${offsetSec}s`;
                }
                
                const delta = event.delta || 1;
                runningTotal += delta;
                
                const deltaColor = delta > 0 ? '#10b981' : '#ef4444';
                const deltaText = delta > 0 ? '+1' : '-1';
                
                return `
                    <div style="display: flex; justify-content: space-between; align-items: center; padding: 10px; border-bottom: 1px solid #f3f4f6;">
                        <div style="flex: 1; font-size: 13px;">
                            <span style="color: #667eea; font-weight: 600;">${offsetStr}</span>
                            <span style="color: #9ca3af; font-size: 11px;">(${clockTime})</span>
                            <span style="color: ${deltaColor}; font-weight: bold; margin-left: 10px;">${deltaText}</span>
                            <span style="color: #9ca3af; font-size: 12px;">(Total: ${runningTotal})</span>
                        </div>
                        <button class="btn btn-small btn-secondary" onclick="deletePlayerScoreEvent('${roundId}', '${participantId}', ${event.originalIndex})" style="padding: 4px 8px; font-size: 11px; background: #ef4444;">Delete</button>
                    </div>
                `;
            }).join('');
        }
        
        document.getElementById('changeScoreEventsList').innerHTML = eventsHTML;
        
    } catch (error) {
        console.error('Error displaying score events:', error);
    }
}

// Cancel change score
document.getElementById('cancelChangeScoreBtn').addEventListener('click', () => {
    document.getElementById('changeScoreModal').classList.add('hidden');
    currentChangeScoreData = null;
});

// Add score event button handler
document.getElementById('addScoreEventBtn').addEventListener('click', async () => {
    if (!currentChangeScoreData?.selectedRound) return;
    
    const { roundId, participantId } = currentChangeScoreData.selectedRound;
    
    // Reuse the addWinToTable logic but for a specific player
    await addScoreEventToPlayer(roundId, participantId);
});

// Add score event to a specific player
window.addScoreEventToPlayer = async function(roundId, participantId) {
    if (!currentTournamentId) return;
    
    try {
        // Get round data
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId);
        const roundDoc = await getDoc(roundRef);
        const roundData = roundDoc.data();
        const roundStartTime = roundData.startedAt ? roundData.startedAt.toDate() : null;
        const roundDurationMin = roundData.timerDuration || 30;
        
        if (!roundStartTime) {
            showToast('Round has not started yet!', 'error');
            return;
        }
        
        // Get participant data
        const participantRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants', participantId);
        const participantDoc = await getDoc(participantRef);
        const participantData = participantDoc.data();
        const playerName = participantData.name;
        
        // Prompt for score delta (+1 or -1)
        const deltaStr = prompt(
            `Add score event for ${playerName}\n\n` +
            `Enter +1 to add a win or -1 to subtract a win:`,
            '+1'
        );
        
        if (!deltaStr) return;
        
        const delta = parseInt(deltaStr);
        if (delta !== 1 && delta !== -1) {
            showToast('Invalid input! Enter +1 or -1 only.', 'error');
            return;
        }
        
        // Prompt for offset
        const now = new Date();
        const currentOffsetMs = now - roundStartTime;
        const currentOffsetMin = Math.max(0, Math.min(currentOffsetMs / 60000, roundDurationMin));
        
        const promptAction = delta > 0 ? 'add win' : 'subtract win';
        const offsetStr = prompt(
            `${promptAction.charAt(0).toUpperCase() + promptAction.slice(1)} for ${playerName}\n\n` +
            `Round started at: ${roundStartTime.toLocaleTimeString()}\n` +
            `Round duration: ${roundDurationMin} minutes\n\n` +
            `Enter time offset (minutes from round start, max ${roundDurationMin}):\n` +
            `Examples: "5" = 5 minutes, "5.5" = 5min 30sec`,
            currentOffsetMin.toFixed(1)
        );
        
        if (!offsetStr) return;
        
        const offsetMinutes = parseFloat(offsetStr);
        if (isNaN(offsetMinutes) || offsetMinutes < 0) {
            showToast('Invalid offset! Enter a positive number of minutes.', 'error');
            return;
        }
        
        if (offsetMinutes > roundDurationMin) {
            showToast(`Invalid offset! Cannot exceed round duration of ${roundDurationMin} minutes.`, 'error');
            return;
        }
        
        // Calculate timestamp
        const offsetMs = offsetMinutes * 60000;
        const newDate = new Date(roundStartTime.getTime() + offsetMs);
        const newTimestamp = Timestamp.fromDate(newDate);
        
        // Create score event
        const scoreEvent = {
            timestamp: newTimestamp,
            delta: delta,
            roundNumber: roundData.roundNumber, // CRITICAL: needed for round score calculations
            addedAt: Timestamp.now()
        };
        
        const playerId = participantData.playerId;
        const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
        
        // Update participant
        await updateDoc(participantRef, {
            wins: increment(delta),
            scoreEvents: arrayUnion(scoreEvent),
            lastWinAt: delta > 0 ? newTimestamp : participantData.lastWinAt
        });
        
        // Update player
        await updateDoc(playerRef, {
            wins: increment(delta),
            scoreEvents: arrayUnion(scoreEvent),
            lastWinAt: delta > 0 ? newTimestamp : (await getDoc(playerRef)).data().lastWinAt
        });
        
        showToast(`Score event added for ${playerName}!`, 'success');
        
        // Refresh display
        displayPlayerScoreEvents();
        
    } catch (error) {
        console.error('Error adding score event:', error);
        showToast('Error adding score event: ' + error.message, 'error');
    }
};

// Delete score event for a specific player
window.deletePlayerScoreEvent = async function(roundId, participantId, eventIndex) {
    if (!currentTournamentId) return;
    
    try {
        const participantRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants', participantId);
        const participantDoc = await getDoc(participantRef);
        const participantData = participantDoc.data();
        const scoreEvents = participantData.scoreEvents || [];
        
        if (eventIndex >= scoreEvents.length) {
            showToast('Score event not found!', 'error');
            return;
        }
        
        const eventToDelete = scoreEvents[eventIndex];
        const dateStr = new Date(eventToDelete.timestamp.toDate()).toLocaleString();
        const delta = eventToDelete.delta || 1;
        const deltaText = delta > 0 ? '+1' : '-1';
        
        if (!confirm(`Delete ${deltaText} score event?\n\nTimestamp: ${dateStr}\n\nThis will adjust total wins by ${-delta}.`)) {
            return;
        }
        
        // Remove from participant scoreEvents
        const updatedScoreEvents = scoreEvents.filter((_, index) => index !== eventIndex);
        
        const participantUpdates = {
            wins: increment(-delta),
            scoreEvents: updatedScoreEvents
        };
        
        // Update lastWinAt if needed
        if (delta > 0) {
            const remainingWins = updatedScoreEvents.filter(e => e.delta > 0);
            if (remainingWins.length > 0) {
                const sortedWins = [...remainingWins].sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
                participantUpdates.lastWinAt = sortedWins[0].timestamp;
            } else {
                participantUpdates.lastWinAt = null;
            }
        }
        
        await updateDoc(participantRef, participantUpdates);
        
        // Update player document
        const playerId = participantData.playerId;
        const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
        const playerDoc = await getDoc(playerRef);
        const playerData = playerDoc.data();
        const playerScoreEvents = playerData.scoreEvents || [];
        
        // Remove matching event from player
        const updatedPlayerScoreEvents = playerScoreEvents.filter(event => 
            event.timestamp.toMillis() !== eventToDelete.timestamp.toMillis()
        );
        
        const playerUpdates = {
            wins: increment(-delta),
            scoreEvents: updatedPlayerScoreEvents
        };
        
        if (delta > 0) {
            const remainingWins = updatedPlayerScoreEvents.filter(e => e.delta > 0);
            if (remainingWins.length > 0) {
                const sortedWins = [...remainingWins].sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
                playerUpdates.lastWinAt = sortedWins[0].timestamp;
            } else {
                playerUpdates.lastWinAt = null;
            }
        }
        
        await updateDoc(playerRef, playerUpdates);
        
        showToast('Score event deleted!', 'success');
        
        // Refresh display
        displayPlayerScoreEvents();
        
    } catch (error) {
        console.error('Error deleting score event:', error);
        showToast('Error deleting event: ' + error.message, 'error');
    }
};

window.deletePlayer = async function(playerId) {
    const player = playersData[playerId];
    
    // Get tournament data for round check
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const tournamentData = tournamentDoc.data();
    const roundInProgress = tournamentData.roundInProgress || false;
    const currentRound = tournamentData.currentRound || 0;
    
    // Build confirmation message
    let confirmMsg = `<p>Delete <strong>${player.name}</strong>?</p>`;
    
    if (player.tableId) {
        confirmMsg += `<p style="margin-top: 10px;">This will remove them from Table ${tablesData[player.tableId]?.tableNumber || '?'}.</p>`;
    }
    
    if (roundInProgress) {
        confirmMsg += `<p style="margin-top: 10px; color: #f59e0b; font-weight: bold;">⚠️ Round ${currentRound} is in progress. Deleting this player will affect the current round.</p>`;
    }
    
    if (player.wins > 0) {
        confirmMsg += `<p style="margin-top: 10px;">They have ${player.wins} win(s) recorded.</p>`;
    }
    
    showConfirmAction(
        'Delete Player',
        confirmMsg,
        async () => {
    try {
        // If player is assigned to a table, remove them from it
        if (player.tableId) {
            const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', player.tableId);
            const tableDoc = await getDoc(tableRef);
            if (tableDoc.exists()) {
                const tableData = tableDoc.data();
                const updatedPlayers = tableData.players.filter(id => id !== playerId);
                const updatedPositions = { ...tableData.positions };
                        
                        // Delete position by finding which position this player occupied
                        for (const [position, pId] of Object.entries(tableData.positions || {})) {
                            if (pId === playerId) {
                                delete updatedPositions[position];
                            }
                        }
                
                await updateDoc(tableRef, {
                    players: updatedPlayers,
                    positions: updatedPositions
                });
            }
        }
        
        await deleteDoc(doc(db, 'tournaments', currentTournamentId, 'players', playerId));
                showToast(`${player.name} deleted successfully.`, 'success');
    } catch (error) {
        console.error('Error deleting player:', error);
                showToast('Error deleting player: ' + error.message, 'error');
    }
        }
    );
};

// Tables Management
function setupTablesListener() {
    if (unsubscribeTables) unsubscribeTables();
    
    const tablesRef = collection(db, 'tournaments', currentTournamentId, 'tables');
    unsubscribeTables = onSnapshot(tablesRef, (snapshot) => {
        tablesData = {};
        snapshot.forEach((doc) => {
            tablesData[doc.id] = { id: doc.id, ...doc.data() };
        });
        displayTables();
        displayPlayers(); // Refresh to show updated assignments
        updateTableMap(); // Update map visualization
    });
}

// Rounds Management - Real-time listener for multiplier changes
function setupRoundsListener() {
    if (unsubscribeRounds) unsubscribeRounds();
    
    const roundsRef = collection(db, 'tournaments', currentTournamentId, 'rounds');
    unsubscribeRounds = onSnapshot(roundsRef, async (snapshot) => {
        // When rounds change (especially multipliers), refresh player stats table
        // The displayPlayerStatsTable function will recalculate all scores with new multipliers
        if (Object.keys(playersData).length > 0) {
            const allPlayers = Object.values(playersData);
            await displayPlayerStatsTable(allPlayers);
        }
        
        // Also refresh the rounds history display to show updated multipliers
        loadRoundsHistory();
    });
}

function displayTables() {
    const tables = Object.values(tablesData).sort((a, b) => a.tableNumber - b.tableNumber);
    tableCount.textContent = tables.length;
    
    if (tables.length === 0) {
        tablesList.innerHTML = '<div class="empty-message">No tables created yet. Add players first, then create tables or auto-assign.</div>';
        return;
    }
    
    tablesList.innerHTML = tables.map(table => {
        const isActive = table.active !== false;
        const playerCount = table.players ? table.players.length : 0;
        const positions = ['East', 'South', 'West', 'North'];
        const seats = positions.map(position => {
            const playerId = table.positions?.[position];
            const playerName = playerId ? playersData[playerId]?.name || 'Unknown' : '';
            const seatClass = playerName ? '' : 'seat-empty';
            const displayName = playerName || 'Empty';
            
            return `
                <div class="table-seat" onclick="openSeatAssignment('${table.id}', ${table.tableNumber}, '${position}')" style="cursor: pointer;">
                    <div class="seat-position">${position} (${getWindSymbol(position)})</div>
                    <div class="seat-player ${seatClass}">${displayName}</div>
                </div>
            `;
        }).join('');
        
        // Status badge based on active state and player count
        let statusBadge;
        let cardStyle = '';
        
        if (!isActive) {
            statusBadge = '<span style="color: #94a3b8; font-size: 12px; font-weight: bold;">🚫 Inactive</span>';
            cardStyle = 'opacity: 0.6; border: 2px dashed #94a3b8;';
        } else if (playerCount === 4) {
            statusBadge = '<span style="color: #10b981; font-size: 12px; font-weight: bold;">✅ Full (4/4)</span>';
        } else if (playerCount > 0 && playerCount < 4) {
            statusBadge = `<span style="color: #f59e0b; font-size: 12px; font-weight: bold;">⚠️ Partial (${playerCount}/4)</span>`;
            cardStyle = 'border: 3px solid #f59e0b;';
        } else {
            statusBadge = '<span style="color: #6b7280; font-size: 12px; font-weight: bold;">⭕ Empty (0/4)</span>';
        }
        
        return `
            <div class="table-card" style="${cardStyle}">
                <div class="table-header">
                    <div class="table-number">
                        Table ${table.tableNumber}
                        <div style="margin-top: 5px;">${statusBadge}</div>
                    </div>
                    <div class="table-actions">
                        <button class="btn btn-small btn-secondary" onclick="toggleTableActiveFromList('${table.id}')">${isActive ? 'Deactivate' : 'Activate'}</button>
                        <button class="btn btn-small btn-danger" onclick="deleteTable('${table.id}')">Delete</button>
                    </div>
                </div>
                <div class="table-seats">
                    ${seats}
                </div>
            </div>
        `;
    }).join('');
}

// Toggle table active state from table list
window.toggleTableActiveFromList = async function(tableId) {
    try {
        const table = tablesData[tableId];
        const newActiveState = !(table.active !== false);
        
        // If deactivating a table with players, confirm first
        if (!newActiveState && table.players && table.players.length > 0) {
            const playerNames = table.players.map(pid => playersData[pid]?.name || 'Unknown').join(', ');
            
            showConfirmAction(
                'Deactivate Table',
                `<p>Deactivating this table will unassign <strong>${table.players.length}</strong> player(s):</p>` +
                `<p style="margin-top: 10px; padding: 10px; background: #f3f4f6; border-radius: 6px; font-size: 13px;">${playerNames}</p>` +
                `<p style="margin-top: 10px;">Continue?</p>`,
                async () => {
                    try {
                        // Use batch write for efficiency
                        const batch = writeBatch(db);
                        
                        // Batch: Unassign all players
                        for (const playerId of table.players) {
                            const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
                            batch.update(playerRef, {
                                tableId: null,
                                position: null
                            });
                        }
                        
                        // Batch: Clear table's player list and deactivate
                        const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', tableId);
                        batch.update(tableRef, {
                            active: newActiveState,
                            players: [],
                            positions: {}
                        });
                        
                        await batch.commit();
                        showToast('Table deactivated and players unassigned.', 'success');
                    } catch (error) {
                        console.error('Error deactivating table:', error);
                        showToast('Error deactivating table: ' + error.message, 'error');
                    }
                }
            );
        return;
    }
    
        // Just toggle active state
        await updateDoc(doc(db, 'tournaments', currentTournamentId, 'tables', tableId), {
            active: newActiveState
        });
        showToast(`Table ${newActiveState ? 'activated' : 'deactivated'}.`, 'success');
    } catch (error) {
        console.error('Error toggling table active state:', error);
        showToast('Error updating table: ' + error.message, 'error');
    }
};

function getWindSymbol(position) {
    const symbols = { East: '東', South: '南', West: '西', North: '北' };
    return symbols[position] || '';
}

// Delete table function (called from table list)
window.deleteTable = async function(tableId) {
    const table = tablesData[tableId];
    const tableNumber = table?.tableNumber || '?';
    const playerCount = table?.players?.length || 0;
    
    let message = `<p>Delete Table ${tableNumber}?</p>`;
    if (playerCount > 0) {
        message += `<p style="margin-top: 10px; color: #f59e0b;"><strong>${playerCount}</strong> player(s) will be unassigned.</p>`;
    }
    
    showConfirmAction(
        'Delete Table',
        message,
        async () => {
            try {
                // Use batch write for efficiency
                const batch = writeBatch(db);
                
                // Batch: Unassign all players
        for (const playerId of table.players || []) {
                    const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
                    batch.update(playerRef, {
                tableId: null,
                position: null
            });
        }
        
                // Batch: Delete the table
                const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', tableId);
                batch.delete(tableRef);
                
                await batch.commit();
                showToast(`Table ${tableNumber} deleted.`, 'success');
    } catch (error) {
        console.error('Error deleting table:', error);
                showToast('Error deleting table: ' + error.message, 'error');
    }
        }
    );
};

// Auto-Assign Players to Tables
// Auto-Assign Players Modal
document.getElementById('autoAssignBtn').addEventListener('click', () => {
    const unassignedPlayers = Object.values(playersData).filter(p => !p.tableId && !p.eliminated);
    
    if (unassignedPlayers.length === 0) {
        showToast('No unassigned, active players!', 'warning');
        return;
    }
    
    if (unassignedPlayers.length < 4) {
        showToast(`Only ${unassignedPlayers.length} unassigned players. Need at least 4 to assign to a table.`, 'warning');
        return;
    }
    
    // Display modal
    const modal = document.getElementById('autoAssignModal');
    const info = document.getElementById('autoAssignInfo');
    const tableList = document.getElementById('tableSelectionList');
    const validation = document.getElementById('assignmentValidation');
    const confirmBtn = document.getElementById('confirmAutoAssignBtn');
    const algorithmSelect = document.getElementById('assignmentAlgorithm');
    const algorithmDesc = document.getElementById('algorithmDescription');
    const rankingOption = document.getElementById('rankingOption');
    const roundRobinOption = document.getElementById('roundRobinOption');
    
    info.textContent = `Unassigned players: ${unassignedPlayers.length}`;
    
    // Check current round to enable/disable ranking algorithms
    const currentRound = currentTournamentData?.currentRound || 0;
    const isRound1OrBefore = currentRound <= 1;
    
    if (isRound1OrBefore) {
        // Disable ranking algorithms for round 1
        rankingOption.disabled = true;
        roundRobinOption.disabled = true;
        rankingOption.textContent = '🏆 By Ranking - Not available (Round 1 - no rankings yet)';
        roundRobinOption.textContent = '🔄 Round Robin - Not available (Round 1 - no rankings yet)';
        algorithmSelect.value = 'random'; // Force random
    } else {
        // Enable ranking algorithms after round 1
        rankingOption.disabled = false;
        roundRobinOption.disabled = false;
        rankingOption.textContent = '🏆 By Ranking - Top 4 in table 1, next 4 in table 2, etc.';
        roundRobinOption.textContent = '🔄 Round Robin - Distribute ranks evenly across tables';
    }
    
    // Update algorithm description when selection changes
    algorithmSelect.addEventListener('change', () => {
        const algo = algorithmSelect.value;
        if (algo === 'random') {
            algorithmDesc.innerHTML = 'Randomly shuffles all unassigned players before assigning to tables.';
        } else if (algo === 'ranking') {
            algorithmDesc.innerHTML = '<strong>Groups players by rank.</strong> Best 4 players at table 1, next best 4 at table 2, etc. <em>Useful for seeding strong players together.</em>';
        } else if (algo === 'round_robin') {
            algorithmDesc.innerHTML = '<strong>Distributes ranks evenly.</strong> Places rank 1, 5, 9, 13 at table 1; rank 2, 6, 10, 14 at table 2, etc. <em>Balances skill levels across tables.</em>';
        }
    });
    
    // Trigger initial description
    algorithmSelect.dispatchEvent(new Event('change'));
    
    // Get all tables, sorted by number
    const allTables = Object.values(tablesData).sort((a, b) => a.tableNumber - b.tableNumber);
    const activeTables = allTables.filter(t => t.active !== false);
    const inactiveTables = allTables.filter(t => t.active === false);
    
    // Render table checkboxes
    let html = '';
    
    if (activeTables.length > 0) {
        html += '<div style="margin-bottom: 10px; font-weight: bold; color: #374151;">Active Tables:</div>';
        html += activeTables.map(table => {
            const playerCount = table.players ? table.players.length : 0;
            return `
                <label style="display: flex !important; align-items: center; justify-content: flex-start; gap: 10px; padding: 8px 12px; margin: 3px 0; background: white; border: 1px solid #10b981; border-radius: 4px; cursor: pointer;">
                    <input type="checkbox" class="table-checkbox" data-table-id="${table.id}" style="width: auto !important; margin: 0;">
                    <span style="flex: 1; text-align: left;">Table ${table.tableNumber} (${playerCount}/4 players)</span>
                </label>
            `;
        }).join('');
    }
    
    if (inactiveTables.length > 0) {
        html += '<div style="margin: 20px 0 10px; font-weight: bold; color: #6b7280;">Inactive Tables:</div>';
        html += inactiveTables.map(table => {
            const playerCount = table.players ? table.players.length : 0;
            return `
                <label style="display: flex !important; align-items: center; justify-content: flex-start; gap: 10px; padding: 8px 12px; margin: 3px 0; background: #f9fafb; border: 1px dashed #94a3b8; border-radius: 4px; cursor: pointer; opacity: 0.6;">
                    <input type="checkbox" class="table-checkbox" data-table-id="${table.id}" style="width: auto !important; margin: 0;">
                    <span style="color: #94a3b8; flex: 1; text-align: left;">Table ${table.tableNumber} (${playerCount}/4 players) - Inactive</span>
                </label>
            `;
        }).join('');
    }
    
    tableList.innerHTML = html;
    
    // Validation on checkbox change
    const checkboxes = tableList.querySelectorAll('.table-checkbox');
    const validateSelection = () => {
        const selectedTables = Array.from(checkboxes).filter(cb => cb.checked);
        const requiredPlayers = selectedTables.length * 4;
        
        if (selectedTables.length === 0) {
            validation.innerHTML = '<span style="color: #6b7280;">Select tables to assign players to.</span>';
            confirmBtn.disabled = true;
        } else if (requiredPlayers === unassignedPlayers.length) {
            validation.innerHTML = `<span style="color: #10b981;">✅ Perfect match! ${selectedTables.length} table(s) × 4 = ${requiredPlayers} players</span>`;
            confirmBtn.disabled = false;
        } else if (requiredPlayers > unassignedPlayers.length) {
            validation.innerHTML = `<span style="color: #ef4444;">❌ Not enough players: ${requiredPlayers} needed, ${unassignedPlayers.length} available</span>`;
            confirmBtn.disabled = true;
        } else {
            validation.innerHTML = `<span style="color: #f59e0b;">⚠️ ${unassignedPlayers.length - requiredPlayers} player(s) will remain unassigned</span>`;
            confirmBtn.disabled = true;
        }
    };
    
    checkboxes.forEach(cb => cb.addEventListener('change', validateSelection));
    validateSelection();
    
    // "Use First Tables" button handler
    document.getElementById('useFirstTablesBtn').onclick = () => {
        const tablesNeeded = Math.floor(unassignedPlayers.length / 4);
        
        if (tablesNeeded === 0) {
            showToast('Not enough players to fill even one table.', 'warning');
            return;
        }
        
        // Get active tables sorted by table number
        const sortedActiveTables = activeTables.slice().sort((a, b) => a.tableNumber - b.tableNumber);
        
        if (sortedActiveTables.length < tablesNeeded) {
            showToast(`Need ${tablesNeeded} table(s) but only ${sortedActiveTables.length} active table(s) available.\n\nPlease create more tables or activate existing ones.`, 'warning');
            return;
        }
        
        // Uncheck all first
        checkboxes.forEach(cb => cb.checked = false);
        
        // Check the first N tables
        const firstNTables = sortedActiveTables.slice(0, tablesNeeded);
        const firstNTableIds = new Set(firstNTables.map(t => t.id));
        
        checkboxes.forEach(cb => {
            const tableId = cb.getAttribute('data-table-id');
            if (firstNTableIds.has(tableId)) {
                cb.checked = true;
            }
        });
        
        validateSelection();
    };
    
    modal.classList.remove('hidden');
});

document.getElementById('cancelAutoAssignBtn').addEventListener('click', () => {
    document.getElementById('autoAssignModal').classList.add('hidden');
});

document.getElementById('confirmAutoAssignBtn').addEventListener('click', async () => {
    const modal = document.getElementById('autoAssignModal');
    const checkboxes = document.querySelectorAll('.table-checkbox:checked');
    const selectedTableIds = Array.from(checkboxes).map(cb => cb.dataset.tableId);
    const algorithmSelect = document.getElementById('assignmentAlgorithm');
    const selectedAlgorithm = algorithmSelect.value;
    
    if (selectedTableIds.length === 0) return;
    
    const unassignedPlayers = Object.values(playersData).filter(p => !p.tableId && !p.eliminated);
    
    // Use selected algorithm to assign players to table groups
    const tableAssignments = assignPlayersByAlgorithm(unassignedPlayers, selectedAlgorithm);
    const positions = ['East', 'South', 'West', 'North'];
    
    const algorithmNames = {
        random: 'Random',
        ranking: 'By Ranking',
        round_robin: 'Round Robin'
    };
        
    try {
        modal.classList.add('hidden');
        
        // Use batch write for efficiency - single network call
        const batch = writeBatch(db);
        
        for (let i = 0; i < selectedTableIds.length && i < tableAssignments.length; i++) {
            const tableId = selectedTableIds[i];
            const tablePlayers = tableAssignments[i];
            
            const playerIds = tablePlayers.map(p => p.id);
            const positionsMap = {};
            tablePlayers.forEach((player, idx) => {
                positionsMap[positions[idx]] = player.id; // { East: playerId, South: playerId, ... }
            });
            
            // Batch: Update table
            const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', tableId);
            batch.update(tableRef, {
                players: playerIds,
                positions: positionsMap
            });
            
            // Batch: Update all players
            for (let j = 0; j < tablePlayers.length; j++) {
                const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', tablePlayers[j].id);
                batch.update(playerRef, {
                    tableId,
                    position: positions[j]
                });
            }
        }
        
        // Commit all updates in a single network call
        await batch.commit();
        
        const algoName = algorithmNames[selectedAlgorithm] || selectedAlgorithm;
        showToast(`Assigned ${selectedTableIds.length * 4} players to ${selectedTableIds.length} table(s) using ${algoName} algorithm!`, 'success');
    } catch (error) {
        console.error('Error auto-assigning:', error);
        showToast('Error auto-assigning: ' + error.message, 'error');
    }
});

// Bulk Unassign All Players
document.getElementById('bulkUnassignBtn').addEventListener('click', () => {
    const assignedPlayers = Object.values(playersData).filter(p => p.tableId);
    
    if (assignedPlayers.length === 0) {
        showToast('No players are currently assigned to tables.', 'info');
        return;
    }
    
    const assignedTables = Object.values(tablesData).filter(t => t.players && t.players.length > 0);
    
    showConfirmAction(
        'Unassign All Players',
        `<p>Unassign all players from all tables?</p>` +
        `<p style="margin-top: 10px;"><strong>${assignedPlayers.length}</strong> player(s) will be unassigned from <strong>${assignedTables.length}</strong> table(s).</p>` +
        `<p style="margin-top: 10px; color: #6b7280;">Tables will remain but will be empty.</p>`,
        async () => {
            try {
                // Use batch write for efficiency
                const batch = writeBatch(db);
                
                // Clear all player assignments
                assignedPlayers.forEach(player => {
                    const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
                    batch.update(playerRef, {
                        tableId: null,
                        position: null
                    });
                });
                
                // Clear all table assignments
                assignedTables.forEach(table => {
                    const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', table.id);
                    batch.update(tableRef, {
                        players: [],
                        positions: {}
                    });
                });
                
                await batch.commit();
                
                showToast(`Unassigned ${assignedPlayers.length} player(s) from ${assignedTables.length} table(s).`, 'success');
            } catch (error) {
                console.error('Error bulk unassigning:', error);
                showToast('Error unassigning players: ' + error.message, 'error');
            }
        }
    );
});

// Export Tournament to JSON
document.getElementById('exportTournamentBtn').addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    try {
        showToast('Exporting tournament data...', 'info');
        
        // Get tournament document
        const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
        const tournamentData = { id: currentTournamentId, ...tournamentDoc.data() };
        
        // Convert Firestore timestamps to ISO strings for JSON
        if (tournamentData.createdAt) {
            tournamentData.createdAt = tournamentData.createdAt.toDate().toISOString();
        }
        
        // Get all players
        const playersSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'players'));
        const players = [];
        playersSnap.forEach(doc => {
            const playerData = { id: doc.id, ...doc.data() };
            // Convert timestamps
            if (playerData.lastWinAt) {
                playerData.lastWinAt = playerData.lastWinAt.toDate().toISOString();
            }
            players.push(playerData);
        });
        
        // Get all tables
        const tablesSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'tables'));
        const tables = [];
        tablesSnap.forEach(doc => {
            tables.push({ id: doc.id, ...doc.data() });
        });
        
        // Get all rounds with their participants
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        const rounds = [];
        for (const roundDoc of roundsSnap.docs) {
            const roundData = { id: roundDoc.id, ...roundDoc.data() };
            
            // Convert timestamps
            if (roundData.startedAt) {
                roundData.startedAt = roundData.startedAt.toDate().toISOString();
            }
            if (roundData.endedAt) {
                roundData.endedAt = roundData.endedAt.toDate().toISOString();
            }
            if (roundData.createdAt) {
                roundData.createdAt = roundData.createdAt.toDate().toISOString();
            }
            
            // Get participants for this round
            const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundDoc.id, 'participants'));
            const participants = [];
            participantsSnap.forEach(pDoc => {
                const pData = { id: pDoc.id, ...pDoc.data() };
                // Convert timestamps
                if (pData.snapshotAt) {
                    pData.snapshotAt = pData.snapshotAt.toDate().toISOString();
                }
                participants.push(pData);
            });
            
            roundData.participants = participants;
            rounds.push(roundData);
        }
        
        // Sort rounds by roundNumber
        rounds.sort((a, b) => (a.roundNumber || 0) - (b.roundNumber || 0));
        
        // Build complete export object
        const exportData = {
            exportedAt: new Date().toISOString(),
            exportVersion: '1.0',
            tournament: tournamentData,
            players: players,
            tables: tables,
            rounds: rounds
        };
        
        // Create JSON blob and download
        const jsonStr = JSON.stringify(exportData, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        const filename = `${tournamentData.name.replace(/[^a-z0-9]/gi, '_')}_${new Date().toISOString().split('T')[0]}.json`;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        showToast(`Tournament data exported to ${filename}`, 'success');
    } catch (error) {
        console.error('Error exporting tournament:', error);
        showToast('Error exporting tournament: ' + error.message, 'error');
    }
});

// Archive/Reactivate Tournament
archiveTournamentBtn.addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const tournamentData = tournamentDoc.data();
    
    const isCompleted = tournamentData.status === 'completed';
    const newStatus = isCompleted ? 'active' : 'completed';
    const action = isCompleted ? 'Reactivate' : 'Archive';
    
    showConfirmAction(
        `${action} Tournament`,
        `<p>${action} <strong>"${tournamentData.name}"</strong>?</p>` +
        `<p style="margin-top: 10px; color: #6b7280;">This will change status to <strong>${newStatus}</strong>.</p>`,
        async () => {
    try {
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            status: newStatus
        });
        
                showToast(`Tournament ${action.toLowerCase()}d successfully!`, 'success');
        await loadTournaments();
        selectTournament(currentTournamentId); // Refresh to update button
    } catch (error) {
        console.error(`Error ${action.toLowerCase()}ing tournament:`, error);
                showToast(`Error ${action.toLowerCase()}ing tournament: ` + error.message, 'error');
    }
        }
    );
});

// Delete Tournament
deleteTournamentBtn.addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const tournamentData = tournamentDoc.data();
    
    const message = `<p style="color: #ef4444; font-weight: bold;">⚠️ WARNING: Delete "${tournamentData.name}"?</p>` +
        `<p style="margin-top: 15px;">This will permanently delete:</p>` +
        `<ul style="margin-top: 10px; padding-left: 20px; line-height: 1.8; color: #374151;">` +
        `<li>The tournament</li>` +
        `<li>All ${Object.keys(playersData).length} players</li>` +
        `<li>All ${Object.keys(tablesData).length} tables</li>` +
        `<li>All game data</li>` +
        `</ul>`;
    
    showTypeToConfirm(
        'Delete Tournament',
        message,
        'DELETE',
        async () => {
            try {
                showToast('Deleting tournament...', 'info');
                
        // Delete all subcollections first
        
        // Delete all players
        const playersSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'players'));
        const deletePlayerPromises = playersSnap.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deletePlayerPromises);
        
        // Delete all tables
        const tablesSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'tables'));
        const deleteTablePromises = tablesSnap.docs.map(doc => deleteDoc(doc.ref));
        await Promise.all(deleteTablePromises);
        
        // Delete all rounds (if any)
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
                for (const roundDoc of roundsSnap.docs) {
                    // Delete participants first
                    const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundDoc.id, 'participants'));
                    const deleteParticipantPromises = participantsSnap.docs.map(pDoc => deleteDoc(pDoc.ref));
                    await Promise.all(deleteParticipantPromises);
                    
                    // Then delete round
                    await deleteDoc(roundDoc.ref);
                }
        
        // Finally delete the tournament itself
        await deleteDoc(doc(db, 'tournaments', currentTournamentId));
        
                showToast('Tournament deleted successfully!', 'success');
        
        // Reload tournaments and clear selection
        currentTournamentId = null;
        await loadTournaments();
        tournamentSelect.value = '';
        deselectTournament();
    } catch (error) {
        console.error('Error deleting tournament:', error);
                showToast('Error deleting tournament: ' + error.message, 'error');
            }
        }
    );
});

// Format time helper
function formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// Update admin timer display
function updateAdminTimerDisplay() {
    if (!currentRoundData || !currentRoundData.startedAt) {
        document.getElementById('roundTimerDisplay').style.display = 'none';
        return;
    }
    
    const timerDuration = currentRoundData.timerDuration || 0; // in minutes
    const totalSeconds = timerDuration * 60;
    
    // Calculate elapsed time
    const startTime = currentRoundData.startedAt.toMillis();
    const now = Date.now();
    const elapsedSeconds = Math.floor((now - startTime) / 1000);
    const remainingSeconds = Math.max(0, totalSeconds - elapsedSeconds);
    
    const timerEl = document.getElementById('adminRoundTimer');
    const warningEl = document.getElementById('adminTimerWarning');
    const displayEl = document.getElementById('roundTimerDisplay');
    
    timerEl.textContent = formatTime(remainingSeconds);
    displayEl.style.display = 'block';
    
    // Apply warning styling
    const percentRemaining = remainingSeconds / totalSeconds;
    
    if (remainingSeconds === 0) {
        timerEl.style.color = '#dc2626';
        warningEl.textContent = '⏰ TIME UP!';
        warningEl.style.color = '#dc2626';
    } else if (percentRemaining <= 0.1) {
        timerEl.style.color = '#dc2626';
        warningEl.textContent = '🚨 Less than 10% time remaining';
        warningEl.style.color = '#dc2626';
    } else if (percentRemaining <= 0.25) {
        timerEl.style.color = '#f59e0b';
        warningEl.textContent = '⚠️ Less than 25% time remaining';
        warningEl.style.color = '#f59e0b';
    } else {
        timerEl.style.color = '#1e40af';
        warningEl.textContent = '';
    }
}

// Start admin timer
function startAdminTimer() {
    // Clear existing intervals
    if (adminTimerInterval) clearInterval(adminTimerInterval);
    if (adminServerSyncInterval) clearInterval(adminServerSyncInterval);
    
    // Update timer immediately
    updateAdminTimerDisplay();
    
    // Update timer every second
    adminTimerInterval = setInterval(() => {
        updateAdminTimerDisplay();
    }, 1000);
    
    // Set up real-time listener for round changes
    if (currentRoundData && currentTournamentId) {
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', currentRoundData.id);
        
        // Real-time listener - updates if another admin changes timer or ends round
        adminServerSyncInterval = onSnapshot(roundRef, (snapshot) => {
            if (snapshot.exists() && currentRoundData) {
                const freshData = snapshot.data();
                
                // Update startedAt and timerDuration
                if (freshData.startedAt) {
                    currentRoundData.startedAt = freshData.startedAt;
                }
                if (freshData.timerDuration !== undefined) {
                    currentRoundData.timerDuration = freshData.timerDuration;
                }
                
                // Check if round ended
                if (freshData.status === 'completed') {
                    clearInterval(adminTimerInterval);
                    if (adminServerSyncInterval && typeof adminServerSyncInterval === 'function') {
                        adminServerSyncInterval(); // Unsubscribe
                    }
                    document.getElementById('roundTimerDisplay').style.display = 'none';
                }
                
                // Update timer display with fresh data
                updateAdminTimerDisplay();
            }
        }, (error) => {
            console.error('Error in round listener:', error);
        });
    }
}

// Stop admin timer
function stopAdminTimer() {
    if (adminTimerInterval) {
        clearInterval(adminTimerInterval);
        adminTimerInterval = null;
    }
    if (adminServerSyncInterval) {
        // adminServerSyncInterval is now an unsubscribe function from onSnapshot
        if (typeof adminServerSyncInterval === 'function') {
            adminServerSyncInterval(); // Unsubscribe
        }
        adminServerSyncInterval = null;
    }
    document.getElementById('roundTimerDisplay').style.display = 'none';
}

// Display round information
async function displayRoundInfo(data) {
    const currentRound = data.currentRound || 0;
    const roundInProgress = data.roundInProgress || false;
    const type = data.type || 'standard';
    const totalRounds = data.totalRounds || 0;
    
    let typeInfoHTML = '';
    if (type === 'cutline' && totalRounds > 0) {
        const activePlayers = Object.values(playersData).filter(p => !p.eliminated).length;
        const cutPerRound = Math.floor(activePlayers / totalRounds);
        typeInfoHTML = `
            <div class="info-item">
                <div class="info-label">Tournament Type</div>
                <div class="info-value" style="color: #ef4444; font-weight: bold;">Cut Line (${totalRounds} rounds)</div>
            </div>
            <div class="info-item">
                <div class="info-label">Active Players</div>
                <div class="info-value">${activePlayers}</div>
            </div>
        `;
    }
    
    if (currentRound === 0) {
        roundInfo.innerHTML = `
            ${typeInfoHTML}
            <div class="info-item" style="text-align: center;">
                <div class="info-label">Status</div>
                <div class="info-value" style="color: #6b7280;">No rounds started yet</div>
            </div>
        `;
        moveToNextRoundBtn.style.display = 'inline-block';
        moveToNextRoundBtn.textContent = 'Move to Round 1';
        startRoundBtn.style.display = 'none';
        endRoundBtn.style.display = 'none';
        createPlayoffBtnMain.style.display = 'none';
        completeTournamentBtn.style.display = 'none';
        document.getElementById('roundParticipantsSection').style.display = 'none';
    } else {
        // Fetch actual round status from database
        let roundStatus = 'staging'; // Default to staging
        currentRoundData = null;
        
        if (currentRound > 0) {
            // Find the current round document to get its actual status
            const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
            for (const roundDoc of roundsSnap.docs) {
                const roundData = roundDoc.data();
                if (roundData.roundNumber === currentRound) {
                    roundStatus = roundData.status || 'staging';
                    currentRoundData = { id: roundDoc.id, ...roundData };
                    break;
                }
            }
        }
        
        // Determine status text and badge
        let statusText = 'Staging';
        let statusClass = 'status-staging';
        
        if (roundStatus === 'in_progress') {
            statusText = 'In Progress';
            statusClass = 'status-active';
        } else if (roundStatus === 'completed') {
            statusText = 'Completed';
            statusClass = 'status-completed';
        }
        
        const isPlayoff = currentRoundData?.isPlayoff || false;
        const playoffBadge = isPlayoff ? '<span style="background: #fbbf24; color: #92400e; padding: 4px 12px; border-radius: 6px; font-size: 14px; font-weight: bold; margin-left: 10px;">PLAYOFF</span>' : '';
        
        // Show editable timer and multiplier if round is in staging
        const timerDuration = currentRoundData?.timerDuration || 0;
        const scoreMultiplier = currentRoundData?.scoreMultiplier || 1;
        let timerInfoHTML = '';
        if (roundStatus === 'staging' && currentRoundData) {
            timerInfoHTML = `
                <div class="info-item">
                    <div class="info-label">Round Timer</div>
                    <div class="info-value">
                        <input 
                            type="number" 
                            id="editRoundTimer" 
                            value="${timerDuration}" 
                            min="1" 
                            max="120"
                            style="width: 80px; padding: 6px 10px; font-size: 16px; border: 2px solid #667eea; border-radius: 6px; text-align: center; font-weight: bold;"
                            onchange="updateRoundTimer(this.value, ${timerDuration})"
                        />
                        <span style="margin-left: 8px; color: #6b7280;">minutes</span>
                    </div>
                </div>
                <div class="info-item">
                    <div class="info-label">Score Multiplier</div>
                    <div class="info-value">
                        <input 
                            type="number" 
                            id="editScoreMultiplier" 
                            value="${scoreMultiplier}" 
                            min="1" 
                            max="10"
                            step="0.5"
                            style="width: 80px; padding: 6px 10px; font-size: 16px; border: 2px solid #f59e0b; border-radius: 6px; text-align: center; font-weight: bold;"
                            onchange="updateScoreMultiplier(this.value, ${scoreMultiplier})"
                        />
                        <span style="margin-left: 8px; color: #6b7280;">x</span>
                    </div>
                </div>
            `;
        } else if (currentRoundData) {
            // Show static display for in-progress or completed rounds
            timerInfoHTML = `
                <div class="info-item">
                    <div class="info-label">Round Timer</div>
                    <div class="info-value">${timerDuration} minutes</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Score Multiplier</div>
                    <div class="info-value" style="font-size: 24px; font-weight: bold; color: #f59e0b;">${scoreMultiplier}x</div>
                </div>
            `;
        }
        
        roundInfo.innerHTML = `
            ${typeInfoHTML}
            <div class="info-item">
                <div class="info-label">Current Round</div>
                <div class="info-value" style="font-size: 32px; color: #667eea;">Round ${currentRound}${totalRounds > 0 ? ` / ${totalRounds}` : ''} ${playoffBadge}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Status</div>
                <div class="info-value">
                    <span class="status-badge ${statusClass}">
                        ${statusText}
                    </span>
                </div>
            </div>
            ${timerInfoHTML}
        `;
        
        // Check if tournament is completed
        const tournamentCompleted = data.status === 'completed';
        
        // Button visibility logic
        if (roundStatus === 'staging') {
            // Round is staged but not started - show Start Round button
            const isPlayoffRound = currentRoundData?.isPlayoff || false;
            moveToNextRoundBtn.style.display = 'none';
            startRoundBtn.style.display = 'inline-block';
            startRoundBtn.textContent = isPlayoffRound ? `Start Playoff Round ${currentRound}` : `Start Round ${currentRound}`;
            endRoundBtn.style.display = 'none';
            addTimeBtn.style.display = 'none';
            createPlayoffBtnMain.style.display = 'none';
            completeTournamentBtn.style.display = 'none';
            stopAdminTimer();
            document.getElementById('roundParticipantsSection').style.display = 'none';
        } else if (roundStatus === 'in_progress') {
            // Round is actively being played - show End Round and Add Time buttons
            moveToNextRoundBtn.style.display = 'none';
            startRoundBtn.style.display = 'none';
            endRoundBtn.style.display = 'inline-block';
            addTimeBtn.style.display = 'inline-block';
            createPlayoffBtnMain.style.display = 'none';
            completeTournamentBtn.style.display = 'none';
            loadRoundParticipants(currentRound);
            
            // Start timer if round data is available
            if (currentRoundData && currentRoundData.startedAt) {
                startAdminTimer();
            }
        } else if (roundStatus === 'completed') {
            // Round is completed
            const isLastScheduledRound = totalRounds > 0 && currentRound >= totalRounds;
            const isPlayoffRound = currentRoundData?.isPlayoff || false;
            const remainingPlayers = Object.values(playersData).filter(p => !p.eliminated).length;
            
            // Show playoff button if:
            // 1. Last scheduled round completed, OR
            // 2. A playoff round just completed (can create another playoff)
            // BUT NOT if tournament is already marked as completed
            const canCreatePlayoff = !tournamentCompleted && (isLastScheduledRound || isPlayoffRound) && remainingPlayers >= 4;
            
            if (isLastScheduledRound && !isPlayoffRound) {
                // Just finished the last scheduled round
                moveToNextRoundBtn.style.display = 'none';
                createPlayoffBtnMain.style.display = canCreatePlayoff ? 'inline-block' : 'none';
                completeTournamentBtn.style.display = tournamentCompleted ? 'none' : 'inline-block';
            } else if (isPlayoffRound) {
                // Just finished a playoff round - can create another playoff
                moveToNextRoundBtn.style.display = 'none';
                createPlayoffBtnMain.style.display = canCreatePlayoff ? 'inline-block' : 'none';
                completeTournamentBtn.style.display = tournamentCompleted ? 'none' : 'inline-block';
        } else {
                // Regular round completed, not last - show Move to Next Round
                moveToNextRoundBtn.style.display = 'inline-block';
                moveToNextRoundBtn.textContent = `Move to Round ${currentRound + 1}`;
                createPlayoffBtnMain.style.display = 'none';
                completeTournamentBtn.style.display = 'none';
            }
            
            startRoundBtn.style.display = 'none';
            endRoundBtn.style.display = 'none';
            addTimeBtn.style.display = 'none';
            stopAdminTimer();
            document.getElementById('roundParticipantsSection').style.display = 'none';
        }
    }
    
    // Load and display rounds history
    loadRoundsHistory();
}

// Load and display current round participants
async function loadRoundParticipants(roundNumber) {
    if (!currentTournamentId) return;
    
    try {
        // Find the round document
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        let currentRoundId = null;
        
        roundsSnap.forEach(doc => {
            const roundData = doc.data();
            if (roundData.roundNumber === roundNumber && roundData.status === 'in_progress') {
                currentRoundId = doc.id;
            }
        });
        
        if (!currentRoundId) {
            document.getElementById('roundParticipantsSection').style.display = 'none';
            return;
        }
        
        // Load participants for this round
        const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', currentRoundId, 'participants'));
        
        if (participantsSnap.empty) {
            document.getElementById('roundParticipantsSection').style.display = 'none';
            return;
        }
        
        const participants = [];
        participantsSnap.forEach(doc => {
            participants.push({ id: doc.id, ...doc.data() });
        });
        
        // Get current wins and calculate round wins from scoreEvents
        for (const participant of participants) {
            if (playersData[participant.playerId]) {
                const playerData = playersData[participant.playerId];
                participant.currentWins = playerData.wins || 0;
                
                // Calculate round wins from scoreEvents
                const scoreEvents = participant.scoreEvents || [];
                participant.roundWins = scoreEvents.reduce((sum, e) => sum + e.delta, 0);
                
                participant.lastWinAt = playerData.lastWinAt;
            } else {
                participant.currentWins = participant.wins || 0;
                participant.roundWins = 0;
                participant.lastWinAt = null;
            }
        }
        
        // Format last win time
        const formatLastWin = (timestamp) => {
            if (!timestamp) return '—';
            const now = Date.now();
            const then = timestamp.toMillis();
            const diffMs = now - then;
            const minutes = Math.floor(diffMs / (1000 * 60));
            return `${minutes}min ago`;
        };
        
        // Prepare data for DataTables
        const tableData = participants.map(p => {
            const tableName = p.tableId 
                ? `Table ${tablesData[p.tableId]?.tableNumber || '?'} - ${p.position || '?'}` 
                : 'Not assigned';
            
            return [
                p.name,
                tableName,
                p.currentWins,
                p.roundWins > 0 ? `+${p.roundWins}` : '—',
                formatLastWin(p.lastWinAt)
            ];
        });
        
        // Destroy existing DataTable if it exists
        if ($.fn.DataTable.isDataTable('#roundParticipantsTable')) {
            $('#roundParticipantsTable').DataTable().destroy();
        }
        
        // Initialize DataTables
        $('#roundParticipantsTable').DataTable({
            data: tableData,
            order: [[2, 'desc']], // Default sort by Total Wins descending
            pageLength: 25,
            lengthMenu: [[10, 25, 50, -1], [10, 25, 50, 'All']],
            language: {
                search: 'Search players:',
                lengthMenu: 'Show _MENU_ players',
                info: 'Showing _START_ to _END_ of _TOTAL_ players'
            },
            columnDefs: [
                { className: 'dt-center', targets: [2, 3, 4] }
            ]
        });
        
        document.getElementById('roundParticipantsSection').style.display = 'block';
    } catch (error) {
        console.error('Error loading round participants:', error);
        document.getElementById('roundParticipantsSection').style.display = 'none';
    }
}

// Load and display rounds history
async function loadRoundsHistory() {
    if (!currentTournamentId) return;
    
    try {
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        
        if (roundsSnap.empty) {
            roundsHistory.innerHTML = '';
            return;
        }
        
        const rounds = [];
        roundsSnap.forEach(doc => {
            rounds.push({ id: doc.id, ...doc.data() });
        });
        
        // Sort by round number
        rounds.sort((a, b) => a.roundNumber - b.roundNumber);
        
        const roundsHTML = rounds.map(round => {
            const statusClass = round.status === 'in_progress' ? 'status-active' : round.status === 'staging' ? 'status-staging' : 'status-completed';
            const statusText = round.status === 'in_progress' ? 'In Progress' : round.status === 'staging' ? 'Staging' : 'Completed';
            const startDate = round.startedAt ? new Date(round.startedAt.toDate()).toLocaleString() : 'N/A';
            const endDate = round.endedAt ? new Date(round.endedAt.toDate()).toLocaleString() : '-';
            
            const timerText = round.timerDuration ? `${round.timerDuration} min` : 'N/A';
            const multiplier = round.scoreMultiplier || 1;
            const isPlayoff = round.isPlayoff || false;
            const playoffBadge = isPlayoff ? '<span style="margin-left: 10px; background: #fbbf24; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: bold;">PLAYOFF</span>' : '';
            
            const viewDetailsBtn = round.status === 'completed' 
                ? `<button class="btn btn-small btn-primary" onclick="viewRoundDetails('${round.id}')" style="margin-right: 10px;">View Details</button>` 
                : '';
            
            return `
                <div style="background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <div style="flex: 1;">
                        <div style="font-weight: 600; margin-bottom: 5px;">
                            Round ${round.roundNumber}
                            ${playoffBadge}
                            <span class="status-badge ${statusClass}" style="margin-left: 10px; font-size: 11px;">${statusText}</span>
                            <span style="margin-left: 10px; font-size: 12px; color: #667eea;">⏱️ ${timerText}</span>
                            <span style="margin-left: 10px; font-size: 12px; color: #059669; font-weight: bold; cursor: pointer;" onclick="editRoundMultiplier('${round.id}', ${round.roundNumber}, ${multiplier})" title="Click to edit multiplier">✕${multiplier}</span>
                        </div>
                        <div style="font-size: 12px; color: #6b7280;">
                            Started: ${startDate}
                            ${round.endedAt ? `<br>Ended: ${endDate}` : ''}
                        </div>
                    </div>
                    <div>
                        ${viewDetailsBtn}
                        <button class="btn btn-small btn-secondary" onclick="restartSpecificRound(${round.roundNumber}, '${round.id}')">
                            Restart
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        
        roundsHistory.innerHTML = `
            <h3 style="font-size: 16px; color: #374151; margin-bottom: 15px; margin-top: 20px; padding-top: 20px; border-top: 2px solid #e5e7eb;">
                Round History
            </h3>
            ${roundsHTML}
        `;
    } catch (error) {
        console.error('Error loading rounds history:', error);
    }
}

// Restart a specific round
window.restartSpecificRound = async function(roundNumber, roundId) {
    if (!currentTournamentId) return;
    
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const data = tournamentDoc.data();
    const currentRound = data.currentRound || 0;
    
    showConfirmAction(
        'Restart Round',
        `<p style="color: #f59e0b; font-weight: bold;">⚠️ Restart Round ${roundNumber}?</p>` +
        `<p style="margin-top: 15px;">This will:</p>` +
        `<ul style="margin-top: 10px; padding-left: 20px; line-height: 1.8;">` +
        `<li>Set Round ${roundNumber} back to "In Progress"</li>` +
        `<li>NOT reset player scores or table assignments</li>` +
        `<li>Allow games to continue in that round</li>` +
        `</ul>` +
        `<p style="margin-top: 15px;">Continue?</p>`,
        async () => {
    try {
        // Update specific round record to in progress
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId);
        await updateDoc(roundRef, {
            status: 'in_progress',
            endedAt: null
        });
        
        // Update tournament to make this the current round
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            currentRound: roundNumber,
            roundInProgress: true
        });
        
                showToast(`Round ${roundNumber} restarted!`, 'success');
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error restarting round:', error);
                showToast('Error restarting round: ' + error.message, 'error');
    }
        }
    );
};

// Edit round multiplier
window.editRoundMultiplier = async function(roundId, roundNumber, currentMultiplier) {
    if (!currentTournamentId) return;
    
    const newMultiplier = prompt(
        `Edit Score Multiplier for Round ${roundNumber}\n\n` +
        `Current multiplier: ✕${currentMultiplier}\n\n` +
        `Enter new multiplier (e.g., 1, 1.5, 2, 3):`,
        currentMultiplier
    );
    
    if (!newMultiplier) return; // User cancelled
    
    const multiplierValue = parseFloat(newMultiplier);
    
    if (isNaN(multiplierValue) || multiplierValue <= 0) {
        showToast('Invalid multiplier! Must be a positive number.', 'error');
        return;
    }
    
    try {
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId);
        await updateDoc(roundRef, {
            scoreMultiplier: multiplierValue
        });
        
        showToast(`✅ Round ${roundNumber} multiplier updated to ✕${multiplierValue}\n\nAll scores will recalculate automatically.`, 'success');
        
        // Refresh the round history to show new multiplier
        loadRoundsHistory();
        
        // Refresh current round info if this is the current round
        const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
        const tournamentData = tournamentDoc.data();
        if (tournamentData.currentRound === roundNumber) {
            // Trigger a refresh of the entire tournament view
            selectTournament(currentTournamentId);
        }
        
    } catch (error) {
        console.error('Error updating round multiplier:', error);
        showToast('Error updating multiplier: ' + error.message, 'error');
    }
};

// Start new round
// Move to Next Round - Creates new round in staging state
moveToNextRoundBtn.addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const data = tournamentDoc.data();
    const nextRound = (data.currentRound || 0) + 1;
    const totalRounds = data.totalRounds || 0;
    const defaultTimer = data.timerDuration || 5;
    
    // Check if we're exceeding total rounds (for cutline tournaments)
    if (totalRounds > 0 && nextRound > totalRounds) {
        showToast(`Cannot create Round ${nextRound}. Tournament is limited to ${totalRounds} rounds.`, 'warning');
        return;
    }
    
    try {
        // Create round record in staging state with tournament's default timer
        const roundRef = doc(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        await setDoc(roundRef, {
            roundNumber: nextRound,
            status: 'staging',
            timerDuration: defaultTimer, // Store in minutes (use tournament default)
            scoreMultiplier: 1, // Default multiplier is 1x
            startedAt: null,
            endedAt: null,
            createdAt: serverTimestamp()
        });
        
        // Update tournament to reflect new current round (but not in progress)
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            currentRound: nextRound,
            roundInProgress: false
        });
        
        showToast(`Moved to Round ${nextRound}!\n\nTimer: ${defaultTimer} minutes\nScore Multiplier: 1x\n(Both editable in round info)\n\nRound is in staging. Assign players to tables, then click "Start Round" when ready.`, "success");
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error moving to next round:', error);
        showToast('Error moving to next round: ' + error.message, 'error');
    }
});

// Start Round - Validates and puts current round in progress
startRoundBtn.addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const data = tournamentDoc.data();
    const currentRound = data.currentRound || 0;
    
    if (currentRound === 0) {
        showToast('No round to start. Click "Move to Next Round" first.', 'warning');
        return;
    }
    
    // Get active players count
    const activePlayers = Object.values(playersData).filter(p => !p.eliminated);
    
    if (activePlayers.length === 0) {
        showValidationError('<p><strong>No active players!</strong></p><p>Add players to the tournament before starting a round.</p>');
        return;
    }
    
    // Check if number of players is divisible by 4
    if (activePlayers.length % 4 !== 0) {
        const remainder = activePlayers.length % 4;
        const needed = 4 - remainder;
        showValidationError(
            `<p><strong>Number of active players must be divisible by 4.</strong></p>` +
            `<p style="margin-top: 10px;">Current active players: <strong>${activePlayers.length}</strong><br>` +
            `Remainder: <strong>${remainder}</strong></p>` +
            `<p style="margin-top: 10px;">You need to either:</p>` +
            `<ul style="margin-left: 20px; margin-top: 5px;">` +
            `<li>Add <strong>${needed}</strong> more player(s), or</li>` +
            `<li>Remove <strong>${remainder}</strong> player(s)</li>` +
            `</ul>` +
            `<p style="margin-top: 10px;">to have a number divisible by 4.</p>`
        );
        return;
    }
    
    // VALIDATION: Check that all active players are assigned to tables
    const unassignedPlayers = activePlayers.filter(p => !p.tableId);
    if (unassignedPlayers.length > 0) {
        const namesList = unassignedPlayers.map(p => `<li>${p.name}</li>`).join('');
        showValidationError(
            `<p><strong>All active players must be assigned to tables.</strong></p>` +
            `<p style="margin-top: 10px;">Unassigned players (${unassignedPlayers.length}):</p>` +
            `<ul style="margin-left: 20px; margin-top: 5px; max-height: 200px; overflow-y: auto;">${namesList}</ul>` +
            `<p style="margin-top: 10px;">Use <strong>"Auto-Assign Players"</strong> to assign them.</p>`
        );
        return;
    }
    
    // VALIDATION: Check that all tables are full (exactly 4 players)
    const allTables = Object.values(tablesData);
    const tablesWithPlayers = allTables.filter(t => t.players && t.players.length > 0);
    const incompleteTables = tablesWithPlayers.filter(t => t.players.length !== 4);
    
    if (incompleteTables.length > 0) {
        const tableList = incompleteTables.map(t => 
            `<li>Table ${t.tableNumber}: <strong>${t.players.length}/4 players</strong></li>`
        ).join('');
        showValidationError(
            `<p><strong>All tables must have exactly 4 players.</strong></p>` +
            `<p style="margin-top: 10px;">Incomplete tables (${incompleteTables.length}):</p>` +
            `<ul style="margin-left: 20px; margin-top: 5px;">${tableList}</ul>` +
            `<p style="margin-top: 10px;">Click on seats to assign players or use <strong>"Auto-Assign Players"</strong>.</p>`
        );
        return;
    }
    
    const numTables = activePlayers.length / 4;
    
    // Show confirmation modal
    document.getElementById('startRoundNumberConfirm').textContent = currentRound;
    document.getElementById('confirmActivePlayersCount').textContent = activePlayers.length;
    document.getElementById('confirmTablesCount').textContent = numTables;
    document.getElementById('startRoundConfirmModal').classList.remove('hidden');
    
    // Store data for confirmation handler
    window.pendingRoundStart = { currentRound, activePlayers };
});

// Cancel start round confirmation
document.getElementById('cancelStartRoundBtn').addEventListener('click', () => {
    document.getElementById('startRoundConfirmModal').classList.add('hidden');
    window.pendingRoundStart = null;
});

// Confirm start round
document.getElementById('confirmStartRoundBtn').addEventListener('click', async () => {
    if (!window.pendingRoundStart) return;
    
    const { currentRound, activePlayers } = window.pendingRoundStart;
    document.getElementById('startRoundConfirmModal').classList.add('hidden');
    
    try {
        // Find the existing round document
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        let roundId = null;
        let roundRef = null;
        
        for (const roundDoc of roundsSnap.docs) {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound) {
                roundId = roundDoc.id;
                roundRef = roundDoc.ref;
                break;
            }
        }
        
        if (!roundRef) {
            throw new Error(`Round ${currentRound} not found. Please move to the round first.`);
        }
        
        // Update round to in_progress status
        await updateDoc(roundRef, {
            status: 'in_progress',
            startedAt: serverTimestamp()
        });
        
        // Snapshot all active players into participants subcollection
        const participantsPromises = activePlayers.map(player => {
            const participantRef = doc(collection(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants'));
            return setDoc(participantRef, {
                playerId: player.id,
                name: player.name,
                wins: player.wins || 0,
                points: player.points || 0,
                tableId: player.tableId || null,
                position: player.position || null,
                lastWinAt: player.lastWinAt || null,
                scoreEvents: [], // Initialize empty scoreEvents array for new round
                snapshotAt: serverTimestamp()
            });
        });
        
        await Promise.all(participantsPromises);
        
        // Update tournament to mark round in progress
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            roundInProgress: true
        });
        
        showToast(`Round ${currentRound} started with ${activePlayers.length} participants!`, "success");
        window.pendingRoundStart = null;
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error starting round:', error);
        showToast('Error starting round: ' + error.message, 'error');
        window.pendingRoundStart = null;
    }
});

// End current round
// Store end round data for modal
let endRoundData = null;

// End Round Button - Show Modal
// Add Time to Current Round
// Global function for updating round timer (staging state)
window.updateRoundTimer = async function(newValue, originalValue) {
    if (!currentTournamentId || !currentRoundData) return;
    
    const newDuration = parseInt(newValue);
    if (isNaN(newDuration) || newDuration <= 0) {
        showToast('Invalid input. Timer must be a positive number.', 'warning');
        document.getElementById('editRoundTimer').value = originalValue;
        return;
    }
    
    if (newDuration === originalValue) return; // No change
    
    try {
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', currentRoundData.id);
        await updateDoc(roundRef, {
            timerDuration: newDuration
        });
        
        // Update local data
        currentRoundData.timerDuration = newDuration;
        
        // No need to refresh, just update the input's original value for next comparison
        document.getElementById('editRoundTimer').setAttribute('onchange', `updateRoundTimer(this.value, ${newDuration})`);
        showToast(`Round timer updated to ${newDuration} minutes`, 'success');
    } catch (error) {
        console.error('Error updating timer:', error);
        showToast('Error updating timer: ' + error.message, 'error');
        document.getElementById('editRoundTimer').value = originalValue;
    }
};

// Global function for updating score multiplier (staging state)
window.updateScoreMultiplier = async function(newValue, originalValue) {
    if (!currentTournamentId || !currentRoundData) return;
    
    const newMultiplier = parseFloat(newValue);
    if (isNaN(newMultiplier) || newMultiplier <= 0) {
        showToast('Invalid input. Multiplier must be a positive number.', 'warning');
        document.getElementById('editScoreMultiplier').value = originalValue;
        return;
    }
    
    if (newMultiplier === originalValue) return; // No change
    
    try {
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', currentRoundData.id);
        await updateDoc(roundRef, {
            scoreMultiplier: newMultiplier
        });
        
        // Update local data
        currentRoundData.scoreMultiplier = newMultiplier;
        
        // No need to refresh, just update the input's original value for next comparison
        document.getElementById('editScoreMultiplier').setAttribute('onchange', `updateScoreMultiplier(this.value, ${newMultiplier})`);
        showToast(`Score multiplier updated to ${newMultiplier}x`, 'success');
    } catch (error) {
        console.error('Error updating multiplier:', error);
        showToast('Error updating multiplier: ' + error.message, 'error');
        document.getElementById('editScoreMultiplier').value = originalValue;
    }
};

addTimeBtn.addEventListener('click', () => {
    if (!currentTournamentId || !currentRoundData) return;
    
    document.getElementById('addTimeMinutes').value = '5';
    document.getElementById('addTimeModal').classList.remove('hidden');
    document.getElementById('addTimeMinutes').focus();
});

// Cancel add time modal
document.getElementById('cancelAddTimeBtn').addEventListener('click', () => {
    document.getElementById('addTimeModal').classList.add('hidden');
});

// Confirm add time
document.getElementById('confirmAddTimeBtn').addEventListener('click', async () => {
    const addMinutes = parseInt(document.getElementById('addTimeMinutes').value);
    
    if (isNaN(addMinutes) || addMinutes <= 0) {
        showToast('Please enter a positive number of minutes.', 'warning');
        return;
    }
    
    document.getElementById('addTimeModal').classList.add('hidden');
    
    try {
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', currentRoundData.id);
        const currentDuration = currentRoundData.timerDuration || 0;
        const newDuration = currentDuration + addMinutes;
        
        await updateDoc(roundRef, {
            timerDuration: newDuration
        });
        
        // Update local data
        currentRoundData.timerDuration = newDuration;
        
        showToast(`Added ${addMinutes} minute(s) to the round! New total duration: ${newDuration} minutes`, 'success');
        
        // Refresh timer display
        updateAdminTimerDisplay();
    } catch (error) {
        console.error('Error adding time:', error);
        showToast('Error adding time: ' + error.message, 'error');
    }
});

endRoundBtn.addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const data = tournamentDoc.data();
    const currentRound = data.currentRound || 0;
    const type = data.type || 'standard';
    const totalRounds = data.totalRounds || 0;
    
    let summaryHTML = '';
    let playersListHTML = '';
    let playersToCut = [];
    
    // Standard tournament
    if (type !== 'cutline') {
        summaryHTML = `<p style="color: #374151;">End round ${currentRound}? No players will be eliminated.</p>`;
        playersListHTML = '';
    }
    // Handle cut line logic
    else if (type === 'cutline' && currentRound < totalRounds) {
        const activePlayers = Object.values(playersData).filter(p => !p.eliminated);
        const allPlayers = Object.values(playersData); // Include eliminated to get original count
        
        // Get round participants to calculate per-round wins
        let roundParticipants = {};
        try {
            const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
            for (const roundDoc of roundsSnap.docs) {
                const roundData = roundDoc.data();
                if (roundData.roundNumber === currentRound && roundData.status === 'in_progress') {
                    const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundDoc.id, 'participants'));
                    participantsSnap.forEach(pDoc => {
                        const pData = pDoc.data();
                        roundParticipants[pData.playerId] = pData;
                    });
                    break;
                }
            }
        } catch (error) {
            console.error('Error fetching round participants:', error);
        }
        
        // Use shared cut line algorithm with new scoring system
        const originalPlayerCount = allPlayers.length;
        
        // Build rounds map and table players map for scoring
        const roundsMap = await buildRoundsMap(currentTournamentId);
        const tablePlayersMap = await buildTablePlayersMapFromRound(currentTournamentId, currentRound);
        
        // Sort players for cutting (worst first) using new scoring algorithm
        const sortedPlayers = sortPlayersForCutLine(activePlayers, currentRound, roundsMap, tablePlayersMap);
        
        // Add tournament scores to sorted players for use in modal display
        sortedPlayers.forEach(p => {
            p.tournamentScore = calculateTournamentScore(p, roundsMap);
            p.roundScore = calculateRoundScore(p, currentRound, roundsMap);
        });
        
        // Calculate target using shared function
        const { targetRemaining, idealTarget, targetPercentage, chosenOption } = calculateCutLineTarget(
            originalPlayerCount,
            currentRound,
            totalRounds,
            sortedPlayers
        );
        
        // Calculate how many to cut to reach target
        const cutCount = activePlayers.length - targetRemaining;
        
        if (cutCount <= 0) {
            // No cuts needed (e.g., already below target due to previous ties)
            playersToCut = []; // Empty array - no one to cut
            summaryHTML = `
                <p><strong>Target:</strong> ~${idealTarget} players (${Math.round(targetPercentage * 100)}% of ${originalPlayerCount} original)</p>
                <p><strong>Adjusted:</strong> ${targetRemaining} (divisible by 4)</p>
                <p><strong>Current:</strong> ${activePlayers.length} players</p>
                <p style="color: #10b981; font-weight: bold;">No cuts needed - already at or below target.</p>
            `;
            playersListHTML = `<p style="color: #6b7280; text-align: center;">Tables will be reset. You can reassign remaining players.</p>`;
        } else {
            // Cut exactly to target - use tie-breakers to decide which players get cut
            // sortedPlayers is already sorted by: total wins, round wins, lastWinAt
            // So just cut the first cutCount players (they are the worst performers)
        playersToCut = sortedPlayers.slice(0, cutCount);
            const playersToKeep = sortedPlayers.slice(cutCount);
            const remainingCount = playersToKeep.length;
            
            summaryHTML = `
                <p><strong>Original Players:</strong> ${originalPlayerCount}</p>
                <p><strong>Current Active:</strong> ${activePlayers.length} players</p>
                <p><strong>Ideal Target:</strong> ${idealTarget} players (${Math.round(targetPercentage * 100)}% of ${originalPlayerCount})</p>
                <p><strong>Adjusted Target:</strong> ${targetRemaining} players ${chosenOption}</p>
                <p><strong>To Eliminate:</strong> ${playersToCut.length} player(s)</p>
                <p><strong>Will Remain:</strong> ${remainingCount} players</p>
            `;
            
            // Group players by tournament score and round score for better display
            const scoreMap = new Map();
            
            playersToCut.forEach(p => {
                const tournamentScore = p.tournamentScore || 0;
                const roundScore = p.roundScore || 0;
                const key = `${tournamentScore}-${roundScore}`; // Group by both total and round scores
                
                if (!scoreMap.has(key)) {
                    scoreMap.set(key, { tournamentScore, roundScore, names: [] });
                }
                scoreMap.get(key).names.push(p.name);
            });
            
            // Sort by score (ascending - worst first), then by round score
            const sortedGroups = Array.from(scoreMap.values()).sort((a, b) => {
                if (a.tournamentScore !== b.tournamentScore) return a.tournamentScore - b.tournamentScore;
                return a.roundScore - b.roundScore;
            });
            
            playersListHTML = `
                <h3 style="font-size: 14px; color: #374151; margin-bottom: 10px;">Players to be eliminated:</h3>
                <div style="background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; padding: 15px; max-height: 200px; overflow-y: auto;">
            `;
            sortedGroups.forEach(group => {
                const tournamentScoreText = group.tournamentScore > 0 ? `+${group.tournamentScore}` : group.tournamentScore;
                const roundScoreText = group.roundScore > 0 ? `+${group.roundScore}` : group.roundScore;
                playersListHTML += `
                    <div style="margin-bottom: 10px;">
                        <strong>${tournamentScoreText} pts (${roundScoreText} this round):</strong><br>
                        <span style="color: #6b7280;">${group.names.join(', ')}</span>
                    </div>
                `;
            });
            playersListHTML += `</div>`;
        }
    }
    // Final round of cut line tournament
    else if (type === 'cutline' && currentRound === totalRounds) {
        const activePlayers = Object.values(playersData).filter(p => !p.eliminated);
        playersToCut = []; // No cuts on final round
        summaryHTML = `
            <p style="color: #10b981; font-weight: bold;">FINAL ROUND</p>
            <p><strong>Players:</strong> ${activePlayers.length}</p>
            <p style="color: #6b7280;">No cuts - this is the final round.</p>
        `;
        playersListHTML = '';
    }
    
    // Show modal
    document.getElementById('endRoundNumber').textContent = currentRound;
    document.getElementById('endRoundSummary').innerHTML = summaryHTML;
    document.getElementById('endRoundPlayersList').innerHTML = playersListHTML;
    
    // Show "End Round Only" button if this is a cutline tournament (not final round)
    const endRoundOnlyBtn = document.getElementById('endRoundOnlyBtn');
    const confirmEndRoundBtn = document.getElementById('confirmEndRoundBtn');
    
    const isLastRound = totalRounds > 0 && currentRound >= totalRounds;
    
    if (type === 'cutline' && !isLastRound) {
        endRoundOnlyBtn.style.display = 'inline-block';
        confirmEndRoundBtn.textContent = 'Complete & Setup Next Round';
    } else {
        endRoundOnlyBtn.style.display = 'none';
        confirmEndRoundBtn.textContent = 'End Round';
    }
    
    // Store data for confirm button
    endRoundData = { currentRound, type, playersToCut, totalRounds };
    
    document.getElementById('endRoundModal').classList.remove('hidden');
});

// Cancel End Round Modal
document.getElementById('cancelEndRoundBtn').addEventListener('click', () => {
    document.getElementById('endRoundModal').classList.add('hidden');
    endRoundData = null;
});

// End Round Only (Skip Culling)
document.getElementById('endRoundOnlyBtn').addEventListener('click', async () => {
    if (!endRoundData) return;
    
    const { currentRound, type, totalRounds } = endRoundData;
    
    // Close modal
    document.getElementById('endRoundModal').classList.add('hidden');
    
    try {
        // Determine if this is the last round
        const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
        const tournamentData = tournamentDoc.data();
        const isLastRound = totalRounds > 0 && currentRound >= totalRounds;
        
        // Update tournament: mark round as not in progress
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            roundInProgress: false
        });
        
        // Update round record to completed
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        for (const roundDoc of roundsSnap.docs) {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound && roundData.status === 'in_progress') {
                await updateDoc(roundDoc.ref, {
                    endedAt: serverTimestamp(),
                    status: 'completed'
                });
            }
        }
        
        // For cutline tournaments, reset tables but DON'T eliminate players
        if (type === 'cutline') {
            const batch = writeBatch(db);
            
            // Unassign all players from tables
            const allPlayers = Object.values(playersData);
            for (const player of allPlayers) {
                if (player.tableId) {
                    const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
                    batch.update(playerRef, {
                        tableId: null,
                        position: null
                    });
                }
            }
            
            // Clear all tables (remove players and positions, keep tables for reuse)
            const allTables = Object.values(tablesData);
            for (const table of allTables) {
                const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', table.id);
                batch.update(tableRef, {
                    players: [],
                    positions: {}
                });
            }
            
            await batch.commit();
            
            showToast(`Round ${currentRound} ended!\n\nNO PLAYERS WERE ELIMINATED.\n\nYou can manually eliminate players or move to the next round.`, "success");
        } else {
            showToast(`Round ${currentRound} ended!`, "success");
        }
        
        selectTournament(currentTournamentId); // Refresh
        endRoundData = null;
    } catch (error) {
        console.error('Error ending round:', error);
        showToast('Error ending round: ' + error.message, 'error');
    }
});

// Confirm End Round
document.getElementById('confirmEndRoundBtn').addEventListener('click', async () => {
    if (!endRoundData) return;
    
    const { currentRound, type, playersToCut, totalRounds } = endRoundData;
    
    // Close modal
    document.getElementById('endRoundModal').classList.add('hidden');
    
    try {
        // Determine if this is the last round
        const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
        const tournamentData = tournamentDoc.data();
        const isLastRound = totalRounds > 0 && currentRound >= totalRounds;
        
        // Update tournament: mark round as not in progress
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            roundInProgress: false
        });
        
        // Update round record to completed
        const roundsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds'));
        for (const roundDoc of roundsSnap.docs) {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound && roundData.status === 'in_progress') {
                await updateDoc(roundDoc.ref, {
                    endedAt: serverTimestamp(),
                    status: 'completed'
                });
            }
        }
        
        // Cut line specific actions
        if (type === 'cutline') {
            // Use batch write for eliminations and unassignments
            const batch = writeBatch(db);
            
            // Eliminate players (if any)
            let eliminatedCount = 0;
            if (playersToCut && playersToCut.length > 0) {
            for (const player of playersToCut) {
                    if (player.id) {
                        const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
                        batch.update(playerRef, {
                    eliminated: true,
                    eliminatedInRound: currentRound
                });
                        eliminatedCount++;
                    }
                }
            }
            
            // Reset all tables (unassign all players and clear tables)
            const allPlayers = Object.values(playersData);
            for (const player of allPlayers) {
                if (player.tableId) {
                    const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
                    batch.update(playerRef, {
                        tableId: null,
                        position: null
                    });
                }
            }
            
            // Clear all tables (remove players and positions)
            const allTables = Object.values(tablesData);
            for (const table of allTables) {
                const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', table.id);
                batch.update(tableRef, {
                    players: [],
                    positions: {}
                });
            }
            
            // Commit batch
            await batch.commit();
            
            // Determine if this was a playoff round
            const wasPlayoffRound = currentRoundData?.isPlayoff || false;
            
            // If not last round and not playoff, do full auto-setup for next round
            if (!isLastRound && !wasPlayoffRound) {
                // Query fresh player count after elimination
                const playersSnapshot = await getDocs(collection(db, 'tournaments', currentTournamentId, 'players'));
                
                const remainingPlayerDocs = playersSnapshot.docs.filter(doc => {
                    const data = doc.data();
                    const isEliminated = data.eliminated === true;
                    return !isEliminated;
                });
                const remainingPlayers = remainingPlayerDocs.length;
                
                // Query fresh table data after clearing tables
                const tablesSnapshot = await getDocs(collection(db, 'tournaments', currentTournamentId, 'tables'));
                const freshTables = tablesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                // Auto-assign players to tables starting from table 1
                const activeTables = freshTables
                    .filter(t => t.active !== false)
                    .sort((a, b) => a.tableNumber - b.tableNumber);
                
                const tablesNeeded = Math.ceil(remainingPlayers / 4);
                
                if (activeTables.length >= tablesNeeded && remainingPlayers % 4 === 0) {
                    // Auto-assign using batch (using random algorithm)
                    const assignBatch = writeBatch(db);
                    const positions = ['East', 'South', 'West', 'North'];
                    
                    // Get remaining players and assign using random algorithm
                    const playersList = remainingPlayerDocs.map(doc => ({ id: doc.id, ...doc.data() }));
                    const tableAssignments = assignPlayersByAlgorithm(playersList, 'random');
                    
                    for (let i = 0; i < tablesNeeded && i < tableAssignments.length; i++) {
                        const table = activeTables[i];
                        const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', table.id);
                        const tablePlayers = tableAssignments[i];
                        const tablePlayerIds = [];
                        const tablePositions = {};
                        
                        for (let j = 0; j < tablePlayers.length; j++) {
                            const player = tablePlayers[j];
                            const position = positions[j];
                            
                            tablePlayerIds.push(player.id);
                            tablePositions[position] = player.id;
                            
                            // Assign player to table
                            const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
                            assignBatch.update(playerRef, {
                                tableId: table.id,
                                position: position
                            });
                        }
                        
                        // Update table
                        assignBatch.update(tableRef, {
                            players: tablePlayerIds,
                            positions: tablePositions
                        });
                    }
                    
                    await assignBatch.commit();
                    
                    // Create next round in staging with tournament's default timer
                    const defaultTimer = tournamentData.timerDuration || 30;
                    const nextRoundRef = doc(collection(db, 'tournaments', currentTournamentId, 'rounds'));
                    await setDoc(nextRoundRef, {
                        roundNumber: currentRound + 1,
                        status: 'staging',
                        timerDuration: defaultTimer,
                        scoreMultiplier: 1, // Default multiplier is 1x
                        createdAt: serverTimestamp(),
                        startedAt: null,
                        endedAt: null
                    });
                    
                    await updateDoc(doc(db, 'tournaments', currentTournamentId), {
                        currentRound: currentRound + 1
                    });
                    
                    showToast(`Round ${currentRound} Complete!\n\n${eliminatedCount > 0 ? `• ${eliminatedCount} player(s) eliminated\n` : ''}• ${remainingPlayers} player(s) auto-assigned to ${tablesNeeded} table(s)\n• Round ${currentRound + 1} created in staging (${defaultTimer} min timer)\n\nYou can edit the timer duration in the UI, then click "Start Round ${currentRound + 1}"!`);
                    selectTournament(currentTournamentId); // Refresh
        } else {
                    // Can't auto-assign - show error
                    showToast(`Cannot auto-assign players to tables!\n\n${eliminatedCount > 0 ? `• ${eliminatedCount} player(s) eliminated\n` : ''}• ${remainingPlayers} player(s) remaining\n\nIssues:\n${remainingPlayers % 4 !== 0 ? `• Player count (${remainingPlayers}) not divisible by 4\n` : ''}${activeTables.length < tablesNeeded ? `• Need ${tablesNeeded} tables, only ${activeTables.length} active\n` : ''}\nPlease manually set up the next round.`);
                    selectTournament(currentTournamentId);
                }
            } else if (isLastRound && !wasPlayoffRound) {
                // Tournament scheduled rounds complete - page will show playoff button
                const eliminationMsg = eliminatedCount > 0 ? `\n\n✅ ${eliminatedCount} player(s) eliminated.` : '';
                showToast(`Tournament Complete!\n\nAll ${totalRounds} scheduled rounds finished.${eliminationMsg}\n\nYou can now create an optional playoff round using the "Create Playoff Round" button.`, "info");
                selectTournament(currentTournamentId); // Refresh to show playoff button
            } else if (wasPlayoffRound) {
                // Playoff round ended - query fresh count from database
                const playersSnapshot = await getDocs(collection(db, 'tournaments', currentTournamentId, 'players'));
                const remainingPlayers = playersSnapshot.docs.filter(doc => !doc.data().eliminated).length;
                const eliminationMsg = eliminatedCount > 0 ? `\n✅ ${eliminatedCount} player(s) eliminated.\n` : '';
                showToast(`Playoff round ended!\n${eliminationMsg}\n${remainingPlayers} player(s) remaining.\n\nYou can create another playoff round or end the tournament.`, "success");
                selectTournament(currentTournamentId); // Refresh to show playoff button
            }
        } else {
            // Standard tournament
            const wasPlayoffRound = currentRoundData?.isPlayoff || false;
            
            if (isLastRound && !wasPlayoffRound) {
                // Tournament complete - page will show playoff button
                showToast(`Tournament Complete!\n\nAll ${totalRounds} scheduled rounds finished.\n\nYou can now create an optional playoff round using the "Create Playoff Round" button.`, "info");
                selectTournament(currentTournamentId); // Refresh to show playoff button
            } else if (wasPlayoffRound) {
                // Playoff round ended
                const remainingPlayers = Object.values(playersData).filter(p => !p.eliminated).length;
                showToast(`Playoff round ended!\n\n${remainingPlayers} player(s) remaining.\n\nYou can create another playoff round or end the tournament.`, "success");
                selectTournament(currentTournamentId); // Refresh to show playoff button
            } else {
                showToast(`Round ${currentRound} ended!\n\nClick "Move to Round ${currentRound + 1}" to set up the next round.`, "success");
        selectTournament(currentTournamentId); // Refresh
            }
        }
        
        endRoundData = null;
    } catch (error) {
        console.error('Error ending round:', error);
        showToast('Error ending round: ' + error.message, 'error');
    }
});

// Skip table assignment
document.getElementById('skipTableAssignmentBtn').addEventListener('click', () => {
    document.getElementById('tableAssignmentModal').classList.add('hidden');
    selectTournament(currentTournamentId); // Refresh
});

// Show Playoff Modal (from main button)
createPlayoffBtnMain.addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
    const tournamentData = tournamentDoc.data();
    const totalRounds = tournamentData.totalRounds || 0;
    const activePlayers = Object.values(playersData).filter(p => !p.eliminated);
    const remainingPlayers = activePlayers.length;
    
    // Populate playoff modal
    document.getElementById('playoffTotalRounds').textContent = totalRounds;
    document.getElementById('playoffRemainingPlayers').textContent = remainingPlayers;
    
    // Populate playoff player count dropdown
    const playoffCountSelect = document.getElementById('playoffPlayerCount');
    playoffCountSelect.innerHTML = '';
    for (let count = 4; count <= remainingPlayers; count += 4) {
        const option = document.createElement('option');
        option.value = count;
        option.textContent = `${count} players (${count / 4} table${count / 4 > 1 ? 's' : ''})`;
        playoffCountSelect.appendChild(option);
    }
    
    // Select the maximum by default
    if (playoffCountSelect.options.length > 0) {
        playoffCountSelect.value = remainingPlayers;
    }
    
    document.getElementById('playoffOptionModal').classList.remove('hidden');
});

// Complete Tournament Button (main round management)
completeTournamentBtn.addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    showConfirmAction(
        'Complete Tournament',
        '<p>Mark this tournament as completed?</p>' +
        '<p style="margin-top: 10px; color: #6b7280;">This will mark the tournament as finished. You can reactivate it later if needed.</p>',
        async () => {
            try {
                await updateDoc(doc(db, 'tournaments', currentTournamentId), {
                    status: 'completed'
                });
                
                showToast('Tournament completed successfully!', 'success');
                selectTournament(currentTournamentId); // Refresh
            } catch (error) {
                console.error('Error completing tournament:', error);
                showToast('Error completing tournament: ' + error.message, 'error');
            }
        }
    );
});

// End Tournament (no playoff)
document.getElementById('endTournamentBtn').addEventListener('click', async () => {
    document.getElementById('playoffOptionModal').classList.add('hidden');
    
    try {
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            status: 'completed'
        });
        
        showToast('Tournament ended! Thank you for using Speed Jong Timer.', 'success');
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error ending tournament:', error);
        showToast('Error ending tournament: ' + error.message, 'error');
    }
});

// Create Playoff Round
document.getElementById('createPlayoffBtn').addEventListener('click', async () => {
    if (!currentTournamentId) return;
    
    const playoffPlayerCount = parseInt(document.getElementById('playoffPlayerCount').value);
    
    if (!playoffPlayerCount || playoffPlayerCount < 4) {
        showToast('Invalid player count. Please select a valid number.', 'warning');
        return;
    }
    
    document.getElementById('playoffOptionModal').classList.add('hidden');
    
    try {
        const tournamentDoc = await getDoc(doc(db, 'tournaments', currentTournamentId));
        const tournamentData = tournamentDoc.data();
        const currentRound = tournamentData.currentRound || 0;
        const defaultTimer = tournamentData.timerDuration || 5;
        
        // Get all active players sorted by ranking (best first)
        const activePlayers = Object.values(playersData).filter(p => !p.eliminated);
        
        // Build rounds map and table players map for scoring
        const roundsMap = await buildRoundsMap(currentTournamentId);
        const lastCompletedRound = roundsMap._lastCompletedRound || 0;
        const tablePlayersMap = await buildTablePlayersMapFromRound(currentTournamentId, lastCompletedRound);
        
        // Sort players for ranking (best performers first) using new scoring system
        const sortedPlayers = sortPlayersForLeaderboard(activePlayers, lastCompletedRound, roundsMap, tablePlayersMap);
        
        // Select top N players for playoff
        const playoffPlayers = sortedPlayers.slice(0, playoffPlayerCount);
        const eliminatedPlayers = sortedPlayers.slice(playoffPlayerCount);
        
        // Build confirmation message
        const playoffRoundNumber = currentRound + 1;
        let confirmHtml = `<p>Create Playoff Round ${playoffRoundNumber}?</p>`;
        confirmHtml += `<p style="margin-top: 15px;"><strong>Top ${playoffPlayerCount} player(s) will participate:</strong></p>`;
        confirmHtml += `<div style="margin: 10px 0; padding: 10px; background: #f3f4f6; border-radius: 6px; max-height: 200px; overflow-y: auto; font-size: 13px;">`;
        playoffPlayers.slice(0, 10).forEach((p, i) => {
            const score = calculateTournamentScore(p, roundsMap);
            const scoreText = score > 0 ? `+${score}` : score;
            confirmHtml += `<div style="padding: 3px 0;">${i + 1}. ${p.name} (${scoreText} pts)</div>`;
        });
        if (playoffPlayers.length > 10) {
            confirmHtml += `<div style="padding: 3px 0; color: #6b7280;">...and ${playoffPlayers.length - 10} more</div>`;
        }
        confirmHtml += `</div>`;
        
        if (eliminatedPlayers.length > 0) {
            confirmHtml += `<p style="margin-top: 10px; color: #ef4444;"><strong>Eliminated:</strong> ${eliminatedPlayers.length} player(s)</p>`;
        }
        
        confirmHtml += `<p style="margin-top: 10px; color: #6b7280;">Timer: ${defaultTimer} minutes (editable in UI)</p>`;
        
        showConfirmAction(
            'Create Playoff Round',
            confirmHtml,
            async () => {
                try {
                    // Create playoff round with tournament's default timer
                    const roundRef = doc(collection(db, 'tournaments', currentTournamentId, 'rounds'));
                    await setDoc(roundRef, {
                        roundNumber: playoffRoundNumber,
                        status: 'staging',
                        timerDuration: defaultTimer,
                        scoreMultiplier: 1, // Default multiplier is 1x
                        isPlayoff: true,
                        playoffPlayerCount: playoffPlayerCount,
                        startedAt: null,
                        endedAt: null,
                        createdAt: serverTimestamp()
                    });
                    
                    // Eliminate players not in playoff
                    if (eliminatedPlayers.length > 0) {
                        const batch = writeBatch(db);
                        for (const player of eliminatedPlayers) {
                            const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
                            batch.update(playerRef, {
                                eliminated: true,
                                eliminatedInRound: playoffRoundNumber
                            });
                        }
                        await batch.commit();
                    }
                    
                    // Update tournament
                    await updateDoc(doc(db, 'tournaments', currentTournamentId), {
                        currentRound: playoffRoundNumber,
                        roundInProgress: false
                    });
                    
                    showToast(`Playoff round created! Round ${playoffRoundNumber} (Playoff) is now in staging with ${playoffPlayerCount} player(s). Timer: ${defaultTimer} minutes. Assign players to tables, then click "Start Round" when ready.`, 'success');
                    selectTournament(currentTournamentId); // Refresh
                } catch (error) {
                    console.error('Error creating playoff round:', error);
                    showToast('Error creating playoff round: ' + error.message, 'error');
                }
            }
        );
    } catch (error) {
        console.error('Error loading playoff data:', error);
        showToast('Error loading playoff data: ' + error.message, 'error');
    }
});

// Auto-assign tables after round
document.getElementById('autoAssignTablesBtn').addEventListener('click', async () => {
    document.getElementById('tableAssignmentModal').classList.add('hidden');
    
    try {
        const activePlayers = Object.values(playersData).filter(p => !p.eliminated && !p.tableId);
        
        if (activePlayers.length === 0) {
            showToast('No unassigned players to assign to tables.', 'warning');
            selectTournament(currentTournamentId);
            return;
        }
        
        if (activePlayers.length % 4 !== 0) {
            showToast(`Cannot auto-assign: ${activePlayers.length} players is not divisible by 4.`, 'warning');
            selectTournament(currentTournamentId);
            return;
        }
        
        // Use random algorithm for post-round auto-assignment
        // (Could be enhanced later to allow algorithm selection)
        const tableAssignments = assignPlayersByAlgorithm(activePlayers, 'random');
        const numTables = tableAssignments.length;
        const positions = ['East', 'South', 'West', 'North'];
        
        // Get next table number
        const existingTables = Object.values(tablesData);
        const tableNumbers = existingTables.map(t => t.tableNumber || 0);
        const nextTableNum = tableNumbers.length > 0 ? Math.max(...tableNumbers) + 1 : 1;
        
        // Create tables and get their IDs first
        const tableRefs = [];
        for (let i = 0; i < numTables; i++) {
            const tablePlayers = tableAssignments[i];
            const playerIds = tablePlayers.map(p => p.id);
            const positionsMap = {};
            tablePlayers.forEach((p, idx) => {
                positionsMap[positions[idx]] = p.id; // { East: playerId, South: playerId, ... }
            });
            
            // Create table
            const tableRef = await addDoc(collection(db, 'tournaments', currentTournamentId, 'tables'), {
                tableNumber: nextTableNum + i,
                players: playerIds,
                positions: positionsMap,
                active: true,
                createdAt: serverTimestamp()
            });
            
            tableRefs.push({ ref: tableRef, players: tablePlayers, positions });
        }
        
        // Use batch write to update all players
        const batch = writeBatch(db);
        for (let i = 0; i < tableRefs.length; i++) {
            const { ref: tableRef, players: tablePlayers, positions: positionsList } = tableRefs[i];
            for (let j = 0; j < tablePlayers.length; j++) {
                const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', tablePlayers[j].id);
                batch.update(playerRef, {
                    tableId: tableRef.id,
                    position: positionsList[j]
                });
            }
        }
        
        // Commit all player updates in one batch
        await batch.commit();
        
        showToast(`${numTables} table(s) created and players assigned!`, "success");
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error auto-assigning tables:', error);
        showToast('Error auto-assigning tables: ' + error.message, 'error');
    }
});

// Update max players
window.updateMaxPlayers = async function(newValue, oldValue) {
    const newMax = parseInt(newValue) || 0;
    if (newMax === oldValue) return;
    
    try {
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            maxPlayers: newMax
        });
        showToast('Max players updated!', 'success');
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error updating max players:', error);
        showToast('Error updating max players: ' + error.message, 'error');
    }
};

// Update total rounds
window.updateTotalRounds = async function(newValue, oldValue) {
    const newTotal = parseInt(newValue) || 0;
    if (newTotal === oldValue || newTotal < 2) return;
    
    try {
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            totalRounds: newTotal
        });
        showToast('Total rounds updated!', 'success');
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error updating total rounds:', error);
        showToast('Error updating total rounds: ' + error.message, 'error');
    }
};

// Update tournament code
window.updateTournamentCode = async function(newValue, oldValue) {
    const newCode = newValue.trim().toUpperCase();
    const oldCode = oldValue.trim().toUpperCase();
    
    // No change
    if (newCode === oldCode) return;
    
    // Validate
    const validation = validateTournamentCode(newCode);
    if (!validation.valid) {
        showToast(validation.error, 'error');
        // Reset to old value
        document.getElementById('tournamentCodeInput').value = oldValue;
        return;
    }
    
    try {
        // Check uniqueness (exclude current tournament)
        if (!(await isTournamentCodeUnique(validation.code, currentTournamentId))) {
            showToast('This tournament code is already in use by another tournament.', 'error');
            document.getElementById('tournamentCodeInput').value = oldValue;
            return;
        }
        
        await updateDoc(doc(db, 'tournaments', currentTournamentId), {
            tournamentCode: validation.code
        });
        showToast(`Tournament code updated to: ${validation.code}`, 'success');
        selectTournament(currentTournamentId); // Refresh
    } catch (error) {
        console.error('Error updating tournament code:', error);
        showToast('Error updating tournament code: ' + error.message, 'error');
        document.getElementById('tournamentCodeInput').value = oldValue;
    }
};

// Make functions globally accessible
window.editPlayer = editPlayer;
window.deletePlayer = deletePlayer;
window.deleteTable = deleteTable;


// ============================================================================
// TABLE MAP FUNCTIONALITY (Simple HTML/CSS approach)
// ============================================================================

let tableMapObjects = {}; // Store table divs by table ID
let draggedTable = null;
let dragOffset = { x: 0, y: 0 };

// Initialize table map
function initTableMap() {
    loadTablesOntoMap();
}

// Show/hide table map
document.getElementById('showTableMapCheckbox').addEventListener('change', (e) => {
    const container = document.getElementById('tableMapContainer');
    if (e.target.checked) {
        container.style.display = 'block';
        initTableMap();
    } else {
        container.style.display = 'none';
    }
});

// Load all tables onto the map
function loadTablesOntoMap() {
    const mapContainer = document.getElementById('tableMapCanvas');
    if (!mapContainer) return;
    
    // Clear existing table divs
    mapContainer.innerHTML = '';
    tableMapObjects = {};
    
    // Add each table as a div
    Object.values(tablesData).forEach(table => {
        addTableToMap(table);
    });
}

// Add a table to the map
function addTableToMap(table) {
    const mapContainer = document.getElementById('tableMapCanvas');
    const canvasWidth = mapContainer.offsetWidth || 1200;
    const canvasHeight = mapContainer.offsetHeight || 600;
    
    // Use stored position or generate random within canvas bounds
    const x = table.mapX !== null && table.mapX !== undefined 
        ? Math.min(table.mapX, canvasWidth - 100) 
        : (Math.random() * (canvasWidth - 200) + 100);
    const y = table.mapY !== null && table.mapY !== undefined 
        ? Math.min(table.mapY, canvasHeight - 100) 
        : (Math.random() * (canvasHeight - 200) + 100);
    const playerCount = table.players ? table.players.length : 0;
    const isActive = table.active !== false; // Default to true if not set
    
    // Determine color based on status
    let backgroundColor;
    if (!isActive) {
        backgroundColor = '#94a3b8'; // Gray for inactive
    } else if (playerCount === 4) {
        backgroundColor = '#10b981'; // Green for full
    } else if (playerCount > 0 && playerCount < 4) {
        backgroundColor = '#f59e0b'; // Amber/Yellow for partially full
    } else {
        backgroundColor = '#6b7280'; // Dark gray for empty
    }
    
    // Create table div (circle with text)
    const tableDiv = document.createElement('div');
    tableDiv.style.position = 'absolute';
    tableDiv.style.left = x + 'px';
    tableDiv.style.top = y + 'px';
    tableDiv.style.width = '80px';
    tableDiv.style.height = '80px';
    tableDiv.style.borderRadius = '50%';
    tableDiv.style.background = backgroundColor;
    tableDiv.style.border = isActive ? '3px solid #1f2937' : '3px dashed #475569';
    tableDiv.style.display = 'flex';
    tableDiv.style.alignItems = 'center';
    tableDiv.style.justifyContent = 'center';
    tableDiv.style.color = 'white';
    tableDiv.style.fontWeight = 'bold';
    tableDiv.style.fontSize = '20px';
    tableDiv.style.cursor = 'move';
    tableDiv.style.userSelect = 'none';
    tableDiv.style.opacity = isActive ? '1' : '0.6';
    tableDiv.textContent = `T${table.tableNumber}`;
    tableDiv.dataset.tableId = table.id;
    tableDiv.dataset.tableNumber = table.tableNumber;
    
    // Make it draggable
    let isDragging = false;
    let startX, startY, initialX, initialY;
    
    const onMouseDown = (e) => {
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialX = parseInt(tableDiv.style.left);
        initialY = parseInt(tableDiv.style.top);
        tableDiv.style.zIndex = '1000';
        e.preventDefault();
    };
    
    const onMouseMove = (e) => {
        if (!isDragging) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        tableDiv.style.left = (initialX + dx) + 'px';
        tableDiv.style.top = (initialY + dy) + 'px';
    };
    
    const onMouseUp = (e) => {
        if (isDragging) {
            isDragging = false;
            tableDiv.style.zIndex = '1';
            // Save position to Firebase
            const finalX = parseInt(tableDiv.style.left);
            const finalY = parseInt(tableDiv.style.top);
            saveTablePosition(table.id, finalX, finalY);
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        }
    };
    
    tableDiv.addEventListener('mousedown', (e) => {
        onMouseDown(e);
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });
    
    // Right-click for menu
    tableDiv.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        showTableMenu(table.id, table.tableNumber, isActive, e.clientX, e.clientY);
    });
    
    mapContainer.appendChild(tableDiv);
    tableMapObjects[table.id] = tableDiv;
}

// Show context menu for table
function showTableMenu(tableId, tableNumber, isActive, x, y) {
    // Remove any existing menu
    const existingMenu = document.getElementById('tableContextMenu');
    if (existingMenu) existingMenu.remove();
    
    const menu = document.createElement('div');
    menu.id = 'tableContextMenu';
    menu.style.position = 'fixed';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.background = 'white';
    menu.style.border = '1px solid #e5e7eb';
    menu.style.borderRadius = '8px';
    menu.style.boxShadow = '0 4px 6px rgba(0,0,0,0.1)';
    menu.style.zIndex = '10000';
    menu.style.minWidth = '180px';
    
    const toggleText = isActive ? 'Mark as Inactive' : 'Mark as Active';
    const toggleIcon = isActive ? '🚫' : '✅';
    
    menu.innerHTML = `
        <div style="padding: 8px 0;">
            <button class="menu-item" data-action="toggle" style="width: 100%; padding: 10px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; display: flex; align-items: center; gap: 10px;">
                <span>${toggleIcon}</span>
                <span>${toggleText}</span>
            </button>
            <button class="menu-item" data-action="delete" style="width: 100%; padding: 10px 16px; border: none; background: none; text-align: left; cursor: pointer; font-size: 14px; color: #ef4444; display: flex; align-items: center; gap: 10px;">
                <span>🗑️</span>
                <span>Delete Table</span>
            </button>
        </div>
    `;
    
    // Hover effects
    menu.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('mouseenter', () => {
            item.style.background = '#f3f4f6';
        });
        item.addEventListener('mouseleave', () => {
            item.style.background = 'none';
        });
    });
    
    // Handle clicks
    menu.querySelector('[data-action="toggle"]').addEventListener('click', async () => {
        menu.remove();
        
        // If deactivating a table with players, confirm first
        const table = tablesData[tableId];
        const newActiveState = !isActive;
        
        if (!newActiveState && table.players && table.players.length > 0) {
            const playerNames = table.players.map(pid => playersData[pid]?.name || 'Unknown').join(', ');
            
            showConfirmAction(
                'Deactivate Table',
                `<p>Deactivating this table will unassign <strong>${table.players.length}</strong> player(s):</p>` +
                `<p style="margin-top: 10px; padding: 10px; background: #f3f4f6; border-radius: 6px; font-size: 13px;">${playerNames}</p>` +
                `<p style="margin-top: 10px;">Continue?</p>`,
                async () => {
                    await toggleTableActive(tableId);
                }
            );
        } else {
            await toggleTableActive(tableId);
        }
    });
    
    menu.querySelector('[data-action="delete"]').addEventListener('click', () => {
        menu.remove();
        
        const table = tablesData[tableId];
        const playerCount = table?.players?.length || 0;
        
        let message = `<p>Delete Table ${tableNumber}?</p>`;
        if (playerCount > 0) {
            message += `<p style="margin-top: 10px; color: #f59e0b;">This will unassign <strong>${playerCount}</strong> player(s) from this table.</p>`;
        }
        
        showConfirmAction(
            'Delete Table',
            message,
            () => {
                deleteTableFromMap(tableId);
            }
        );
    });
    
    document.body.appendChild(menu);
    
    // Close menu when clicking outside
    setTimeout(() => {
        document.addEventListener('click', function closeMenu(e) {
            if (!menu.contains(e.target)) {
                menu.remove();
                document.removeEventListener('click', closeMenu);
            }
        });
    }, 0);
}

// Toggle table active/inactive
async function toggleTableActive(tableId) {
    try {
        const table = tablesData[tableId];
        const newActiveState = !(table.active !== false); // Toggle
        
        // If deactivating, unassign all players from this table
        if (!newActiveState && table.players && table.players.length > 0) {
            const playerIds = table.players;
            
            // Use batch write for efficiency
            const batch = writeBatch(db);
            
            // Batch: Unassign all players
            for (const playerId of playerIds) {
                const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
                batch.update(playerRef, {
                    tableId: null,
                    position: null
                });
            }
            
            // Batch: Clear table's player list
            const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', tableId);
            batch.update(tableRef, {
                active: newActiveState,
                players: [],
                positions: {}
            });
            
            await batch.commit();
        } else {
            // Just toggle active state
            await updateDoc(doc(db, 'tournaments', currentTournamentId, 'tables', tableId), {
                active: newActiveState
            });
        }
    } catch (error) {
        console.error('Error toggling table active state:', error);
        showToast('Error updating table: ' + error.message, 'error');
    }
}

// Save table position to Firebase
async function saveTablePosition(tableId, x, y) {
    try {
        await updateDoc(doc(db, 'tournaments', currentTournamentId, 'tables', tableId), {
            mapX: Math.round(x),
            mapY: Math.round(y)
        });
    } catch (error) {
        console.error('Error saving table position:', error);
    }
}

// Delete table from map and Firebase
async function deleteTableFromMap(tableId) {
    try {
        // Use batch write for efficiency
        const batch = writeBatch(db);
        
        // Batch: Unassign players from this table
        const players = Object.values(playersData).filter(p => p.tableId === tableId);
        for (const player of players) {
            const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', player.id);
            batch.update(playerRef, {
                tableId: null,
                position: null
            });
        }
        
        // Batch: Delete table from Firebase
        const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', tableId);
        batch.delete(tableRef);
        
        await batch.commit();
        
        // Remove from map
        if (tableMapObjects[tableId]) {
            tableMapObjects[tableId].remove();
            delete tableMapObjects[tableId];
        }
    } catch (error) {
        console.error('Error deleting table:', error);
        showToast('Error deleting table: ' + error.message, 'error');
    }
}

// Bulk Create Tables Button
document.getElementById('bulkCreateTablesBtn').addEventListener('click', () => {
    // Suggest next available table number
    const existingNumbers = Object.values(tablesData).map(t => t.tableNumber || 0);
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    document.getElementById('startTableNumber').value = nextNumber;
    document.getElementById('bulkCreateTablesModal').classList.remove('hidden');
});

document.getElementById('cancelBulkCreateTablesBtn').addEventListener('click', () => {
    document.getElementById('bulkCreateTablesModal').classList.add('hidden');
});

document.getElementById('confirmBulkCreateTablesBtn').addEventListener('click', async () => {
    const startNum = parseInt(document.getElementById('startTableNumber').value) || 1;
    const numTables = parseInt(document.getElementById('numTablesToCreate').value) || 1;
    
    if (numTables < 1 || numTables > 50) {
        showToast('Please enter a number between 1 and 50', 'warning');
        return;
    }
    
    // Check for existing table numbers
    const existingNumbers = new Set(Object.values(tablesData).map(t => t.tableNumber));
    const conflicts = [];
    
    for (let i = 0; i < numTables; i++) {
        const tableNumber = startNum + i;
        if (existingNumbers.has(tableNumber)) {
            conflicts.push(tableNumber);
        }
    }
    
    if (conflicts.length > 0) {
        showToast(`Cannot create tables:\n\nTable numbers already exist: ${conflicts.join(', ')}\n\nPlease choose a different starting number.`);
        return;
    }
    
    document.getElementById('bulkCreateTablesModal').classList.add('hidden');
    
    try {
        const tablesPerRow = 5;
        const spacingX = 200;
        const spacingY = 150;
        const startX = 150;
        const startY = 100;
        
        // Use batch write for all tables - single network call
        const batch = writeBatch(db);
        
        for (let i = 0; i < numTables; i++) {
            const tableNumber = startNum + i;
            const row = Math.floor(i / tablesPerRow);
            const col = i % tablesPerRow;
            const mapX = startX + (col * spacingX);
            const mapY = startY + (row * spacingY);
            
            const tableRef = doc(collection(db, 'tournaments', currentTournamentId, 'tables'));
            batch.set(tableRef, {
                tableNumber: tableNumber,
                players: [],
                positions: {},
                mapX: mapX,
                mapY: mapY,
                active: true,
                createdAt: serverTimestamp()
            });
        }
        
        // Commit all tables in one batch
        await batch.commit();
        
        showToast(`Created ${numTables} table(s)!`, "success");
    } catch (error) {
        console.error('Error creating tables:', error);
        showToast('Error creating tables: ' + error.message, 'error');
    }
});

// Add Single Table to Map
document.getElementById('addTableToMapBtn').addEventListener('click', () => {
    const existingNumbers = Object.values(tablesData).map(t => t.tableNumber || 0);
    const nextNumber = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : 1;
    document.getElementById('newTableNumber').value = nextNumber;
    document.getElementById('addTableToMapModal').classList.remove('hidden');
});

document.getElementById('cancelAddTableToMapBtn').addEventListener('click', () => {
    document.getElementById('addTableToMapModal').classList.add('hidden');
});

document.getElementById('confirmAddTableToMapBtn').addEventListener('click', async () => {
    const tableNumber = parseInt(document.getElementById('newTableNumber').value) || 1;
    
    // Check if table number already exists
    const existing = Object.values(tablesData).find(t => t.tableNumber === tableNumber);
    if (existing) {
        showToast(`Table ${tableNumber} already exists!\n\nPlease choose a different number.`, "warning");
        return;
    }
    
    document.getElementById('addTableToMapModal').classList.add('hidden');
    
    try {
        // Random position to avoid stacking
        const randomX = Math.floor(Math.random() * 800 + 200); // 200-1000
        const randomY = Math.floor(Math.random() * 500 + 150); // 150-650
        
        await addDoc(collection(db, 'tournaments', currentTournamentId, 'tables'), {
            tableNumber: tableNumber,
            players: [],
            positions: {},
            mapX: randomX,
            mapY: randomY,
            active: true,
            createdAt: serverTimestamp()
        });
        
        // Enable map if not already visible
        const checkbox = document.getElementById('showTableMapCheckbox');
        if (!checkbox.checked) {
            checkbox.checked = true;
            checkbox.dispatchEvent(new Event('change')); // Trigger the change event to init map
        } else {
            // Map already visible, just reload it
            setTimeout(() => loadTablesOntoMap(), 500);
        }
    } catch (error) {
        console.error('Error creating table:', error);
        showToast('Error creating table: ' + error.message, 'error');
    }
});

// Update table map when tables change
function updateTableMap() {
    const checkbox = document.getElementById('showTableMapCheckbox');
    if (checkbox && checkbox.checked) {
        loadTablesOntoMap();
    }
}

// ============================================================================
// VALIDATION ERROR MODAL
// ============================================================================

function showValidationError(message) {
    document.getElementById('validationErrorMessage').innerHTML = message;
    document.getElementById('validationErrorModal').classList.remove('hidden');
}

document.getElementById('closeValidationErrorBtn').addEventListener('click', () => {
    document.getElementById('validationErrorModal').classList.add('hidden');
});

// ============================================================================
// SEAT ASSIGNMENT FUNCTIONALITY
// ============================================================================

let currentSeatData = { tableId: null, tableNumber: null, position: null };

// Open seat assignment modal
window.openSeatAssignment = function(tableId, tableNumber, position) {
    const table = tablesData[tableId];
    if (!table) return;
    
    currentSeatData = { tableId, tableNumber, position };
    
    // Update modal title and info
    document.getElementById('seatAssignmentTitle').textContent = `Assign Player to Seat`;
    document.getElementById('seatTableNumber').textContent = `Table ${tableNumber}`;
    document.getElementById('seatPosition').textContent = `${position} (${getWindSymbol(position)})`;
    
    // Find current player in this seat
    const currentPlayerId = table.positions?.[position];
    const currentPlayerName = currentPlayerId ? playersData[currentPlayerId]?.name || 'Unknown' : null;
    
    if (currentPlayerName) {
        document.getElementById('currentSeatPlayer').innerHTML = `<strong>Current Player:</strong> ${currentPlayerName}`;
    } else {
        document.getElementById('currentSeatPlayer').innerHTML = `<strong>Current Player:</strong> <em style="color: #6b7280;">None</em>`;
    }
    
    // Populate player dropdown
    const select = document.getElementById('seatPlayerSelect');
    select.innerHTML = '<option value="">-- Remove Player --</option>';
    
    // Get unassigned players + current player (if any)
    const unassignedPlayers = Object.values(playersData).filter(p => 
        (!p.tableId || p.id === currentPlayerId) && !p.eliminated
    );
    
    unassignedPlayers.sort((a, b) => a.name.localeCompare(b.name));
    
    unassignedPlayers.forEach(player => {
        const option = document.createElement('option');
        option.value = player.id;
        option.textContent = player.name;
        if (player.id === currentPlayerId) {
            option.selected = true;
        }
        select.appendChild(option);
    });
    
    // Show modal
    document.getElementById('seatAssignmentModal').classList.remove('hidden');
};

// Cancel seat assignment
document.getElementById('cancelSeatAssignmentBtn').addEventListener('click', () => {
    document.getElementById('seatAssignmentModal').classList.add('hidden');
});

// Confirm seat assignment
document.getElementById('confirmSeatAssignmentBtn').addEventListener('click', async () => {
    const { tableId, tableNumber, position } = currentSeatData;
    const selectedPlayerId = document.getElementById('seatPlayerSelect').value;
    
    try {
        const table = tablesData[tableId];
        
        // Find current player in this seat
        const currentPlayerId = table.positions?.[position];
        
        // Use batch for efficiency
        const batch = writeBatch(db);
        const tableRef = doc(db, 'tournaments', currentTournamentId, 'tables', tableId);
        
        // Build new players array and positions map
        let newPlayers = [...(table.players || [])];
        let newPositions = { ...(table.positions || {}) };
        
        // Remove current player from this seat (if any)
        if (currentPlayerId) {
            newPlayers = newPlayers.filter(id => id !== currentPlayerId);
            delete newPositions[position]; // Delete the position key, not playerId
            
            const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', currentPlayerId);
            batch.update(playerRef, {
                tableId: null,
                position: null
            });
        }
        
        // Add new player to this seat (if selected)
        if (selectedPlayerId) {
            // Check if this player is already at this table in a different seat
            if (newPlayers.includes(selectedPlayerId)) {
                showToast('This player is already assigned to another seat at this table!', 'warning');
                return;
            }
            
            newPlayers.push(selectedPlayerId);
            newPositions[position] = selectedPlayerId; // { East: playerId, South: playerId, ... }
            
            const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', selectedPlayerId);
            batch.update(playerRef, {
                tableId: tableId,
                position: position
            });
        }
        
        // Update table
        batch.update(tableRef, {
            players: newPlayers,
            positions: newPositions
        });
        
        await batch.commit();
        
        document.getElementById('seatAssignmentModal').classList.add('hidden');
        
        // Refresh displays (updates happen via onSnapshot, but this ensures map updates too)
        updateTableMap();
    } catch (error) {
        console.error('Error assigning seat:', error);
        showToast('Error assigning seat: ' + error.message, 'error');
    }
});

// Round Details Modal
document.getElementById('closeRoundDetailsBtn').addEventListener('click', () => {
    document.getElementById('roundDetailsModal').classList.add('hidden');
});

// Toggle accordion for table details
window.toggleAccordion = function(accordionId) {
    const content = document.getElementById(accordionId);
    const icon = document.getElementById(accordionId + '-icon');
    
    if (content.style.display === 'none') {
        content.style.display = 'block';
        icon.textContent = '▲';
    } else {
        content.style.display = 'none';
        icon.textContent = '▼';
    }
};

// Build time series chart for score progression
function buildTimeSeriesChart(participants, allWinEvents, roundData) {
    // Generate unique canvas ID for this table
    const canvasId = `chart-${Math.random().toString(36).substr(2, 9)}`;
    
    const roundStartTime = roundData.startedAt ? roundData.startedAt.toDate() : null;
    const roundEndTime = roundData.endedAt ? roundData.endedAt.toDate() : null;
    const roundDurationMin = roundData.timerDuration || 30;
    const roundDurationMs = roundDurationMin * 60 * 1000;
    
    if (!roundStartTime) {
        return '<p style="color: #9ca3af; font-size: 13px;">Chart unavailable - round start time missing</p>';
    }
    
    // Calculate effective end time (round end or round start + duration)
    const effectiveEndTime = roundEndTime || new Date(roundStartTime.getTime() + roundDurationMs);
    
    // Colors for each player (cycle through these)
    const colors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];
    
    // Collect all score events for the chart
    const allChartEvents = [];
    participants.forEach(p => {
        const scoreEvents = p.scoreEvents || [];
        const winTimestamps = p.winTimestamps || [];
        
        if (scoreEvents.length > 0) {
            scoreEvents.forEach(event => {
                allChartEvents.push({
                    participantId: p.id,
                    timestamp: event.timestamp,
                    delta: event.delta || 1
                });
            });
        } else {
            // Fallback to winTimestamps
            winTimestamps.forEach(timestamp => {
                allChartEvents.push({
                    participantId: p.id,
                    timestamp: timestamp,
                    delta: 1
                });
            });
        }
    });
    
    // Build datasets for each player
    const datasets = participants.map((participant, index) => {
        const playerEvents = allChartEvents.filter(e => e.participantId === participant.id);
        
        // Sort by timestamp
        playerEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
        
        // Build data points: [time, cumulative wins]
        const dataPoints = [];
        
        // Start at 0
        dataPoints.push({ x: 0, y: 0 });
        
        let cumulativeWins = 0;
        playerEvents.forEach(event => {
            const eventTime = new Date(event.timestamp.toDate());
            const offsetMs = eventTime - roundStartTime;
            const offsetMin = offsetMs / 60000;
            
            // Cap at round end time for display (grace period scores show at end)
            const displayOffsetMin = Math.min(offsetMin, roundDurationMin);
            
            cumulativeWins += event.delta; // Can be +1 or -1
            dataPoints.push({ x: displayOffsetMin, y: cumulativeWins });
        });
        
        // End at round duration with final score
        if (dataPoints.length === 1 || dataPoints[dataPoints.length - 1].x < roundDurationMin) {
            dataPoints.push({ x: roundDurationMin, y: cumulativeWins });
        }
        
        const color = colors[index % colors.length];
        const positionShort = participant.position?.charAt(0) || '?';
        
        return {
            label: `${participant.name} (${positionShort})`,
            data: dataPoints,
            borderColor: color,
            backgroundColor: color + '20',
            borderWidth: 2,
            pointRadius: 4,
            pointHoverRadius: 6,
            stepped: false,
            tension: 0
        };
    });
    
    // Create canvas and initialize chart after DOM insertion
    setTimeout(() => {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;
        
        const ctx = canvas.getContext('2d');
        new Chart(ctx, {
            type: 'line',
            data: { datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Time (minutes from round start)'
                        },
                        min: 0,
                        max: roundDurationMin,
                        ticks: {
                            stepSize: roundDurationMin <= 10 ? 1 : 5
                        }
                    },
                    y: {
                        type: 'linear',
                        title: {
                            display: true,
                            text: 'Cumulative Wins'
                        },
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: true,
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y} wins at +${context.parsed.x.toFixed(1)}min`;
                            }
                        }
                    }
                }
            }
        });
    }, 100);
    
    return `<canvas id="${canvasId}" style="max-height: 300px;"></canvas>`;
}

// View Round Details Function (called from rounds history)
window.viewRoundDetails = async function(roundId) {
    if (!currentTournamentId) return;
    
    try {
        // Fetch round document
        const roundDoc = await getDoc(doc(db, 'tournaments', currentTournamentId, 'rounds', roundId));
        if (!roundDoc.exists()) {
            showToast('Round not found!', 'error');
            return;
        }
        
        const roundData = roundDoc.data();
        const roundNumber = roundData.roundNumber;
        const startDate = roundData.startedAt ? new Date(roundData.startedAt.toDate()).toLocaleString() : 'N/A';
        const endDate = roundData.endedAt ? new Date(roundData.endedAt.toDate()).toLocaleString() : 'N/A';
        const timerText = roundData.timerDuration ? `${roundData.timerDuration} minutes` : 'N/A';
        const isPlayoff = roundData.isPlayoff || false;
        const playoffBadge = isPlayoff ? '<span style="margin-left: 10px; background: #fbbf24; color: #92400e; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">PLAYOFF</span>' : '';
        
        // Update modal title and info
        document.getElementById('roundDetailsTitle').innerHTML = `Round ${roundNumber} Details ${playoffBadge}`;
        document.getElementById('roundDetailsInfo').innerHTML = `
            <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 15px;">
                <div><strong>Timer Duration:</strong> ${timerText}</div>
                <div><strong>Started:</strong> ${startDate}</div>
                <div><strong>Ended:</strong> ${endDate}</div>
            </div>
        `;
        
        // Fetch all participants for this round
        const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants'));
        
        if (participantsSnap.empty) {
            document.getElementById('roundDetailsTables').innerHTML = '<p style="color: #6b7280; text-align: center; padding: 20px;">No participant data found for this round.</p>';
            document.getElementById('roundDetailsModal').classList.remove('hidden');
            return;
        }
        
        // Group participants by table
        const tableGroups = {};
        participantsSnap.forEach(doc => {
            const participant = { id: doc.id, ...doc.data() };
            const tableId = participant.tableId || 'unassigned';
            
            if (!tableGroups[tableId]) {
                tableGroups[tableId] = [];
            }
            tableGroups[tableId].push(participant);
        });
        
        // Get table data to display table numbers
        const tablesSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'tables'));
        const tablesMap = {};
        tablesSnap.forEach(doc => {
            tablesMap[doc.id] = { id: doc.id, ...doc.data() };
        });
        
        // Render tables
        let tablesHTML = '';
        
        // Sort tables by table number
        const sortedTableIds = Object.keys(tableGroups).sort((a, b) => {
            if (a === 'unassigned') return 1;
            if (b === 'unassigned') return -1;
            const tableA = tablesMap[a]?.tableNumber || 999;
            const tableB = tablesMap[b]?.tableNumber || 999;
            return tableA - tableB;
        });
        
        for (const tableId of sortedTableIds) {
            const participants = tableGroups[tableId];
            const table = tablesMap[tableId];
            const tableNumber = table?.tableNumber || '?';
            
            // Calculate net score for this table
            const tableNetScore = participants.reduce((total, p) => {
                const scoreEvents = p.scoreEvents || [];
                const participantScore = scoreEvents.reduce((sum, e) => sum + e.delta, 0);
                return total + participantScore;
            }, 0);
            
            const scoreDisplay = tableNetScore >= 0 ? `(+${tableNetScore})` : `(${tableNetScore})`;
            const tableName = tableId === 'unassigned' 
                ? 'Unassigned Players' 
                : `Table ${tableNumber} ${scoreDisplay}`;
            
            // Sort participants by position
            const positionOrder = { 'East': 0, 'South': 1, 'West': 2, 'North': 3 };
            participants.sort((a, b) => {
                const orderA = positionOrder[a.position] ?? 999;
                const orderB = positionOrder[b.position] ?? 999;
                return orderA - orderB;
            });
            
            // Build player list
            let playersListHTML = participants.map(p => {
                const position = p.position || 'N/A';
                const positionShort = position.charAt(0); // E, S, W, N
                const winsAtRoundStart = p.wins || 0;
                const scoreEvents = p.scoreEvents || [];
                const roundWins = scoreEvents.reduce((sum, e) => sum + e.delta, 0);
                
                return `
                    <div style="display: flex; justify-content: space-between; padding: 8px; border-bottom: 1px solid #e5e7eb;">
                        <div style="flex: 1;">
                            <strong>${positionShort}:</strong> ${p.name}
                        </div>
                        <div style="color: #6b7280; font-size: 13px;">
                            Tourney Wins: ${winsAtRoundStart} | Round Wins: ${roundWins}
                        </div>
                    </div>
                `;
            }).join('');
            
            // Build scoring timeline (all score events from all players at this table, chronologically)
            let allWinEvents = [];
            participants.forEach(p => {
                const scoreEvents = p.scoreEvents || [];
                const winTimestamps = p.winTimestamps || [];
                
                // If scoreEvents exist, use those (includes +1 and -1)
                if (scoreEvents.length > 0) {
                    scoreEvents.forEach((event, index) => {
                        allWinEvents.push({
                            player: p,
                            timestamp: event.timestamp,
                            delta: event.delta || 1, // Default to +1 for old data
                            participantId: p.id,
                            eventIndex: index,
                            isScoreEvent: true
                        });
                    });
                } else {
                    // Fallback to winTimestamps for backwards compatibility
                    winTimestamps.forEach((timestamp, index) => {
                        allWinEvents.push({
                            player: p,
                            timestamp: timestamp,
                            delta: 1,
                            participantId: p,
                            winIndex: index,
                            isScoreEvent: false
                        });
                    });
                }
            });
            
            // Sort events chronologically
            allWinEvents.sort((a, b) => a.timestamp.toMillis() - b.timestamp.toMillis());
            
            // Track running totals for each player
            const runningTotals = {};
            participants.forEach(p => {
                runningTotals[p.id] = 0;
            });
            
            let timelineHTML = '';
            let batchScoringCount = 0;
            
            if (allWinEvents.length === 0) {
                timelineHTML = '<p style="color: #9ca3af; font-size: 13px; padding: 10px; text-align: center;">No score events recorded at this table.</p>';
            } else {
                const roundStartTime = roundData.startedAt ? roundData.startedAt.toDate() : null;
                
                timelineHTML = allWinEvents.map((event, index) => {
                    const eventDate = new Date(event.timestamp.toDate());
                    const clockTime = eventDate.toLocaleTimeString();
                    
                    // Calculate offset from round start
                    let offsetStr = '';
                    if (roundStartTime) {
                        const offsetMs = eventDate - roundStartTime;
                        const offsetMin = Math.floor(offsetMs / 60000);
                        const offsetSec = Math.floor((offsetMs % 60000) / 1000);
                        offsetStr = `+${offsetMin}m ${offsetSec}s`;
                    }
                    
                    // Check if this score event is within 30 seconds of the previous event (batch scoring warning)
                    let batchWarning = '';
                    if (index > 0) {
                        const prevEventDate = new Date(allWinEvents[index - 1].timestamp.toDate());
                        const timeDiffMs = eventDate - prevEventDate;
                        const timeDiffSec = timeDiffMs / 1000;
                        
                        if (timeDiffSec <= 30) {
                            batchScoringCount++;
                            batchWarning = `<span style="color: #f59e0b; font-weight: bold; margin-left: 8px;" title="Warning: Recorded within ${timeDiffSec.toFixed(1)}s of previous score event - possible batch scoring">⚠️ ${timeDiffSec.toFixed(1)}s</span>`;
                        }
                    }
                    
                    const positionShort = event.player.position?.charAt(0) || '?';
                    const delta = event.delta || 1;
                    
                    // Update running total for this player
                    runningTotals[event.participantId] += delta;
                    const runningCount = runningTotals[event.participantId];
                    
                    // Style based on delta
                    const deltaColor = delta > 0 ? '#10b981' : '#ef4444';
                    const deltaText = delta > 0 ? '+1' : '-1';
                    
                    return `
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px; border-bottom: 1px solid #f3f4f6;">
                            <div style="flex: 1; font-size: 13px;">
                                <span style="color: #667eea; font-weight: 600;">${offsetStr}</span>
                                <span style="color: #9ca3af; font-size: 11px;">(${clockTime})</span> - 
                                <strong>${event.player.name}</strong> (${positionShort}) 
                                <span style="color: ${deltaColor}; font-weight: bold;">${deltaText}</span>
                                <span style="color: #9ca3af; font-size: 12px;">(Total: ${runningCount})</span>
                                ${batchWarning}
                            </div>
                            <div style="display: flex; gap: 5px;">
                                <button class="btn btn-small btn-secondary" onclick="editWinTimestamp('${roundId}', '${event.participantId}', ${event.winIndex || event.eventIndex})" style="padding: 4px 8px; font-size: 11px;">Edit</button>
                                <button class="btn btn-small btn-secondary" onclick="deleteWinTimestamp('${roundId}', '${event.participantId}', ${event.winIndex || event.eventIndex})" style="padding: 4px 8px; font-size: 11px; background: #ef4444;">Delete</button>
                            </div>
                        </div>
                    `;
                }).join('');
            }
            
            // Calculate total wins for this table
            const totalWins = allWinEvents.filter(e => e.delta > 0).length;
            
            // Create zero wins warning banner if applicable
            const zeroWinsWarningBanner = totalWins === 0
                ? `<div style="background: #fee2e2; border: 1px solid #ef4444; border-radius: 6px; padding: 10px; margin-bottom: 15px;">
                       <strong style="color: #7f1d1d;">⚠️ No Wins Recorded</strong>
                       <p style="margin: 5px 0 0 0; font-size: 13px; color: #7f1d1d;">
                           This table has 0 wins recorded for the entire round. Verify players scored correctly.
                       </p>
                   </div>`
                : '';
            
            // Create batch scoring warning banner if applicable
            const batchWarningBanner = batchScoringCount > 0 
                ? `<div style="background: #fef3c7; border: 1px solid #f59e0b; border-radius: 6px; padding: 10px; margin-bottom: 15px;">
                       <strong style="color: #92400e;">⚠️ Batch Scoring Detected</strong>
                       <p style="margin: 5px 0 0 0; font-size: 13px; color: #78350f;">
                           ${batchScoringCount} scoring update(s) recorded within 30 seconds of each other. Players should score in real-time, not batched.
                       </p>
                   </div>`
                : '';
            
            // Build time series chart
            const chartHTML = buildTimeSeriesChart(participants, allWinEvents, roundData);
            
            // Unique ID for collapsible content
            const accordionId = `table-accordion-${tableId}`;
            const warningEmoji = (batchScoringCount > 0 || totalWins === 0) ? ' ⚠️' : '';
            
            tablesHTML += `
                <div style="background: #ffffff; border: 1px solid #e5e7eb; border-radius: 8px; margin-bottom: 15px; overflow: hidden;">
                    <div onclick="toggleAccordion('${accordionId}')" style="padding: 15px; cursor: pointer; background: #f9fafb; display: flex; justify-content: space-between; align-items: center; user-select: none;">
                        <h3 style="font-size: 16px; color: #374151; margin: 0;">${tableName}${warningEmoji}</h3>
                        <span id="${accordionId}-icon" style="font-size: 18px; color: #6b7280;">▼</span>
                    </div>
                    
                    <div id="${accordionId}" style="display: none; padding: 15px;">
                        ${zeroWinsWarningBanner}
                        ${batchWarningBanner}
                        
                        <div style="margin-bottom: 15px;">
                            ${playersListHTML}
                        </div>
                        
                        <div style="border-top: 2px solid #e5e7eb; padding-top: 15px; margin-bottom: 15px;">
                            <h4 style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">📈 Score Progression</h4>
                            ${chartHTML}
                        </div>
                        
                        <div style="border-top: 2px solid #e5e7eb; padding-top: 10px;">
                            <h4 style="font-size: 14px; color: #6b7280; margin-bottom: 10px;">
                                🕐 Scoring Timeline
                                <button class="btn btn-small btn-primary" onclick="addWinToTable('${roundId}', '${tableId}')" style="margin-left: 10px; padding: 4px 8px; font-size: 11px;">+/− Add Score Event</button>
                                <button class="btn btn-small btn-secondary" onclick="redistributeTableScores('${roundId}', '${tableId}')" style="margin-left: 5px; padding: 4px 8px; font-size: 11px; background: #667eea;">⏱️ Redistribute Events</button>
                            </h4>
                            ${timelineHTML}
                        </div>
                    </div>
                </div>
            `;
        }
        
        document.getElementById('roundDetailsTables').innerHTML = tablesHTML;
        document.getElementById('roundDetailsModal').classList.remove('hidden');
        
    } catch (error) {
        console.error('Error loading round details:', error);
        showToast('Error loading round details: ' + error.message, 'error');
    }
};

// Edit Win Timestamp
window.editWinTimestamp = async function(roundId, participantId, winIndex) {
    if (!currentTournamentId) return;
    
    try {
        // Get round data to get start time
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId);
        const roundDoc = await getDoc(roundRef);
        
        if (!roundDoc.exists()) {
            showToast('Round not found!', 'error');
            return;
        }
        
        const roundData = roundDoc.data();
        const roundStartTime = roundData.startedAt ? roundData.startedAt.toDate() : null;
        
        if (!roundStartTime) {
            showToast('Round has not started yet!', 'error');
            return;
        }
        
        // Get participant data
        const participantRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants', participantId);
        const participantDoc = await getDoc(participantRef);
        
        if (!participantDoc.exists()) {
            showToast('Participant not found!', 'error');
            return;
        }
        
        const participantData = participantDoc.data();
        const scoreEvents = participantData.scoreEvents || [];
        
        if (scoreEvents.length === 0) {
            showToast('No score events found! This may be old data format.', 'error');
            return;
        }
        
        if (winIndex >= scoreEvents.length) {
            showToast('Score event not found!', 'error');
            return;
        }
        
        const currentEvent = scoreEvents[winIndex];
        const currentTimestamp = currentEvent.timestamp;
        const currentDate = new Date(currentTimestamp.toDate());
        
        // Calculate current offset from round start
        const currentOffsetMs = currentDate - roundStartTime;
        const currentOffsetMin = Math.floor(currentOffsetMs / 60000);
        const currentOffsetSec = Math.floor((currentOffsetMs % 60000) / 1000);
        
        // Get round timer duration for validation
        const roundDurationMin = roundData.timerDuration || 30;
        
        // Prompt for new offset
        const newOffsetStr = prompt(
            `Edit score event timestamp for ${participantData.name}:\n\n` +
            `Current: +${currentOffsetMin}m ${currentOffsetSec}s from round start\n` +
            `(${currentDate.toLocaleTimeString()})\n\n` +
            `Round duration: ${roundDurationMin} minutes\n\n` +
            `Enter new time offset (minutes from round start, max ${roundDurationMin}):\n` +
            `Examples: "5" = 5 minutes, "5.5" = 5min 30sec, "12.75" = 12min 45sec`,
            `${currentOffsetMin}.${Math.round(currentOffsetSec / 60 * 100)}`
        );
        
        if (!newOffsetStr) return; // User cancelled
        
        // Parse offset
        const offsetMinutes = parseFloat(newOffsetStr);
        if (isNaN(offsetMinutes) || offsetMinutes < 0) {
            showToast('Invalid offset! Enter a positive number of minutes.', 'error');
            return;
        }
        
        // Validate against round duration
        if (offsetMinutes > roundDurationMin) {
            showToast(`Invalid offset! Cannot exceed round duration of ${roundDurationMin} minutes.`, 'error');
            return;
        }
        
        // Calculate new timestamp
        const offsetMs = offsetMinutes * 60000;
        const newDate = new Date(roundStartTime.getTime() + offsetMs);
        const newTimestamp = Timestamp.fromDate(newDate);
        
        // Update participant's scoreEvents array
        const updatedScoreEvents = [...scoreEvents];
        updatedScoreEvents[winIndex] = {
            ...currentEvent,
            timestamp: newTimestamp
        };
        
        await updateDoc(participantRef, {
            scoreEvents: updatedScoreEvents
        });
        
        // Also update player document's scoreEvents
        const playerId = participantData.playerId;
        const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
        const playerDoc = await getDoc(playerRef);
        
        if (playerDoc.exists()) {
            const playerData = playerDoc.data();
            const playerScoreEvents = playerData.scoreEvents || [];
            
            if (playerScoreEvents.length > 0) {
                // Find and replace the matching event in player's array
                const playerUpdatedScoreEvents = playerScoreEvents.map(event => {
                    if (event.timestamp.toMillis() === currentTimestamp.toMillis()) {
                        return { ...event, timestamp: newTimestamp };
                    }
                    return event;
                });
                
                await updateDoc(playerRef, {
                    scoreEvents: playerUpdatedScoreEvents
                });
            }
        }
        
        showToast('Score event timestamp updated!', 'success');
        
        // Refresh the modal
        viewRoundDetails(roundId);
        
    } catch (error) {
        console.error('Error editing score event timestamp:', error);
        showToast('Error editing timestamp: ' + error.message, 'error');
    }
};

// Delete Win Timestamp (or Score Event)
window.deleteWinTimestamp = async function(roundId, participantId, eventIndex) {
    if (!currentTournamentId) return;
    
    try {
        // Get participant data
        const participantRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants', participantId);
        const participantDoc = await getDoc(participantRef);
        
        if (!participantDoc.exists()) {
            showToast('Participant not found!', 'error');
            return;
        }
        
        const participantData = participantDoc.data();
        const scoreEvents = participantData.scoreEvents || [];
        
        if (scoreEvents.length === 0) {
            showToast('No score events found! This may be old data format.', 'error');
            return;
        }
        
        if (eventIndex >= scoreEvents.length) {
            showToast('Score event not found!', 'error');
            return;
        }
        
        const eventToDelete = scoreEvents[eventIndex];
        const dateStr = new Date(eventToDelete.timestamp.toDate()).toLocaleString();
        const delta = eventToDelete.delta || 1;
        
        const deltaText = delta > 0 ? '+1' : delta < 0 ? '-1' : '0';
        
        // Confirm deletion
        if (!confirm(`Delete ${deltaText} score event for ${participantData.name}?\n\nTimestamp: ${dateStr}\n\nThis will:\n- Remove event from round history\n- Adjust player's total wins by ${-delta}\n- Cannot be undone`)) {
            return;
        }
        
        // Update participant document
        const updatedScoreEvents = scoreEvents.filter((_, index) => index !== eventIndex);
        
        const participantUpdates = {
            wins: increment(-delta), // Reverse the delta
            scoreEvents: updatedScoreEvents
        };
        
        // Update lastWinAt if we're deleting a +1 win
        if (delta > 0) {
            // Find the most recent +1 event after deletion
            const remainingWins = updatedScoreEvents.filter(e => e.delta > 0);
            if (remainingWins.length > 0) {
                const sortedWins = [...remainingWins].sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
                participantUpdates.lastWinAt = sortedWins[0].timestamp;
            } else {
                participantUpdates.lastWinAt = null;
            }
        }
        
        await updateDoc(participantRef, participantUpdates);
        
        // Also update player document
        const playerId = participantData.playerId;
        const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
        const playerDoc = await getDoc(playerRef);
        
        if (playerDoc.exists()) {
            const playerData = playerDoc.data();
            const playerScoreEvents = playerData.scoreEvents || [];
            
            if (playerScoreEvents.length === 0) {
                // No scoreEvents on player - old data, just decrement wins
                await updateDoc(playerRef, { wins: increment(-delta) });
            } else {
                // Remove matching scoreEvent from player's array
                const updatedPlayerScoreEvents = playerScoreEvents.filter(event => 
                    event.timestamp.toMillis() !== eventToDelete.timestamp.toMillis()
                );
                
                const playerUpdates = {
                    wins: increment(-delta),
                    scoreEvents: updatedPlayerScoreEvents
                };
                
                // Update lastWinAt if we're deleting a +1 win
                if (delta > 0) {
                    const remainingWins = updatedPlayerScoreEvents.filter(e => e.delta > 0);
                    if (remainingWins.length > 0) {
                        const sortedWins = [...remainingWins].sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis());
                        playerUpdates.lastWinAt = sortedWins[0].timestamp;
                    } else {
                        playerUpdates.lastWinAt = null;
                    }
                }
                
                await updateDoc(playerRef, playerUpdates);
            }
        }
        
        showToast('Score event deleted successfully!', 'success');
        
        // Refresh the modal
        viewRoundDetails(roundId);
        
    } catch (error) {
        console.error('Error deleting score event:', error);
        showToast('Error deleting score event: ' + error.message, 'error');
    }
};

// Add Win to Table
window.addWinToTable = async function(roundId, tableId) {
    if (!currentTournamentId) return;
    
    try {
        // Get round data to get start time
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId);
        const roundDoc = await getDoc(roundRef);
        
        if (!roundDoc.exists()) {
            showToast('Round not found!', 'error');
            return;
        }
        
        const roundData = roundDoc.data();
        const roundStartTime = roundData.startedAt ? roundData.startedAt.toDate() : null;
        
        if (!roundStartTime) {
            showToast('Round has not started yet!', 'error');
            return;
        }
        
        // Get all participants at this table
        const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants'));
        
        const playersAtTable = [];
        participantsSnap.forEach(doc => {
            const participant = { id: doc.id, ...doc.data() };
            if (participant.tableId === tableId) {
                playersAtTable.push(participant);
            }
        });
        
        if (playersAtTable.length === 0) {
            showToast('No players found at this table!', 'error');
            return;
        }
        
        // Sort by position
        const positionOrder = { 'East': 0, 'South': 1, 'West': 2, 'North': 3 };
        playersAtTable.sort((a, b) => {
            const orderA = positionOrder[a.position] ?? 999;
            const orderB = positionOrder[b.position] ?? 999;
            return orderA - orderB;
        });
        
        // Prompt user to select player
        let message = 'Select player to adjust score:\n\n';
        playersAtTable.forEach((p, index) => {
            const positionShort = p.position?.charAt(0) || '?';
            message += `${index + 1}. ${p.name} (${positionShort})\n`;
        });
        message += '\nEnter number (1-' + playersAtTable.length + '):';
        
        const selection = prompt(message);
        if (!selection) return; // User cancelled
        
        const selectedIndex = parseInt(selection) - 1;
        if (isNaN(selectedIndex) || selectedIndex < 0 || selectedIndex >= playersAtTable.length) {
            showToast('Invalid selection!', 'error');
            return;
        }
        
        const selectedParticipant = playersAtTable[selectedIndex];
        
        // Prompt for score delta (+1 or -1)
        const deltaStr = prompt(
            `Adjust score for ${selectedParticipant.name}\n\n` +
            `Enter +1 to add a win or -1 to subtract a win:`,
            '+1'
        );
        
        if (!deltaStr) return; // User cancelled
        
        const delta = parseInt(deltaStr);
        if (delta !== 1 && delta !== -1) {
            showToast('Invalid input! Enter +1 or -1 only.', 'error');
            return;
        }
        
        // Get round timer duration for validation
        const roundDurationMin = roundData.timerDuration || 30;
        
        // Prompt for offset from round start
        const now = new Date();
        const currentOffsetMs = now - roundStartTime;
        const currentOffsetMin = Math.max(0, Math.min(currentOffsetMs / 60000, roundDurationMin));
        
        const promptAction = delta > 0 ? 'add win' : 'subtract win';
        
        const offsetStr = prompt(
            `${promptAction.charAt(0).toUpperCase() + promptAction.slice(1)} for ${selectedParticipant.name}\n\n` +
            `Round started at: ${roundStartTime.toLocaleTimeString()}\n` +
            `Round duration: ${roundDurationMin} minutes\n\n` +
            `Enter time offset (minutes from round start, max ${roundDurationMin}):\n` +
            `Examples: "5" = 5 minutes, "5.5" = 5min 30sec, "12.75" = 12min 45sec`,
            currentOffsetMin.toFixed(1)
        );
        
        if (!offsetStr) return; // User cancelled
        
        // Parse offset
        const offsetMinutes = parseFloat(offsetStr);
        if (isNaN(offsetMinutes) || offsetMinutes < 0) {
            showToast('Invalid offset! Enter a positive number of minutes.', 'error');
            return;
        }
        
        // Validate against round duration
        if (offsetMinutes > roundDurationMin) {
            showToast(`Invalid offset! Cannot exceed round duration of ${roundDurationMin} minutes.`, 'error');
            return;
        }
        
        // Calculate timestamp
        const offsetMs = offsetMinutes * 60000;
        const newDate = new Date(roundStartTime.getTime() + offsetMs);
        const newTimestamp = Timestamp.fromDate(newDate);
        
        const participantRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants', selectedParticipant.id);
        const playerId = selectedParticipant.playerId;
        const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
        
        // Create score event object for audit trail
        const scoreEvent = {
            timestamp: newTimestamp,
            delta: delta,
            roundNumber: roundData.roundNumber, // CRITICAL: needed for round score calculations
            addedAt: Timestamp.now() // When admin made this adjustment
        };
        
        // Update participant document
        const participantUpdates = {
            wins: increment(delta),
            scoreEvents: arrayUnion(scoreEvent)
        };
        
        // Update lastWinAt for +1 wins
        if (delta > 0) {
            participantUpdates.lastWinAt = newTimestamp;
        }
        
        await updateDoc(participantRef, participantUpdates);
        
        // Update player document
        const playerUpdates = {
            wins: increment(delta),
            scoreEvents: arrayUnion(scoreEvent)
        };
        
        if (delta > 0) {
            playerUpdates.lastWinAt = newTimestamp;
        }
        
        await updateDoc(playerRef, playerUpdates);
        
        const actionText = delta > 0 ? 'added to' : 'subtracted from';
        showToast(`Score event ${actionText} ${selectedParticipant.name}!`, 'success');
        
        // Refresh the modal
        viewRoundDetails(roundId);
        
    } catch (error) {
        console.error('Error adding score event:', error);
        showToast('Error adding score event: ' + error.message, 'error');
    }
};

// Redistribute Table Scores - evenly space all scoreEvents from t=0 to round end
window.redistributeTableScores = async function(roundId, tableId) {
    if (!currentTournamentId) return;
    
    try {
        // Get round data
        const roundRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId);
        const roundDoc = await getDoc(roundRef);
        
        if (!roundDoc.exists()) {
            showToast('Round not found!', 'error');
            return;
        }
        
        const roundData = roundDoc.data();
        const roundStartTime = roundData.startedAt ? roundData.startedAt.toDate() : null;
        const roundDurationMin = roundData.timerDuration || 30;
        
        if (!roundStartTime) {
            showToast('Round has not started yet!', 'error');
            return;
        }
        
        // Get all participants at this table
        const participantsSnap = await getDocs(collection(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants'));
        
        const playersAtTable = [];
        participantsSnap.forEach(doc => {
            const participant = { id: doc.id, ...doc.data() };
            if (participant.tableId === tableId) {
                playersAtTable.push(participant);
            }
        });
        
        if (playersAtTable.length === 0) {
            showToast('No players found at this table!', 'error');
            return;
        }
        
        // Collect all scoreEvents from all players at this table
        let allScoreEvents = [];
        playersAtTable.forEach(participant => {
            const scoreEvents = participant.scoreEvents || [];
            scoreEvents.forEach(event => {
                allScoreEvents.push({
                    participantId: participant.id,
                    playerId: participant.playerId,
                    playerName: participant.name,
                    originalTimestamp: event.timestamp,
                    delta: event.delta || 1,
                    addedAt: event.addedAt
                });
            });
        });
        
        if (allScoreEvents.length === 0) {
            showToast('No score events to redistribute at this table.', 'warning');
            return;
        }
        
        // Sort events by original timestamp to preserve order
        allScoreEvents.sort((a, b) => a.originalTimestamp.toMillis() - b.originalTimestamp.toMillis());
        
        // Confirm with admin
        const tableName = `Table ${tablesData[tableId]?.tableNumber || '?'}`;
        if (!confirm(
            `Redistribute ${allScoreEvents.length} score event(s) at ${tableName}?\n\n` +
            `This will evenly space all events from t=0 to t=${roundDurationMin} minutes.\n\n` +
            `Current order will be preserved.\n\n` +
            `This action cannot be undone!`
        )) {
            return;
        }
        
        // Calculate even spacing
        const totalEvents = allScoreEvents.length;
        const roundDurationMs = roundDurationMin * 60000;
        const spacing = roundDurationMs / (totalEvents + 1); // +1 to avoid placing event exactly at end
        
        // Create new timestamps for each event
        const now = Timestamp.now();
        allScoreEvents.forEach((event, index) => {
            const offsetMs = spacing * (index + 1);
            const newDate = new Date(roundStartTime.getTime() + offsetMs);
            event.newTimestamp = Timestamp.fromDate(newDate);
        });
        
        // Group events by participant for efficient updates
        const eventsByParticipant = {};
        allScoreEvents.forEach(event => {
            if (!eventsByParticipant[event.participantId]) {
                eventsByParticipant[event.participantId] = [];
            }
            eventsByParticipant[event.participantId].push(event);
        });
        
        // Update each participant and their corresponding player
        for (const participantId in eventsByParticipant) {
            const events = eventsByParticipant[participantId];
            const playerId = events[0].playerId;
            
            // Build new scoreEvents array for participant
            const newParticipantScoreEvents = events.map(e => ({
                timestamp: e.newTimestamp,
                delta: e.delta,
                addedAt: now // Mark as redistributed
            }));
            
            // Update participant
            const participantRef = doc(db, 'tournaments', currentTournamentId, 'rounds', roundId, 'participants', participantId);
            await updateDoc(participantRef, {
                scoreEvents: newParticipantScoreEvents,
                lastWinAt: newParticipantScoreEvents.filter(e => e.delta > 0).length > 0 
                    ? newParticipantScoreEvents.filter(e => e.delta > 0).sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())[0].timestamp 
                    : null
            });
            
            // For player: remove old events from this participant, add new ones
            const playerRef = doc(db, 'tournaments', currentTournamentId, 'players', playerId);
            const playerDoc = await getDoc(playerRef);
            const playerData = playerDoc.data();
            const oldPlayerScoreEvents = playerData.scoreEvents || [];
            
            // Remove old events by matching timestamps
            const oldTimestamps = new Set(events.map(e => e.originalTimestamp.toMillis()));
            const filteredPlayerScoreEvents = oldPlayerScoreEvents.filter(e => 
                !oldTimestamps.has(e.timestamp.toMillis())
            );
            
            // Add new events
            const updatedPlayerScoreEvents = [...filteredPlayerScoreEvents, ...newParticipantScoreEvents];
            
            // Calculate new lastWinAt for player
            const playerWins = updatedPlayerScoreEvents.filter(e => e.delta > 0);
            const playerLastWin = playerWins.length > 0 
                ? playerWins.sort((a, b) => b.timestamp.toMillis() - a.timestamp.toMillis())[0].timestamp 
                : null;
            
            await updateDoc(playerRef, {
                scoreEvents: updatedPlayerScoreEvents,
                lastWinAt: playerLastWin
            });
        }
        
        showToast(`✅ Redistributed ${allScoreEvents.length} score event(s) at ${tableName}!`, 'success');
        
        // Refresh the round details view
        viewRoundDetails(roundId);
        
    } catch (error) {
        console.error('Error redistributing scores:', error);
        showToast('Error redistributing scores: ' + error.message, 'error');
    }
};
