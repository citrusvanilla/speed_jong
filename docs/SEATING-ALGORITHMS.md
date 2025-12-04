# Seating Assignment Algorithms

## Overview

The Speed Jong tournament system now supports three different algorithms for assigning players to tables. These algorithms provide flexibility in how players are distributed across tables based on tournament stage and strategy.

## Available Algorithms

### 1. 🎲 Random
**Description:** Randomly shuffles all unassigned players before assigning to tables.

**Use Case:**
- Default algorithm for all rounds
- Best for Round 1 (when no rankings exist yet)
- Ensures unpredictable and fair distribution
- Prevents strategic gaming of table assignments

**Example (16 players, 4 tables):**
```
Table 1: Players 7, 3, 12, 5
Table 2: Players 14, 1, 9, 16
Table 3: Players 4, 11, 8, 2
Table 4: Players 13, 6, 15, 10
```

---

### 2. 🏆 By Ranking
**Description:** Groups players by tournament rank. Top 4 players at table 1, next best 4 at table 2, etc.

**Use Case:**
- Available after Round 1 (requires existing rankings)
- Creates "bracket-style" competition
- Useful for creating high-stakes tables with top performers
- Can create elimination-style progression

**Ranking Criteria (in order):**
1. Total wins (descending)
2. Total points (descending)
3. Most recent win timestamp (descending)
4. Name (alphabetically)

**Example (16 players ranked 1-16, 4 tables):**
```
Table 1: Rank 1, 2, 3, 4 (top tier)
Table 2: Rank 5, 6, 7, 8 (upper mid)
Table 3: Rank 9, 10, 11, 12 (lower mid)
Table 4: Rank 13, 14, 15, 16 (bottom tier)
```

---

### 3. 🔄 Round Robin
**Description:** Distributes ranks evenly across tables. Places rank 1, 5, 9, 13 at table 1; rank 2, 6, 10, 14 at table 2, etc.

**Use Case:**
- Available after Round 1 (requires existing rankings)
- Balances skill levels across all tables
- Ensures each table has a mix of strong and weak players
- Useful for Swiss-style tournaments
- Prevents runaway leaders from consolidating strength

**Example (16 players ranked 1-16, 4 tables):**
```
Table 1: Rank 1, 5, 9, 13 (balanced)
Table 2: Rank 2, 6, 10, 14 (balanced)
Table 3: Rank 3, 7, 11, 15 (balanced)
Table 4: Rank 4, 8, 12, 16 (balanced)
```

---

## Implementation Details

### Python Admin Tool (`dev/db_auto_assign.py`)

**Usage:**
```bash
# Activate virtual environment first
cd dev
source venv/bin/activate

# Random assignment (default)
python db_auto_assign.py <tournament-id>
python db_auto_assign.py <tournament-id> random

# By ranking
python db_auto_assign.py <tournament-id> ranking

# Round robin
python db_auto_assign.py <tournament-id> round_robin
```

**Features:**
- Validates algorithm choice against current round
- Automatically falls back to random for Round 1
- Shows player wins in output when using ranking algorithms
- Handles unassigned players automatically

---

### Web Admin Panel (`pages/admin.html` + `js/admin.js`)

**UI Features:**
- Algorithm selector dropdown in Auto-Assign modal
- Contextual descriptions that update when algorithm is selected
- Conditional enabling/disabling of ranking algorithms:
  - **Round 1:** Only "Random" available (ranking options disabled)
  - **Round 2+:** All algorithms available
- Visual feedback showing which algorithm was used

**Algorithm Descriptions:**
- **Random:** "Randomly shuffles all unassigned players before assigning to tables."
- **By Ranking:** "Groups players by rank. Best 4 players at table 1, next best 4 at table 2, etc. *Useful for seeding strong players together.*"
- **Round Robin:** "Distributes ranks evenly. Places rank 1, 5, 9, 13 at table 1; rank 2, 6, 10, 14 at table 2, etc. *Balances skill levels across tables.*"

---

## Technical Implementation

### Sorting Function (Python & JavaScript)

Players are sorted using the following criteria:
1. **Wins** (descending) - Players with more wins rank higher
2. **Points** (descending) - Tie-breaker: more points ranks higher
3. **Last Win Timestamp** (descending) - Players with more recent wins rank higher
4. **Name** (alphabetically) - Final tie-breaker for identical records

### Assignment Functions

**Python:** `assign_by_algorithm(players, algorithm)`
**JavaScript:** `assignPlayersByAlgorithm(players, algorithm)`

Both implementations:
- Take a list of players and an algorithm name
- Return a list of table assignments (array of arrays)
- Only assign players that can be fully seated (divisible by 4)
- Use the same sorting logic for consistency

---

## Round 1 Restrictions

### Why Ranking Algorithms Are Disabled for Round 1

Before Round 1 starts, all players have:
- **0 wins**
- **0 points**
- **No last win timestamp**

This means:
- All players are tied in the ranking
- Sorting by ranking produces arbitrary results
- "By Ranking" and "Round Robin" would effectively be random anyway

### Automatic Fallback

Both the Python and JavaScript implementations:
- Detect when `currentRound <= 1`
- Automatically disable or fall back to "Random" algorithm
- Show warning messages to the user

---

## Testing Recommendations

### Round 1 Test
1. Create a new tournament
2. Add 16 players
3. Open Auto-Assign modal
4. Verify only "Random" is available
5. Confirm players are assigned randomly

### Round 2+ Test
1. Complete Round 1 with some players winning
2. Unassign all players
3. Open Auto-Assign modal
4. Verify all three algorithms are available
5. Test "By Ranking" - verify top players grouped together
6. Unassign all players
7. Test "Round Robin" - verify ranks distributed evenly

### Python Script Test
```bash
# Round 1 - should auto-fallback to random
python db_auto_assign.py abc123 ranking
# Warning: 'ranking' algorithm not recommended for Round 1
# Falling back to 'random' algorithm

# Round 2+ - should work normally
python db_auto_assign.py abc123 ranking
# Shows players with win counts
```

---

## Future Enhancements

Potential improvements:
1. **Custom Sorting:** Allow admins to define custom ranking criteria
2. **Algorithm Selection for Auto-Assign After Round:** Currently uses random; could allow selection
3. **Swiss Pairing:** Implement full Swiss system pairing logic
4. **Seeding:** Allow manual seeding for Round 1
5. **Preview:** Show table assignments before confirming
6. **History:** Track which algorithm was used for each round

---

## Files Modified

### Python
- `dev/db_auto_assign.py` - Added algorithm support and sorting logic

### JavaScript
- `js/admin.js` - Added sorting, assignment functions, and UI logic

### HTML
- `pages/admin.html` - Added algorithm selector to auto-assign modal

---

## Related Documentation

- **Tournament Guide:** `docs/TOURNAMENT-GUIDE.md`
- **Firebase Schema:** `docs/FIREBASE-SCHEMA.md`
- **Cut Line Logic:** `docs/CUT-LINE-LOGIC.md`
- **Project Structure:** `PROJECT-STRUCTURE.md`


