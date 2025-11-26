# Speed Jong Tournament System Guide

## 🎯 Overview

Your Speed Jong app now has a full tournament management system with Firebase backend!

## 📁 New Pages

| Page | URL | Purpose |
|------|-----|---------|
| Mode Selection | `mode-select.html` | Choose Practice or Tournament mode |
| Table Selection | `tournament-select.html` | Select your table (tournament mode) |
| Admin Dashboard | `admin.html` | Manage tournaments, players, and tables |
| Player View | `player-view.html` | Check your table assignment |
| Leaderboard | `leaderboard.html` | Live tournament standings |
| Timer | `index.html?mode=normal` | Practice mode timer |
| Timer (Tournament) | `index.html?mode=tournament` | Tournament mode with scoring |

## 🏆 Tournament Workflow

### Admin Setup (Before Tournament):

1. **Open Admin Dashboard**: http://localhost:8000/admin.html
2. **Create Tournament**:
   - Click "+ New Tournament"
   - Name it (e.g., "December 2025 Speed Jong")
   - Set default timer duration
3. **Register Players**:
   - Click "+ Add Player" for each of ~50 players
   - Names must be unique
   - Edit or delete as needed
4. **Assign Tables**:
   - **Option A (Auto)**: Click "🎲 Auto-Assign Players" to randomly create tables
   - **Option B (Manual)**: Click "+ Create Table" and manually assign 4 players to East/South/West/North positions
5. **Share Links**:
   - Players go to: `http://localhost:8000/player-view.html`
   - Timer/scoring: `http://localhost:8000/mode-select.html`
   - Leaderboard: `http://localhost:8000/leaderboard.html`

### Player Experience (During Tournament):

1. **Check Assignment**:
   - Go to `player-view.html`
   - Select your name
   - See table number and position (East/South/West/North)

2. **Launch Timer**:
   - Go to `mode-select.html`
   - Choose "Tournament Mode"
   - Select your table
   - Timer loads with scoring panel at bottom

3. **During Play**:
   - **Tap anywhere** on timer to reset countdown
   - **Long press (1.5s)** to return to table selection
   - **Scoring buttons** at bottom: `+` to add win, `−` to subtract
   - All 4 players at table can see and update scores in real-time

4. **Track Progress**:
   - Go to `leaderboard.html` anytime
   - See live rankings across all players
   - Updates automatically as games complete

## 🎮 Features

### Tournament Mode Timer:
- ✅ All original timer features (countdown, animations, sounds)
- ✅ Scoring panel at bottom of screen
- ✅ See all 4 players at your table
- ✅ `+` button to record a win
- ✅ `−` button to subtract (for mistakes or point losses)
- ✅ Real-time score updates (everyone sees changes instantly)
- ✅ Long press anywhere to go back to table selection

### Practice Mode Timer:
- ✅ Original timer without any tournament features
- ✅ No Firebase connection needed
- ✅ Long press to return to mode selection

### Admin Dashboard:
- ✅ Create multiple tournaments
- ✅ Add/edit/delete players (duplicate names prevented)
- ✅ Manual table creation with position assignments
- ✅ Auto-random table assignment
- ✅ Real-time updates
- ✅ Delete tables (players auto-unassigned)

### Leaderboard:
- ✅ Live updates as scores change
- ✅ Sorted by wins, then points
- ✅ Shows player names, table assignments, wins, and points
- ✅ Summary stats at top
- ✅ Top 3 get special colors (gold, silver, bronze)

## 🔒 Security Notes

**Current Setup (for testing):**
- Firestore rules allow all reads/writes
- Fine for private tournaments with trusted players

**Before Going Public:**
1. Deploy to a real server (not localhost)
2. Add Firebase Authentication
3. Update Firestore rules (see `firestore.rules`)
4. Restrict admin access to authenticated users only

## 💾 Data Structure

```
tournaments/{tournamentId}
  - name: string
  - status: "setup" | "active" | "completed"
  - timerDuration: number
  - createdAt: timestamp
  
  /players/{playerId}
    - name: string
    - tableId: string | null
    - position: "East" | "South" | "West" | "North" | null
    - wins: number
    - points: number
    - registeredAt: timestamp
  
  /tables/{tableId}
    - tableNumber: number
    - players: [playerId, playerId, playerId, playerId]
    - positions: { playerId: "East", ... }
    - createdAt: timestamp
```

## 🚀 Quick Start

1. **Start local server**: Already running on http://localhost:8000
2. **Admin setup**: Create tournament, add players, assign tables
3. **Players check in**: View assignments at `player-view.html`
4. **Play games**: Use tournament mode timer with scoring
5. **Watch leaderboard**: Live updates at `leaderboard.html`

## 📱 Mobile Optimization

- All pages are mobile-responsive
- Scoring buttons are touch-optimized
- Long press works on both desktop and mobile
- Real-time updates work across all devices

---

**Ready to test?** Start at: http://localhost:8000/admin.html

