# Speed Jong Timer ⏱️🀄

A modern, multi-directional countdown timer for Speed Mahjong games with tournament management capabilities.

## Features

### 🎮 **Practice Mode**
- Customizable timer duration (3-10 seconds)
- Multi-directional visual countdown
- Optional sound effects (tick, reset, timeout)
- Tap anywhere to reset
- Retro 8-bit design with animations

### 🏆 **Tournament Mode**
- Firebase-backed real-time tournament system
- Table-based player assignments (4 players per table)
- Live leaderboard with golf-style ranking
- Round management (standard & cut line tournaments)
- Automatic or manual table assignments
- Real-time score tracking across multiple tables

## Quick Start

### Local Development

1. **Clone the repository**
   ```bash
   cd /path/to/spped_jong
   ```

2. **Start a local server**
   ```bash
   python3 -m http.server 8000
   ```

3. **Open in browser**
   ```
   http://localhost:8000
   ```

### File Structure

```
spped_jong/
├── index.html              # Entry point - mode selection
├── assets/                 # Images and fonts
├── css/                    # Stylesheets
├── js/                     # JavaScript logic
├── pages/                  # HTML pages
├── docs/                   # Documentation
├── dev/                    # Admin tools (Python)
└── tests/                  # Test files
```

See [PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md) for detailed file organization.

## Documentation

- **[PROJECT-STRUCTURE.md](PROJECT-STRUCTURE.md)** - Complete file structure and organization
- **[docs/TOURNAMENT-GUIDE.md](docs/TOURNAMENT-GUIDE.md)** - Tournament features and workflows
- **[dev/README.md](dev/README.md)** - Database admin tools documentation

## Tournament Setup

### Prerequisites

1. Create a Firebase project at [Firebase Console](https://console.firebase.google.com/)
2. Enable Firestore Database
3. Update `js/firebase-config.js` with your Firebase credentials
4. Deploy security rules from `firestore.rules`

### Admin Panel

Access at `/pages/admin.html` to:
- Create and manage tournaments
- Register players
- Create or auto-assign tables
- Start/end rounds
- Track tournament progress

### Player Features

- **Table Selection**: `/pages/tournament-select.html`
- **View Assignment**: `/pages/player-view.html`
- **Leaderboard**: `/pages/leaderboard.html`
- **Timer**: `/pages/timer.html?mode=tournament`

## Database Management

Python scripts for Firebase administration:

```bash
# Install dependencies
pip install -r dev/requirements.txt

# View database statistics
python dev/db_stats.py

# Delete all tournaments
python dev/db_cleanup.py delete-all

# Export backups
python dev/db_export.py
```

See [dev/README.md](dev/README.md) for full admin tools documentation.

## Security

- Firebase security rules in `firestore.rules`
- Service account keys (for admin tools) are gitignored
- Admin panel has no authentication (add your own if deploying publicly)
- Read-only Firestore access for public users
- Write access controlled via security rules

**⚠️ Important**: The admin panel (`pages/admin.html`) has no authentication. For production use, add authentication or restrict access.

## Deployment

### GitHub Pages / Static Hosting

1. Push to GitHub
2. Enable GitHub Pages on your repository
3. Deploy from `main` branch, root directory

All paths are relative and will work on any static host.

**Do NOT deploy**:
- `dev/serviceAccountKey.json`
- `dev/` folder (contains admin scripts)
- `tests/` folder (optional, only for development)

### Hosting Recommendations

- ✅ **GitHub Pages** - Free, easy setup
- ✅ **Netlify** - Auto-deploy from Git
- ✅ **Vercel** - Fast static hosting
- ✅ **Firebase Hosting** - Integrated with Firebase backend

## Technology Stack

- **Frontend**: Vanilla HTML/CSS/JavaScript
- **Backend**: Firebase Firestore (real-time database)
- **Admin Tools**: Python + Firebase Admin SDK
- **Fonts**: Press Start 2P (8-bit retro)
- **PWA**: Manifest for mobile installation

## Browser Support

- ✅ Chrome/Edge (recommended)
- ✅ Safari (iOS/macOS)
- ✅ Firefox
- ⚠️ Requires JavaScript enabled
- ⚠️ Best experience on mobile devices

## Tournament Types

### Standard Tournament
- Multiple rounds, players accumulate wins
- Tables can be reset between rounds
- No player elimination

### Cut Line Tournament
- Players eliminated each round based on performance
- Configurable number of rounds
- 1/N players cut per round (except final)
- Golf-style ranking with tie-breaking

## Contributing

This is a personal project, but feel free to fork and adapt for your own use!

## License

MIT License - See LICENSE file for details

## Credits

- **Design Inspiration**: Retro arcade aesthetics
- **Fonts**: Press Start 2P by CodeMan38
- **Animations**: Pokémon GIFs (Magikarp, Pikachu)
- **Mahjong GIF**: Various tile animations

## Support

For issues or questions, open a GitHub issue.

---

**Made with ❤️ for Speed Mahjong enthusiasts**
