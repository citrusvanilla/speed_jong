# Scoring and Ranking System

## Overview

Speed Jong uses a **score-based system with round multipliers** to rank players. Players earn points (+1) or penalties (-1) during gameplay, and each round can have a multiplier applied.

---

## Scoring System

### Score Events

During each round, players record score events:
- **+1** - Player scored a point (win/success)
- **-1** - Player received a penalty

Each score event is stored with:
- `delta`: +1 or -1
- `roundNumber`: Which round this occurred in
- `timestamp`: When it occurred (relative to round start)

### Round Multipliers

Each round has a **scoreMultiplier** (default: 1x):
- Set by admin when creating/editing a round
- Can be any positive number (e.g., 1x, 2x, 3x, 1.5x)
- Typically used for playoff/final rounds to increase stakes
- Applied to all score events in that round

### Score Calculations

#### 1. **Tournament Score**
Total score across all rounds, with multipliers applied:

```
Tournament Score = Σ (scoreEvent.delta × round.scoreMultiplier) for all rounds
```

**Example:**
- Round 1 (1x): +2 points, -1 penalty = **+1**
- Round 2 (1x): +3 points, 0 penalties = **+3**
- Round 3 (2x): +1 point, -1 penalty = **0** (but doubled: 0 × 2 = 0)
- **Total Tournament Score: +1 + 3 + 0 = +4**

#### 2. **Round Score**
Score for current round only, with multiplier:

```
Round Score = Σ (scoreEvent.delta × round.scoreMultiplier) for current round
```

**Example (Round 3 with 2x multiplier):**
- +2 points, -1 penalty = (+2 - 1) × 2 = **+2**

#### 3. **Table Round Score**
Sum of all 4 players' round scores at the same table:

```
Table Round Score = Σ (player.roundScore) for all 4 players at table
```

**Example Table:**
- Player A: +2 (round score)
- Player B: +1
- Player C: -1
- Player D: +1
- **Table Round Score: +3**

---

## Ranking Algorithm

### Tie-Breaker Hierarchy

Players are ranked from **best to worst** using the following criteria:

1. **Tournament Score** (higher is better)
2. **Round Score** (higher is better)
3. **Last Win Timestamp** (more recent is better)
4. **Table Round Score** (higher is better)
5. **Name** (alphabetically, as final tie-breaker)

### How Tie-Breaking Works

Players are compared **sequentially** through each criterion:

```
IF Player A's tournament score > Player B's tournament score:
    → Player A ranks higher
ELSE IF tournament scores are equal:
    → Compare round scores
    → If still tied, compare last win timestamps
    → If still tied, compare table round scores
    → If still tied, alphabetical by name
```

### Why This Order?

1. **Tournament Score** - Primary measure of overall performance
2. **Round Score** - Rewards current round performance (recent success matters)
3. **Last Win Timestamp** - Rewards recency and momentum
4. **Table Round Score** - Rewards being at a high-performing table
5. **Name** - Ensures deterministic, stable ranking

---

## Golf-Style Ranking

Players with **identical scores across ALL tie-breakers** share the same rank.

### Rank Skipping

After tied players, the next rank skips appropriately:

```
Rank 1: Player A (10 pts)
Rank 2: Player B (8 pts)
Rank 3: Player C (7 pts)
Rank 4: Player D (5 pts)  ← Tied
Rank 4: Player E (5 pts)  ← Tied (same tournament score, round score, last win, table score)
Rank 4: Player F (5 pts)  ← Tied
Rank 4: Player G (5 pts)  ← Tied
Rank 8: Player H (4 pts)  ← Next rank is 8 (not 5!)
```

**Formula:** Next rank after N tied players = current rank + N

### When Players Are Tied

Players are considered **fully tied** ONLY if ALL of these match:
- ✅ Same tournament score
- ✅ Same round score
- ✅ Same last win timestamp (or both have no wins)
- ✅ Same table round score

If even ONE criterion differs, they get different ranks.

---

## Examples

### Example 1: Simple Tournament Score Difference

| Rank | Player | Tournament Score | Round Score | Last Win | Table Score |
|------|--------|------------------|-------------|----------|-------------|
| 1    | Alice  | +10              | +3          | 12:05    | +8          |
| 2    | Bob    | +8               | +2          | 12:03    | +6          |
| 3    | Carol  | +7               | +4          | 12:10    | +9          |

**Why this order?**
- Alice has highest tournament score (+10) → Rank 1
- Bob has 2nd highest (+8) → Rank 2
- Carol has 3rd highest (+7) → Rank 3

---

### Example 2: Tied Tournament Score, Different Round Scores

| Rank | Player | Tournament Score | Round Score | Last Win | Table Score |
|------|--------|------------------|-------------|----------|-------------|
| 1    | Alice  | +5               | +3          | 12:05    | +7          |
| 2    | Bob    | +5               | +2          | 12:03    | +6          |
| 3    | Carol  | +5               | +1          | 12:01    | +5          |

**Why this order?**
- All have same tournament score (+5)
- Alice has highest round score (+3) → Rank 1
- Bob has 2nd highest round score (+2) → Rank 2
- Carol has lowest round score (+1) → Rank 3

---

### Example 3: Same Tournament & Round Score, Different Last Win

| Rank | Player | Tournament Score | Round Score | Last Win | Table Score |
|------|--------|------------------|-------------|----------|-------------|
| 1    | Alice  | +5               | +2          | 12:10    | +7          |
| 2    | Bob    | +5               | +2          | 12:05    | +6          |
| 3    | Carol  | +5               | +2          | 12:01    | +8          |

**Why this order?**
- All have same tournament score (+5) and round score (+2)
- Alice has most recent win (12:10) → Rank 1
- Bob has 2nd most recent win (12:05) → Rank 2
- Carol has oldest win (12:01) → Rank 3 (even though her table score is highest!)

---

### Example 4: Everything Tied Except Table Score

| Rank | Player | Tournament Score | Round Score | Last Win | Table Score |
|------|--------|------------------|-------------|----------|-------------|
| 1    | Alice  | +5               | +2          | 12:05    | +8          |
| 2    | Bob    | +5               | +2          | 12:05    | +6          |
| 3    | Carol  | +5               | +2          | 12:05    | +4          |

**Why this order?**
- All have same tournament score, round score, and last win time
- Alice's table has highest total score (+8) → Rank 1
- Bob's table has 2nd highest (+6) → Rank 2
- Carol's table has lowest (+4) → Rank 3

---

### Example 5: Fully Tied Players (Golf-Style)

| Rank | Player | Tournament Score | Round Score | Last Win | Table Score |
|------|--------|------------------|-------------|----------|-------------|
| 1    | Alice  | +5               | +2          | 12:05    | +7          |
| 2    | Bob    | +3               | +1          | 12:03    | +5          |
| 3    | Carol  | +2               | +1          | 12:01    | +4          |
| 4    | David  | 0                | 0           | (none)   | 0           |
| 4    | Emma   | 0                | 0           | (none)   | 0           |
| 4    | Frank  | 0                | 0           | (none)   | 0           |
| 4    | Grace  | 0                | 0           | (none)   | 0           |
| 8    | Henry  | -1               | -1          | 12:00    | -2          |

**Why this order?**
- Alice, Bob, Carol have different scores → Ranks 1, 2, 3
- David, Emma, Frank, Grace ALL have identical stats → All Rank 4
- Next rank after 4 tied players is **8** (4 + 4 = 8)
- Henry has negative score → Rank 8

---

## Round Multiplier Examples

### Example: 3-Round Tournament with Final Round at 2x

**Player Performance:**

| Round | Multiplier | Score Events | Calculation | Round Score |
|-------|------------|--------------|-------------|-------------|
| 1     | 1x         | +3, -1       | (3-1) × 1   | +2          |
| 2     | 1x         | +2, -1       | (2-1) × 1   | +1          |
| 3     | 2x         | +4, 0        | (4-0) × 2   | +8          |

**Tournament Score:** 2 + 1 + 8 = **+11**

**Impact:** Round 3 is worth **double**, so performing well in finals is crucial!

---

### Example: Progressive Multipliers

| Round | Multiplier | Theme         |
|-------|------------|---------------|
| 1-3   | 1x         | Regular play  |
| 4     | 1.5x       | Semi-finals   |
| 5     | 2x         | Finals        |

This rewards players who advance deep into the tournament.

---

## Cut-Line Implications

For **cut-line tournaments**, players are sorted **worst-first** (using the SAME criteria, but reversed):

1. **Lowest tournament score** gets cut first
2. If tied, **lowest round score** gets cut
3. If tied, **oldest last win** gets cut
4. If tied, **lowest table score** gets cut

This ensures that:
- Players who performed poorly overall are eliminated first
- Recent performance matters (round score is 2nd criterion)
- Players at high-performing tables have slight advantage
- Tie-breaking is fair and deterministic

---

## Technical Implementation

### Code Location

**Sorting Functions:**
- `js/cutline-utils.js`
  - `sortPlayersForLeaderboard()` - Best-first sorting
  - `sortPlayersForCutLine()` - Worst-first sorting
  - `calculateTournamentScore()`
  - `calculateRoundScore()`
  - `calculateTableRoundScore()`

**Used In:**
- Admin panel player stats table
- Leaderboard display
- Cut-line elimination calculations
- Playoff player selection

### Data Structure

**Player Object:**
```javascript
{
  id: "player123",
  name: "Alice",
  scoreEvents: [
    { delta: 1, roundNumber: 1, timestamp: Timestamp(...) },
    { delta: -1, roundNumber: 1, timestamp: Timestamp(...) },
    { delta: 1, roundNumber: 2, timestamp: Timestamp(...) }
  ],
  lastWinAt: Timestamp(...),  // Most recent +1 event
  tableId: "table456",
  eliminated: false
}
```

**Round Object:**
```javascript
{
  roundNumber: 1,
  scoreMultiplier: 1,  // Default 1x, can be changed by admin
  timerDuration: 30,   // Minutes
  status: 'in_progress',
  startedAt: Timestamp(...),
  endedAt: null
}
```

---

## Admin Configuration

### Setting Round Multipliers

Admins can set the multiplier when:
1. **Creating a round** - "Move to Next Round" creates with default 1x
2. **Editing staging round** - Input field appears in round info (editable before start)

**UI Location:**
- Admin Panel → Round Management → Round Info → "Score Multiplier" field

**Valid Values:**
- Minimum: 0.5x (half points)
- Maximum: 10x
- Step: 0.5 (allows 1x, 1.5x, 2x, 2.5x, etc.)

### Display Locations

**Round Multiplier Shown:**
- ✅ Admin panel round info (large, editable in staging)
- ✅ Leaderboard stats cards (highlighted if >1x)
- ✅ Round history/details
- 🔜 Player-view page
- 🔜 Timer page

---

## Best Practices

### For Tournament Organizers

1. **Use 1x for regular rounds** - Keeps scoring simple and predictable

2. **Use >1x for important rounds:**
   - Finals: 2x or 3x
   - Semi-finals: 1.5x or 2x
   - Playoff rounds: 2x

3. **Announce multipliers clearly** - Players should know stakes before playing

4. **Be consistent** - Don't change multipliers unexpectedly mid-tournament

### For Players

1. **Tournament score is king** - Overall performance matters most

2. **Recent performance matters** - Round score is 2nd tie-breaker

3. **Last win timing matters** - If tied, recency counts

4. **Table performance counts** - Playing at a high-scoring table helps in ties

5. **Multiplied rounds are crucial** - Perform well when stakes are high!

---

## FAQ

**Q: Why does round score come before last win timestamp?**

A: Round score reflects **current round performance**, which is more actionable and recent than historical "last win" timing. It rewards players who are performing well NOW.

**Q: Can tournament score be negative?**

A: Yes! If a player has more penalties (-1) than points (+1), their score can be negative.

**Q: What if two players have never scored (both 0 tournament score, no wins)?**

A: They'll be ranked by:
1. Round score (if current round has activity)
2. Table score (their table's total performance)
3. Name (alphabetically)

**Q: How does golf-style ranking work for eliminated players?**

A: Eliminated players are ranked separately, continuing from where active players left off. If 10 active players remain, the first eliminated player is Rank 11 (or shares a rank if tied with others eliminated in the same round).

**Q: Can multipliers be changed after a round starts?**

A: No, multipliers are locked once a round moves from `staging` to `in_progress`. This ensures fairness.

---

## Version History

- **v1.0** (Current) - Initial score-based system with multipliers
  - Replaced simple "wins" counting
  - Added round multipliers
  - Implemented 5-tier tie-breaking hierarchy
  - Golf-style ranking with proper rank skipping


