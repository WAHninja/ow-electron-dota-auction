const { ipcRenderer, shell } = require('electron');

// State
let currentMatch = null;
let currentState = null;
let gsiData = null;
let activityLog = [];
let selectedWinningTeam = null;

// UI Elements - Navigation
const openJitsiBtn = document.getElementById('openJitsiBtn');
const viewHistoryBtn = document.getElementById('viewHistoryBtn');
const settingsBtn = document.getElementById('settingsBtn')
const resumeMatchBtn = document.createElement('button');;
resumeMatchBtn.className = 'btn-nav';
resumeMatchBtn.innerHTML = '<span class="icon">↩️</span> Resume Match';
resumeMatchBtn.addEventListener('click', showResumeMatchModal);

const navControls = document.querySelector('.nav-controls');
if (navControls) {
  navControls.insertBefore(resumeMatchBtn, navControls.firstChild);
}

// UI Elements - Match Control
const noMatchPanel = document.getElementById('noMatchPanel');
const matchInfoPanel = document.getElementById('matchInfoPanel');
const createMatchBtn = document.getElementById('createMatchBtn');
const endRoundBtn = document.getElementById('endRoundBtn');
const endMatchBtn = document.getElementById('endMatchBtn');
const matchNameEl = document.getElementById('matchName');
const currentRoundEl = document.getElementById('currentRound');
const gamePhaseEl = document.getElementById('gamePhase');

// UI Elements - Teams
const team1PlayersEl = document.getElementById('team1Players');
const teamAPlayersEl = document.getElementById('teamAPlayers');
const team1CountEl = document.getElementById('team1Count');
const teamACountEl = document.getElementById('teamACount');

// UI Elements - Status Cards
const gsiStatusEl = document.getElementById('gsiStatus');
const lastGsiUpdateEl = document.getElementById('lastGsiUpdate');
const voiceStatusEl = document.getElementById('voiceStatus');
const playersOnlineEl = document.getElementById('playersOnline');
const dotaGameStatusEl = document.getElementById('dotaGameStatus');
const dotaMatchIdEl = document.getElementById('dotaMatchId');

// UI Elements - Content Areas
const welcomeContent = document.getElementById('welcomeContent');
const rosterContent = document.getElementById('rosterContent');
const auctionContent = document.getElementById('auctionContent');
const resultsContent = document.getElementById('resultsContent');
const contentTitle = document.getElementById('contentTitle');
const rosterGrid = document.getElementById('rosterGrid');

// UI Elements - Activity Log
const activityLogEl = document.getElementById('activityLog');
const clearLogBtn = document.getElementById('clearLogBtn');

// UI Elements - Modals
const createMatchModal = document.getElementById('createMatchModal');
const closeCreateMatch = document.getElementById('closeCreateMatch');
const cancelCreateMatch = document.getElementById('cancelCreateMatch');
const confirmCreateMatch = document.getElementById('confirmCreateMatch');
const matchNameInput = document.getElementById('matchNameInput');
const playersList = document.getElementById('playersList');
const addPlayerBtn = document.getElementById('addPlayerBtn');

const endRoundModal = document.getElementById('endRoundModal');
const closeEndRound = document.getElementById('closeEndRound');
const cancelEndRound = document.getElementById('cancelEndRound');
const confirmEndRound = document.getElementById('confirmEndRound');
const selectTeam1Btn = document.getElementById('selectTeam1');
const selectTeamABtn = document.getElementById('selectTeamA');

// Resume Match UI Elements
const resumeMatchModal = document.getElementById('resumeMatchModal');
const matchDetailsModal = document.getElementById('matchDetailsModal');
const closeResumeMatch = document.getElementById('closeResumeMatch');
const cancelResumeMatch = document.getElementById('cancelResumeMatch');
const closeMatchDetails = document.getElementById('closeMatchDetails');
const backToMatchList = document.getElementById('backToMatchList');
const confirmResumeMatch = document.getElementById('confirmResumeMatch');
const abandonMatchBtn = document.getElementById('abandonMatchBtn');
const resumableMatchesList = document.getElementById('resumableMatchesList');
const noMatchesFound = document.getElementById('noMatchesFound');
const loadingMatches = document.getElementById('loadingMatches');
const matchDetailsContent = document.getElementById('matchDetailsContent');
const createNewMatchFromEmpty = document.getElementById('createNewMatchFromEmpty');

let selectedMatchToResume = null;

// Initialize
async function initialize() {
  console.log('[Auction] Initializing dashboard');
  
  // Get current state
  await refreshState();
  
  // Set up event listeners
  setupEventListeners();
  
  // Update UI
  updateDashboard();
  
  logActivity('Dashboard initialized and ready');
}

// Event Listeners
function setupEventListeners() {
  // Navigation
  openJitsiBtn.addEventListener('click', openJitsiWindow);
  viewHistoryBtn.addEventListener('click', () => {
    logActivity('Match history feature - coming soon');
  });
  settingsBtn.addEventListener('click', () => {
    logActivity('Settings feature - coming soon');
  });
  
  // Match Control
  createMatchBtn.addEventListener('click', () => showModal(createMatchModal));
  document.getElementById('quickCreateMatch').addEventListener('click', () => showModal(createMatchModal));
  endRoundBtn.addEventListener('click', () => showModal(endRoundModal));
  endMatchBtn.addEventListener('click', handleEndMatch);
  
  // Create Match Modal
  closeCreateMatch.addEventListener('click', () => hideModal(createMatchModal));
  cancelCreateMatch.addEventListener('click', () => hideModal(createMatchModal));
  confirmCreateMatch.addEventListener('click', handleCreateMatch);
  addPlayerBtn.addEventListener('click', addPlayerToList);
  
  // End Round Modal
  closeEndRound.addEventListener('click', () => hideModal(endRoundModal));
  cancelEndRound.addEventListener('click', () => hideModal(endRoundModal));
  confirmEndRound.addEventListener('click', handleEndRound);
  selectTeam1Btn.addEventListener('click', () => selectWinningTeam('team1'));
  selectTeamABtn.addEventListener('click', () => selectWinningTeam('teamA'));
  
  // Resume Match modal controls
  closeResumeMatch?.addEventListener('click', () => hideModal(resumeMatchModal));
  cancelResumeMatch?.addEventListener('click', () => hideModal(resumeMatchModal));
  closeMatchDetails?.addEventListener('click', () => hideModal(matchDetailsModal));

  backToMatchList?.addEventListener('click', () => {
    hideModal(matchDetailsModal);
    showModal(resumeMatchModal);
  });

  confirmResumeMatch?.addEventListener('click', handleResumeMatch);
  abandonMatchBtn?.addEventListener('click', handleAbandonMatch);

  createNewMatchFromEmpty?.addEventListener('click', () => {
    hideModal(resumeMatchModal);
    showModal(createMatchModal);
    populatePlayersList();
  });

  // Activity Log
  clearLogBtn.addEventListener('click', () => {
    activityLog = [];
    renderActivityLog();
  });
  
  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', refreshState);
  document.getElementById('joinVoiceBtn').addEventListener('click', openJitsiWindow);
  
  // IPC Event Listeners
  ipcRenderer.on('match-started', handleMatchStarted);
  ipcRenderer.on('round-ended', handleRoundEnded);
  ipcRenderer.on('offer-created', handleOfferCreated);
  ipcRenderer.on('offer-accepted', handleOfferAccepted);
  ipcRenderer.on('match-ended', handleMatchEnded);
  ipcRenderer.on('game-state-update', handleGSIUpdate);
  ipcRenderer.on('jitsi-main-room-ready', handleJitsiReady);
  ipcRenderer.on('jitsi-auction-room-created', handleAuctionRoomCreated);
  ipcRenderer.on('jitsi-return-to-main', handleReturnToMain);
}

// State Management
async function refreshState() {
  try {
    const result = await ipcRenderer.invoke('get-current-state');
    if (result.success) {
      currentState = result.state;
      updateDashboard();
    }
  } catch (error) {
    console.error('[Auction] Error refreshing state:', error);
    logActivity('Error refreshing state', 'error');
  }
}

// Update Dashboard
function updateDashboard() {
  if (!currentState) return;
  
  // Update match info
  if (currentState.matchId) {
    noMatchPanel.style.display = 'none';
    matchInfoPanel.style.display = 'block';
    
    currentRoundEl.textContent = currentState.roundNumber;
    gamePhaseEl.textContent = formatPhase(currentState.gamePhase);
    
    // Update teams
    updateTeams();
    
    // Show roster
    showContent('roster');
    renderRoster();
  } else {
    noMatchPanel.style.display = 'block';
    matchInfoPanel.style.display = 'none';
    showContent('welcome');
  }
  
  // Update voice chat status
  if (currentState.jitsi && currentState.jitsi.isMainRoomAvailable) {
    voiceStatusEl.textContent = 'Main Room Active';
    voiceStatusEl.classList.add('text-success');
  }
  
  // Update player count
  const totalPlayers = Object.keys(currentState.playerGoldBalances || {}).length;
  playersOnlineEl.textContent = `${totalPlayers} / ${totalPlayers}`;
}

function updateTeams() {
  if (!currentState.teamCompositions) return;
  
  const team1 = currentState.teamCompositions.team1 || [];
  const teamA = currentState.teamCompositions.teamA || [];
  
  team1CountEl.textContent = team1.length;
  teamACountEl.textContent = teamA.length;
  
  // Render player chips
  team1PlayersEl.innerHTML = team1.map(steamId => 
    `<span class="player-chip">${getSteamIdShort(steamId)}</span>`
  ).join('');
  
  teamAPlayersEl.innerHTML = teamA.map(steamId => 
    `<span class="player-chip">${getSteamIdShort(steamId)}</span>`
  ).join('');
}

function renderRoster() {
  if (!currentState.playerGoldBalances) return;
  
  const players = Object.entries(currentState.playerGoldBalances);
  
  rosterGrid.innerHTML = players.map(([steamId, gold]) => {
    const team = getPlayerTeam(steamId);
    const teamClass = team === 'team1' ? 'team1' : 'teamA';
    
    return `
      <div class="roster-card ${teamClass}">
        <div class="roster-header">
          <span class="player-name">${getSteamIdShort(steamId)}</span>
          <span class="team-badge">${team === 'team1' ? 'Team 1' : 'Team A'}</span>
        </div>
        <div class="roster-gold">
          <span class="gold-icon">💰</span>
          <span class="gold-amount">${gold.toLocaleString()}</span>
        </div>
      </div>
    `;
  }).join('');
}

function getPlayerTeam(steamId) {
  if (currentState.teamCompositions.team1.includes(steamId)) return 'team1';
  if (currentState.teamCompositions.teamA.includes(steamId)) return 'teamA';
  return 'unknown';
}

// Content Management
function showContent(contentType) {
  welcomeContent.style.display = 'none';
  rosterContent.style.display = 'none';
  auctionContent.style.display = 'none';
  resultsContent.style.display = 'none';
  
  switch(contentType) {
    case 'welcome':
      welcomeContent.style.display = 'block';
      contentTitle.textContent = 'Welcome';
      break;
    case 'roster':
      rosterContent.style.display = 'block';
      contentTitle.textContent = 'Player Roster';
      break;
    case 'auction':
      auctionContent.style.display = 'block';
      contentTitle.textContent = 'Auction Phase';
      break;
    case 'results':
      resultsContent.style.display = 'block';
      contentTitle.textContent = 'Round Results';
      break;
  }
}

// Modal Management
function showModal(modal) {
  modal.style.display = 'flex';
}

function hideModal(modal) {
  modal.style.display = 'none';
}

// Helper Functions
function formatPhase(phase) {
  const phases = {
    idle: 'Idle',
    playing: 'Playing',
    auction: 'Auction',
    complete: 'Complete'
  };
  return phases[phase] || phase;
}

function getSteamIdShort(steamId) {
  // Show last 4 digits of Steam ID
  return steamId ? `...${steamId.slice(-4)}` : 'Unknown';
}

function logActivity(message, type = 'info') {
  const entry = {
    time: new Date().toLocaleTimeString(),
    message,
    type
  };
  
  activityLog.unshift(entry);
  
  // Keep only last 50 entries
  if (activityLog.length > 50) {
    activityLog = activityLog.slice(0, 50);
  }
  
  renderActivityLog();
}

function renderActivityLog() {
  if (activityLog.length === 0) {
    activityLogEl.innerHTML = `
      <div class="log-item">
        <span class="log-time">--:--</span>
        <span class="log-message">Waiting for activity...</span>
      </div>
    `;
    return;
  }
  
  activityLogEl.innerHTML = activityLog.map(entry => `
    <div class="log-item log-${entry.type}">
      <span class="log-time">${entry.time}</span>
      <span class="log-message">${entry.message}</span>
    </div>
  `).join('');
}

// =======================
// Resume Match Logic
// =======================

async function checkForResumableMatches() {
  try {
    const currentPlayer = await ipcRenderer.invoke('get-current-player');
    if (!currentPlayer.success || !currentPlayer.player) return;

    const result = await ipcRenderer.invoke('get-resumable-matches', {
      playerSteamId: currentPlayer.player.steamId
    });

    if (result.success && result.matches?.length) {
      logActivity(`${result.matches.length} resumable match(es) found`, 'info');

      if (result.matches.length === 1 && !currentState?.matchId) {
        setTimeout(() => {
          if (confirm('You have an active match in progress. Resume it?')) {
            showResumeMatchModal();
          }
        }, 1000);
      }
    }
  } catch (err) {
    console.error('[Resume] Error checking matches:', err);
  }
}

async function showResumeMatchModal() {
  showModal(resumeMatchModal);

  loadingMatches.style.display = 'block';
  resumableMatchesList.style.display = 'none';
  noMatchesFound.style.display = 'none';

  try {
    const currentPlayer = await ipcRenderer.invoke('get-current-player');
    if (!currentPlayer.success) {
      hideModal(resumeMatchModal);
      return alert('Please log in first');
    }

    const result = await ipcRenderer.invoke('get-resumable-matches', {
      playerSteamId: currentPlayer.player.steamId
    });

    loadingMatches.style.display = 'none';

    if (result.success && result.matches?.length) {
      resumableMatchesList.style.display = 'block';
      renderResumableMatches(result.matches);
    } else {
      noMatchesFound.style.display = 'block';
    }
  } catch (err) {
    loadingMatches.style.display = 'none';
    alert('Failed to load matches');
  }
}

function renderResumableMatches(matches) {
  resumableMatchesList.innerHTML = matches.map(match => {
    const created = new Date(match.created_at).toLocaleDateString();
    const last = new Date(match.lastActivity).toLocaleString();

    const team1 = match.participants.filter(p => p.initial_team === 'team1').length;
    const teamA = match.participants.filter(p => p.initial_team === 'teamA').length;

    return `
      <div class="match-card" data-id="${match.id}">
        <h3>${match.match_name || 'Unnamed Match'}</h3>
        <p>${team1} vs ${teamA}</p>
        <small>Created ${created} • Last activity ${last}</small>
      </div>
    `;
  }).join('');

  document.querySelectorAll('.match-card').forEach(card => {
    card.addEventListener('click', () => {
      const match = matches.find(m => m.id === card.dataset.id);
      showMatchDetails(match);
    });
  });
}

function showMatchDetails(match) {
  selectedMatchToResume = match;
  hideModal(resumeMatchModal);
  showModal(matchDetailsModal);

  matchDetailsContent.innerHTML = `
    <h3>${match.match_name}</h3>
    <p>Round ${match.current_round}</p>
    <p>Total rounds played: ${match.totalRounds}</p>
  `;
}

async function handleResumeMatch() {
  if (!selectedMatchToResume) return;

  confirmResumeMatch.disabled = true;

  try {
    const result = await ipcRenderer.invoke('restore-match', {
      matchId: selectedMatchToResume.id
    });

    if (result.success) {
      hideModal(matchDetailsModal);
      logActivity(`Match resumed: ${selectedMatchToResume.match_name}`, 'success');
      await refreshState();
    } else {
      alert(result.error);
    }
  } finally {
    confirmResumeMatch.disabled = false;
  }
}

async function handleAbandonMatch() {
  if (!selectedMatchToResume) return;

  if (!confirm(`Abandon "${selectedMatchToResume.match_name}"?`)) return;

  try {
    const result = await ipcRenderer.invoke('abandon-match', {
      matchId: selectedMatchToResume.id
    });

    if (result.success) {
      hideModal(matchDetailsModal);
      selectedMatchToResume = null;
      showResumeMatchModal();
      logActivity('Match abandoned', 'info');
    }
  } catch (err) {
    alert('Failed to abandon match');
  }
}


// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  initialize();
  setTimeout(checkForResumableMatches, 2000);
});

// This continues from auction.js Part 1
// Add these functions to the same file

// Player Management for Create Match
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

let playersToAdd = [];

function addPlayerToList() {
  const playerItem = document.createElement('div');
  playerItem.className = 'player-item';
  playerItem.innerHTML = `
    <input type="text" class="player-steam-id" placeholder="Steam ID (76561198...)">
    <input type="text" class="player-username" placeholder="Username">
    <select class="player-team">
      <option value="team1">Team 1</option>
      <option value="teamA">Team A</option>
      <option value="random">Random</option>
    </select>
    <button class="btn-icon btn-danger" onclick="this.parentElement.remove()">
      <span>×</span>
    </button>
  `;
  playersList.appendChild(playerItem);
}

// Add initial players on modal open
createMatchBtn.addEventListener('click', () => {
  playersList.innerHTML = '';
  // Add 4 default player slots
  for (let i = 0; i < 4; i++) {
    addPlayerToList();
  }
});

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

// End Round Handlers
function selectWinningTeam(team) {
  selectedWinningTeam = team;
  
  // Update button states
  selectTeam1Btn.classList.remove('selected');
  selectTeamABtn.classList.remove('selected');
  
  if (team === 'team1') {
    selectTeam1Btn.classList.add('selected');
  } else {
    selectTeamABtn.classList.add('selected');
  }
  
  confirmEndRound.disabled = false;
}

async function handleEndRound() {
  if (!selectedWinningTeam || !gsiData) {
    alert('Please select a winning team and ensure GSI data is available');
    return;
  }
  
  confirmEndRound.disabled = true;
  confirmEndRound.innerHTML = '<span class="spinner"></span> Ending Round...';
  
  try {
    // Extract player stats from GSI data
    const playerStats = extractPlayerStats(gsiData);
    
    const result = await ipcRenderer.invoke('end-round', {
      dotaMatchId: gsiData.map?.matchid || 'unknown',
      customGameName: gsiData.map?.customgamename || '',
      winningTeam: selectedWinningTeam,
      playerStats
    });
    
    if (result.success) {
      hideModal(endRoundModal);
      selectedWinningTeam = null;
      logActivity(`Round ${currentState.roundNumber + 1} ended - ${selectedWinningTeam} won`, 'success');
      await refreshState();
    } else {
      alert('Failed to end round: ' + result.error);
    }
  } catch (error) {
    alert('Error ending round: ' + error.message);
  } finally {
    confirmEndRound.disabled = false;
    confirmEndRound.innerHTML = '<span class="icon">✓</span> End Round';
  }
}

function extractPlayerStats(data) {
  // This would extract stats from GSI data
  // For now, return mock data structure
  const stats = {};
  
  if (data.player && data.hero) {
    stats[data.player.steamid] = {
      hero: data.hero.name || 'unknown',
      kills: data.hero.kills || 0,
      deaths: data.hero.deaths || 0,
      assists: data.hero.assists || 0
    };
  }
  
  return stats;
}

async function handleEndMatch() {
  if (!confirm('Are you sure you want to end this match?')) {
    return;
  }
  
  logActivity('Match ended', 'info');
  currentMatch = null;
  await refreshState();
}

// Event Handlers
function handleMatchStarted(event, data) {
  logActivity(`Match started: ${data.matchName}`, 'success');
  currentMatch = data;
  refreshState();
}

function handleRoundEnded(event, data) {
  logActivity(`Round ${data.roundNumber} ended - ${data.winningTeam} won`, 'success');
  
  // Show auction UI
  showContent('auction');
  renderAuctionUI(data);
  
  refreshState();
}

function handleOfferCreated(event, data) {
  logActivity('Offer created', 'info');
  refreshAuctionUI();
}

function handleOfferAccepted(event, data) {
  logActivity('Offer accepted - player transferred', 'success');
  showContent('roster');
  refreshState();
}

function handleMatchEnded(event, data) {
  logActivity(`Match completed! Winner: ${data.winnerSteamId}`, 'success');
  currentMatch = null;
  refreshState();
}

function handleGSIUpdate(event, data) {
  gsiData = data;
  
  // Update GSI status
  gsiStatusEl.textContent = 'Connected';
  gsiStatusEl.classList.add('text-success');
  lastGsiUpdateEl.textContent = new Date().toLocaleTimeString();
  
  // Update Dota game status
  if (data.map) {
    dotaGameStatusEl.textContent = formatGameState(data.map.game_state);
    dotaMatchIdEl.textContent = `Match ID: ${data.map.matchid || 'N/A'}`;
  }
}

function handleJitsiReady(event, data) {
  voiceStatusEl.textContent = 'Main Room Ready';
  logActivity('Voice chat main room available', 'success');
}

function handleAuctionRoomCreated(event, data) {
  logActivity(`Auction room created for round ${data.roundNumber}`, 'info');
  voiceStatusEl.textContent = 'Auction Room Active';
}

function handleReturnToMain(event, data) {
  logActivity('All players returned to main voice room', 'info');
  voiceStatusEl.textContent = 'Main Room Active';
}

// Auction UI
function renderAuctionUI(roundData) {
  const winningTeam = roundData.winningTeam;
  const losingTeam = roundData.losingTeam;
  const offerLimits = currentState.offerLimits;
  
  auctionContent.innerHTML = `
    <div class="auction-container">
      <div class="auction-header">
        <h3>🏆 ${winningTeam === 'team1' ? 'Team 1' : 'Team A'} Won!</h3>
        <p>Winning team: Make your offers • Losing team: Review and accept an offer</p>
      </div>

      <div class="auction-grid">
        <!-- Winning Team Section -->
        <div class="auction-section">
          <h4>Winning Team - Make Offers</h4>
          <p class="section-hint">Select a teammate to offer (${offerLimits.minOffer} - ${offerLimits.maxOffer} gold)</p>
          
          <div id="offerForm" class="offer-form">
            <select id="offeringPlayer" class="form-select">
              <option value="">Your Steam ID...</option>
              ${currentState.teamCompositions[winningTeam].map(steamId => 
                `<option value="${steamId}">${getSteamIdShort(steamId)} (${currentState.playerGoldBalances[steamId]} gold)</option>`
              ).join('')}
            </select>

            <select id="offeredPlayer" class="form-select">
              <option value="">Select teammate to offer...</option>
            </select>

            <input 
              type="number" 
              id="offerAmount" 
              class="form-input" 
              placeholder="Gold amount"
              min="${offerLimits.minOffer}"
              max="${offerLimits.maxOffer}"
            >

            <button id="submitOfferBtn" class="btn-primary btn-block">
              <span class="icon">💰</span>
              Submit Offer
            </button>
          </div>
        </div>

        <!-- Losing Team Section -->
        <div class="auction-section">
          <h4>Losing Team - Review Offers</h4>
          <p class="section-hint">Discuss in voice chat and select one offer to accept</p>
          
          <div id="offersList" class="offers-list">
            <p class="text-muted">Waiting for offers...</p>
          </div>
        </div>
      </div>

      <div class="auction-info">
        <strong>Gold Distribution:</strong><br>
        • Losing team: Each player lost 50% of their gold<br>
        • Winning team: Each player gained ${1000 + Math.floor(Object.values(roundData.goldChanges.goldLosses).reduce((a, b) => a + b, 0) / currentState.teamCompositions[winningTeam].length)} gold
      </div>
    </div>
  `;

  // Set up auction event listeners
  setupAuctionListeners();
  
  // Load existing offers
  refreshAuctionUI();
}

function setupAuctionListeners() {
  const offeringPlayerSelect = document.getElementById('offeringPlayer');
  const offeredPlayerSelect = document.getElementById('offeredPlayer');
  const submitOfferBtn = document.getElementById('submitOfferBtn');

  // Update offered player options when offering player changes
  offeringPlayerSelect?.addEventListener('change', (e) => {
    const offeringPlayerId = e.target.value;
    if (!offeringPlayerId) return;

    const winningTeam = currentState.teamCompositions.team1.includes(offeringPlayerId) ? 'team1' : 'teamA';
    const teammates = currentState.teamCompositions[winningTeam].filter(id => id !== offeringPlayerId);

    offeredPlayerSelect.innerHTML = `
      <option value="">Select teammate to offer...</option>
      ${teammates.map(steamId => 
        `<option value="${steamId}">${getSteamIdShort(steamId)} (${currentState.playerGoldBalances[steamId]} gold)</option>`
      ).join('')}
    `;
  });

  // Submit offer
  submitOfferBtn?.addEventListener('click', async () => {
    const offeringPlayerId = offeringPlayerSelect.value;
    const offeredPlayerId = offeredPlayerSelect.value;
    const goldAmount = parseInt(document.getElementById('offerAmount').value);

    if (!offeringPlayerId || !offeredPlayerId || !goldAmount) {
      alert('Please fill in all fields');
      return;
    }

    submitOfferBtn.disabled = true;
    submitOfferBtn.innerHTML = '<span class="spinner"></span> Submitting...';

    try {
      const result = await ipcRenderer.invoke('create-offer', {
        offeringPlayerSteamId: offeringPlayerId,
        offeredPlayerSteamId: offeredPlayerId,
        goldAmount
      });

      if (result.success) {
        logActivity('Offer submitted successfully', 'success');
        refreshAuctionUI();
      } else {
        alert('Failed to create offer: ' + result.error);
      }
    } catch (error) {
      alert('Error creating offer: ' + error.message);
    } finally {
      submitOfferBtn.disabled = false;
      submitOfferBtn.innerHTML = '<span class="icon">💰</span> Submit Offer';
    }
  });
}

async function refreshAuctionUI() {
  // This would fetch and display current offers
  // For now, just a placeholder
  const offersListEl = document.getElementById('offersList');
  if (offersListEl) {
    offersListEl.innerHTML = '<p class="text-muted">Loading offers...</p>';
  }
}

// Jitsi Window
function openJitsiWindow() {
  const jitsiWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  jitsiWindow.loadFile(path.join(__dirname, '../jitsi-component.html'));
}

function formatGameState(state) {
  const states = {
    'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS': 'In Progress',
    'DOTA_GAMERULES_STATE_PRE_GAME': 'Pre-Game',
    'DOTA_GAMERULES_STATE_POST_GAME': 'Post Game',
    'DOTA_GAMERULES_STATE_HERO_SELECTION': 'Hero Selection'
  };
  return states[state] || state;
}