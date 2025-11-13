# Speed Jong Timer

A minimalist countdown timer designed for Speed Jong (Mahjong) games with clean visual feedback and animated effects.

## Features

### Timer & Display
- ⏱️ **Configurable countdown timer** (3-10 seconds, with "hard mode" 3-second option)
- 🎯 **Large centered timer** with smooth countdown
- 🥧 **Full-screen pie wipe animation** - White circle depletes clockwise as time runs out
- 🌈 **Dynamic color transitions** from green → yellow → orange → red (aggressive curve for urgency)
- 💾 **Settings persistence** - Timer duration and sound preferences saved locally

### Visual Feedback
- ⚡ **Pikachu tap animation** - Happy Pikachu appears at tap location, oriented towards center
- 🐟 **Magikarp timeout animation** - Appears when timer hits zero
- 🔴 **Flashing red background** when timer expires
- 📱 **Responsive design** optimized for desktop, tablet, and mobile

### Audio
- 🔊 **Optional tick sounds** (disabled by default) - Plays every second
- 🎵 **Reset confirmation beep** - Two-tone chime when starting/resetting timer
- ⚠️ **Timeout alert sound** - Descending buzz when time expires
- 🔇 Individual toggles for tick, reset, and timeout sounds
- 🎹 All sounds generated using Web Audio API (8-bit retro style)

### Interaction
- 👆 **Tap anywhere** to reset timer during countdown
- 🚀 **Ready state** - START GAME button leads to 0.0 ready screen, then tap to begin
- 🚫 **250ms tap debounce** to prevent accidental double-taps
- 📱 **Wake lock** keeps screen active during gameplay
- 🔄 **On-screen instructions** appear in different game states

## How to Play

### Initial Setup
1. Open `index.html` in a web browser
2. Configure your preferred timer duration (default: 5 seconds)
3. Toggle sounds on/off individually (tick sound off by default)
4. Enable "Do Not Disturb" mode on your phone
5. Click "READY"

### During Game
1. **Ready state** - Screen shows "North taps anywhere to start when East is ready!"
2. **Tap to start** - Countdown begins with pie wipe animation
3. **Screen color changes** gradually as time runs out (green → red)
4. **Tap anywhere** to reset the timer back to starting value
   - Pikachu animation appears at tap location
   - Reset sound plays (if enabled)
5. **Timer reaches 0.0:**
   - Magikarp animation appears
   - Background flashes red continuously
   - Instructions appear: "Tap anywhere to reset timer. Reload to change settings."
6. **Tap to restart** the countdown

### Changing Settings
- Reload the page to access the settings screen
- Adjust timer duration (3-10 seconds)
- Toggle tick, reset, and timeout sounds individually

## Running the App

### Option 1: Direct File Open
Simply double-click `index.html` or open it in your browser.

### Option 2: Local Server (Recommended)
For best wake lock functionality, serve via HTTP:

```bash
# Using Python
python3 -m http.server 8000

# Using Node.js (if you have npx)
npx serve

# Using PHP
php -S localhost:8000
```

Then visit `http://localhost:8000` in your browser.

### Option 3: PWA (Progressive Web App)
For true fullscreen experience on mobile:
1. Open the app in Safari (iOS) or Chrome (Android)
2. Tap "Share" → "Add to Home Screen"
3. Launch from home screen for fullscreen mode without browser UI

## Technical Details

### Display
- **Timer text:** 20vmin font size (responsive)
- **Pie wipe:** Full-screen SVG animation with 500-unit radius
- **Centered layout** with text using `mix-blend-mode: difference` for visibility
- **Retro font:** Press Start 2P (local, no external requests)

### Audio Frequencies (8-bit Style)
- **Tick sound:** 800 Hz square wave, 50ms duration
- **Reset chime:** 600 Hz → 800 Hz, 100ms duration
- **Timeout buzz:** 400 Hz → 200 Hz descending, 500ms duration

### Browser Compatibility
- Wake Lock API requires HTTPS or localhost
- Works best on Chrome, Edge, and Safari (iOS 16.4+)
- Touch events optimized for mobile devices
- All resources loaded locally (no network dependencies)

## Technologies Used

- **HTML5** - Semantic markup
- **CSS3** - Responsive design, animations, SVG styling
- **Vanilla JavaScript** - No frameworks or dependencies
- **Web Audio API** - Real-time sound generation
- **Wake Lock API** - Screen management
- **LocalStorage API** - Settings persistence
- **SVG** - Full-screen pie wipe animation

## File Structure

```
spped_jong/
├── index.html              # Main HTML structure
├── style.css               # All styles and animations
├── script.js               # Game logic, audio, and state management
├── manifest.json           # PWA configuration
├── favicon.jpg             # Site icon
├── mahjong.gif             # Home screen animation
├── magikarp.gif            # Timeout animation
├── pickachu_happy.gif      # Tap feedback animation
├── fonts/
│   └── PressStart2P-Regular.ttf  # Retro font (local)
└── README.md               # This file
```

## Browser Support

- ✅ Chrome/Edge 84+
- ✅ Safari 16.4+ (iOS/macOS)
- ✅ Firefox (wake lock not supported, but app works)
- ⚠️ Older browsers may not support all visual effects

---

**Optimized for:** 2-4 player Speed Jong (Mahjong) games  
**Best Experience:** Mobile device in "Do Not Disturb" mode, added to home screen as PWA
