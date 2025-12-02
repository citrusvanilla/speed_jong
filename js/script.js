/**
 * Speed Jong Timer Beta
 * Multi-directional countdown timer for Speed Jong (Mahjong) games
 */

// Import Firebase if in tournament mode
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.6.0/firebase-app.js";
import { 
    getFirestore, 
    doc, 
    getDoc,
    updateDoc,
    onSnapshot,
    increment
} from "https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js";

// Detect tournament mode from URL params
const urlParams = new URLSearchParams(window.location.search);
const isTournamentMode = urlParams.get('mode') === 'tournament';

// Tournament mode state
let tournamentId = null;
let tableId = null;
let tableNumber = null;
let tablePlayers = [];
let db = null;

// Long press detection
let longPressTimer = null;
let longPressStartTime = 0;
const LONG_PRESS_DURATION = 1500; // 1.5 seconds

// Game state
let timerDuration = 5;
let tickSoundEnabled = false;
let resetSoundEnabled = true;
let timeoutSoundEnabled = true;
let currentTime = 5.00;
let timerInterval = null;
let wakeLock = null;
let isTimeout = false;
let isReady = false; // True when on game screen but not started
let lastTapTime = 0;
let lastTickSecond = 5;
const TAP_DEBOUNCE_MS = 250;
let isRoundInProgress = false; // Track if tournament round is active
let graceTimer = null; // Timer for auto-closing scoring modal
let isInGracePeriod = false; // Track if we're in the grace period after round ends
const GRACE_PERIOD_MS = 30000; // 30 seconds

// Load saved settings from localStorage
function loadSettings() {
    const savedDuration = localStorage.getItem('timerDuration');
    const savedTickSound = localStorage.getItem('tickSoundEnabled');
    const savedResetSound = localStorage.getItem('resetSoundEnabled');
    const savedTimeoutSound = localStorage.getItem('timeoutSoundEnabled');
    
    // Only load duration in practice mode (tournament mode loads from backend)
    if (!isTournamentMode && savedDuration) {
        timerDurationInput.value = savedDuration;
        timerDuration = parseInt(savedDuration);
    }
    
    // Load sound settings (applies to both modes)
    if (savedTickSound !== null) {
        tickSoundInput.checked = savedTickSound === 'true';
        tickSoundEnabled = savedTickSound === 'true';
    }
    if (savedResetSound !== null) {
        resetSoundInput.checked = savedResetSound === 'true';
        resetSoundEnabled = savedResetSound === 'true';
    }
    if (savedTimeoutSound !== null) {
        timeoutSoundInput.checked = savedTimeoutSound === 'true';
        timeoutSoundEnabled = savedTimeoutSound === 'true';
    }
}

// Save settings to localStorage
function saveSettings() {
    localStorage.setItem('timerDuration', timerDuration.toString());
    localStorage.setItem('tickSoundEnabled', tickSoundEnabled.toString());
    localStorage.setItem('resetSoundEnabled', resetSoundEnabled.toString());
    localStorage.setItem('timeoutSoundEnabled', timeoutSoundEnabled.toString());
}

// Audio context for sound generation
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// DOM elements
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const progressPie = document.getElementById('progressPie');
const timerText = document.getElementById('timerText');
const tapHint = document.getElementById('tapHint');
const timeoutGif = document.getElementById('timeoutGif');
const settingsHint = document.querySelector('.settings-hint');
const startButton = document.getElementById('startButton');
const timerDurationInput = document.getElementById('timerDuration');
const tickSoundInput = document.getElementById('tickSoundEnabled');
const resetSoundInput = document.getElementById('resetSoundEnabled');
const timeoutSoundInput = document.getElementById('timeoutSoundEnabled');
const tapGif = document.getElementById('tapGif');
const scoringModal = document.getElementById('scoringModal');
const playersScoring = document.getElementById('playersScoring');
const tableInfo = document.getElementById('tableInfo');
const closeScoringBtn = document.getElementById('closeScoringBtn');

// Initialize tournament mode if needed
if (isTournamentMode) {
    tournamentId = localStorage.getItem('tournamentId');
    tableId = localStorage.getItem('tableId');
    tableNumber = localStorage.getItem('tableNumber');
    
    if (!tournamentId || !tableId) {
        window.location.href = '../pages/tournament-select.html';
    } else {
        // Initialize Firebase
        const firebaseConfig = {
            apiKey: "AIzaSyDI0fUdOj9fLT92VEBQCs0rGPWm0cgIEhQ",
            authDomain: "speedjong-285c0.firebaseapp.com",
            projectId: "speedjong-285c0",
            storageBucket: "speedjong-285c0.firebasestorage.app",
            messagingSenderId: "282851961282",
            appId: "1:282851961282:web:942a04667587d5ee320e5b",
            measurementId: "G-GYKFD28ZLH"
        };
        
        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        
        // Set up tournament UI - check if DOM is ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', setupTournamentUI);
        } else {
            // DOM already loaded
            setupTournamentUI();
        }
        
        // Load tournament settings
        loadTournamentSettings();
    }
} else {
    // Practice mode - update hints to indicate long press to return home
    if (settingsHint) {
        settingsHint.innerHTML = 'Tap anywhere to reset<br>Long press to return home';
    }
}

// Setup tournament UI on start screen
function setupTournamentUI() {
    // Hide duration selector in tournament mode
    const durationSelector = document.getElementById('durationSelector');
    if (durationSelector) {
        durationSelector.classList.add('hidden');
    }
    
    // Hide mahjong gif in tournament mode
    const mahjongGif = document.querySelector('.mahjong-gif');
    if (mahjongGif) {
        mahjongGif.style.display = 'none';
    }
    
    // Show tournament info card
    const tournamentInfo = document.getElementById('tournamentInfo');
    if (tournamentInfo) {
        tournamentInfo.classList.remove('hidden');
    }
    
    // Show tournament name (outside card)
    const tournamentNameDisplay = document.getElementById('tournamentNameDisplay');
    if (tournamentNameDisplay) {
        tournamentNameDisplay.classList.remove('hidden');
    }
    
    // Show timer duration info (outside card, below)
    const tournamentDurationInfo = document.getElementById('tournamentDurationInfo');
    if (tournamentDurationInfo) {
        tournamentDurationInfo.classList.remove('hidden');
    }
    
    // Show back to tables button in tournament mode
    const backToTablesBtn = document.getElementById('backToTablesBtn');
    if (backToTablesBtn) {
        backToTablesBtn.classList.remove('hidden');
    }
    
    // Set up real-time listener for tournament changes (to detect round start)
    if (tournamentId) {
        onSnapshot(doc(db, 'tournaments', tournamentId), (doc) => {
            if (doc.exists()) {
                const data = doc.data();
                const roundInProgress = data.roundInProgress || false;
                const currentRound = data.currentRound || 0;
                const tournamentNameDisplay = document.getElementById('tournamentNameDisplay');
                const tournamentRoundInfo = document.getElementById('tournamentRoundInfo');
                const tournamentTableInfo = document.getElementById('tournamentTableInfo');
                const tournamentDurationInfo = document.getElementById('tournamentDurationInfo');
                
                // Update global round status
                const wasRoundInProgress = isRoundInProgress;
                isRoundInProgress = roundInProgress;
                
                // Detect round end - open scoring modal automatically if on game screen
                if (wasRoundInProgress && !roundInProgress && gameScreen && gameScreen.classList.contains('hidden') === false) {
                    openScoringModal(true);
                    startGracePeriod();
                }
                
                // If round status changed and we're in ready state, update screen color
                if (wasRoundInProgress !== roundInProgress && isReady && !gameScreen.classList.contains('hidden')) {
                    if (roundInProgress) {
                        gameScreen.style.backgroundColor = '#4ade80'; // Green - round started!
                    } else {
                        gameScreen.style.backgroundColor = '#fbbf24'; // Yellow - waiting
                    }
                }
                
                // Update tournament info
                if (tournamentNameDisplay) {
                    tournamentNameDisplay.textContent = data.name || 'Tournament';
                }
                if (tournamentTableInfo) {
                    tournamentTableInfo.textContent = `Table ${tableNumber}`;
                }
                if (tournamentDurationInfo) {
                    const duration = data.timerDuration || 5;
                    tournamentDurationInfo.textContent = `Timer: ${duration} seconds`;
                    timerDuration = duration; // Update global timer duration
                }
                
                // Update round info badge
                if (tournamentRoundInfo) {
                    updateRoundInfoBadge(tournamentRoundInfo, currentRound, roundInProgress);
                }
                
                // Update game screen state if already on it
                if (isReady && gameScreen && !gameScreen.classList.contains('hidden')) {
                    updateDisplay();
                }
            }
        });
    }
}

// Helper function to update round info badge with appropriate styling
async function updateRoundInfoBadge(badgeElement, currentRound, roundInProgress) {
    if (!badgeElement) return;
    
    if (currentRound === 0) {
        badgeElement.className = 'round-info-badge no-round';
        badgeElement.textContent = 'No rounds started';
        return;
    }
    
    try {
        const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
        let roundStatus = null;
        
        roundsSnap.forEach(roundDoc => {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound) {
                roundStatus = roundData.status;
            }
        });
        
        // Determine class and text based on round status
        if (roundStatus === 'staging') {
            badgeElement.className = 'round-info-badge staging';
            badgeElement.textContent = `Round ${currentRound} - PREPARING`;
        } else if (roundStatus === 'in_progress') {
            badgeElement.className = 'round-info-badge in-progress';
            badgeElement.textContent = `Round ${currentRound} - IN PROGRESS`;
        } else if (roundStatus === 'completed') {
            badgeElement.className = 'round-info-badge completed';
            badgeElement.textContent = `Round ${currentRound} - COMPLETED`;
        } else {
            // Fallback to roundInProgress flag if no round document found
            if (roundInProgress) {
                badgeElement.className = 'round-info-badge in-progress';
                badgeElement.textContent = `Round ${currentRound} - IN PROGRESS`;
            } else {
                badgeElement.className = 'round-info-badge staging';
                badgeElement.textContent = `Round ${currentRound} - PREPARING`;
            }
        }
    } catch (error) {
        console.error('Error fetching round status:', error);
        // Fallback to simple display
        if (roundInProgress) {
            badgeElement.className = 'round-info-badge in-progress';
            badgeElement.textContent = `Round ${currentRound} - IN PROGRESS`;
        } else {
            badgeElement.className = 'round-info-badge staging';
            badgeElement.textContent = `Round ${currentRound} - PREPARING`;
        }
    }
}

// Helper function to get round status text (for scoring modal)
async function getRoundStatusText(currentRound, roundInProgress) {
    if (currentRound === 0) {
        return '';
    }
    
    try {
        const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
        let roundStatus = null;
        
        roundsSnap.forEach(roundDoc => {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound) {
                roundStatus = roundData.status;
            }
        });
        
        // Determine display text based on round status
        if (roundStatus === 'staging') {
            return `Round ${currentRound} - PREPARING`;
        } else if (roundStatus === 'in_progress') {
            return `Round ${currentRound} - IN PROGRESS`;
        } else if (roundStatus === 'completed') {
            return `Round ${currentRound} - COMPLETED`;
        } else {
            // Fallback to roundInProgress flag if no round document found
            if (roundInProgress) {
                return `Round ${currentRound} - IN PROGRESS`;
            } else {
                return `Round ${currentRound} - PREPARING`;
            }
        }
    } catch (error) {
        console.error('Error fetching round status:', error);
        // Fallback to simple display
        return `Round ${currentRound}${roundInProgress ? ' - IN PROGRESS' : ' - PREPARING'}`;
    }
}

// Load tournament settings (called before starting game)
async function loadTournamentSettings() {
    try {
        // Load tournament settings
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (!tournamentDoc.exists()) {
            alert('Tournament not found!');
            window.location.href = '../pages/tournament-select.html';
            return;
        }
        
        const tournamentData = tournamentDoc.data();
        
        // Set timer duration from tournament settings
        timerDuration = tournamentData.timerDuration || 5;
        
        // Update UI with tournament info
        const tournamentNameDisplay = document.getElementById('tournamentNameDisplay');
        const tournamentTableInfo = document.getElementById('tournamentTableInfo');
        const tournamentDurationInfo = document.getElementById('tournamentDurationInfo');
        const tournamentRoundInfo = document.getElementById('tournamentRoundInfo');
        
        if (tournamentNameDisplay) {
            tournamentNameDisplay.textContent = tournamentData.name || 'Tournament';
        }
        if (tournamentTableInfo) {
            tournamentTableInfo.textContent = `Table ${tableNumber}`;
        }
        if (tournamentDurationInfo) {
            tournamentDurationInfo.textContent = `Timer: ${timerDuration} seconds`;
        }
        if (tournamentRoundInfo) {
            const currentRound = tournamentData.currentRound || 0;
            const roundInProgress = tournamentData.roundInProgress || false;
            
            // Set initial round status
            isRoundInProgress = roundInProgress;
            
            // Update round info badge
            await updateRoundInfoBadge(tournamentRoundInfo, currentRound, roundInProgress);
        }
        
        // Load and display players at this table
        await loadTablePlayers();
        
    } catch (error) {
        console.error('Error loading tournament settings:', error);
        alert('Error loading tournament: ' + error.message);
    }
}

// Load players assigned to this table
async function loadTablePlayers() {
    try {
        const tableDoc = await getDoc(doc(db, 'tournaments', tournamentId, 'tables', tableId));
        if (!tableDoc.exists()) return;
        
        const tableData = tableDoc.data();
        const positions = tableData.positions || {};
        const windSymbols = { East: '東', South: '南', West: '西', North: '北' };
        
        const tablePlayersList = document.getElementById('tablePlayersList');
        if (!tablePlayersList) return;
        
        // Create list of players with their positions
        const playersHTML = [];
        for (const position of ['East', 'South', 'West', 'North']) {
            const playerId = positions[position];
            if (playerId) {
                const playerDoc = await getDoc(doc(db, 'tournaments', tournamentId, 'players', playerId));
                if (playerDoc.exists()) {
                    const playerData = playerDoc.data();
                    const windSymbol = windSymbols[position] || '';
                    playersHTML.push(`
                        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: rgba(255,255,255,0.5); border-radius: 6px;">
                            <span style="font-size: 0.7rem; color: #333;">${playerData.name}</span>
                            <span style="font-size: 0.9rem; font-weight: bold; color: #667eea;">${windSymbol} ${position}</span>
                        </div>
                    `);
                }
            }
        }
        
        tablePlayersList.innerHTML = playersHTML.join('');
        
    } catch (error) {
        console.error('Error loading table players:', error);
    }
}

// Load tournament table and players (called when game starts)
async function loadTournamentData() {
    try {
        // Load table data
        const tableDoc = await getDoc(doc(db, 'tournaments', tournamentId, 'tables', tableId));
        if (!tableDoc.exists()) {
            alert('Table not found!');
            window.location.href = '../pages/tournament-select.html';
            return;
        }
        
        const tableData = tableDoc.data();
        const playerIds = tableData.players || [];
        
        // Load all players and set up real-time listeners
        for (const playerId of playerIds) {
            const playerRef = doc(db, 'tournaments', tournamentId, 'players', playerId);
            
            // Set up real-time listener for each player
            onSnapshot(playerRef, (playerDoc) => {
                if (playerDoc.exists()) {
                    const playerData = { id: playerId, ...playerDoc.data() };
                    
                    // Update or add player in array
                    const existingIndex = tablePlayers.findIndex(p => p.id === playerId);
                    if (existingIndex >= 0) {
                        tablePlayers[existingIndex] = playerData;
                    } else {
                        tablePlayers.push(playerData);
                    }
                    
                    // Re-render scoring panel
                    updateScoringPanel();
                }
            });
        }
        
        // Update table info
        tableInfo.textContent = `Table ${tableNumber}`;
        
    } catch (error) {
        console.error('Error loading tournament data:', error);
        alert('Error loading tournament: ' + error.message);
    }
}

// Update scoring panel with current player data
function updateScoringPanel() {
    if (!isTournamentMode || tablePlayers.length === 0) return;
    
    // Sort players by position order (East, South, West, North)
    const positionOrder = { 'East': 0, 'South': 1, 'West': 2, 'North': 3 };
    const sortedPlayers = [...tablePlayers].sort((a, b) => 
        positionOrder[a.position] - positionOrder[b.position]
    );
    
    const windSymbols = { East: '東', South: '南', West: '西', North: '北' };
    
    playersScoring.innerHTML = sortedPlayers.map(player => `
        <div class="player-score-card">
            <div class="player-score-name">${player.name}</div>
            <div class="player-score-position">${windSymbols[player.position]} ${player.position}</div>
            <div class="score-display">${player.wins || 0} wins</div>
            <div class="score-controls">
                <button class="score-btn win" onclick="event.stopPropagation(); adjustScore('${player.id}', 1)">+</button>
                <button class="score-btn lose" onclick="event.stopPropagation(); adjustScore('${player.id}', -1)">−</button>
            </div>
        </div>
    `).join('');
}

// Adjust player score
window.adjustScore = async function(playerId, delta) {
    if (!isTournamentMode || !db) return;
    
    // Only allow score adjustments during active round or grace period
    if (!isRoundInProgress && !isInGracePeriod) {
        return;
    }
    
    try {
        const { serverTimestamp, getDocs, collection, query, where } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        
        const playerRef = doc(db, 'tournaments', tournamentId, 'players', playerId);
        
        const updates = {
            wins: increment(delta)
        };
        
        // If adding a win, update lastWinAt timestamp for tie-breaking
        if (delta > 0) {
            updates.lastWinAt = serverTimestamp();
        }
        
        await updateDoc(playerRef, updates);
        
        // Also update round participants if round is in progress
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (tournamentDoc.exists()) {
            const tournamentData = tournamentDoc.data();
            const currentRound = tournamentData.currentRound || 0;
            const roundInProgress = tournamentData.roundInProgress || false;
            
            if (currentRound > 0 && roundInProgress) {
                // Find the current round document
                const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
                let currentRoundId = null;
                
                roundsSnap.forEach(roundDoc => {
                    const roundData = roundDoc.data();
                    if (roundData.roundNumber === currentRound && roundData.status === 'in_progress') {
                        currentRoundId = roundDoc.id;
                    }
                });
                
                if (currentRoundId) {
                    // Find and update this player's participant record
                    const participantsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds', currentRoundId, 'participants'));
                    
                    participantsSnap.forEach(async (participantDoc) => {
                        const participantData = participantDoc.data();
                        if (participantData.playerId === playerId) {
                            const participantUpdates = {
                                wins: increment(delta)
                            };
                            if (delta > 0) {
                                participantUpdates.lastWinAt = serverTimestamp();
                            }
                            await updateDoc(participantDoc.ref, participantUpdates);
                        }
                    });
                }
            }
        }
        
        // Play a sound for feedback
        if (delta > 0) {
            playReset(); // Positive sound
        } else {
            playTick(); // Negative sound
        }
    } catch (error) {
        console.error('Error updating score:', error);
        alert('Error updating score: ' + error.message);
    }
};

// SVG pie chart helper function (full-screen wipe)
function getPiePath(percentage) {
    // percentage is 0-1, where 1 is full circle, 0 is empty
    // Using viewBox -50,-50,100,100 with center at 0,0 (screen center)
    const cx = 0;
    const cy = 0;
    const radius = 500; // Massive radius to cover tall mobile aspect ratios (16:9, 19.5:9, etc.)
    
    if (percentage <= 0) return '';
    if (percentage >= 1) {
        // Full circle - covers entire screen
        return `M ${cx},${cy} m 0,-${radius} a ${radius},${radius} 0 1,1 0,${radius * 2} a ${radius},${radius} 0 1,1 0,-${radius * 2}`;
    }
    
    // Calculate the angle (starts from top, goes clockwise)
    const angle = percentage * 2 * Math.PI;
    
    // Calculate end point of the arc
    const endX = cx + radius * Math.sin(angle);
    const endY = cy - radius * Math.cos(angle);
    
    // Large arc flag: 1 if angle > 180 degrees
    const largeArc = angle > Math.PI ? 1 : 0;
    
    // Create pie path: move to center, line to start (top), arc to end, line back to center
    return `M ${cx},${cy} L ${cx},${cy - radius} A ${radius},${radius} 0 ${largeArc},1 ${endX},${endY} Z`;
}

// Show tap gif at touch location
function showTapGif(x, y) {
    tapGif.style.left = `${x}px`;
    tapGif.style.top = `${y}px`;
    
    // Calculate angle pointing towards center of screen
    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight / 2;
    const angleToCenter = Math.atan2(centerY - y, centerX - x) * 180 / Math.PI;
    
    // Rotate to point towards center (add 90 to adjust for image orientation)
    tapGif.style.transform = `translate(-50%, -50%) rotate(${angleToCenter + 90}deg)`;
    
    // Restart gif from frame 1 by reloading the image
    const src = tapGif.src;
    tapGif.src = '';
    tapGif.src = src + '?' + Date.now();
    
    tapGif.classList.remove('fade-out');
    tapGif.classList.add('visible');
    
    // Fade out after 750ms
    setTimeout(() => {
        tapGif.classList.remove('visible');
        tapGif.classList.add('fade-out');
    }, 750);
}

// Sound generation functions
function playTick() {
    if (!tickSoundEnabled) return;
    
    // 8-bit style tick - short square wave beep
    const osc = audioContext.createOscillator();
    const gain = audioContext.createGain();
    
    osc.connect(gain);
    gain.connect(audioContext.destination);
    
    osc.frequency.value = 440; // A4 note (one octave lower)
    osc.type = 'square';
    
    const now = audioContext.currentTime;
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
    
    osc.start(now);
    osc.stop(now + 0.05);
}

function playReset() {
    if (!resetSoundEnabled) return;
    
    // Nintendo-style confirm beep - pleasant two-tone chime
    const now = audioContext.currentTime;
    
    // First tone (lower note)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    
    osc1.frequency.value = 392; // G4 (one octave lower)
    osc1.type = 'square';
    
    gain1.gain.setValueAtTime(0.3, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
    
    osc1.start(now);
    osc1.stop(now + 0.1);
    
    // Second tone (higher note, slightly delayed)
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    
    osc2.frequency.value = 523; // C5 (one octave lower)
    osc2.type = 'square';
    
    gain2.gain.setValueAtTime(0.3, now + 0.05);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc2.start(now + 0.05);
    osc2.stop(now + 0.15);
}

function playTimeout() {
    if (!timeoutSoundEnabled) return;
    
    // 8-bit style error/timeout sound - descending buzz
    const now = audioContext.currentTime;
    
    // First buzz (higher)
    const osc1 = audioContext.createOscillator();
    const gain1 = audioContext.createGain();
    
    osc1.connect(gain1);
    gain1.connect(audioContext.destination);
    
    osc1.frequency.setValueAtTime(220, now); // A3 (lower)
    osc1.frequency.exponentialRampToValueAtTime(110, now + 0.15); // Drop octave
    osc1.type = 'square';
    
    gain1.gain.setValueAtTime(0.4, now);
    gain1.gain.exponentialRampToValueAtTime(0.01, now + 0.15);
    
    osc1.start(now);
    osc1.stop(now + 0.15);
    
    // Second buzz (lower, delayed)
    const osc2 = audioContext.createOscillator();
    const gain2 = audioContext.createGain();
    
    osc2.connect(gain2);
    gain2.connect(audioContext.destination);
    
    osc2.frequency.setValueAtTime(185, now + 0.1); // F#3 (lower)
    osc2.frequency.exponentialRampToValueAtTime(92, now + 0.3); // Drop octave
    osc2.type = 'square';
    
    gain2.gain.setValueAtTime(0.4, now + 0.1);
    gain2.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
    
    osc2.start(now + 0.1);
    osc2.stop(now + 0.3);
}

// Wake Lock functions
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
        }
    } catch (err) {
        console.error('Wake Lock error:', err);
    }
}

async function releaseWakeLock() {
    if (wakeLock !== null) {
        try {
            await wakeLock.release();
            wakeLock = null;
        } catch (err) {
            console.error('Error releasing wake lock:', err);
        }
    }
}

// Timer functions
function startTimer() {
    currentTime = timerDuration;
    lastTickSecond = Math.floor(timerDuration);
    isTimeout = false;
    isReady = false;
    gameScreen.classList.remove('timeout');
    updateDisplay();
    updateScreenColor();
    
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timerInterval = setInterval(() => {
        currentTime -= 0.1;
        
        // Ensure we don't go below 0
        if (currentTime < 0) {
            currentTime = 0;
        }
        
        updateDisplay();
        updateScreenColor();
        
        // Play tick sound only when crossing a whole second boundary
        const currentSecond = Math.floor(currentTime);
        if (currentSecond < lastTickSecond && currentTime > 0) {
            playTick();
            lastTickSecond = currentSecond;
        }
        
        if (currentTime <= 0) {
            clearInterval(timerInterval);
            handleTimeout();
        }
    }, 100); // Update every 100ms (tenths of a second)
}

function resetTimer() {
    // Trigger flash effect
    gameScreen.classList.remove('flash');
    // Force reflow to restart animation
    void gameScreen.offsetWidth;
    gameScreen.classList.add('flash');
    
    // Always play reset sound and restart timer
    isReady = false;
    playReset();
    startTimer();
    
    // Remove flash class after animation completes
    setTimeout(() => {
        gameScreen.classList.remove('flash');
    }, 600);
}

function updateScreenColor() {
    if (currentTime === 0 || isTimeout) {
        return; // Don't change color here, handled by timeout
    }
    
    // Calculate color based on time remaining
    // Progress from 0 (just started) to 1 (almost done)
    const progress = 1 - (currentTime / timerDuration);
    
    // Use exponential curve for more aggressive color change near the end
    const colorProgress = Math.pow(progress, 0.6); // Makes it transition to red much faster
    
    // HSL color transition:
    // Green (120°) → Yellow (60°) → Orange (30°) → Red (0°)
    // As time runs out, hue decreases toward warmer colors
    const hue = 120 - (colorProgress * 120); // 120° to 0° (pure red)
    
    // Increase saturation as time runs out for more intensity
    const saturation = 65 + (colorProgress * 35); // 65% to 100%
    
    // Slightly decrease lightness for more dramatic effect
    const lightness = 60 - (colorProgress * 10); // 60% to 50%
    
    gameScreen.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
}

function handleTimeout() {
    isTimeout = true;
    gameScreen.classList.add('timeout');
    gameScreen.style.backgroundColor = ''; // Let CSS handle the color
    playTimeout();
}

function updateDisplay() {
    const displayTime = currentTime.toFixed(1);
    
    // Update hint text based on state
    if (isReady) {
        // Ready state - show "tap to start" or "waiting for round"
        timerText.style.opacity = '0';
        tapHint.classList.remove('visible');
        timeoutGif.classList.remove('visible');
        
        if (isTournamentMode) {
            if (isRoundInProgress) {
                settingsHint.innerHTML = 'North taps anywhere to start<br>when East is ready!<br><br>Long press to record wins';
                gameScreen.style.backgroundColor = '#4ade80'; // Green when ready
            } else {
                settingsHint.innerHTML = 'WAITING FOR ROUND TO START<br><br>Ask the organizer to start a round';
                gameScreen.style.backgroundColor = '#fbbf24'; // Yellow/amber when waiting
            }
        } else {
            settingsHint.innerHTML = 'North taps anywhere to start<br>when East is ready!<br><br>Long press to return home<br><br>iPhone users can rotate<br>the phone in landscape mode<br>and remove all other tabs for<br>maximum tap real estate.<br><br>Sound not working?<br>Turn off Silent Mode<br>and reload page.';
        }
        settingsHint.classList.add('visible');
    } else if (currentTime <= 0) {
        // Timer finished - show magikarp and reset/settings hint
        timerText.style.opacity = '0';
        tapHint.classList.remove('visible');
        timeoutGif.classList.add('visible');
        
        if (isTournamentMode) {
            if (isRoundInProgress || isInGracePeriod) {
                settingsHint.innerHTML = 'Tap anywhere to reset timer.<br>Long press to record wins.';
            } else {
                settingsHint.innerHTML = 'Tap anywhere to reset timer.<br><br>Round not active - scoring disabled.';
            }
        } else {
            settingsHint.innerHTML = 'Tap anywhere to reset timer.<br>Long press to return home.';
        }
        settingsHint.classList.add('visible');
    } else {
        // Timer running - show time and tap hint
        timerText.style.opacity = '1';
        timerText.textContent = displayTime;
        tapHint.classList.add('visible');
        timeoutGif.classList.remove('visible');
        settingsHint.classList.remove('visible');
    }
    
    // Calculate progress (percentage of time remaining)
    const progress = Math.max(0, currentTime / timerDuration);
    
    // Update pie chart: starts full, wipes away to nothing
    progressPie.setAttribute('d', getPiePath(progress));
}

// Event listeners
startButton.addEventListener('click', async () => {
    // Get configuration based on mode
    if (isTournamentMode) {
        // In tournament mode: timer duration already set from backend
        // Only get sound preferences
        tickSoundEnabled = tickSoundInput.checked;
        resetSoundEnabled = resetSoundInput.checked;
        timeoutSoundEnabled = timeoutSoundInput.checked;
        
        // Save sound settings
        localStorage.setItem('tickSoundEnabled', tickSoundEnabled.toString());
        localStorage.setItem('resetSoundEnabled', resetSoundEnabled.toString());
        localStorage.setItem('timeoutSoundEnabled', timeoutSoundEnabled.toString());
        
        // Load tournament players data
        await loadTournamentData();
    } else {
        // In practice mode: get all settings from UI
        timerDuration = parseInt(timerDurationInput.value);
        tickSoundEnabled = tickSoundInput.checked;
        resetSoundEnabled = resetSoundInput.checked;
        timeoutSoundEnabled = timeoutSoundInput.checked;
        
        // Save all settings for next time
        saveSettings();
        
        // Validate timer duration
        if (timerDuration < 3) timerDuration = 3;
        if (timerDuration > 15) timerDuration = 15;
    }
    
    // Play tap sound (after checking if sound is enabled)
    playReset();
    
    // Request wake lock
    await requestWakeLock();
    
    // Switch to game screen in ready state (showing 0.0)
    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    isReady = true;
    currentTime = 0;
    
    // Set initial color based on mode and round status
    if (isTournamentMode && !isRoundInProgress) {
        gameScreen.style.backgroundColor = '#fbbf24'; // Yellow/amber when waiting
    } else {
        gameScreen.style.backgroundColor = '#4ade80'; // Green when ready
    }
    
    updateDisplay();
});

// Long press handling
function startLongPress(e) {
    // Don't start long press if clicking on scoring buttons
    if (e.target.closest('.score-btn')) {
        return;
    }
    
    longPressStartTime = Date.now();
    longPressTimer = setTimeout(() => {
        handleLongPress();
    }, LONG_PRESS_DURATION);
}

function cancelLongPress() {
    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }
}

function handleLongPress() {
    if (isTournamentMode) {
        // Only allow score recording during active round or grace period
        if (isRoundInProgress || isInGracePeriod) {
            openScoringModal(false);
        }
    } else {
        // Navigate back to home in practice mode
        window.location.href = '../index.html';
    }
}

function startGracePeriod() {
    // Clear any existing grace timer
    if (graceTimer) {
        clearInterval(graceTimer);
    }
    
    isInGracePeriod = true;
    let remainingSeconds = 30;
    const graceCountdown = document.getElementById('graceCountdown');
    
    if (graceCountdown) {
        graceCountdown.style.display = 'block';
        graceCountdown.style.color = '#ef4444'; // Reset to red
        graceCountdown.textContent = `Auto-closing in ${remainingSeconds}s`;
    }
    
    graceTimer = setInterval(() => {
        remainingSeconds--;
        
        if (graceCountdown) {
            if (remainingSeconds > 0) {
                graceCountdown.textContent = `Auto-closing in ${remainingSeconds}s`;
            } else {
                graceCountdown.textContent = 'Closing...';
            }
        }
        
        if (remainingSeconds <= 0) {
            clearInterval(graceTimer);
            graceTimer = null;
            isInGracePeriod = false;
            // Grace period expired - return to tournament select page
            window.location.href = '../pages/tournament-select.html';
        }
    }, 1000);
}

function stopGracePeriod() {
    if (graceTimer) {
        clearInterval(graceTimer);
        graceTimer = null;
    }
    
    isInGracePeriod = false;
    
    const graceCountdown = document.getElementById('graceCountdown');
    if (graceCountdown) {
        graceCountdown.style.display = 'none';
    }
}

async function openScoringModal(autoOpened = false) {
    if (scoringModal) {
        // Stop the timer
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        
        // Set to timeout state (stops the timer)
        currentTime = 0;
        handleTimeout();
        updateDisplay();
        
        scoringModal.classList.remove('hidden');
        
        // Update round info in modal
        if (isTournamentMode && tournamentId) {
            const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
            if (tournamentDoc.exists()) {
                const data = tournamentDoc.data();
                const currentRound = data.currentRound || 0;
                const roundInProgress = data.roundInProgress || false;
                const modalRoundInfo = document.getElementById('modalRoundInfo');
                
                if (modalRoundInfo && currentRound > 0) {
                    const statusText = await getRoundStatusText(currentRound, roundInProgress);
                    modalRoundInfo.textContent = statusText;
                }
            }
        }
    }
}

function closeScoringModal() {
    if (scoringModal) {
        scoringModal.classList.add('hidden');
        
        // Stop grace period timer
        stopGracePeriod();
        
        // Ensure timer is in timeout state (stopped, showing "tap anywhere to reset")
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        currentTime = 0;
        handleTimeout();
        updateDisplay();
    }
}

gameScreen.addEventListener('mousedown', (e) => {
    // Don't start long press if clicking on scoring modal
    if (e.target.closest('#scoringModal')) {
        return;
    }
    startLongPress(e);
});

gameScreen.addEventListener('mouseup', (e) => {
    cancelLongPress();
});

gameScreen.addEventListener('mouseleave', (e) => {
    cancelLongPress();
});

// Close scoring modal button
if (closeScoringBtn) {
    closeScoringBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeScoringModal();
    });
    
    // Exit to tournament button
    const exitToTournamentBtn = document.getElementById('exitToTournamentBtn');
    if (exitToTournamentBtn) {
        exitToTournamentBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            // Navigate to tournament select page
            window.location.href = '../pages/tournament-select.html';
        });
    }
}

// Back to tables button (on start screen)
const backToTablesBtn = document.getElementById('backToTablesBtn');
if (backToTablesBtn) {
    backToTablesBtn.addEventListener('click', (e) => {
        e.preventDefault();
        // Navigate to tournament select page
        window.location.href = '../pages/tournament-select.html';
    });
}

gameScreen.addEventListener('click', (e) => {
    e.preventDefault();
    
    // Don't handle tap if clicking on scoring modal
    if (e.target.closest('#scoringModal')) {
        return;
    }
    
    const now = Date.now();
    if (now - lastTapTime >= TAP_DEBOUNCE_MS) {
        lastTapTime = now;
        
        // Show tap gif at click location
        showTapGif(e.clientX, e.clientY);
        
        if (isReady) {
            // In tournament mode, check if round is in progress
            if (isTournamentMode && !isRoundInProgress) {
                // Don't start timer if no round active
                return;
            }
            
            // First tap after START GAME - begin countdown
            isReady = false;
            playReset(); // Play sound when starting
            startTimer();
        } else {
            // Already running - reset timer
            resetTimer();
        }
    }
});

gameScreen.addEventListener('touchstart', (e) => {
    // Don't handle if touching scoring modal
    if (e.target.closest('#scoringModal')) {
        return;
    }
    
    e.preventDefault();
    
    // Start long press timer
    startLongPress(e);
    
    const now = Date.now();
    if (now - lastTapTime >= TAP_DEBOUNCE_MS) {
        lastTapTime = now;
        
        // Show tap gif at touch location
        if (e.touches && e.touches.length > 0) {
            showTapGif(e.touches[0].clientX, e.touches[0].clientY);
        }
        
        if (isReady) {
            // In tournament mode, check if round is in progress
            if (isTournamentMode && !isRoundInProgress) {
                // Don't start timer if no round active
                return;
            }
            
            // First tap after START GAME - begin countdown
            isReady = false;
            playReset(); // Play sound when starting
            startTimer();
        } else {
            // Already running - reset timer
            resetTimer();
        }
    }
}, { passive: false });

gameScreen.addEventListener('touchend', (e) => {
    cancelLongPress();
}, { passive: false });

gameScreen.addEventListener('touchcancel', (e) => {
    cancelLongPress();
}, { passive: false });

// Handle visibility change to re-request wake lock if needed
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// Load saved settings when page loads
loadSettings();

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    releaseWakeLock();
});

