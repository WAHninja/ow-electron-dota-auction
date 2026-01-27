require('dotenv').config();
const SteamService = require('./steam-service');

// Initialize Steam service
const steamService = new SteamService(process.env.STEAM_API_KEY);const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const Store = require('electron-store');
const GSIServer = require('./gsi-server');
const AuctionManager = require('./auction-manager');
const JitsiManager = require('./jitsi-manager');
const supabase = require('./supabase-client');
const MatchRecovery = require('./match-recovery');

const store = new Store();
let mainWindow = null;
let overlayWindow = null;
let gsiServer = null;
let auctionManager = null;
let jitsiManager = null;
let matchRecovery = null;

function ensureSupabaseInitialized() {
  if (!supabase.isInitialized()) {
    const success = supabase.initialize(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    if (!success) {
      throw new Error('Supabase initialization failed');
    }

    console.log('[Supabase] Initialized successfully');
  }
}

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

function createOverlayWindow() {
  overlayWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  overlayWindow.loadFile(path.join(__dirname, '../renderer/overlay.html'));
  overlayWindow.setIgnoreMouseEvents(true);
}

function initializeApp() {
  // Start GSI Server
  gsiServer = new GSIServer();
  
  // Initialize Auction Manager
  auctionManager = new AuctionManager();

  // ✅ Initialize Match Recovery
  matchRecovery = new MatchRecovery(supabase);

  // Initialize Jitsi Manager and create main room immediately
  jitsiManager = new JitsiManager();
  const mainRoomInfo = jitsiManager.initializeMainRoom();
  
  console.log('[App] Main voice chat room is now available');
  console.log('[App] Players can join:', mainRoomInfo.mainRoomName);

  // GSI event handlers
  gsiServer.on('game-state', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('game-state-update', data);
    }
    
    if (overlayWindow) {
      overlayWindow.webContents.send('game-state-update', data);
    }
  });

  // Auction event handlers
  auctionManager.on('match-started', (data) => {
    // Update main room metadata with match info
    jitsiManager.updateMainRoomForMatch(data.matchId, data.matchName);
    
    if (mainWindow) {
      mainWindow.webContents.send('match-started', {
        ...data,
        jitsi: jitsiManager.getMainRoomInfo()
      });
    }
  });

  auctionManager.on('round-ended', (data) => {
    // Move losing team to auction room
    const losingTeamPlayers = auctionManager.teamCompositions[data.losingTeam];
    const jitsiConfig = jitsiManager.startAuctionPhase(losingTeamPlayers, data.roundNumber);
    
    if (mainWindow) {
      mainWindow.webContents.send('round-ended', {
        ...data,
        jitsi: jitsiConfig
      });
    }
  });

  auctionManager.on('offer-created', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('offer-created', data);
    }
  });

  auctionManager.on('offer-accepted', (data) => {
    // Return everyone to main room
    const jitsiConfig = jitsiManager.endAuctionPhase();
    
    if (mainWindow) {
      mainWindow.webContents.send('offer-accepted', {
        ...data,
        jitsi: jitsiConfig
      });
    }
  });

  auctionManager.on('match-ended', (data) => {
    // Main room stays open for post-match discussion
    console.log('[App] Match ended - main voice chat room remains available');
    
    if (mainWindow) {
      mainWindow.webContents.send('match-ended', data);
    }
  });

  // Jitsi event handlers
  jitsiManager.on('main-room-ready', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('jitsi-main-room-ready', data);
    }
  });

  jitsiManager.on('match-started', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('jitsi-match-started', data);
    }
  });

  jitsiManager.on('auction-room-created', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('jitsi-auction-room-created', data);
    }
  });

  jitsiManager.on('return-to-main', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('jitsi-return-to-main', data);
    }
  });

  jitsiManager.on('domain-changed', (data) => {
    if (mainWindow) {
      mainWindow.webContents.send('jitsi-domain-changed', data);
    }
  });

  gsiServer.start();
}

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
    ensureSupabaseInitialized();

    const player = await supabase.upsertPlayer(
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

// IPC Handlers - Supabase Setup
ipcMain.handle('setup-supabase', async (event, { url, key }) => {
  try {
    const success = supabase.initialize(url, key);
    if (success) {
      initializeApp();
      mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
      return { success: true };
    }
    return { success: false, error: 'Failed to initialize Supabase' };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handlers - Match Management
ipcMain.handle('start-match', async (event, { matchName, players }) => {
  try {
    const match = await auctionManager.startMatch(matchName, players);
    return { success: true, match };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('end-round', async (event, { dotaMatchId, customGameName, winningTeam, playerStats }) => {
  try {
    const round = await auctionManager.endRound(dotaMatchId, customGameName, winningTeam, playerStats);
    return { success: true, round };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('create-offer', async (event, { offeringPlayerSteamId, offeredPlayerSteamId, goldAmount }) => {
  try {
    const offer = await auctionManager.createOffer(offeringPlayerSteamId, offeredPlayerSteamId, goldAmount);
    return { success: true, offer };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('accept-offer', async (event, { offerId }) => {
  try {
    const offer = await auctionManager.acceptOffer(offerId);
    return { success: true, offer };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-current-state', async () => {
  try {
    const auctionState = auctionManager.getCurrentState();
    const jitsiState = jitsiManager.getCurrentState();
    return { 
      success: true, 
      state: {
        ...auctionState,
        jitsi: jitsiState
      }
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-match-data', async (event, { matchId }) => {
  try {
    const match = await supabase.getMatch(matchId);
    const participants = await supabase.getMatchParticipants(matchId);
    const rounds = await supabase.getRoundsByMatch(matchId);
    const transfers = await supabase.getTransfersByMatch(matchId);
    
    return { 
      success: true, 
      data: { match, participants, rounds, transfers } 
    };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

// IPC Handlers - Match Recovery
ipcMain.handle('get-resumable-matches', async (event, { playerSteamId }) => {
  try {
    ensureSupabaseInitialized();

    if (!matchRecovery) {
      matchRecovery = new MatchRecovery(supabase);
    }

    const matches = await matchRecovery.getResumableMatches(playerSteamId);
    return { success: true, matches };
  } catch (error) {
    console.error('[IPC] get-resumable-matches failed:', error);
    return { success: false, error: error.message };
  }
});
ipcMain.handle('resume-match', async (event, { matchId }) => {
  try {
    ensureSupabaseInitialized();

    if (!matchRecovery) {
      matchRecovery = new MatchRecovery(supabase);
    }

    const match = await matchRecovery.resumeMatch(matchId);
    return { success: true, match };
  } catch (error) {
    console.error('[IPC] resume-match failed:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handlers - Jitsi
ipcMain.handle('get-main-room-info', async () => {
  try {
    const info = jitsiManager.getMainRoomInfo();
    return { success: true, info };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('get-jitsi-config', async (event, { playerSteamId, isLosingTeam, phase }) => {
  try {
    const config = jitsiManager.getPlayerRoomConfig(playerSteamId, isLosingTeam, phase);
    return { success: true, config };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('set-jitsi-domain', async (event, { domain }) => {
  try {
    jitsiManager.setJitsiDomain(domain);
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.on('toggle-overlay', (event, show) => {
  if (show && !overlayWindow) {
    createOverlayWindow();
  } else if (!show && overlayWindow) {
    overlayWindow.close();
    overlayWindow = null;
  }
});

app.whenReady().then(() => {
  try {
    ensureSupabaseInitialized();
  } catch (err) {
    console.error('[Startup] Supabase failed to initialize:', err.message);
  }

  createMainWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    if (gsiServer) gsiServer.stop();
    if (jitsiManager) jitsiManager.cleanup();
    app.quit();
  }
});

app.on('before-quit', () => {
  if (jitsiManager) jitsiManager.cleanup();
});
