# Service Integration Guide

## Current Status (Phase 3b)

### ✅ Completed

1. **Service Layer Created** (Phase 2)
   - Base Service with common CRUD operations
   - TournamentService, PlayerService, TableService, RoundService, ScoreService
   - All services tested, documented, zero linter errors

2. **Utilities Created** (Phase 1)
   - Constants (config/constants.js)
   - Formatters (utils/formatters.js)
   - Validators (utils/validators.js)
   - Error Handler (utils/error-handler.js)

3. **Integration Setup** (Phase 3a-3b)
   - Services imported into admin.js
   - Service instances created and initialized
   - Duplicate formatters removed (formatTime, getWindSymbol)
   - localStorage keys replaced with constants

### 🔄 In Progress

**Current Branch**: `refactor/modular-architecture`  
**Commits**: 5 commits ahead of main  
**Files Modified**: admin.js (imports and setup only)

---

## Remaining Work

### Step 1: Replace Format Functions (~30 minutes)

**Search & Replace:**

```javascript
// Find all instances and replace:
new Date(timestamp.toDate()).toLocaleString()
→ formatFirebaseTimestamp(timestamp)

new Date(timestamp.toDate()).toLocaleTimeString()
→ formatTimeOnly(timestamp)

// Score formatting
score > 0 ? `+${score}` : score
→ formatScore(score)

// Multiplier formatting  
`✕${multiplier}`
→ formatMultiplier(multiplier)
```

**Files to update:** admin.js, leaderboard.html

---

### Step 2: Replace Constants (~1 hour)

**Status Strings:**
```javascript
// Tournament status
'staging' → TOURNAMENT_STATUS.STAGING
'active' → TOURNAMENT_STATUS.ACTIVE
'completed' → TOURNAMENT_STATUS.COMPLETED

// Round status
'staging' → ROUND_STATUS.STAGING
'in_progress' → ROUND_STATUS.IN_PROGRESS
'completed' → ROUND_STATUS.COMPLETED

// Tournament types
'standard' → TOURNAMENT_TYPES.STANDARD
'cutline' → TOURNAMENT_TYPES.CUTLINE
```

**Magic Numbers:**
```javascript
5 → TIMER_DEFAULTS.DEFAULT_DURATION (when used for timer)
4 → TABLE_CONSTRAINTS.PLAYERS_PER_TABLE
1 → SCORE_DEFAULTS.DEFAULT_MULTIPLIER
```

**Error/Success Messages:**
```javascript
'Tournament created successfully!' → SUCCESS_MESSAGES.TOURNAMENT_CREATED
'Player not found' → ERROR_MESSAGES.PLAYER_NOT_FOUND
// ... etc
```

---

### Step 3: Replace Tournament Operations (~1 hour)

**Current Pattern:**
```javascript
// OLD: Direct Firebase calls
const tournamentDoc = await getDoc(doc(db, 'tournaments', tournamentId));
await updateDoc(doc(db, 'tournaments', tournamentId), { status: 'active' });
await deleteDoc(doc(db, 'tournaments', tournamentId));
```

**New Pattern:**
```javascript
// NEW: Service methods
const tournament = await tournamentService.getById(tournamentId);
await tournamentService.startTournament(tournamentId);
await tournamentService.deleteTournament(tournamentId);
```

**Functions to Update:**
- `loadTournaments()` → Use `tournamentService.getAllTournaments()`
- `selectTournament()` → Use `tournamentService.getById()`
- Tournament CRUD operations
- Tournament status changes

---

### Step 4: Replace Player Operations (~1.5 hours)

**Current Pattern:**
```javascript
// OLD
const playerRef = doc(db, 'tournaments', currentTournamentId, 'players');
await setDoc(playerRef, { name, wins: 0, ... });
await updateDoc(doc(db, 'tournaments', currentTournamentId, 'players', playerId), updates);
```

**New Pattern:**
```javascript
// NEW
const playerId = await playerService.addPlayer(name);
await playerService.updatePlayer(playerId, updates);
await playerService.eliminatePlayer(playerId, roundNumber);
```

**Functions to Update:**
- `addPlayer()` → Use `playerService.addPlayer()`
- `updatePlayer()` → Use `playerService.updatePlayer()`
- `deletePlayer()` → Use `playerService.deletePlayer()`
- `eliminatePlayer()` → Use `playerService.eliminatePlayer()`
- Player assignment → Use `playerService.assignToTable()`
- Score events → Use `scoreService` methods

**Real-time Listeners:**
```javascript
// OLD
const playersRef = collection(db, 'tournaments', currentTournamentId, 'players');
unsubscribePlayers = onSnapshot(playersRef, (snapshot) => { ... });

// NEW
unsubscribePlayers = playerService.subscribeToPlayers((players) => {
    playersData = {};
    players.forEach(player => {
        playersData[player.id] = player;
    });
    displayPlayerStatsTable(Object.values(playersData));
});
```

---

### Step 5: Replace Table Operations (~1 hour)

**New Pattern:**
```javascript
// Table CRUD
const tableId = await tableService.createTable(tableNumber);
await tableService.updateTable(tableId, updates);
await tableService.deleteTable(tableId);

// Table assignments
await tableService.assignPlayerToPosition(tableId, playerId, position);
await tableService.clearPlayers(tableId);

// Queries
const activeTables = await tableService.getActiveTables();
const table = await tableService.getByNumber(tableNumber);
```

**Real-time Listeners:**
```javascript
unsubscribeTables = tableService.subscribeToTables((tables) => {
    tablesData = {};
    tables.forEach(table => {
        tablesData[table.id] = table;
    });
    displayTables();
});
```

---

### Step 6: Replace Round Operations (~1 hour)

**New Pattern:**
```javascript
// Round lifecycle
const roundId = await roundService.createRound(roundNumber, {
    timerDuration: 5,
    scoreMultiplier: 1,
    isPlayoff: false
});

await roundService.startRound(roundId);
await roundService.endRound(roundId);
await roundService.updateMultiplier(roundId, 2);

// Queries
const rounds = await roundService.getAllRounds();
const lastRound = await roundService.getLastCompletedRound();
const roundsMap = await roundService.buildRoundsMap();
```

---

### Step 7: Replace Score Operations (~1 hour)

**Current Pattern:**
```javascript
// OLD: Manual score event creation
const scoreEvent = {
    timestamp: Timestamp.now(),
    delta: 1,
    roundNumber: currentRound,
    addedAt: Timestamp.now()
};

await updateDoc(playerRef, {
    wins: increment(delta),
    scoreEvents: arrayUnion(scoreEvent),
    lastWinAt: delta > 0 ? timestamp : lastWinAt
});
```

**New Pattern:**
```javascript
// NEW: Service handles complexity
const scoreEvent = scoreService.createScoreEvent(roundNumber, delta, timestamp);
await scoreService.addToPlayer(playerId, scoreEvent);
// Or add to both player and participant:
await scoreService.addScoreEvent(playerId, roundId, participantId, scoreEvent);
```

---

### Step 8: Apply Error Handling (~30 minutes)

**Wrap Operations:**
```javascript
// Before
async function someOperation() {
    try {
        // ... operation
        showToast('Success!', 'success');
    } catch (error) {
        console.error('Error:', error);
        showToast('Error: ' + error.message, 'error');
    }
}

// After
async function someOperation() {
    return ErrorHandler.handle(
        async () => {
            // ... operation
        },
        'operation description',
        showToast,
        { successMessage: SUCCESS_MESSAGES.TOURNAMENT_CREATED }
    );
}
```

---

## Testing Checklist

After each step, test:

### Tournament Operations
- [ ] Create tournament
- [ ] Edit tournament name
- [ ] Edit tournament code
- [ ] Change tournament status
- [ ] Delete tournament
- [ ] Archive tournament

### Player Operations
- [ ] Add player
- [ ] Edit player name
- [ ] Delete player
- [ ] Eliminate player
- [ ] Reinstate player
- [ ] Assign to table
- [ ] Unassign from table

### Table Operations
- [ ] Create table
- [ ] Delete table
- [ ] Toggle active/inactive
- [ ] Assign player to position
- [ ] Clear table
- [ ] Auto-assign players

### Round Operations
- [ ] Create round
- [ ] Start round
- [ ] End round
- [ ] Update timer
- [ ] Update multiplier
- [ ] Create playoff round

### Score Operations
- [ ] Add win (+1)
- [ ] Add penalty (-1)
- [ ] Delete score event
- [ ] Edit timestamp
- [ ] View round history

---

## Migration Strategy

### Option A: Incremental (Recommended)
1. Do Steps 1-2 (formatters & constants) - commit
2. Test - commit
3. Do Step 3 (tournaments) - commit
4. Test - commit
5. Continue pattern...

### Option B: Big Bang
1. Do all steps 1-7
2. Test everything at once
3. Fix issues
4. Commit

**Recommendation**: Option A is safer, easier to debug

---

## Rollback Plan

If issues arise:

```bash
# See what changed
git diff main

# Rollback specific file
git checkout main -- js/admin.js

# Rollback entire branch
git reset --hard main

# Or create new branch from specific commit
git checkout -b refactor-fix <commit-hash>
```

---

## Estimated Time

- Step 1 (Formatters): 30 min
- Step 2 (Constants): 1 hour
- Step 3 (Tournaments): 1 hour
- Step 4 (Players): 1.5 hours
- Step 5 (Tables): 1 hour
- Step 6 (Rounds): 1 hour
- Step 7 (Scores): 1 hour
- Step 8 (Error Handling): 30 min
- Testing: 1 hour

**Total**: ~8-9 hours of focused work

---

## Benefits After Completion

✅ **80-90% reduction in code duplication**  
✅ **All Firebase operations go through services** (easy to mock for testing)  
✅ **Consistent error handling** across the app  
✅ **Validation before every DB write**  
✅ **Easy to add features** (just use services)  
✅ **Easy to add caching** (add to services)  
✅ **Easy to switch backends** (just swap service implementations)  
✅ **Much easier to onboard new developers**

---

## Next Session Checklist

1. Pull latest from `refactor/modular-architecture` branch
2. Start with Step 1 (easiest, high impact)
3. Commit after each step
4. Test after each step
5. Take breaks between steps
6. When complete, merge to main with comprehensive testing

---

## Questions to Consider

1. **Should we add unit tests?** (Would catch regressions)
2. **Should we add service mocks?** (Would make testing easier)
3. **Should we add TypeScript?** (Would catch type errors)
4. **Should we add JSDoc to admin.js?** (Would improve IDE autocomplete)

These can be future enhancements!

