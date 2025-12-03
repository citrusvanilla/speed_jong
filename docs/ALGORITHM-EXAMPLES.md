# Seating Algorithm Examples

## Visual Comparison of All Three Algorithms

### Scenario: 16 Players After Round 2

**Player Rankings (by wins/points):**

| Rank | Player | Wins | Points |
|------|--------|------|--------|
| 1    | Alice  | 6    | 82     |
| 2    | Bob    | 5    | 78     |
| 3    | Carol  | 5    | 75     |
| 4    | David  | 4    | 71     |
| 5    | Eve    | 4    | 68     |
| 6    | Frank  | 4    | 65     |
| 7    | Grace  | 3    | 62     |
| 8    | Henry  | 3    | 59     |
| 9    | Ivy    | 3    | 56     |
| 10   | Jack   | 2    | 53     |
| 11   | Kelly  | 2    | 50     |
| 12   | Leo    | 2    | 47     |
| 13   | Mary   | 1    | 44     |
| 14   | Nancy  | 1    | 41     |
| 15   | Oscar  | 1    | 38     |
| 16   | Paul   | 0    | 35     |

---

## Algorithm 1: 🎲 Random

**Description:** Randomly shuffles all players before assignment

**Table Assignments (example):**

```
┌─────────┬─────────────────────────────────┐
│ Table 1 │ Grace, Paul, Alice, Jack        │
│         │ (3W, 0W, 6W, 2W)                │
│         │ Average: 2.75 wins              │
├─────────┼─────────────────────────────────┤
│ Table 2 │ Eve, Leo, Carol, Nancy          │
│         │ (4W, 2W, 5W, 1W)                │
│         │ Average: 3.0 wins               │
├─────────┼─────────────────────────────────┤
│ Table 3 │ Henry, David, Ivy, Oscar        │
│         │ (3W, 4W, 3W, 1W)                │
│         │ Average: 2.75 wins              │
├─────────┼─────────────────────────────────┤
│ Table 4 │ Bob, Frank, Mary, Kelly         │
│         │ (5W, 4W, 1W, 2W)                │
│         │ Average: 3.0 wins               │
└─────────┴─────────────────────────────────┘
```

**Characteristics:**
- ✅ Unpredictable distribution
- ✅ No strategic advantage from knowing rankings
- ✅ Each table has mixed skill levels
- ⚠️  Luck-based - some tables may be harder than others

---

## Algorithm 2: 🏆 By Ranking

**Description:** Groups players by rank (top 4 together, next 4 together, etc.)

**Table Assignments:**

```
┌─────────┬─────────────────────────────────┐
│ Table 1 │ Alice, Bob, Carol, David        │
│  🏆     │ (6W, 5W, 5W, 4W)                │
│  TOP    │ Average: 5.0 wins - ELITE TABLE │
├─────────┼─────────────────────────────────┤
│ Table 2 │ Eve, Frank, Grace, Henry        │
│  ⭐     │ (4W, 4W, 3W, 3W)                │
│  UPPER  │ Average: 3.5 wins - STRONG      │
├─────────┼─────────────────────────────────┤
│ Table 3 │ Ivy, Jack, Kelly, Leo           │
│  📊     │ (3W, 2W, 2W, 2W)                │
│  LOWER  │ Average: 2.25 wins - MODERATE   │
├─────────┼─────────────────────────────────┤
│ Table 4 │ Mary, Nancy, Oscar, Paul        │
│  🔻     │ (1W, 1W, 1W, 0W)                │
│  BOTTOM │ Average: 0.75 wins - STRUGGLING │
└─────────┴─────────────────────────────────┘
```

**Characteristics:**
- ✅ Creates clear skill tiers
- ✅ Best players compete directly against each other
- ✅ Useful for "playoff" or "bracket" style progression
- ✅ Weaker players get fair competition at their level
- ⚠️  Can create "runaway leader" effect at top tables
- ⚠️  Bottom tables may feel "eliminated" even if still playing

**Use Cases:**
- Championship rounds
- Creating highlight matches (top players)
- Separating skill levels intentionally
- Bracket-style progression

---

## Algorithm 3: 🔄 Round Robin

**Description:** Distributes ranks evenly across all tables

**Table Assignments:**

```
┌─────────┬─────────────────────────────────┐
│ Table 1 │ Alice, Eve, Ivy, Mary           │
│  🎯     │ (#1, #5, #9, #13)               │
│         │ (6W, 4W, 3W, 1W)                │
│         │ Average: 3.5 wins - BALANCED    │
├─────────┼─────────────────────────────────┤
│ Table 2 │ Bob, Frank, Jack, Nancy         │
│  🎯     │ (#2, #6, #10, #14)              │
│         │ (5W, 4W, 2W, 1W)                │
│         │ Average: 3.0 wins - BALANCED    │
├─────────┼─────────────────────────────────┤
│ Table 3 │ Carol, Grace, Kelly, Oscar      │
│  🎯     │ (#3, #7, #11, #15)              │
│         │ (5W, 3W, 2W, 1W)                │
│         │ Average: 2.75 wins - BALANCED   │
├─────────┼─────────────────────────────────┤
│ Table 4 │ David, Henry, Leo, Paul         │
│  🎯     │ (#4, #8, #12, #16)              │
│         │ (4W, 3W, 2W, 0W)                │
│         │ Average: 2.25 wins - BALANCED   │
└─────────┴─────────────────────────────────┘
```

**Characteristics:**
- ✅ Every table has similar average skill level
- ✅ Each table has one top player, one bottom player, two middle
- ✅ Fair competition across all tables
- ✅ Prevents leader consolidation
- ✅ Ideal for Swiss-style tournaments
- ✅ Gives weaker players chance to compete with strong players

**Use Cases:**
- Swiss system tournaments
- Maintaining competitive balance
- Preventing skill clustering
- Fair progression through rounds

---

## Side-by-Side Comparison

| Metric                    | Random | By Ranking | Round Robin |
|---------------------------|--------|------------|-------------|
| **Table Avg (High)**      | 3.0    | 5.0        | 3.5         |
| **Table Avg (Low)**       | 2.75   | 0.75       | 2.25        |
| **Variance**              | Medium | Very High  | Very Low    |
| **Skill Balance**         | Random | None       | Maximum     |
| **Predictability**        | None   | High       | Medium      |
| **Top Player Advantage**  | None   | High       | Low         |

---

## When to Use Each Algorithm

### Use **Random** when:
- ✅ It's Round 1 (no rankings exist)
- ✅ You want complete unpredictability
- ✅ You want to prevent strategic gaming
- ✅ Fairness through randomness is important

### Use **By Ranking** when:
- ✅ You want to create "bracket-style" competition
- ✅ Creating a championship/playoff atmosphere
- ✅ You want best players to compete directly
- ✅ Skill tiers make sense for your tournament
- ✅ You're running elimination-style progression

### Use **Round Robin** when:
- ✅ You want balanced competition at every table
- ✅ Running a Swiss-style tournament
- ✅ You want to prevent runaway leaders
- ✅ Every player should face varied skill levels
- ✅ Maintaining fairness across all tables is critical

---

## Mathematical Distribution

### 12-Player Tournament (3 tables)

**Rankings:** Players 1-12 by skill

#### Random
```
Table distribution: ???
(completely unpredictable)
```

#### By Ranking
```
Table 1: Players 1, 2, 3, 4   (ranks 1-4)
Table 2: Players 5, 6, 7, 8   (ranks 5-8)
Table 3: Players 9, 10, 11, 12 (ranks 9-12)
```

#### Round Robin
```
Table 1: Players 1, 4, 7, 10  (every 3rd rank)
Table 2: Players 2, 5, 8, 11  (every 3rd rank + 1)
Table 3: Players 3, 6, 9, 12  (every 3rd rank + 2)
```

**Formula for Round Robin:**
- Player at rank `R` goes to table `(R - 1) mod N`
- Where `N` = number of tables
- This creates perfect distribution

---

## Real-World Example: 64-Player Tournament

### Round 3 (After 2 rounds, players have different win records)

**Player Distribution by Wins:**
- 8 players with 5+ wins (top tier)
- 16 players with 3-4 wins (upper mid)
- 24 players with 1-2 wins (lower mid)
- 16 players with 0 wins (struggling)

#### Random Assignment
- Each table gets a random mix
- Some tables might have 3 top players by chance
- Some tables might have 3 struggling players by chance

#### By Ranking Assignment
```
Tables 1-2:   All 8 top tier players (ultra-competitive!)
Tables 3-6:   Upper mid tier (strong competition)
Tables 7-12:  Lower mid tier (moderate)
Tables 13-16: Struggling players (learning environment)
```

#### Round Robin Assignment
```
Every table gets:
- ~0.5 top tier players (1 every 2 tables)
- 1 upper mid player
- 1-2 lower mid players
- 1 struggling player

All tables are balanced!
```

---

## Tips for Tournament Organizers

1. **Start with Random** for Round 1 (always)

2. **Consider your tournament goals:**
   - **Casual/Fun:** Random throughout
   - **Competitive/Swiss:** Round Robin after Round 1
   - **Championship/Playoffs:** By Ranking for final rounds

3. **Mix algorithms:**
   - Rounds 1-3: Random
   - Rounds 4-6: Round Robin
   - Finals: By Ranking

4. **Communicate the algorithm:**
   - Tell players which algorithm you're using
   - Explain why (strategy, fairness, excitement)
   - Set expectations

5. **Monitor feedback:**
   - Ask players which they prefer
   - Adjust for future tournaments
   - Different communities may prefer different styles

---

## Implementation Notes

Both Python and JavaScript implementations use identical sorting logic:

```
Sort Priority:
1. Wins (DESC)      - More wins = higher rank
2. Points (DESC)    - Tie-breaker: more points
3. Last Win (DESC)  - Recent winners rank higher in ties
4. Name (ASC)       - Alphabetical as final tie-breaker
```

This ensures consistent rankings across both admin interfaces.

