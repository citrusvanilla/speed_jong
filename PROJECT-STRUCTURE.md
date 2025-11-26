# Speed Jong Timer - Project Structure

## Directory Structure

```
spped_jong/
├── index.html                 # Main entry point - mode selection
├── manifest.json             # PWA manifest
├── firestore.rules          # Firebase security rules
├── .gitignore               # Git ignore file
├── README.md                # Main documentation
├── PROJECT-STRUCTURE.md     # This file
│
├── assets/                  # Static assets
│   ├── images/             # Image files
│   │   ├── favicon.jpg     # Site favicon
│   │   ├── mahjong.gif     # Loading/start screen animation
│   │   ├── magikarp.gif    # Timeout animation
│   │   └── pickachu_happy.gif  # Tap feedback animation
│   └── fonts/              # Custom fonts
│       └── PressStart2P-Regular.ttf  # 8-bit retro font
│
├── css/                     # Stylesheets
│   ├── style.css           # Main app styles
│   └── admin-styles.css    # Admin panel styles
│
├── js/                      # JavaScript files
│   ├── firebase-config.js  # Firebase initialization
│   ├── script.js           # Main timer logic
│   └── admin.js            # Admin panel logic
│
├── pages/                   # HTML pages (excluding index)
│   ├── timer.html          # Main timer interface
│   ├── tournament-select.html  # Table selection for tournaments
│   ├── player-view.html    # Player assignment view
│   ├── leaderboard.html    # Real-time leaderboard
│   └── admin.html          # Tournament admin panel
│
├── docs/                    # Documentation
│   └── TOURNAMENT-GUIDE.md # Tournament feature guide
│
├── dev/                     # Development tools
│   ├── README.md           # Dev tools documentation
│   ├── requirements.txt    # Python dependencies
│   ├── setup_firebase.py   # Firebase Admin SDK setup
│   ├── db_stats.py         # Database statistics
│   ├── db_cleanup.py       # Database cleanup utilities
│   ├── db_export.py        # Database export/backup
│   ├── serviceAccountKey.json  # Firebase credentials (gitignored)
│   └── exports/            # JSON exports (gitignored)
│
└── tests/                   # Test files
    └── firebase-test.html  # Firebase connection test
```

## File Purposes

### Root Files

- **index.html**: Entry point of the application. Shows mode selection (Practice vs Tournament).
- **manifest.json**: Progressive Web App manifest for mobile installation.
- **firestore.rules**: Firebase Firestore security rules.
- **.gitignore**: Specifies files to ignore in version control.

### Assets

**Images**:
- `favicon.jpg`: Browser tab icon
- `mahjong.gif`: Animated mahjong tiles for start screen
- `magikarp.gif`: Timeout animation (Pokémon reference)
- `pickachu_happy.gif`: Tap feedback animation

**Fonts**:
- `PressStart2P-Regular.ttf`: Retro 8-bit style font used throughout the app

### CSS

- **style.css**: Main application styles including timer, animations, and responsive design
- **admin-styles.css**: Styles specific to the admin panel (cards, forms, tables)

### JavaScript

- **firebase-config.js**: Firebase project configuration and initialization
- **script.js**: Main timer logic, tournament mode integration, scoring
- **admin.js**: Admin panel functionality (tournament/player/table/round management)

### Pages

User-facing pages:
- **timer.html**: The main countdown timer interface
- **tournament-select.html**: Select your table for tournament mode
- **player-view.html**: View your table assignment
- **leaderboard.html**: Real-time tournament leaderboard

Admin pages:
- **admin.html**: Comprehensive tournament management dashboard

### Development Tools

Python scripts for database administration:
- **db_stats.py**: View database statistics
- **db_cleanup.py**: Clean up and delete data
- **db_export.py**: Export/backup tournaments to JSON

See `dev/README.md` for detailed usage.

### Tests

- **firebase-test.html**: Simple page to verify Firebase connection

## Path References

All paths are relative to the file location:

**From root (index.html)**:
- CSS: `css/style.css`
- JS: `js/script.js`
- Images: `assets/images/favicon.jpg`
- Pages: `pages/timer.html`

**From pages/ directory**:
- CSS: `../css/style.css`
- JS: `../js/script.js`
- Images: `../assets/images/favicon.jpg`
- Root: `../index.html`
- Other pages: `timer.html` (same directory)

**From css/ directory**:
- Fonts: `../assets/fonts/PressStart2P-Regular.ttf`

## Deployment

### Local Development

1. Start a local server:
   ```bash
   python3 -m http.server 8000
   ```

2. Open browser to `http://localhost:8000`

### Production (GitHub Pages / Static Hosting)

Simply deploy the entire directory structure. All paths are relative and will work on any static host.

**Important**: Never deploy the `dev/` folder or `serviceAccountKey.json` to production!

## Firebase Structure

```
Firestore Collections:
└── tournaments/{tournamentId}
    ├── (tournament document)
    ├── players/{playerId}
    ├── tables/{tableId}
    └── rounds/{roundId}
        └── participants/{participantId}
```

See `docs/TOURNAMENT-GUIDE.md` for full tournament feature documentation.

