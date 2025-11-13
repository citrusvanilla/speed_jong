# Speed Jong Timer

A web-based timer game with screen tap interaction and wake lock functionality.

## Features

- ⏱️ Configurable countdown timer (3-15 seconds)
- 🔊 Optional countdown sounds
- 📱 Wake lock to keep screen active during gameplay
- 🟢 Green screen during active countdown
- 🔴 Red screen on timeout
- 👆 Tap to reset timer or restart after timeout

## How to Play

1. Open `index.html` in a web browser
2. Configure your preferred timer duration (default: 5 seconds)
3. Toggle countdown sounds on/off (default: on)
4. Click "START GAME"
5. The countdown begins - screen turns green
6. **Tap anywhere on the screen to reset the timer** (plays reset sound)
7. If the timer reaches 0, the screen turns red (plays timeout sound)
8. When red, tap to start a new game

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

## Browser Compatibility

- Wake Lock API requires HTTPS or localhost
- Works best on Chrome, Edge, and Safari (iOS 16.4+)
- Touch events optimized for mobile devices

## Technologies Used

- HTML5
- CSS3
- Vanilla JavaScript
- Web Audio API for sound generation
- Wake Lock API for screen management

