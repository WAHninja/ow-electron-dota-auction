# Player Authentication System Implementation

## Overview
This document outlines the changes needed to implement player-based authentication with Steam profile fetching.

## 1. Setup Environment Variables

### Create `.env` file in project root:
```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
STEAM_API_KEY=your-steam-api-key (optional)
JITSI_DOMAIN=meet.jit.si
```

### Get Steam API Key (Optional but Recommended):
1. Go to https://steamcommunity.com/dev/apikey
2. Register your domain (can use localhost)
3. Copy the API key to `.env`

**Note:** Without Steam API key, the app will use fallback usernames like "Player_1234"

## 2. Update package.json

Run: `npm install dotenv axios`

## 3. Update src/main/index.js

Add at the very top:
```javascript
require('dotenv').config();
const SteamService = require('./steam-service');

// Initialize Steam service
const steamService = new SteamService(process.env.STEAM_API_KEY);
```

Update `createMainWindow()`:
```javascript
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Check for stored player
  const currentPlayer = store.get('currentPlayer');
  
  if (!currentPlayer) {
    mainWindow.loadFile(path.join(__dirname, '../renderer/player-login.html'));
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    initializeApp();
  }
}
```

Update `initializeApp()`:
```javascript
function initializeApp() {
  // Initialize Supabase with env variables
  if (!supabase.isInitialized()) {
    const success = supabase.initialize(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    if (!success) {
      console.error('[App] Failed to initialize Supabase');
      return;
    }
  }

  // Rest of initialization...
  gsiServer = new GSIServer();
  auctionManager = new AuctionManager();
  jitsiManager = new JitsiManager();
  
  const mainRoomInfo = jitsiManager.initializeMainRoom();
  // ... rest of code
}
```

Add new IPC handlers:
```javascript
// Player Authentication
ipcMain.handle('fetch-steam-profile', async (event, steamId) => {
  try {
    const playerData = await steamService.getPlayerSummary(steamId);
    return { 
      success: true, 
      data: {
        steamId,
        ...playerData
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('register-player', async (event, playerData) => {
  try {
    const player = await supabase.registerPlayer(
      playerData.steamId,
      playerData.username,
      playerData.avatarUrl,
      playerData.profileUrl
    );
    
    // Store current player
    store.set('currentPlayer', {
      steamId: player.steam_id,
      username: player.username,
      avatarUrl: player.avatar_url
    });
    
    // Initialize app
    initializeApp();
    
    // Load dashboard
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
    
    return { success: true, player };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-current-player', async () => {
  const player = store.get('currentPlayer');
  return { success: true, player };
});

ipcMain.handle('get-all-players', async () => {
  try {
    const players = await supabase.getAllPlayers();
    return { success: true, players };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('logout-player', () => {
  store.delete('currentPlayer');
  mainWindow.loadFile(path.join(__dirname, '../renderer/player-login.html'));
  return { success: true };
});
```

## 4. Update Match Creation UI

Modify `src/renderer/js/auction.js` - `handleCreateMatch()`:

```javascript
// Replace player collection with:
async function handleCreateMatch() {
  const matchName = matchNameInput.value.trim();
  
  if (!matchName) {
    alert('Please enter a match name');
    return;
  }
  
  // Get all registered players
  const playersResult = await ipcRenderer.invoke('get-all-players');
  
  if (!playersResult.success || !playersResult.players) {
    alert('Failed to fetch players');
    return;
  }
  
  // Get selected players from checkboxes/list
  const selectedPlayers = [];
  const playerCheckboxes = document.querySelectorAll('.player-checkbox:checked');
  
  playerCheckboxes.forEach(checkbox => {
    const playerData = playersResult.players.find(p => p.steam_id === checkbox.value);
    if (playerData) {
      selectedPlayers.push({
        steamId: playerData.steam_id,
        username: playerData.username,
        team: checkbox.dataset.team || 'random'
      });
    }
  });
  
  if (selectedPlayers.length < 2) {
    alert('Please select at least 2 players');
    return;
  }
  
  // Randomly assign players with "random" team
  selectedPlayers.forEach(player => {
    if (player.team === 'random') {
      player.team = Math.random() < 0.5 ? 'team1' : 'teamA';
    }
  });
  
  // Create match
  try {
    const result = await ipcRenderer.invoke('start-match', {
      matchName,
      players: selectedPlayers
    });
    
    if (result.success) {
      hideModal(createMatchModal);
      logActivity(`Match created: ${matchName}`, 'success');
      await refreshState();
    } else {
      alert('Failed to create match: ' + result.error);
    }
  } catch (error) {
    alert('Error creating match: ' + error.message);
  }
}
```

## 5. Update Create Match Modal in index.html

Replace the players list section:

```html
<div class="form-group">
  <label>Select Players</label>
  <div id="playersList" class="players-selection-list">
    <!-- Will be populated dynamically -->
  </div>
</div>
```

Add function to populate players in `auction.js`:

```javascript
async function populatePlayersList() {
  const result = await ipcRenderer.invoke('get-all-players');
  
  if (!result.success || !result.players) {
    playersList.innerHTML = '<p class="text-muted">No players registered yet</p>';
    return;
  }
  
  const currentPlayer = await ipcRenderer.invoke('get-current-player');
  
  playersList.innerHTML = result.players.map(player => `
    <div class="player-select-item">
      <input 
        type="checkbox" 
        class="player-checkbox" 
        value="${player.steam_id}"
        data-team="random"
        ${player.steam_id === currentPlayer.player?.steamId ? 'checked' : ''}
      >
      <img src="${player.avatar_url || 'default-avatar.png'}" class="player-avatar-small" />
      <span class="player-name">${player.username}</span>
      <select class="player-team-select" data-steamid="${player.steam_id}">
        <option value="random">Random</option>
        <option value="team1">Team 1</option>
        <option value="teamA">Team A</option>
      </select>
    </div>
  `).join('');
  
  // Update data-team when select changes
  document.querySelectorAll('.player-team-select').forEach(select => {
    select.addEventListener('change', (e) => {
      const steamId = e.target.dataset.steamid;
      const checkbox = document.querySelector(`.player-checkbox[value="${steamId}"]`);
      if (checkbox) {
        checkbox.dataset.team = e.target.value;
      }
    });
  });
}

// Call this when opening create match modal
createMatchBtn.addEventListener('click', () => {
  showModal(createMatchModal);
  populatePlayersList();
});
```

## 6. Add CSS Styles

Add to `src/renderer/css/styles.css`:

```css
/* Player Login Styles */
.player-login-form {
  padding: 20px 0;
}

.loading-state {
  text-align: center;
  padding: 40px 20px;
}

.spinner-large {
  display: inline-block;
  width: 50px;
  height: 50px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

.player-preview {
  padding: 20px 0;
}

.player-preview-card {
  display: flex;
  align-items: center;
  gap: 20px;
  background: rgba(255, 255, 255, 0.05);
  padding: 20px;
  border-radius: 10px;
  margin-bottom: 20px;
}

.player-avatar {
  width: 80px;
  height: 80px;
  border-radius: 50%;
  border: 3px solid rgba(255, 255, 255, 0.3);
}

.player-details h3 {
  margin: 0 0 5px 0;
  font-size: 1.5rem;
}

.player-steamid {
  opacity: 0.7;
  font-size: 0.9rem;
}

.help-section {
  text-align: center;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

/* Player Selection List */
.players-selection-list {
  max-height: 400px;
  overflow-y: auto;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 8px;
  padding: 15px;
}

.player-select-item {
  display: grid;
  grid-template-columns: auto 40px 1fr auto;
  gap: 12px;
  align-items: center;
  padding: 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-bottom: 8px;
}

.player-avatar-small {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.2);
}

.player-name {
  font-weight: 500;
}

.player-team-select {
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
  font-size: 0.9rem;
}
```

## 7. Files to Create/Update

### New Files:
- ✅ `.env` (create in project root)
- ✅ `.env.example` (already provided)
- ✅ `src/main/steam-service.js` (already provided)
- ✅ `src/renderer/player-login.html` (already provided)
- ✅ `src/renderer/js/player-login.js` (already provided)

### Files to Update:
- `src/main/index.js` - Add dotenv, Steam service, new IPC handlers
- `src/main/supabase-client.js` - Already updated with new player methods
- `src/renderer/index.html` - Update create match modal
- `src/renderer/js/auction.js` - Update match creation logic
- `src/renderer/css/styles.css` - Add new styles

## 8. Testing

1. **Setup .env file** with your credentials
2. **Run** `npm install`
3. **Update Supabase schema** with new player fields
4. **Start app** - Should show player login
5. **Enter Steam ID** - Should fetch profile
6. **Create match** - Should show registered players
7. **Test logout** - Should return to login screen

## Summary of User Flow

1. App opens → Player login screen
2. Enter Steam ID → Fetches Steam profile (username + avatar)
3. Confirm → Registers/logs in player
4. Dashboard opens → All features available
5. Create match → Select from registered players (with avatars)
6. Players persist across app restarts
7. Logout button → Returns to login screen