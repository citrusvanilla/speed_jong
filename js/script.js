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
        // No tournament data, redirect to selection
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
}

// Setup tournament UI on start screen
function setupTournamentUI() {
    // Hide duration selector in tournament mode
    const durationSelector = document.getElementById('durationSelector');
    if (durationSelector) {
        durationSelector.classList.add('hidden');
    }
    
    // Show tournament info
    const tournamentInfo = document.getElementById('tournamentInfo');
    if (tournamentInfo) {
        tournamentInfo.classList.remove('hidden');
    }
    
    // Set up interval to update grace period countdown and round status
    setInterval(() => {
        if (isTournamentMode && tablePlayers.length > 0) {
            updateScoringPanel();
        }
        
        // Also check round status if in ready state
        if (isTournamentMode && isReady) {
            checkRoundStatusForDisplay();
        }
    }, 1000); // Update every second
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
        const tournamentTableInfo = document.getElementById('tournamentTableInfo');
        const tournamentDurationInfo = document.getElementById('tournamentDurationInfo');
        const tournamentRoundInfo = document.getElementById('tournamentRoundInfo');
        
        if (tournamentTableInfo) {
            tournamentTableInfo.textContent = `Table ${tableNumber}`;
        }
        if (tournamentDurationInfo) {
            tournamentDurationInfo.textContent = `Timer: ${timerDuration} seconds`;
        }
        if (tournamentRoundInfo) {
            const currentRound = tournamentData.currentRound || 0;
            const roundInProgress = tournamentData.roundInProgress || false;
            if (currentRound > 0) {
                tournamentRoundInfo.textContent = `Round ${currentRound}${roundInProgress ? ' (In Progress)' : ' (Completed)'}`;
            }
        }
        
    } catch (error) {
        console.error('Error loading tournament settings:', error);
        alert('Error loading tournament: ' + error.message);
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
                    
                    // Re-render scoring panel (force update because player data changed)
                    forceUpdateScoring = true;
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

// Check if score editing is currently allowed
let canEditScores = true;
let scoreEditStatus = '';
let lastScoreEditStatus = '';
let forceUpdateScoring = false;
let cachedCurrentRoundId = null;
let cachedRoundInProgress = false;

// Check if timer can be started (tournament mode only)
async function canStartTimer() {
    if (!isTournamentMode || !db || !tournamentId) {
        return true; // Allow in practice mode
    }
    
    try {
        const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (!tournamentDoc.exists()) {
            return false;
        }
        
        const tournamentData = tournamentDoc.data();
        const currentRound = tournamentData.currentRound || 0;
        
        if (currentRound === 0) {
            return false; // No round started
        }
        
        // Find the current round document
        const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
        let currentRoundStatus = null;
        
        roundsSnap.forEach(roundDoc => {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound) {
                currentRoundStatus = roundData.status;
            }
        });
        
        // Only allow starting if round is in progress
        return currentRoundStatus === 'in_progress';
    } catch (error) {
        console.error('Error checking round status:', error);
        return false;
    }
}

// Check round status and update display message
async function checkRoundStatusForDisplay() {
    if (!isTournamentMode || !db || !tournamentId) {
        settingsHint.innerHTML = 'North taps anywhere to start<br>when East is ready!<br><br>Long press to record wins';
        return;
    }
    
    try {
        const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (!tournamentDoc.exists()) {
            settingsHint.innerHTML = '⚠️ Tournament not found<br><br>Please return to table selection';
            return;
        }
        
        const tournamentData = tournamentDoc.data();
        const currentRound = tournamentData.currentRound || 0;
        
        if (currentRound === 0) {
            settingsHint.innerHTML = '⏳ Waiting for round to start<br><br>Please wait for the organizer';
            return;
        }
        
        // Find the current round document
        const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
        let currentRoundStatus = null;
        
        roundsSnap.forEach(roundDoc => {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound) {
                currentRoundStatus = roundData.status;
            }
        });
        
        if (currentRoundStatus === 'in_progress') {
            settingsHint.innerHTML = 'North taps anywhere to start<br>when East is ready!<br><br>Long press to record wins';
        } else if (currentRoundStatus === 'staging') {
            settingsHint.innerHTML = '⏳ Round is staging<br><br>Waiting for organizer to<br>start the round...';
        } else if (currentRoundStatus === 'completed') {
            settingsHint.innerHTML = '🏁 Round has ended<br><br>Waiting for next round...';
        } else {
            settingsHint.innerHTML = '⏳ Waiting for round to start<br><br>Please wait for the organizer';
        }
    } catch (error) {
        console.error('Error checking round status for display:', error);
        settingsHint.innerHTML = 'North taps anywhere to start<br>when East is ready!<br><br>Long press to record wins';
    }
}

async function checkScoreEditingAllowed() {
    if (!isTournamentMode || !db || !tournamentId) {
        canEditScores = false;
        scoreEditStatus = '';
        return;
    }
    
    try {
        const { getDocs, collection } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        
        const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
        if (!tournamentDoc.exists()) {
            canEditScores = false;
            scoreEditStatus = '';
            cachedCurrentRoundId = null;
            cachedRoundInProgress = false;
            return;
        }
        
        const tournamentData = tournamentDoc.data();
        const currentRound = tournamentData.currentRound || 0;
        const roundInProgress = tournamentData.roundInProgress || false;
        
        if (currentRound === 0) {
            canEditScores = false;
            scoreEditStatus = '';
            cachedCurrentRoundId = null;
            cachedRoundInProgress = false;
            return;
        }
        
        // Find the current round document
        const roundsSnap = await getDocs(collection(db, 'tournaments', tournamentId, 'rounds'));
        let currentRoundData = null;
        
        roundsSnap.forEach(roundDoc => {
            const roundData = roundDoc.data();
            if (roundData.roundNumber === currentRound) {
                currentRoundData = { id: roundDoc.id, ...roundData };
            }
        });
        
        if (!currentRoundData) {
            canEditScores = false;
            scoreEditStatus = '';
            cachedCurrentRoundId = null;
            cachedRoundInProgress = false;
            return;
        }
        
        if (currentRoundData.status === 'in_progress') {
            canEditScores = true;
            scoreEditStatus = '';
            cachedCurrentRoundId = currentRoundData.id;
            cachedRoundInProgress = true;
        } else if (currentRoundData.status === 'completed' && currentRoundData.endedAt) {
            cachedCurrentRoundId = currentRoundData.id;
            cachedRoundInProgress = false;
            // Check if within 15 second grace period
            const now = Date.now();
            const endedAt = currentRoundData.endedAt.toMillis();
            const gracePeriodMs = 15000; // 15 seconds
            const elapsed = now - endedAt;
            
            if (elapsed < gracePeriodMs) {
                canEditScores = true;
                const remaining = Math.ceil((gracePeriodMs - elapsed) / 1000);
                scoreEditStatus = `⏱️ Grace period: ${remaining}s`;
            } else {
                canEditScores = false;
                scoreEditStatus = '🔒 Editing locked';
                cachedCurrentRoundId = currentRoundData.id;
                cachedRoundInProgress = false;
            }
        } else {
            canEditScores = false;
            scoreEditStatus = '🔒 Editing locked';
            cachedCurrentRoundId = null;
            cachedRoundInProgress = false;
        }
    } catch (error) {
        console.error('Error checking score editing status:', error);
        canEditScores = false;
        scoreEditStatus = '';
        cachedCurrentRoundId = null;
        cachedRoundInProgress = false;
    }
}

// Update scoring panel with current player data
async function updateScoringPanel() {
    if (!isTournamentMode || tablePlayers.length === 0) return;
    
    // Check if editing is allowed
    await checkScoreEditingAllowed();
    
    // Only update if status changed or forced to avoid interfering with taps
    const currentStatusKey = `${canEditScores}-${scoreEditStatus}`;
    if (currentStatusKey === lastScoreEditStatus && playersScoring.innerHTML && !forceUpdateScoring) {
        return; // No change, skip re-render
    }
    lastScoreEditStatus = currentStatusKey;
    forceUpdateScoring = false;
    
    // Sort players by position order (East, South, West, North)
    const positionOrder = { 'East': 0, 'South': 1, 'West': 2, 'North': 3 };
    const sortedPlayers = [...tablePlayers].sort((a, b) => 
        positionOrder[a.position] - positionOrder[b.position]
    );
    
    const windSymbols = { East: '東', South: '南', West: '西', North: '北' };
    
    const disabledStyle = canEditScores ? '' : 'opacity: 0.3; pointer-events: none;';
    const statusHTML = scoreEditStatus ? `<div style="text-align: center; padding: 10px; background: ${canEditScores ? '#fef3c7' : '#fee2e2'}; color: ${canEditScores ? '#92400e' : '#991b1b'}; border-radius: 8px; margin-bottom: 10px; font-size: 13px; font-weight: bold;">${scoreEditStatus}</div>` : '';
    
    playersScoring.innerHTML = statusHTML + sortedPlayers.map(player => `
        <div class="player-score-card">
            <div class="player-score-name">${player.name}</div>
            <div class="player-score-position">${windSymbols[player.position]} ${player.position}</div>
            <div class="score-display">${player.wins || 0} wins</div>
            <div class="score-controls" style="${disabledStyle}">
                <button class="score-btn win" onclick="event.stopPropagation(); adjustScore('${player.id}', 1)" ${canEditScores ? '' : 'disabled'}>+</button>
                <button class="score-btn lose" onclick="event.stopPropagation(); adjustScore('${player.id}', -1)" ${canEditScores ? '' : 'disabled'}>−</button>
            </div>
        </div>
    `).join('');
}

// Adjust player score
window.adjustScore = async function(playerId, delta) {
    if (!isTournamentMode || !db) return;
    
    // Use cached validation status instead of re-checking
    if (!canEditScores) {
        alert('❌ Score editing disabled\n\nYou can only update scores:\n• During an active round\n• Within 15 seconds after round ends');
        return;
    }
    
    try {
        const { serverTimestamp, query, where, getDocs } = await import("https://www.gstatic.com/firebasejs/12.6.0/firebase-firestore.js");
        
        const playerRef = doc(db, 'tournaments', tournamentId, 'players', playerId);
        
        const updates = {
            wins: increment(delta)
        };
        
        // If adding a win, update lastWinAt timestamp for tie-breaking
        if (delta > 0) {
            updates.lastWinAt = serverTimestamp();
        }
        
        // Update player document
        await updateDoc(playerRef, updates);
        
        // Also update round participants if round is in progress and we have cached round ID
        if (cachedRoundInProgress && cachedCurrentRoundId) {
            // Query for this specific player's participant record
            const participantsRef = collection(db, 'tournaments', tournamentId, 'rounds', cachedCurrentRoundId, 'participants');
            const participantQuery = query(participantsRef, where('playerId', '==', playerId));
            const participantSnap = await getDocs(participantQuery);
            
            if (!participantSnap.empty) {
                const participantDoc = participantSnap.docs[0];
                const participantUpdates = {
                    wins: increment(delta)
                };
                if (delta > 0) {
                    participantUpdates.lastWinAt = serverTimestamp();
                }
                await updateDoc(participantDoc.ref, participantUpdates);
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
        // Ready state - show "tap to start"
        timerText.style.opacity = '0';
        tapHint.classList.remove('visible');
        timeoutGif.classList.remove('visible');
        
        if (isTournamentMode) {
            // Check if round is in progress - if not, show waiting message
            checkRoundStatusForDisplay();
        } else {
            settingsHint.innerHTML = 'North taps anywhere to start<br>when East is ready!<br><br>iPhone users can rotate<br>the phone in landscape mode<br>and remove all other tabs for<br>maximum tap real estate.<br><br>Sound not working?<br>Turn off Silent Mode<br>and reload page.';
        }
        settingsHint.classList.add('visible');
    } else if (currentTime <= 0) {
        // Timer finished - show magikarp and reset/settings hint
        timerText.style.opacity = '0';
        tapHint.classList.remove('visible');
        timeoutGif.classList.add('visible');
        
        if (isTournamentMode) {
            settingsHint.innerHTML = 'Tap anywhere to reset timer.<br>Long press to record wins.';
        } else {
            settingsHint.innerHTML = 'Tap anywhere to reset timer.<br>Reload to change settings.';
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
    gameScreen.style.backgroundColor = '#4ade80'; // Green
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
        // Open scoring modal
        openScoringModal();
    } else {
        // Navigate back to home in practice mode
        window.location.href = '../index.html';
    }
}

async function openScoringModal() {
    if (scoringModal) {
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
                    modalRoundInfo.textContent = `Round ${currentRound}${roundInProgress ? ' (In Progress)' : ' (Completed)'}`;
                }
            }
        }
    }
}

function closeScoringModal() {
    if (scoringModal) {
        scoringModal.classList.add('hidden');
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
}

gameScreen.addEventListener('click', async (e) => {
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
            // First tap after START GAME - check if round is in progress
            const canStart = await canStartTimer();
            if (!canStart) {
                alert('⚠️ Cannot start timer\n\nThe round must be in progress.\n\nPlease wait for the organizer to start the round.');
                return;
            }
            
            isReady = false;
            playReset(); // Play sound when starting
            startTimer();
        } else {
            // Already running - reset timer
            resetTimer();
        }
    }
});

gameScreen.addEventListener('touchstart', async (e) => {
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
            // First tap after START GAME - check if round is in progress
            const canStart = await canStartTimer();
            if (!canStart) {
                alert('⚠️ Cannot start timer\n\nThe round must be in progress.\n\nPlease wait for the organizer to start the round.');
                return;
            }
            
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

