// Game state
let timerDuration = 5;
let soundEnabled = true;
let currentTime = 5;
let timerInterval = null;
let wakeLock = null;
let isTimeout = false;

// Chinese number characters
const chineseNumbers = {
    0: '零',
    1: '一',
    2: '二',
    3: '三',
    4: '四',
    5: '五',
    6: '六',
    7: '七',
    8: '八',
    9: '九',
    10: '十',
    11: '十一',
    12: '十二',
    13: '十三',
    14: '十四',
    15: '十五'
};

// Audio context and sounds
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// DOM elements
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const timerDisplay = document.getElementById('timerDisplay');
const tapHint = document.getElementById('tapHint');
const startButton = document.getElementById('startButton');
const timerDurationInput = document.getElementById('timerDuration');
const soundEnabledInput = document.getElementById('soundEnabled');

// Sound generation functions
function playTick() {
    if (!soundEnabled) return;
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.value = 800;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.1);
}

function playReset() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(600, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(900, audioContext.currentTime + 0.15);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.4, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.15);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.15);
}

function playTimeout() {
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.frequency.setValueAtTime(400, audioContext.currentTime);
    oscillator.frequency.exponentialRampToValueAtTime(200, audioContext.currentTime + 0.5);
    oscillator.type = 'sawtooth';
    
    gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.5);
}

// Wake Lock functions
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLock = await navigator.wakeLock.request('screen');
            console.log('Wake Lock active');
            
            wakeLock.addEventListener('release', () => {
                console.log('Wake Lock released');
            });
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
    isTimeout = false;
    gameScreen.classList.remove('timeout');
    tapHint.textContent = 'TAP TO RESET';
    updateDisplay();
    
    if (timerInterval) {
        clearInterval(timerInterval);
    }
    
    timerInterval = setInterval(() => {
        currentTime--;
        updateDisplay();
        
        if (currentTime > 0) {
            playTick();
        } else {
            clearInterval(timerInterval);
            handleTimeout();
        }
    }, 1000);
}

function resetTimer() {
    if (isTimeout) {
        // If timed out, restart the game
        startTimer();
    } else {
        // Reset the timer
        currentTime = timerDuration;
        updateDisplay();
        playReset();
    }
}

function handleTimeout() {
    isTimeout = true;
    gameScreen.classList.add('timeout');
    tapHint.textContent = 'TAP TO START AGAIN';
    playTimeout();
}

function updateDisplay() {
    const chineseChar = chineseNumbers[currentTime] || '零';
    timerDisplay.innerHTML = `<span class="roman-numeral">${currentTime}</span><span class="chinese-character">${chineseChar}</span>`;
}

// Event listeners
startButton.addEventListener('click', async () => {
    // Get configuration
    timerDuration = parseInt(timerDurationInput.value);
    soundEnabled = soundEnabledInput.checked;
    
    // Validate timer duration
    if (timerDuration < 3) timerDuration = 3;
    if (timerDuration > 15) timerDuration = 15;
    
    // Request wake lock
    await requestWakeLock();
    
    // Switch to game screen
    startScreen.classList.add('hidden');
    gameScreen.classList.remove('hidden');
    
    // Start the game
    startTimer();
});

gameScreen.addEventListener('click', (e) => {
    e.preventDefault();
    resetTimer();
});

gameScreen.addEventListener('touchstart', (e) => {
    e.preventDefault();
    resetTimer();
}, { passive: false });

// Handle visibility change to re-request wake lock if needed
document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
        await requestWakeLock();
    }
});

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    releaseWakeLock();
});

