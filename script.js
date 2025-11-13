/**
 * Speed Jong Timer Beta
 * Multi-directional countdown timer for Speed Jong (Mahjong) games
 */

// Game state
let timerDuration = 5;
let soundEnabled = true;
let currentTime = 5.00;
let timerInterval = null;
let wakeLock = null;
let isTimeout = false;
let lastTapTime = 0;
let lastTickSecond = 5;
const TAP_DEBOUNCE_MS = 250;

// Audio context for sound generation
const audioContext = new (window.AudioContext || window.webkitAudioContext)();

// DOM elements
const startScreen = document.getElementById('startScreen');
const gameScreen = document.getElementById('gameScreen');
const timerDisplay = document.getElementById('timerDisplay');
const settingsHint = document.querySelector('.settings-hint');
const startButton = document.getElementById('startButton');
const timerDurationInput = document.getElementById('timerDuration');
const soundEnabledInput = document.getElementById('soundEnabled');

// Sound generation functions
function playTick() {
    if (!soundEnabled) return;
    
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
    if (!soundEnabled) return;
    
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
    if (!soundEnabled) return;
    
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
    lastTickSecond = Math.floor(timerDuration);
    isTimeout = false;
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
    
    // HSL color transition:
    // Green (120°) → Yellow (60°) → Orange (30°) → Red-Orange (15°)
    // As time runs out, hue decreases toward warmer colors
    const hue = 120 - (progress * 105); // 120° to 15°
    
    // Increase saturation as time runs out for more intensity
    const saturation = 65 + (progress * 35); // 65% to 100%
    
    // Slightly decrease lightness for more dramatic effect
    const lightness = 60 - (progress * 10); // 60% to 50%
    
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
    
    // Always show two numbers, one for top and one for bottom
    timerDisplay.innerHTML = `
        <span class="timer-number">${displayTime}</span>
        <span class="timer-number">${displayTime}</span>
    `;
    
    // Show instructions when timer hits 0
    if (currentTime <= 0) {
        settingsHint.classList.add('visible');
    } else {
        settingsHint.classList.remove('visible');
    }
}

// Event listeners
startButton.addEventListener('click', async () => {
    // Get configuration first
    timerDuration = parseInt(timerDurationInput.value);
    soundEnabled = soundEnabledInput.checked;
    
    // Play tap sound (after checking if sound is enabled)
    playReset();
    
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
    const now = Date.now();
    if (now - lastTapTime >= TAP_DEBOUNCE_MS) {
        lastTapTime = now;
        resetTimer();
    }
});

gameScreen.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapTime >= TAP_DEBOUNCE_MS) {
        lastTapTime = now;
        resetTimer();
    }
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

