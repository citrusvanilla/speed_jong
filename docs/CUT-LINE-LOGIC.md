# Cut Line Tournament Logic

## Overview

Cut line tournaments use a sophisticated elimination system that targets cumulative percentages while handling ties intelligently and ensuring player counts remain divisible by 4.

## Percentage Targets

Cuts are based on **original player count**, not current round participants.

### Formula
```
Target Remaining = Original Count × (1 - Current Round / Total Rounds)
```

### Examples

**4-Round Tournament:**
- Round 1 → 75% remaining (cut bottom 25%)
- Round 2 → 50% remaining (cumulative cut to 50%)
- Round 3 → 25% remaining (cumulative cut to 25%)
- Round 4 → Finals (no cuts)

**3-Round Tournament:**
- Round 1 → 67% remaining (cut bottom 33%)
- Round 2 → 33% remaining (cumulative cut to 67%)
- Round 3 → Finals (no cuts)

**With 64 Players, 4 Rounds:**
```
Original: 64 players
After Round 1: 48 players (64 × 0.75)
After Round 2: 32 players (64 × 0.50)
After Round 3: 16 players (64 × 0.25)
Round 4: Finals with 16
```

## Tie Handling

### The Cutline Score
The system identifies the "cutline score" - the score of the player at the target cut position.

**All players with that score or worse are eliminated together.**

### Example Scenario

64 players, Round 1 ends, target 48 remaining (cut 16):

```
Sorted by wins (worst first):
Position  Score  Action
1-12      2 wins  Cut (below cutline)
13-18     3 wins  Cut (at cutline - include ALL tied players)
19-64     4+ wins Keep

Result: 18 players cut (not 16) to respect ties
Remaining: 46 players
```

## Divisibility by 4 Enforcement

The target must be divisible by 4, but we choose intelligently to avoid splitting score groups.

### Target Adjustment Algorithm

```javascript
1. Calculate ideal target: original_count × percentage
2. If not divisible by 4:
   a. Find round_down = floor(ideal / 4) × 4
   b. Find round_up = ceil(ideal / 4) × 4
   c. Check if round_down splits a score group
   d. Check if round_up splits a score group
   e. Choose based on:
      - If one splits and one doesn't: choose non-splitting option
      - If both split or neither splits: choose round_up (keep more players)
3. Use chosen target for cuts
```

### Score Group Split Detection

A cut "splits a score group" if players with the same score end up on both sides of the cutline.

**Example:**
```
Sorted players:
  10 players with 5 wins
  8 players with 6 wins
  6 players with 7 wins

Option A: Keep 20 (cut 4)
  - Cuts 4 players with 5 wins
  - Remaining 6 players with 5 wins
  - SPLITS the 5-win group ❌

Option B: Keep 18 (cut 6)
  - Cuts 6 players with 5 wins
  - Remaining 4 players with 5 wins
  - SPLITS the 5-win group ❌

Option C: Keep 16 (cut 8)
  - Cuts all 10 players with 5 wins
  - No split, clean cut ✅
```

### After Target Selection

Once target is selected, tie handling still applies:

```javascript
1. Cut to reach target
2. Include all players tied at cutline score
3. If remaining not divisible by 4:
   - Cut 1-3 more from next score group
4. Final remaining is guaranteed divisible by 4
```

### Complete Example

**60 players, 4 rounds, ending Round 1:**

```
Ideal target: 75% of 60 = 45 players

Option A (round down): 44 players
  - Would cut 16 players
  - Check: Does this split any score groups? No ✅
  
Option B (round up): 48 players  
  - Would cut 12 players
  - Check: Does this split any score groups? Yes (splits 6-win group) ❌

Choose Option A: 44 players (doesn't split score groups)

Apply tie handling:
  - Cut to 44
  - Include all tied at cutline
  - Adjust for divisibility by 4
  
Final: 44 remaining ✅
```

## Edge Cases

### Everyone Ties

If all players have the same score:
- No players can be differentiated
- **No cuts are made**
- Warning displayed to admin
- Next round will make larger cumulative cut to reach target

**Example:**
```
64 players, all score 4 wins in Round 1
Target was 48, but can't determine who to cut
All 64 advance to Round 2

Round 2 ends:
Now targeting 32 (50% of original 64)
Need to cut 32 players to reach target
```

### Already Below Target

If previous tie handling resulted in fewer players than target:
- No additional cuts
- Continue with current player count
- Next round calculates from original count

### Per-Round Performance Tracking

The system tracks wins at two levels:
- **Tournament total wins:** Accumulated across all rounds
- **Round wins:** Calculated as (current wins - wins at round start)

**Example:**
```
Player A: Started round with 5 wins, now has 7 wins → 2 round wins
Player B: Started round with 5 wins, now has 6 wins → 1 round win

Both have different total wins (7 vs 6), so total wins determines order.

Player C: Started round with 8 wins, now has 10 wins → 2 round wins
Player D: Started round with 6 wins, now has 10 wins → 4 round wins

Both have 10 total wins (TIED!), so round performance breaks tie.
Player D performed better this round (4 wins vs 2), so Player C gets cut first.

Player E: 10 total, 3 round wins, last win at 3:45pm
Player F: 10 total, 3 round wins, last win at 3:52pm

Both have same total and round wins, so last win timestamp breaks tie.
Player F won more recently (3:52pm > 3:45pm), so Player E gets cut first.
```

## Confirmation Dialog

Admin sees detailed breakdown with round performance:

```
End Round 1 and cut 18 player(s)?

Target: ~45 players (75% of 60 original)
Adjusted: 44 (closest divisible by 4, no score splits)
Remaining after cut: 44 players ✅

Players to be eliminated:
  5 total (1 this round): Alice, Bob
  5 total (2 this round): Carol
  6 total (0 this round): Dave, Eve
  6 total (1 this round): Frank, Grace, Henry
  7 total (2 this round): Ivy, Jack, Kate

Tables will be reset. You can reassign remaining players.
```

## Best Practices

### Recommended Player Counts

For clean 4-round tournaments:
- **64 players** → 48 → 32 → 16 (ideal)
- **60 players** → 44-48 → 28-32 → 12-16 (adjusts with ties)
- **48 players** → 36 → 24 → 12

### Tournament Planning

1. **Original count doesn't need to be perfect** - system adjusts
2. **Ties are handled automatically** - no manual intervention needed
3. **Divisibility is guaranteed** - always able to create complete tables
4. **Admin sees preview** - can confirm before executing cuts

## Implementation Notes

### Sorting Priority (Determining Cut Order)

When deciding who gets cut, players are sorted with these priorities:

1. **Primary:** Total tournament wins (ascending - lowest first)
2. **Tie-breaker 1:** Wins gained THIS ROUND (ascending - fewer round wins gets cut)
3. **Tie-breaker 2:** Total points scored (ascending - fewer points = fewer games played = cut first)
4. **Tie-breaker 3:** Last win timestamp (ascending - oldest win gets cut, most recent stays)

**Points as Tie-Breaker Rationale:**
When players have identical wins (0 total, 0 this round), points serve as a proxy for how many games their table has played. Tables that have played more games have had more opportunities to score wins. In a tie situation, players at tables with more games played (higher points) are cut first, as they've had more chances but failed to capitalize.

### Round Participants
Each round snapshots participants at start, preserving historical record of who played in each round.

### Table Reset
After each round end in cut line:
- All table assignments cleared
- Eliminated players unassigned
- Admin must reassign remaining players before next round

