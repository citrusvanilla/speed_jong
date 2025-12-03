# Code Refactoring Analysis & Recommendations

## Current State

### File Sizes
- **`admin.js`**: 6,316 lines ⚠️ (CRITICAL - needs major refactoring)
- **`script.js`**: 1,329 lines ⚠️ (moderate refactoring needed)
- **`cutline-utils.js`**: 291 lines ✅ (good size)
- **`firebase-config.js`**: 25 lines ✅ (good size)

**Total JavaScript**: ~7,961 lines

---

## Major Refactoring Opportunities

### 1. **CRITICAL: Split `admin.js` into Modules** (6,316 lines → ~8-10 files)

The admin.js file is a monolith. Here's a proposed module structure:

```
js/
├── admin/
│   ├── admin-main.js           (~500 lines) - Main initialization, tournament selection
│   ├── tournament-manager.js   (~800 lines) - Tournament CRUD operations
│   ├── player-manager.js       (~900 lines) - Player CRUD, scoring, elimination
│   ├── table-manager.js        (~600 lines) - Table CRUD, assignments, map
│   ├── round-manager.js        (~1200 lines) - Round lifecycle, timer, participants
│   ├── score-manager.js        (~800 lines) - Score events, history, adjustments
│   ├── ui-helpers.js           (~400 lines) - Modals, toasts, validation, formatting
│   ├── auto-assign.js          (~300 lines) - Auto-assignment algorithms
│   └── data-sync.js            (~400 lines) - Real-time listeners, data transformations
```

#### Current Sections in `admin.js`:
1. **Tournament Management** (lines 348-963)
   - Load tournaments
   - Create/edit/delete tournaments
   - Tournament code generation
   - Tournament info display
   
2. **Players Management** (lines 964-2300)
   - Real-time listener setup
   - Player display (table view)
   - Player CRUD operations
   - Player scoring/elimination
   - Score event management
   
3. **Tables Management** (lines 2301-2316)
   - Real-time listener
   - Table display
   - Table CRUD operations
   
4. **Rounds Management** (lines 2317-3415)
   - Real-time listener
   - Round display and history
   - Round lifecycle (start, end, restart)
   - Timer management
   - Participants management
   
5. **Table Map** (lines 4690-5156)
   - Canvas-based visual map
   - Drag-and-drop positioning
   - Table menu interactions
   
6. **Round Details Modal** (lines 5461-6316)
   - Participant statistics
   - Score event history
   - Time-series charts
   - Score redistribution

---

### 2. **Extract Common UI Patterns**

#### Modals
Currently scattered throughout code. Create `ui/modal-manager.js`:
```javascript
// Reusable modal system
class ModalManager {
    showConfirmAction(title, message, onConfirm, onCancel)
    showTypeToConfirm(title, message, expectedText, onConfirm)
    showPrompt(title, message, defaultValue)
    showPlayerActions(playerId, isEliminated)
    showRoundDetails(roundId)
    // ... etc
}
```

#### Data Tables
Multiple DataTables instances with similar configs. Create `ui/table-helpers.js`:
```javascript
function createDataTable(selector, columns, data, options = {}) {
    // Standardized DataTable configuration
}
```

---

### 3. **Create Service Layer for Firebase**

Currently, Firebase calls are scattered. Create `services/`:

```
js/services/
├── tournament-service.js    - All tournament DB operations
├── player-service.js        - All player DB operations
├── table-service.js         - All table DB operations
├── round-service.js         - All round DB operations
└── score-service.js         - All score event DB operations
```

**Benefits:**
- Single source of truth for DB operations
- Easier to test
- Consistent error handling
- Can add caching layer easily

**Example:**
```javascript
// services/player-service.js
export class PlayerService {
    constructor(db, tournamentId) {
        this.db = db;
        this.tournamentId = tournamentId;
    }
    
    async getPlayers() { ... }
    async addPlayer(name) { ... }
    async updatePlayer(playerId, data) { ... }
    async deletePlayer(playerId) { ... }
    async eliminatePlayer(playerId, roundNumber) { ... }
    
    // Real-time
    subscribeToPlayers(callback) { ... }
}
```

---

### 4. **Extract Calculation Logic**

Create `utils/`:

```
js/utils/
├── score-calculator.js      - Tournament/round/table score calculations
├── ranking-calculator.js    - Sorting, golf-style ranking
├── cutline-calculator.js    - Cut line logic (already exists!)
├── time-formatter.js        - Time/date formatting utilities
└── validators.js            - Input validation functions
```

**Move from `admin.js`:**
- `sortPlayersByRanking()` → `ranking-calculator.js`
- `assignPlayersByAlgorithm()` → `utils/auto-assign.js`
- `buildRoundsMap()` → `score-calculator.js`
- `buildTablePlayersMapFromRound()` → `score-calculator.js`
- `formatTime()` → `time-formatter.js`

---

### 5. **State Management**

Currently using global variables. Consider a simple state manager:

```javascript
// state/tournament-state.js
class TournamentState {
    constructor() {
        this.currentTournamentId = null;
        this.playersData = {};
        this.tablesData = {};
        this.roundsData = {};
        this.listeners = [];
    }
    
    subscribe(callback) { ... }
    updatePlayers(players) { ... }
    updateTables(tables) { ... }
    // etc
}

export const tournamentState = new TournamentState();
```

**Benefits:**
- Centralized state
- Easier debugging
- Can add undo/redo easily
- Can persist to localStorage

---

### 6. **Component-Based Architecture**

For larger features, use class-based components:

```javascript
// components/RoundManager.js
export class RoundManager {
    constructor(tournamentId, db) {
        this.tournamentId = tournamentId;
        this.db = db;
        this.currentRound = null;
        this.timer = null;
    }
    
    async createRound(roundNumber, timerDuration, multiplier) { ... }
    async startRound(roundId) { ... }
    async endRound(roundId) { ... }
    async updateTimer(roundId, newDuration) { ... }
    
    startTimer() { ... }
    stopTimer() { ... }
}
```

---

### 7. **Reduce Code Duplication**

#### Identified Duplicates:

**Score Event Handling:**
- `addScoreEventToPlayer()` in admin.js
- `addWinToTable()` in admin.js
- `adjustScore()` in script.js
- All have similar logic for creating scoreEvents

**Solution:** Create `createScoreEvent(roundNumber, delta, timestamp)` helper

**Real-time Listeners:**
- `setupPlayersListener()`
- `setupTablesListener()`
- `setupRoundsListener()`
- Very similar patterns

**Solution:** Create `createRealtimeListener(collectionPath, callback)` wrapper

---

### 8. **Improve Error Handling**

Currently: `try/catch` blocks everywhere with inconsistent error messages

**Solution:**
```javascript
// utils/error-handler.js
export class ErrorHandler {
    static async handle(operation, context) {
        try {
            return await operation();
        } catch (error) {
            console.error(`Error in ${context}:`, error);
            showToast(`Error: ${error.message}`, 'error');
            // Optional: Send to error tracking service
            throw error;
        }
    }
}

// Usage
await ErrorHandler.handle(
    () => playerService.deletePlayer(playerId),
    'deleting player'
);
```

---

### 9. **Constants & Configuration**

Extract magic numbers and strings:

```javascript
// config/constants.js
export const TIMER_DEFAULTS = {
    DEFAULT_DURATION: 5,
    WARNING_THRESHOLD: 0.25,  // 25%
    DANGER_THRESHOLD: 0.10    // 10%
};

export const TOURNAMENT_TYPES = {
    STANDARD: 'standard',
    CUTLINE: 'cutline'
};

export const ROUND_STATUS = {
    STAGING: 'staging',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed'
};

export const POSITIONS = ['East', 'South', 'West', 'North'];
export const WIND_SYMBOLS = { East: '東', South: '南', West: '西', North: '北' };
```

---

### 10. **Event Handling Cleanup**

Currently: Mix of inline event handlers, `addEventListener`, and `window.functionName`

**Issues:**
- Memory leaks potential
- Hard to track what's listening
- No event cleanup

**Solution:**
```javascript
// utils/event-manager.js
export class EventManager {
    constructor() {
        this.listeners = [];
    }
    
    on(element, event, handler) {
        element.addEventListener(event, handler);
        this.listeners.push({ element, event, handler });
    }
    
    cleanup() {
        this.listeners.forEach(({ element, event, handler }) => {
            element.removeEventListener(event, handler);
        });
        this.listeners = [];
    }
}
```

---

## Proposed Refactored Structure

```
js/
├── admin/
│   ├── admin-main.js              # Main entry point
│   ├── tournament-manager.js      # Tournament operations
│   ├── player-manager.js          # Player operations
│   ├── table-manager.js           # Table operations
│   ├── round-manager.js           # Round lifecycle
│   ├── score-manager.js           # Score event handling
│   ├── ui-helpers.js              # Modals, toasts, etc.
│   ├── auto-assign.js             # Seating algorithms
│   └── data-sync.js               # Real-time listeners
├── services/
│   ├── tournament-service.js      # Tournament DB operations
│   ├── player-service.js          # Player DB operations
│   ├── table-service.js           # Table DB operations
│   ├── round-service.js           # Round DB operations
│   └── score-service.js           # Score event DB operations
├── utils/
│   ├── score-calculator.js        # Score calculations
│   ├── ranking-calculator.js      # Ranking & sorting
│   ├── cutline-utils.js           # Cut line logic (exists)
│   ├── time-formatter.js          # Date/time formatting
│   ├── validators.js              # Input validation
│   ├── error-handler.js           # Error handling
│   └── event-manager.js           # Event listener management
├── components/
│   ├── DataTableManager.js        # DataTable wrapper
│   ├── ModalManager.js            # Modal system
│   ├── RoundManager.js            # Round component
│   └── TableMap.js                # Table map canvas
├── config/
│   ├── constants.js               # App constants
│   └── firebase-config.js         # Firebase config (exists)
├── state/
│   └── tournament-state.js        # Centralized state
└── script.js                      # Timer app (refactor separately)
```

---

## Migration Strategy

### Phase 1: Extract Services (Low Risk)
1. Create `services/` directory
2. Move Firebase operations to service classes
3. Update imports in admin.js
4. Test thoroughly

**Estimated time:** 2-3 hours
**Risk:** Low
**Benefit:** Immediate code organization improvement

### Phase 2: Extract Utilities (Low Risk)
1. Create `utils/` directory
2. Move calculation functions
3. Move formatters and validators
4. Update imports

**Estimated time:** 1-2 hours
**Risk:** Low
**Benefit:** Reusability across files

### Phase 3: Extract UI Components (Medium Risk)
1. Create `components/` directory
2. Extract modal system
3. Extract DataTable wrapper
4. Update DOM element references

**Estimated time:** 3-4 hours
**Risk:** Medium (DOM manipulation)
**Benefit:** Cleaner UI code

### Phase 4: Split Admin Module (High Risk)
1. Create `admin/` directory
2. Split admin.js by feature area
3. Set up ES6 module imports
4. Test each module independently

**Estimated time:** 6-8 hours
**Risk:** High (lots of interdependencies)
**Benefit:** Massive maintainability improvement

### Phase 5: Implement State Management (Medium Risk)
1. Create state management layer
2. Migrate global variables
3. Update all state access points

**Estimated time:** 4-5 hours
**Risk:** Medium
**Benefit:** Easier debugging, can add features like undo/redo

---

## Quick Wins (Do First)

### 1. Extract Constants (30 mins)
Create `config/constants.js` and replace all magic numbers/strings

### 2. Extract Formatters (1 hour)
Move `formatTime()`, `getWindSymbol()`, etc. to `utils/formatters.js`

### 3. Create Error Handler (1 hour)
Standardize error handling across the app

### 4. Extract Score Calculations (2 hours)
Move all score calculation logic to dedicated files

### 5. Create Service Classes (3 hours)
Start with PlayerService and TournamentService

---

## Testing Strategy

After each refactoring phase:

1. **Manual Testing:**
   - Create tournament
   - Add players
   - Create tables
   - Start/end rounds
   - Record scores
   - Test elimination
   - Test multipliers

2. **Automated Tests (Future):**
   - Unit tests for services
   - Unit tests for calculations
   - Integration tests for Firebase operations

3. **Regression Testing:**
   - Keep old version in separate branch
   - Compare behavior side-by-side

---

## Long-Term Benefits

1. **Maintainability:** Much easier to find and fix bugs
2. **Testability:** Can unit test individual modules
3. **Performance:** Can lazy-load modules, tree-shake unused code
4. **Collaboration:** Multiple developers can work on different modules
5. **Documentation:** Each module can have its own README
6. **Extensibility:** Easier to add new features

---

## Recommended Next Steps

1. **Start with Quick Wins** (Phase 1 & 2) - Low risk, immediate benefit
2. **Create branch:** `refactor/modular-architecture`
3. **Commit after each small change** for easy rollback
4. **Test thoroughly** after each phase
5. **Document as you go** - Add JSDoc comments to new modules

---

## Files to Create (Priority Order)

### Priority 1 (Do First):
1. `js/config/constants.js`
2. `js/utils/formatters.js`
3. `js/utils/error-handler.js`

### Priority 2:
4. `js/services/player-service.js`
5. `js/services/tournament-service.js`
6. `js/utils/score-calculator.js`

### Priority 3:
7. `js/admin/tournament-manager.js`
8. `js/admin/player-manager.js`
9. `js/components/ModalManager.js`

### Priority 4:
10. `js/admin/round-manager.js`
11. `js/admin/table-manager.js`
12. `js/state/tournament-state.js`

---

## Conclusion

The codebase has grown organically to ~8k lines with most of it in a single file. This is technical debt that will make future development slower and more error-prone.

**Recommended approach:** Start with low-risk, high-value refactorings (services, utils, constants), test thoroughly, then tackle the larger structural changes.

**Estimated total time for full refactor:** 20-25 hours
**Estimated time for Phase 1-2 only:** 5-6 hours (80% of the benefit)

