/**
 * Speed Jong Timer Beta
 * Multi-directional countdown timer for Speed Jong (Mahjong) games
 */

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
    
    if (savedDuration) {
        timerDurationInput.value = savedDuration;
        timerDuration = parseInt(savedDuration);
    }
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
        settingsHint.innerHTML = 'North taps anywhere to start<br>when East is ready!<br><br>iPhone users can rotate<br>the phone in landscape mode<br>and remove all other tabs for<br>maximum tap real estate.<br><br>Sound not working?<br>Turn off Silent Mode<br>and reload page.';
        settingsHint.classList.add('visible');
    } else if (currentTime <= 0) {
        // Timer finished - show magikarp and reset/settings hint
        timerText.style.opacity = '0';
        tapHint.classList.remove('visible');
        timeoutGif.classList.add('visible');
        settingsHint.innerHTML = 'Tap anywhere to reset timer.<br>Reload to change settings.';
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
    // Get configuration first
    timerDuration = parseInt(timerDurationInput.value);
    tickSoundEnabled = tickSoundInput.checked;
    resetSoundEnabled = resetSoundInput.checked;
    timeoutSoundEnabled = timeoutSoundInput.checked;
    
    // Save settings for next time
    saveSettings();
    
    // Play tap sound (after checking if sound is enabled)
    playReset();
    
    // Validate timer duration
    if (timerDuration < 3) timerDuration = 3;
    if (timerDuration > 15) timerDuration = 15;
    
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

gameScreen.addEventListener('click', (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapTime >= TAP_DEBOUNCE_MS) {
        lastTapTime = now;
        
        // Show tap gif at click location
        showTapGif(e.clientX, e.clientY);
        
        if (isReady) {
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
    e.preventDefault();
    const now = Date.now();
    if (now - lastTapTime >= TAP_DEBOUNCE_MS) {
        lastTapTime = now;
        
        // Show tap gif at touch location
        if (e.touches && e.touches.length > 0) {
            showTapGif(e.touches[0].clientX, e.touches[0].clientY);
        }
        
        if (isReady) {
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

