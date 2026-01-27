const { ipcRenderer } = require('electron');

let jitsiApi = null;
let currentRoomName = null;
let currentDomain = 'meet.jit.si';
let playerName = 'Player'; // Will be set from match data
let currentRoomType = 'main';

const roomNameEl = document.getElementById('roomName');
const roomTypeEl = document.getElementById('roomType');
const loadingOverlay = document.getElementById('loadingOverlay');
const transitionMessage = document.getElementById('transitionMessage');
const jitsiContainer = document.getElementById('jitsi-meet-container');

/**
 * Initialize Jitsi Meet with given configuration
 */
function initializeJitsi(roomName, domain = 'meet.jit.si', displayName = 'Player') {
  // Clean up existing instance
  if (jitsiApi) {
    jitsiApi.dispose();
    jitsiApi = null;
  }

  currentRoomName = roomName;
  currentDomain = domain;
  playerName = displayName;

  // Update UI
  roomNameEl.textContent = roomName;
  loadingOverlay.classList.remove('hidden');

  // Jitsi configuration options
  const options = {
    roomName: roomName,
    width: '100%',
    height: '100%',
    parentNode: jitsiContainer,
    configOverwrite: {
      startWithAudioMuted: false,
      startWithVideoMuted: true,
      enableWelcomePage: false,
      prejoinPageEnabled: false,
      disableDeepLinking: true,
      toolbarButtons: [
        'microphone',
        'camera',
        'desktop',
        'hangup',
        'chat',
        'settings',
        'raisehand',
        'videoquality',
        'filmstrip',
        'stats',
        'tileview'
      ]
    },
    interfaceConfigOverwrite: {
      SHOW_JITSI_WATERMARK: false,
      SHOW_WATERMARK_FOR_GUESTS: false,
      DISPLAY_WELCOME_PAGE_CONTENT: false,
      DISABLE_VIDEO_BACKGROUND: true,
      DEFAULT_BACKGROUND: '#1a1a1a',
      DEFAULT_REMOTE_DISPLAY_NAME: 'Player',
      DEFAULT_LOCAL_DISPLAY_NAME: displayName
    },
    userInfo: {
      displayName: displayName
    }
  };

  console.log('[Jitsi] Initializing with room:', roomName);

  // Create Jitsi instance
  jitsiApi = new JitsiMeetExternalAPI(domain, options);

  // Event listeners
  jitsiApi.addEventListener('videoConferenceJoined', () => {
    console.log('[Jitsi] Joined conference');
    loadingOverlay.classList.add('hidden');
  });

  jitsiApi.addEventListener('participantJoined', (participant) => {
    console.log('[Jitsi] Participant joined:', participant.displayName);
  });

  jitsiApi.addEventListener('participantLeft', (participant) => {
    console.log('[Jitsi] Participant left:', participant.displayName);
  });

  jitsiApi.addEventListener('audioMuteStatusChanged', (status) => {
    console.log('[Jitsi] Audio muted:', status.muted);
  });

  jitsiApi.addEventListener('videoMuteStatusChanged', (status) => {
    console.log('[Jitsi] Video muted:', status.muted);
  });

  jitsiApi.addEventListener('readyToClose', () => {
    console.log('[Jitsi] Ready to close');
  });
}

/**
 * Switch to a different room
 */
function switchRoom(roomName, roomType = 'main', showTransition = false) {
  if (showTransition) {
    transitionMessage.classList.add('show');
    setTimeout(() => {
      transitionMessage.classList.remove('show');
    }, 3000);
  }

  currentRoomType = roomType;

  // Update room type indicator
  roomTypeEl.textContent = roomType === 'auction' ? 'Auction Room (Private)' : 'Main Room';
  roomTypeEl.className = `room-type ${roomType}`;

  // Reinitialize with new room
  initializeJitsi(roomName, currentDomain, playerName);
}

/**
 * Clean up and leave current room
 */
function leaveRoom() {
  if (jitsiApi) {
    jitsiApi.executeCommand('hangup');
    jitsiApi.dispose();
    jitsiApi = null;
  }
}

// Listen for room changes from main process
ipcRenderer.on('jitsi-room-created', (event, data) => {
  console.log('[Jitsi] Main room created:', data);
  initializeJitsi(data.roomName, data.domain, playerName);
});

ipcRenderer.on('jitsi-auction-room-created', (event, data) => {
  console.log('[Jitsi] Auction room created:', data);
  
  // Check if current player should move to auction room
  // This will be determined by the main process based on team
  const urlParams = new URLSearchParams(window.location.search);
  const playerSteamId = urlParams.get('steamId');
  
  if (data.participants.includes(playerSteamId)) {
    // This player is on losing team, move to auction room
    switchRoom(data.auctionRoomName, 'auction', true);
  }
  // Winning team stays in main room
});

ipcRenderer.on('jitsi-return-to-main', (event, data) => {
  console.log('[Jitsi] Returning to main room:', data);
  
  // Only switch if not already in main room
  if (currentRoomType === 'auction') {
    switchRoom(data.roomName, 'main', false);
  }
});

ipcRenderer.on('jitsi-update-player-name', (event, name) => {
  playerName = name;
  if (jitsiApi) {
    jitsiApi.executeCommand('displayName', name);
  }
});

// Request initial Jitsi configuration on load
window.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const playerSteamId = urlParams.get('steamId');
  
  if (playerSteamId) {
    try {
      const result = await ipcRenderer.invoke('get-current-state');
      if (result.success && result.state.jitsi.mainRoomName) {
        const { mainRoomName, domain } = result.state.jitsi;
        
        // Get player info from match participants
        const matchData = await ipcRenderer.invoke('get-match-data', {
          matchId: result.state.matchId
        });
        
        if (matchData.success) {
          const participant = matchData.data.participants.find(
            p => p.player_steam_id === playerSteamId
          );
          
          if (participant) {
            playerName = participant.players.username;
          }
        }
        
        initializeJitsi(mainRoomName, domain, playerName);
      }
    } catch (error) {
      console.error('[Jitsi] Error loading initial config:', error);
    }
  }
});

// Clean up on window close
window.addEventListener('beforeunload', () => {
  leaveRoom();
});