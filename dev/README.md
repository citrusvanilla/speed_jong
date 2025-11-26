# Firebase Admin Tools

Python scripts for managing your Speed Jong Firebase database.

## Setup

### 1. Create Python Virtual Environment (Recommended)

```bash
cd dev
python3 -m venv venv
source venv/bin/activate  # On macOS/Linux
# venv\Scripts\activate   # On Windows
```

The venv is already created and has Firebase Admin SDK installed.

### 2. Activate Virtual Environment

Every time you want to use the admin tools:

```bash
cd dev
source venv/bin/activate  # On macOS/Linux
# venv\Scripts\activate   # On Windows
```

You'll see `(venv)` in your terminal prompt when activated.

To deactivate:
```bash
deactivate
```

### 3. Install/Update Dependencies (if needed)

```bash
# Make sure venv is activated first
pip install -r requirements.txt
```

### 4. Get Service Account Key

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project (speedjong-285c0)
3. Click the gear icon → **Project Settings**
4. Go to **Service Accounts** tab
5. Click **Generate New Private Key**
6. Save the JSON file as `dev/serviceAccountKey.json`

⚠️ **Important:** Never commit `serviceAccountKey.json` to git! It's already in `.gitignore`.

## Usage

**Important**: Make sure your virtual environment is activated before running these commands!

```bash
cd dev
source venv/bin/activate
```

### View Database Statistics

```bash
python db_stats.py
```

Shows:
- Number of tournaments
- Players per tournament
- Tables per tournament
- Rounds per tournament
- Total participants across all rounds

### Database Cleanup

**Delete all tournaments:**
```bash
python db_cleanup.py delete-all
```

**Delete specific tournament:**
```bash
python db_cleanup.py delete <tournament-id>
```

**Find orphaned data:**
```bash
python db_cleanup.py find-orphans
```

Checks for:
- Players assigned to non-existent tables
- Tables referencing non-existent players

**Nuclear option (delete EVERYTHING):**
```bash
python db_cleanup.py nuclear
```

⚠️ This deletes ALL data from ALL collections!

### Export/Backup

**Export all tournaments:**
```bash
python db_export.py
```

Exports all tournaments to `exports/` as JSON files.

**Export specific tournament:**
```bash
python db_export.py <tournament-id>
```

Each export includes:
- Tournament data
- All players
- All tables
- All rounds
- All participants per round

### Bulk Player Import

**List tournaments:**
```bash
python db_bulk_import.py list
```

**Import players from file:**
```bash
python db_bulk_import.py import <tournament-id> <file-path>
```

**File format:**
- Plain text or CSV
- One player name per line
- Empty lines ignored
- Duplicates automatically skipped

**Example file (`players.txt`):**
```
Alice Johnson
Bob Smith
Carol Williams
```

**Example usage:**
```bash
python db_bulk_import.py list
python db_bulk_import.py import abc123 players.txt
```

The script will:
- Check for duplicates (in file and database)
- Respect tournament player limits
- Preview before importing
- Provide detailed progress feedback

### Create Tournament

**Quick tournament creation:**
```bash
python create_tournament.py "Tournament Name" [type] [timer] [max_players] [total_rounds]
```

**Examples:**
```bash
# Standard tournament
python create_tournament.py "Spring 2024"

# Cut line, 5s timer, 64 max, 4 rounds
python create_tournament.py "Championship" cutline 5 64 4
```

### Export/Import Tournament State

**Export complete state to JSON:**
```bash
python db_export_state.py <tournament-id> [output-file]
```

Exports everything:
- Tournament settings
- All players with current scores
- All table assignments
- All rounds with participant snapshots

**Import state from JSON:**
```bash
python db_import_state.py <json-file> [new-tournament-id]
```

Creates a complete copy of the tournament at the exact state it was exported.

**Use cases:**
- 📸 Snapshot before risky operations
- 🐛 Debug specific scenarios
- 🧪 Create test fixtures
- 💾 Backup before tournament
- 🔄 Restore if something goes wrong

### Simulate Games (Testing)

**Generate realistic game results:**
```bash
python db_simulate_games.py <tournament-id> [min-games] [max-games]
```

Simulates 4-6 games per table (or custom range):
- Randomly picks winners from each table
- Updates player wins and lastWinAt timestamps
- Updates round participant records
- Spreads game times over ~1 hour period

**Example workflow:**
```bash
# Create tournament and add players
python create_tournament.py "Test Tournament" cutline 5 60 4
python db_bulk_import.py import <tournament-id> ../tests/sample_players_60.csv

# (In admin UI: auto-assign tables and start round 1)

# Simulate games
python db_simulate_games.py <tournament-id> 4 6

# Export state for later
python db_export_state.py <tournament-id> test_round1_complete.json

# (Test cut line logic in UI)

# If needed, restore from backup
python db_import_state.py test_round1_complete.json
```

## Important Notes

### Player Count Requirements

**Starting Rounds:**
- Number of active players MUST be divisible by 4
- Each table requires exactly 4 players
- The system will prevent starting a round if this requirement isn't met

**Cut Line Tournaments:**
- Plan your player count and rounds carefully
- After each cut, remaining players should be divisible by 4
- Example: 64 players → 48 → 32 → 16 (all divisible by 4)
- Avoid: 60 players → 45 → 30 → 15 (creates assignment issues)

## Security Notes

- These scripts use **Firebase Admin SDK** with full database access
- Service account key gives unrestricted access to your Firebase project
- Keep `serviceAccountKey.json` secure and never share it
- Only run these scripts locally, never deploy them

## File Structure

```
dev/
├── requirements.txt           # Python dependencies
├── serviceAccountKey.json     # Your Firebase credentials (gitignored)
├── setup_firebase.py          # Firebase initialization
├── db_stats.py               # View database statistics
├── db_cleanup.py             # Cleanup and deletion tools
├── db_export.py              # Export/backup tools
├── exports/                  # JSON exports (created automatically)
└── README.md                 # This file
```

