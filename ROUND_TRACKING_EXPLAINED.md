# Round Tracking System - Explained

## Overview

The Round Tracker automatically detects when Dota 2 games start and end, and maps them to match rounds in your auction system.

## How It Works

### 1. **Match Starts**
```javascript
// User creates match with players assigned to teams
Match Created:
  - Team 1: [Player A, Player B, Player C]
  - Team A: [Player D, Player E]

// Round Tracker starts monitoring GSI data
roundTracker.startTracking(match, teamCompositions);
```

### 2. **Players Launch Dota 2**
```
GSI sends data → App receives → Round Tracker processes
```

### 3. **Round Start Detection**
```javascript
// Detects when game state changes to IN_PROGRESS
Previous State: HERO_SELECTION (or any other state)
Current State:  GAME_IN_PROGRESS
                ↓
        🎮 Round Started!
                ↓
        Emit: 'round-started' event
```

**Captured Data:**
- Dota Match ID (from `map.matchid`)
- Custom Game Name (from `map.customgamename`)
- Round Number (increments automatically)
- Start timestamp

### 4. **During the Game**
```javascript
// Continuously tracks player stats from GSI
GSI Data → Update player stats in memory

Tracked per player:
  - Steam ID
  - Team (team1 or teamA)
  - Hero name
  - Kills, Deaths, Assists
  - Level, Net Worth
```

### 5. **Round End Detection**
```javascript
// Detects when game state changes to POST_GAME
Previous State: GAME_IN_PROGRESS
Current State:  POST_GAME
                ↓
        🏁 Round Ended!
                ↓
        Determine Winner
                ↓
        Emit: 'round-ended' event
```

### 6. **Winner Determination**

**Method 1: GSI win_team (Primary)**
```javascript
// Check map.win_team from GSI
map.win_team = "radiant" or "dire"

// Cross-reference with player data
Player A (Team 1) → team_name = "radiant"
Player D (Team A) → team_name = "dire"

If win_team === "radiant" → Team 1 wins
```

**Method 2: Manual Fallback**
```javascript
// If GSI doesn't provide win_team clearly
Emit: 'manual-winner-selection-required'
       ↓
Show modal asking user to select winner
```

### 7. **Auction Phase Triggered**
```javascript
// After winner determined
roundTracker.emit('round-ended', {
  roundNumber: 2,
  winningTeam: 'team1',
  losingTeam: 'teamA',
  playerStats: { ... },
  dotaMatchId: '7891234567'
});

// AuctionManager receives event
auctionManager.endRound(...data);
  ↓
Auction phase begins
  ↓
Voice chat splits teams
```

## Integration with Existing Code

### Update `src/main/index.js`:

```javascript
const RoundTracker = require('./round-tracker');

let roundTracker = null;

function initializeApp() {
  // ... existing code ...
  
  roundTracker = new RoundTracker();
  
  // Connect GSI to Round Tracker
  gsiServer.on('game-state', (data) => {
    // Send to round tracker
    if (roundTracker) {
      roundTracker.processGSIData(data);
    }
    
    // ... rest of existing code ...
  });
  
  // Handle round events
  roundTracker.on('round-started', (data) => {
    console.log('[App] Round started:', data.roundNumber);
    if (mainWindow) {
      mainWindow.webContents.send('round-started', data);
    }
  });
  
  roundTracker.on('round-ended', async (data) => {
    console.log('[App] Round ended. Winner:', data.winningTeam);
    
    try {
      // Automatically end the round in auction manager
      const round = await auctionManager.endRound(
        data.dotaMatchId,
        data.customGameName,
        data.winningTeam,
        data.playerStats
      );
      
      console.log('[App] Round saved to database');
    } catch (error) {
      console.error('[App] Error ending round:', error);
    }
  });
  
  roundTracker.on('manual-winner-selection-required', (data) => {
    console.log('[App] Manual winner selection required');
    
    // Show modal to user
    if (mainWindow) {
      mainWindow.webContents.send('show-winner-selection', data);
    }
  });
  
  // ... rest of existing code ...
}
```

### Update `src/main/auction-manager.js`:

```javascript
// In startMatch()
async startMatch(matchName, players) {
  // ... existing code ...
  
  this.emit('match-started', {
    matchId: this.currentMatch.id,
    matchName,
    players,
    teamCompositions: this.teamCompositions // Add this
  });
  
  return this.currentMatch;
}
```

### Update match start handler in `index.js`:

```javascript
auctionManager.on('match-started', (data) => {
  // Update main room metadata
  jitsiManager.updateMainRoomForMatch(data.matchId, data.matchName);
  
  // Start round tracking
  roundTracker.startTracking(
    { id: data.matchId, current_round: 0 },
    data.teamCompositions
  );
  
  if (mainWindow) {
    mainWindow.webContents.send('match-started', {
      ...data,
      jitsi: jitsiManager.getMainRoomInfo()
    });
  }
});
```

### Update match end handler:

```javascript
auctionManager.on('match-ended', (data) => {
  // Stop round tracking
  if (roundTracker) {
    roundTracker.stopTracking();
  }
  
  console.log('[App] Match ended - main voice chat room remains available');
  
  if (mainWindow) {
    mainWindow.webContents.send('match-ended', data);
  }
});
```

## UI Changes

### Remove Manual "End Round" Button (Optional)

Since rounds now end automatically, you can:

**Option 1: Remove the button entirely**
```javascript
// The round ends automatically when GSI detects POST_GAME
```

**Option 2: Keep it as "Force End Round" for edge cases**
```javascript
// Useful if GSI fails or game crashes
endRoundBtn.textContent = "Force End Round";
endRoundBtn.title = "Manually end round (use if automatic detection fails)";
```

### Add Round Status Indicator

Update dashboard to show current round status:

```javascript
// In auction.js
ipcRenderer.on('round-started', (event, data) => {
  logActivity(`Round ${data.roundNumber} started - Match ID: ${data.dotaMatchId}`, 'info');
  currentRoundEl.textContent = data.roundNumber;
  gamePhaseEl.textContent = 'Playing';
  gamePhaseEl.className = 'stat-value status-playing';
});

ipcRenderer.on('round-ended', (event, data) => {
  logActivity(`Round ${data.roundNumber} ended - ${data.winningTeam} won!`, 'success');
  gamePhaseEl.textContent = 'Auction';
  gamePhaseEl.className = 'stat-value status-auction';
  
  // Auction UI will appear automatically via existing handlers
});
```

### Handle Manual Winner Selection

```javascript
// In auction.js
ipcRenderer.on('show-winner-selection', (event, data) => {
  // Show modal asking user to select winner
  showModal(endRoundModal);
  
  // Pre-fill with round data
  document.getElementById('manualRoundInfo').textContent = 
    `Round ${data.roundNumber} - Match ID: ${data.dotaMatchId}`;
});

// When user selects winner
async function handleManualWinnerSelection(winningTeam) {
  const result = await ipcRenderer.invoke('set-round-winner', {
    winningTeam: winningTeam
  });
  
  if (result.success) {
    hideModal(endRoundModal);
  }
}
```

Add IPC handler in `index.js`:

```javascript
ipcMain.handle('set-round-winner', async (event, { winningTeam }) => {
  try {
    const success = roundTracker.manuallySetWinner(winningTeam);
    return { success };
  } catch (error) {
    return { success: false, error: error.message };
  }
});
```

## Benefits of Automatic Tracking

✅ **No Manual Intervention** - Rounds detected automatically
✅ **Accurate Stats** - All player data captured from GSI
✅ **Match ID Tracking** - Each round linked to actual Dota match
✅ **Team Detection** - Knows which players are on which team
✅ **Auto-Winner Detection** - Usually determines winner from GSI
✅ **Fallback Support** - Manual selection if auto-detection fails

## Limitations & Edge Cases

### Limitation 1: Multiple Games Simultaneously
**Problem:** If players from different teams play separate practice games, tracker might get confused.

**Solution:** Only track games where at least 2 players from the active match are present.

### Limitation 2: Game Crashes
**Problem:** If Dota crashes, POST_GAME state might not be detected.

**Solution:** Keep "Force End Round" button as backup.

### Limitation 3: Custom Games
**Problem:** Some custom games might not send standard GSI data.

**Solution:** Test with your specific custom game and adjust detection logic if needed.

### Limitation 4: Player Leaves Early
**Problem:** If a player leaves before POST_GAME, their stats might be incomplete.

**Solution:** Stats are captured continuously, so whatever was tracked before they left is saved.

## Testing the System

1. **Create a match** with 4-6 players
2. **All players join Dota 2** and start a game
3. **Check logs** - Should see "Round started"
4. **Play the game** - Stats being tracked
5. **Game ends** - Should see "Round ended" and winner detected
6. **Check dashboard** - Should transition to auction phase automatically
7. **Verify database** - Round should be saved with all player stats

## Debugging

Enable detailed logging:
```javascript
// In round-tracker.js
this.debugMode = true;

// Add at key points
if (this.debugMode) {
  console.log('[RoundTracker] DEBUG:', ...);
}
```

Check what's being tracked:
```javascript
// In console or add to dashboard
const roundInfo = roundTracker.getCurrentRoundInfo();
console.log('Current round:', roundInfo);
```