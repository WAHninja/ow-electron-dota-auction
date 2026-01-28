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
const settingsBtn = document.getElementById('settingsBtn');
const resumeMatchBtn = document.createElement('button');
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
  ipcRenderer.on('round-started', handleRoundStarted);
  ipcRenderer.on('round-ended', handleRoundEnded);
  ipcRenderer.on('offer-created', handleOfferCreated);
  ipcRenderer.on('offer-accepted', handleOfferAccepted);
  ipcRenderer.on('match-ended', handleMatchEnded);
  ipcRenderer.on('game-state-update', handleGSIUpdate);
  ipcRenderer.on('jitsi-main-room-ready', handleJitsiReady);
  ipcRenderer.on('jitsi-auction-room-created', handleAuctionRoomCreated);
  ipcRenderer.on('jitsi-return-to-main', handleReturnToMain);
  ipcRenderer.on('show-winner-selection', handleShowWinnerSelection);
  ipcRenderer.on('round-end-error', handleRoundEndError);
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
    
    // Show appropriate content based on phase
    if (currentState.gamePhase === 'auction') {
      showContent('auction');
      // Auction UI will be rendered by handleRoundEnded event
    } else {
      showContent('roster');
      renderRoster();
    }
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
  if (!currentState.teamCompositions) return 'unknown';
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
        <div class="match-card-header">
          <div class="match-card-title">
            <h3>${match.match_name || 'Unnamed Match'}</h3>
            <div class="match-card-meta">
              <span>Round ${match.current_round}</span>
              <span>•</span>
              <span>Created ${created}</span>
            </div>
          </div>
          <span class="match-status-badge playing">Active</span>
        </div>
        <div class="match-card-stats">
          <div class="stat-box">
            <div class="stat-box-label">Players</div>
            <div class="stat-box-value">${match.participants.length}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">Rounds</div>
            <div class="stat-box-value">${match.totalRounds}</div>
          </div>
          <div class="stat-box">
            <div class="stat-box-label">Last Activity</div>
            <div class="stat-box-value" style="font-size: 0.9rem;">${last}</div>
          </div>
        </div>
        <div class="match-card-teams">
          <div class="team-preview team1">
            <strong>Team 1: ${team1}</strong>
          </div>
          <div class="team-preview teamA">
            <strong>Team A: ${teamA}</strong>
          </div>
        </div>
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

  const team1Players = match.participants.filter(p => p.initial_team === 'team1');
  const teamAPlayers = match.participants.filter(p => p.initial_team === 'teamA');

  matchDetailsContent.innerHTML = `
    <div class="match-detail-section">
      <h3>${match.match_name}</h3>
      <div class="match-card-meta">
        <span>Round ${match.current_round}</span>
        <span>•</span>
        <span>Total rounds played: ${match.totalRounds}</span>
        <span>•</span>
        <span>Created: ${new Date(match.created_at).toLocaleString()}</span>
      </div>
    </div>

    <div class="match-detail-section">
      <h4>Team 1 (${team1Players.length} players)</h4>
      <div class="player-list-detailed">
        ${team1Players.map(p => `
          <div class="player-card-detailed">
            <img src="${p.players.avatar_url || ''}" style="width: 40px; height: 40px; border-radius: 50%;" />
            <div>
              <div><strong>${p.players.username}</strong></div>
              <div style="font-size: 0.85rem; opacity: 0.7;">💰 ${p.current_gold} gold</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="match-detail-section">
      <h4>Team A (${teamAPlayers.length} players)</h4>
      <div class="player-list-detailed">
        ${teamAPlayers.map(p => `
          <div class="player-card-detailed">
            <img src="${p.players.avatar_url || ''}" style="width: 40px; height: 40px; border-radius: 50%;" />
            <div>
              <div><strong>${p.players.username}</strong></div>
              <div style="font-size: 0.85rem; opacity: 0.7;">💰 ${p.current_gold} gold</div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

async function handleResumeMatch() {
  if (!selectedMatchToResume) return;

  confirmResumeMatch.disabled = true;
  confirmResumeMatch.innerHTML = '<span class="spinner"></span> Resuming...';

  try {
    const result = await ipcRenderer.invoke('resume-match', {
      matchId: selectedMatchToResume.id
    });

    if (result.success) {
      hideModal(matchDetailsModal);
      logActivity(`Match resumed: ${selectedMatchToResume.match_name}`, 'success');
      await refreshState();
    } else {
      alert(result.error || 'Failed to resume match');
    }
  } catch (error) {
    alert('Error resuming match: ' + error.message);
  } finally {
    confirmResumeMatch.disabled = false;
    confirmResumeMatch.innerHTML = '▶ Resume Match';
  }
}

async function handleAbandonMatch() {
  if (!selectedMatchToResume) return;

  if (!confirm(`Abandon "${selectedMatchToResume.match_name}"?`)) return;

  abandonMatchBtn.disabled = true;

  try {
    const result = await ipcRenderer.invoke('abandon-match', {
      matchId: selectedMatchToResume.id
    });

    if (result.success) {
      hideModal(matchDetailsModal);
      selectedMatchToResume = null;
      showResumeMatchModal();
      logActivity('Match abandoned', 'info');
    } else {
      alert(result.error || 'Failed to abandon match');
    }
  } catch (err) {
    alert('Error abandoning match: ' + err.message);
  } finally {
    abandonMatchBtn.disabled = false;
  }
}

// Player Management for Create Match
async function populatePlayersList() {
  const result = await ipcRenderer.invoke('get-all-players');
  
  if (!result.success || !result.players || result.players.length === 0) {
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

// Handle Create Match
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
  
  confirmCreateMatch.disabled = true;
  confirmCreateMatch.innerHTML = '<span class="spinner"></span> Creating...';
  
  // Create match
  try {
    const result = await ipcRenderer.invoke('start-match', {
      matchName,
      players: selectedPlayers
    });
    
    if (result.success) {
      hideModal(createMatchModal);
      matchNameInput.value = '';
      logActivity(`Match created: ${matchName}`, 'success');
      await refreshState();
    } else {
      alert('Failed to create match: ' + result.error);
    }
  } catch (error) {
    alert('Error creating match: ' + error.message);
  } finally {
    confirmCreateMatch.disabled = false;
    confirmCreateMatch.innerHTML = '<span class="icon">🚀</span> Start Match';
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
  if (!selectedWinningTeam) {
    alert('Please select a winning team');
    return;
  }
  
  confirmEndRound.disabled = true;
  confirmEndRound.innerHTML = '<span class="spinner"></span> Ending Round...';
  
  try {
    // Extract player stats from GSI data if available
    const playerStats = gsiData ? extractPlayerStats(gsiData) : {};
    
    const result = await ipcRenderer.invoke('end-round', {
      dotaMatchId: gsiData?.map?.matchid || 'manual_' + Date.now(),
      customGameName: gsiData?.map?.customgamename || '',
      winningTeam: selectedWinningTeam,
      playerStats
    });
    
    if (result.success) {
      hideModal(endRoundModal);
      selectedWinningTeam = null;
      selectTeam1Btn.classList.remove('selected');
      selectTeamABtn.classList.remove('selected');
      logActivity(`Round ended - ${selectedWinningTeam} won`, 'success');
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

function handleRoundStarted(event, data) {
  logActivity(`Round ${data.roundNumber} started - Match ID: ${data.dotaMatchId}`, 'info');
  refreshState();
}

async function handleRoundEnded(event, data) {
  logActivity(`Round ${data.roundNumber} ended - ${data.winningTeam} won!`, 'success');
  
  // Show auction UI
  showContent('auction');
  await renderAuctionUI(data);
  
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

function handleShowWinnerSelection(event, data) {
  logActivity('Manual winner selection required', 'info');
  showModal(endRoundModal);
  
  // Pre-fill with round data if available
  if (data.roundNumber) {
    logActivity(`Please select winner for round ${data.roundNumber}`, 'info');
  }
}

function handleRoundEndError(event, data) {
  logActivity(`Error ending round: ${data.error}`, 'error');
  alert('Failed to end round automatically. Please use manual round end.');
}

// Auction UI
async function renderAuctionUI(roundData) {
  const winningTeam = roundData.winningTeam;
  const losingTeam = roundData.losingTeam;
  const offerLimits = currentState.offerLimits;
  
  // Get current player
  const currentPlayerResult = await ipcRenderer.invoke('get-current-player');
  const currentPlayerSteamId = currentPlayerResult.player?.steamId;
  
  // Get all players to map Steam IDs to usernames
  const playersResult = await ipcRenderer.invoke('get-all-players');
  const playerMap = new Map();
  if (playersResult.success && playersResult.players) {
    playersResult.players.forEach(p => {
      playerMap.set(p.steam_id, p.username);
    });
  }
  
  // Helper function to get username or fallback
  const getPlayerName = (steamId) => {
    return playerMap.get(steamId) || getSteamIdShort(steamId);
  };
  
  // Check if current player is on winning team
  const isCurrentPlayerOnWinningTeam = currentState.teamCompositions[winningTeam].includes(currentPlayerSteamId);
  
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
          ${isCurrentPlayerOnWinningTeam ? `
            <p class="section-hint">Select a teammate to offer (${offerLimits.minOffer} - ${offerLimits.maxOffer} gold)</p>
            
            <div id="offerForm" class="offer-form">
              <div class="form-group">
                <label>You are:</label>
                <div style="background: rgba(76, 175, 80, 0.2); padding: 12px; border-radius: 8px; margin-bottom: 15px;">
                  <strong>${getPlayerName(currentPlayerSteamId)}</strong>
                  <span style="opacity: 0.8; margin-left: 10px;">💰 ${currentState.playerGoldBalances[currentPlayerSteamId]} gold</span>
                </div>
              </div>

              <select id="offeredPlayer" class="form-select">
                <option value="">Select teammate to offer...</option>
                ${currentState.teamCompositions[winningTeam]
                  .filter(steamId => steamId !== currentPlayerSteamId)
                  .map(steamId => 
                    `<option value="${steamId}">${getPlayerName(steamId)} (💰 ${currentState.playerGoldBalances[steamId]} gold)</option>`
                  ).join('')}
              </select>

              <input 
                type="number" 
                id="offerAmount" 
                class="form-input" 
                placeholder="Gold amount (${offerLimits.minOffer} - ${offerLimits.maxOffer})"
                min="${offerLimits.minOffer}"
                max="${offerLimits.maxOffer}"
              >

              <button id="submitOfferBtn" class="btn-primary btn-block">
                <span class="icon">💰</span>
                Submit Offer
              </button>
            </div>
          ` : `
            <p class="text-muted" style="text-align: center; padding: 40px 20px;">
              You are on the losing team.<br>
              Wait for offers from the winning team.
            </p>
          `}
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
        • Winning team: Each player gained gold from the win
      </div>
    </div>
  `;

  // Set up auction event listeners
  setupAuctionListeners(currentPlayerSteamId);
  
  // Load existing offers
  refreshAuctionUI();
}

function setupAuctionListeners(currentPlayerSteamId) {
  const offeredPlayerSelect = document.getElementById('offeredPlayer');
  const submitOfferBtn = document.getElementById('submitOfferBtn');

  // No need to update offered player options on change since current player is already set
  // The offered player dropdown is already populated with teammates

  // Submit offer
  submitOfferBtn?.addEventListener('click', async () => {
    const offeredPlayerId = offeredPlayerSelect?.value;
    const goldAmount = parseInt(document.getElementById('offerAmount')?.value);

    if (!currentPlayerSteamId) {
      alert('Could not determine your player ID');
      return;
    }

    if (!offeredPlayerId || !goldAmount) {
      alert('Please select a teammate and enter gold amount');
      return;
    }

    if (goldAmount < currentState.offerLimits.minOffer || goldAmount > currentState.offerLimits.maxOffer) {
      alert(`Gold amount must be between ${currentState.offerLimits.minOffer} and ${currentState.offerLimits.maxOffer}`);
      return;
    }

    submitOfferBtn.disabled = true;
    submitOfferBtn.innerHTML = '<span class="spinner"></span> Submitting...';

    try {
      const result = await ipcRenderer.invoke('create-offer', {
        offeringPlayerSteamId: currentPlayerSteamId,
        offeredPlayerSteamId: offeredPlayerId,
        goldAmount
      });

      if (result.success) {
        logActivity('Offer submitted successfully', 'success');
        // Clear form
        if (offeredPlayerSelect) offeredPlayerSelect.value = '';
        const amountInput = document.getElementById('offerAmount');
        if (amountInput) amountInput.value = '';
        // Refresh offers
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
  if (!currentState || !currentState.currentRound) {
    console.log('[Auction] No current round to fetch offers for');
    return;
  }

  const offersListEl = document.getElementById('offersList');
  if (!offersListEl) return;

  offersListEl.innerHTML = '<p class="text-muted">Loading offers...</p>';

  try {
    const result = await ipcRenderer.invoke('get-offers', {
      roundId: currentState.currentRound.id
    });

    if (result.success && result.offers && result.offers.length > 0) {
      await renderOffers(result.offers);
    } else {
      offersListEl.innerHTML = '<p class="text-muted">No offers yet</p>';
    }
  } catch (error) {
    console.error('[Auction] Failed to load offers:', error);
    offersListEl.innerHTML = '<p class="text-muted">Error loading offers</p>';
  }
}

async function renderOffers(offers) {
  const offersListEl = document.getElementById('offersList');
  if (!offersListEl) return;

  // Get all players to map Steam IDs to usernames
  const playersResult = await ipcRenderer.invoke('get-all-players');
  const playerMap = new Map();
  if (playersResult.success && playersResult.players) {
    playersResult.players.forEach(p => {
      playerMap.set(p.steam_id, p.username);
    });
  }
  
  // Helper function to get username or fallback
  const getPlayerName = (steamId) => {
    return playerMap.get(steamId) || getSteamIdShort(steamId);
  };

  offersListEl.innerHTML = offers.map(offer => `
    <div class="offer-card" style="background: rgba(0,0,0,0.3); padding: 15px; border-radius: 8px; margin-bottom: 10px;">
      <div class="offer-header" style="display: flex; justify-content: space-between; margin-bottom: 10px;">
        <span><strong>${getPlayerName(offer.offering_player_steam_id)}</strong></span>
        <span class="offer-gold" style="color: #FFD700; font-weight: bold;">💰 ${offer.gold_amount.toLocaleString()}</span>
      </div>
      <div class="offer-body" style="margin-bottom: 10px;">
        Offering: <strong>${getPlayerName(offer.offered_player_steam_id)}</strong>
      </div>
      ${!offer.is_accepted ? `
        <button class="btn-primary btn-sm btn-block" onclick="window.acceptOfferGlobal('${offer.id}')">
          ✓ Accept Offer
        </button>
      ` : `
        <div style="color: #4CAF50;">✓ Accepted</div>
      `}
    </div>
  `).join('');
}

// Global function for accepting offers (called from onclick)
window.acceptOfferGlobal = async function(offerId) {
  if (!confirm('Accept this offer? This will transfer the player to the losing team.')) {
    return;
  }

  try {
    const result = await ipcRenderer.invoke('accept-offer', { offerId });
    if (result.success) {
      logActivity('Offer accepted!', 'success');
      await refreshState();
    } else {
      alert('Failed to accept offer: ' + result.error);
    }
  } catch (error) {
    alert('Error accepting offer: ' + error.message);
  }
};

// Jitsi Window
function openJitsiWindow() {
  const { BrowserWindow } = require('electron').remote;
  const path = require('path');

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

// Initialize on load
window.addEventListener('DOMContentLoaded', () => {
  initialize();
  setTimeout(checkForResumableMatches, 2000);
});