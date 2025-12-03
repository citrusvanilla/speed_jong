# Firebase Schema Documentation

## Firestore Database Structure

### Collection: `tournaments`

Root collection containing all tournament documents.

#### Tournament Document Fields
```javascript
{
  name: string,                    // Tournament name
  type: string,                    // 'standard' or 'cutline'
  status: string,                  // 'staging', 'active', 'completed'
  timerDuration: number,           // Default timer in minutes
  maxPlayers: number,              // Maximum players allowed
  totalRounds: number,             // Total scheduled rounds
  currentRound: number,            // Current round number (0 = not started)
  roundInProgress: boolean,        // Whether a round is actively being played
  originalPlayerCount: number,     // Player count at tournament start
  createdAt: timestamp,            // Tournament creation time
  completedAt: timestamp | null    // Tournament completion time
}
```

---

### Subcollection: `tournaments/{tournamentId}/players`

Player documents within a tournament.

#### Player Document Fields
```javascript
{
  name: string,                    // Player full name
  wins: number,                    // Total wins across tournament
  points: number,                  // Total points/round wins
  tableId: string | null,          // Current table assignment
  position: string | null,         // Current seat ('East', 'South', 'West', 'North')
  eliminated: boolean,             // Whether player is eliminated
  eliminatedInRound: number | null,// Round number when eliminated
  lastWinAt: timestamp | null,     // Most recent +1 win timestamp (for tie-breaking)
  scoreEvents: [{                  // Full audit trail of score adjustments
    timestamp: timestamp,          // When the score event occurred
    delta: number,                 // +1 or -1
    addedAt: timestamp             // When the event was recorded
  }],
  registeredAt: timestamp,         // When player registered
  isHistorical: boolean | null     // Legacy flag (optional)
}
```

---

### Subcollection: `tournaments/{tournamentId}/tables`

Table documents within a tournament.

#### Table Document Fields
```javascript
{
  tableNumber: number,             // Table number (1, 2, 3, ...)
  players: string[],               // Array of player IDs assigned to this table
  positions: {                     // Map of position to player ID
    'East': string,
    'South': string,
    'West': string,
    'North': string
  },
  active: boolean,                 // Whether table is active/in use
  mapX: number | null,             // X coordinate for table map display
  mapY: number | null,             // Y coordinate for table map display
  createdAt: timestamp             // Table creation time
}
```

---

### Subcollection: `tournaments/{tournamentId}/rounds`

Round documents within a tournament.

#### Round Document Fields
```javascript
{
  roundNumber: number,             // Round number (1, 2, 3, ...)
  status: string,                  // 'staging', 'in_progress', 'completed'
  timerDuration: number,           // Round timer in minutes
  startedAt: timestamp | null,     // When round started (null if not started)
  endedAt: timestamp | null,       // When round ended (null if not ended)
  createdAt: timestamp,            // Round creation time
  isPlayoff: boolean | null        // Whether this is a playoff round
}
```

---

### Subcollection: `tournaments/{tournamentId}/rounds/{roundId}/participants`

Participant snapshots for a specific round. These are created when a round starts and capture the state of each player at that moment.

#### Participant Document Fields
```javascript
{
  playerId: string,                // Reference to player document ID
  name: string,                    // Player name (snapshot)
  wins: number,                    // Total tournament wins at round start (snapshot)
  points: number,                  // Total tournament points at round start (snapshot)
  tableId: string | null,          // Table assignment at round start (snapshot)
  position: string | null,         // Seat position at round start (snapshot)
  snapshotAt: timestamp,           // When this snapshot was taken
  lastWinAt: timestamp | null,     // Most recent +1 win timestamp (updated during round)
  scoreEvents: [{                  // Full audit trail of score adjustments DURING THIS ROUND
    timestamp: timestamp,          // When the score event occurred (round time)
    delta: number,                 // +1 or -1
    addedAt: timestamp             // When the event was recorded
  }]
}
```

**Note:** Participant documents are created as snapshots when a round starts. The `wins`, `points`, and other fields reflect the player's state at the beginning of the round. During the round, `scoreEvents` is updated as players score wins (+1) or admins make adjustments (-1).

---

## Data Flow Examples

### Starting a Round
1. Admin clicks "Start Round"
2. System creates participant snapshots:
   - For each active player, creates a participant document in `rounds/{roundId}/participants`
   - Snapshots current `wins`, `points`, `tableId`, `position`
   - Initializes `winTimestamps` as empty array
3. Round status → `'in_progress'`
4. Tournament `roundInProgress` → `true`

### Scoring a Win or Adjustment
1. Player scores a win (+1) or admin makes adjustment (+1 or -1)
2. System updates:
   - `tournaments/{tournamentId}/players/{playerId}`:
     - Increment or decrement `wins` by delta
     - Append score event to `scoreEvents` array
     - Set `lastWinAt` to event timestamp (if delta > 0)
   - `tournaments/{tournamentId}/rounds/{roundId}/participants/{participantId}`:
     - Increment or decrement `wins` by delta
     - Append score event to `scoreEvents` array (round-specific)
     - Set `lastWinAt` to event timestamp (if delta > 0)

### Ending a Round
1. Admin clicks "End Round"
2. System updates:
   - Round status → `'completed'`
   - Set `endedAt` timestamp
   - Tournament `roundInProgress` → `false`
3. For cut line tournaments:
   - Eliminate players based on cut algorithm
   - Unassign all players from tables
   - Clear all table assignments
   - Auto-assign remaining players for next round

---

## Query Patterns

### Get All Active Players
```javascript
const playersSnap = await getDocs(
  query(
    collection(db, 'tournaments', tournamentId, 'players'),
    where('eliminated', '==', false)
  )
);
```

### Get Current Round
```javascript
const roundsSnap = await getDocs(
  collection(db, 'tournaments', tournamentId, 'rounds')
);
const currentRound = roundsSnap.docs.find(doc => 
  doc.data().roundNumber === currentRoundNumber &&
  doc.data().status === 'in_progress'
);
```

### Get Round Participants (for historical viewing)
```javascript
const participantsSnap = await getDocs(
  collection(db, 'tournaments', tournamentId, 'rounds', roundId, 'participants')
);
```

### Get Player's Score Events for a Specific Round
```javascript
const participantDoc = await getDoc(
  doc(db, 'tournaments', tournamentId, 'rounds', roundId, 'participants', participantId)
);
const roundScoreEvents = participantDoc.data().scoreEvents || [];
const roundWins = roundScoreEvents.filter(e => e.delta > 0).length;
```

---

## Important Notes

1. **Real-time Listeners**: Use `onSnapshot()` for live updates on leaderboards, player views, and admin panels.

2. **Batch Writes**: Use batch writes for operations affecting multiple documents (e.g., eliminating multiple players, clearing table assignments).

3. **Server Timestamps**: Always use `serverTimestamp()` for consistency across clients.

4. **Score Events**: The `scoreEvents` array in participant documents contains ONLY events from that specific round. The player document's `scoreEvents` contains ALL events across the entire tournament. Each event has a `delta` (+1 for wins, -1 for score corrections).

5. **Historical Data**: Round participants serve as immutable snapshots of player state at round start. DO NOT modify participant snapshots after round completion - they serve as the historical record.

6. **Table Assignments**: Players can be assigned/unassigned throughout a round. The participant snapshot captures the assignment at round START, but current assignment is in the player document.


