# Speed Jong Timer Beta

A multi-directional countdown timer designed for Speed Jong (Mahjong) games, optimized for 4-player table setups with visual and audio feedback.

## Features

### Timer & Display
- ⏱️ **Configurable countdown timer** (3-15 seconds)
- 🔢 **Four-directional number display** - Numbers positioned at top, bottom, left, and right, each rotated to face outward for easy viewing from any seat
- 📦 **Fixed-size boxes** around numbers to prevent layout shifts
- 🧭 **East Wind indicator (東)** - Traditional Chinese character above bottom box to indicate East player position
- 🎯 **Giant centered zero** when timer expires
- 🌈 **Dynamic color transitions** from green → yellow → orange → red as time runs out

### Visual Feedback
- ⚡ **Double white flash** on tap for instant visual confirmation
- 🔴 **Flashing red background** when timer hits zero
- 📱 **Responsive design** optimized for desktop, tablet, and mobile (iPhone 14+)

### Audio
- 🔊 **Optional countdown sounds** with lower, pleasant tones
- 🎵 **Reset confirmation beep** (two-tone chime)
- ⚠️ **Timeout alert sound** (descending buzz)
- 🔇 All sounds respect the enable/disable setting

### Interaction
- 👆 **Tap anywhere** to reset timer during countdown
- 🚫 **250ms tap debounce** to prevent accidental double-taps
- 📱 **Wake lock** keeps screen active during gameplay
- 🔄 **On-screen instructions** appear when timer expires

## How to Play

### Initial Setup
1. Open `index.html` in a web browser
2. Configure your preferred timer duration (default: 5 seconds)
3. Toggle sound on/off as desired (default: on)
4. Click "START GAME"
5. **Position the device** - Place it in the center of the table with the 東 (East) character facing the East Wind player

### During Game
1. **Countdown begins** - Four numbers appear at edges, facing outward
   - 東 character visible above bottom number
2. **Screen color changes** gradually as time runs out (green → yellow → orange → red)
3. **Tap anywhere** to reset the timer back to starting value
   - You'll see a quick double white flash
   - Reset sound plays (if enabled)
4. **Timer reaches 0:**
   - Giant "0" appears in center
   - Background flashes red continuously
   - Instructions appear: "Tap to reset timer. Reload page to change settings."
5. **Tap to restart** the countdown

### Changing Settings
- Reload the page to access the settings screen
- Adjust timer duration (3-15 seconds)
- Enable/disable sound

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

## Technical Details

### Display Layout
- **Desktop:** 450px × 300px number boxes with 20rem font size
- **Tablet (≤768px):** 350px × 240px boxes with 15rem font size
- **Mobile (≤480px):** 160px × 120px boxes with 7rem font size
- **Small phones (≤380px):** 140px × 100px boxes with 5rem font size
- **Timeout display:** 70vmin font size for giant centered zero

### Audio Frequencies (Lower Tones)
- **Tick sound:** A4 (440 Hz)
- **Reset chime:** G4 (392 Hz) → C5 (523 Hz)
- **Timeout buzz:** A3 (220 Hz) → F#3 (185 Hz) descending

### Browser Compatibility
- Wake Lock API requires HTTPS or localhost
- Works best on Chrome, Edge, and Safari (iOS 16.4+)
- Touch events optimized for mobile devices
- Backdrop blur and visual effects may vary by browser

## Technologies Used

- **HTML5** - Semantic markup
- **CSS3** - Responsive design, animations, backdrop filters
- **Vanilla JavaScript** - No frameworks or dependencies
- **Web Audio API** - Real-time sound generation
- **Wake Lock API** - Screen management

## File Structure

```
spped_jong/
├── index.html          # Main HTML structure
├── style.css           # All styles and animations
├── script.js           # Game logic and audio
└── README.md          # This file
```

## Browser Support

- ✅ Chrome/Edge 84+
- ✅ Safari 16.4+ (iOS/macOS)
- ✅ Firefox (wake lock not supported)
- ⚠️ Older browsers may not support all visual effects

---

**Version:** Beta  
**Optimized for:** 4-player Speed Jong (Mahjong) games  
**Best Experience:** iPad/tablet placed in center of table
