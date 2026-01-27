const { ipcRenderer } = require('electron');
const Store = require('electron-store');
const store = new Store();

// UI Elements
const steamIdDisplay = document.getElementById('steamIdDisplay');
const gameStatus = document.getElementById('gameStatus');
const lastUpdate = document.getElementById('lastUpdate');
const currentGameInfo = document.getElementById('currentGameInfo');
const playerInfo = document.getElementById('playerInfo');
const rawData = document.getElementById('rawData');
const eventLog = document.getElementById('eventLog');

// Display Steam ID
const steamId = store.get('steamId');
steamIdDisplay.textContent = `Steam ID: ${steamId}`;

// Event log array
let events = [];

// Logout handler
document.getElementById('logoutBtn').addEventListener('click', () => {
  if (confirm('Are you sure you want to logout?')) {
    ipcRenderer.send('logout');
  }
});

// Clear buttons
document.getElementById('clearDataBtn').addEventListener('click', () => {
  rawData.innerHTML = '<p class="no-data">No data received yet</p>';
});

document.getElementById('clearLogBtn').addEventListener('click', () => {
  events = [];
  eventLog.innerHTML = '<p class="no-data">No events recorded yet</p>';
});

// Listen for game state updates
ipcRenderer.on('game-state-update', (event, data) => {
  updateLastUpdateTime();
  updateGameStatus(data);
  updateCurrentGameInfo(data);
  updatePlayerInfo(data);
  updateRawData(data);
  checkForEvents(data);
});

function updateLastUpdateTime() {
  const now = new Date();
  lastUpdate.textContent = now.toLocaleTimeString();
}

function updateGameStatus(data) {
  if (!data.map) {
    gameStatus.textContent = 'Waiting for Dota 2...';
    gameStatus.className = 'status-value';
    return;
  }

  const state = data.map.game_state;
  let statusText = 'Unknown';
  let statusClass = 'status-value';

  switch(state) {
    case 'DOTA_GAMERULES_STATE_WAIT_FOR_PLAYERS_TO_LOAD':
      statusText = 'Loading';
      statusClass = 'status-value status-warning';
      break;
    case 'DOTA_GAMERULES_STATE_HERO_SELECTION':
      statusText = 'Hero Selection';
      statusClass = 'status-value status-warning';
      break;
    case 'DOTA_GAMERULES_STATE_STRATEGY_TIME':
      statusText = 'Strategy Time';
      statusClass = 'status-value status-warning';
      break;
    case 'DOTA_GAMERULES_STATE_PRE_GAME':
      statusText = 'Pre-Game';
      statusClass = 'status-value status-warning';
      break;
    case 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS':
      statusText = 'In Game';
      statusClass = 'status-value status-active';
      break;
    case 'DOTA_GAMERULES_STATE_POST_GAME':
      statusText = 'Post Game';
      statusClass = 'status-value status-inactive';
      break;
    default:
      statusText = state;
  }

  gameStatus.textContent = statusText;
  gameStatus.className = statusClass;
}

function updateCurrentGameInfo(data) {
  if (!data.map) {
    currentGameInfo.innerHTML = '<p class="no-data">No active game</p>';
    return;
  }

  const gameTime = data.map.clock_time || 0;
  const minutes = Math.floor(Math.abs(gameTime) / 60);
  const seconds = Math.abs(gameTime) % 60;
  const timeString = `${gameTime < 0 ? '-' : ''}${minutes}:${seconds.toString().padStart(2, '0')}`;

  const html = `
    <div class="info-row">
      <span class="info-label">Game Time:</span>
      <span class="info-value">${timeString}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Match ID:</span>
      <span class="info-value">${data.map.matchid || 'N/A'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Game State:</span>
      <span class="info-value">${data.map.game_state || 'N/A'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Custom Game:</span>
      <span class="info-value">${data.map.customgamename || 'None (Standard Dota)'}</span>
    </div>
    ${data.map.win_team ? `
      <div class="info-row">
        <span class="info-label">Winner:</span>
        <span class="info-value">${data.map.win_team}</span>
      </div>
    ` : ''}
  `;

  currentGameInfo.innerHTML = html;
}

function updatePlayerInfo(data) {
  if (!data.player || !data.hero) {
    playerInfo.innerHTML = '<p class="no-data">Waiting for game data...</p>';
    return;
  }

  const heroName = data.hero.name ? data.hero.name.replace('npc_dota_hero_', '') : 'Unknown';

  const html = `
    <div class="info-row">
      <span class="info-label">Player Name:</span>
      <span class="info-value">${data.player.name || 'Unknown'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Steam ID:</span>
      <span class="info-value">${data.player.steamid || 'N/A'}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Hero:</span>
      <span class="info-value hero-name">${heroName}</span>
    </div>
    <div class="info-row">
      <span class="info-label">Team:</span>
      <span class="info-value">${data.player.team_name || 'N/A'}</span>
    </div>
    ${data.hero.level ? `
      <div class="info-row">
        <span class="info-label">Level:</span>
        <span class="info-value">${data.hero.level}</span>
      </div>
    ` : ''}
    ${data.hero.alive !== undefined ? `
      <div class="info-row">
        <span class="info-label">Status:</span>
        <span class="info-value ${data.hero.alive ? 'status-active' : 'status-inactive'}">
          ${data.hero.alive ? 'Alive' : 'Dead'}
        </span>
      </div>
    ` : ''}
  `;

  playerInfo.innerHTML = html;
}

function updateRawData(data) {
  const formatted = JSON.stringify(data, null, 2);
  rawData.innerHTML = `<pre>${escapeHtml(formatted)}</pre>`;
}

// Track events
let lastGameState = null;
let lastHero = null;

function checkForEvents(data) {
  if (!data.map || !data.player) return;

  const currentGameState = data.map.game_state;
  const currentHero = data.hero?.name;

  // Game Start Event
  if (lastGameState !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' && 
      currentGameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS') {
    logEvent('game-start', {
      matchId: data.map.matchid,
      customGame: data.map.customgamename || 'Standard Dota',
      hero: currentHero,
      playerName: data.player.name
    });
  }

  // Game End Event
  if (lastGameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' && 
      currentGameState === 'DOTA_GAMERULES_STATE_POST_GAME') {
    logEvent('game-end', {
      matchId: data.map.matchid,
      winner: data.map.win_team,
      playerTeam: data.player.team_name,
      won: data.player.team_name === data.map.win_team
    });
  }

  // Hero Change Event
  if (lastHero && currentHero && lastHero !== currentHero) {
    logEvent('hero-change', {
      from: lastHero.replace('npc_dota_hero_', ''),
      to: currentHero.replace('npc_dota_hero_', '')
    });
  }

  // Hero Selection (first time)
  if (!lastHero && currentHero) {
    logEvent('hero-selected', {
      hero: currentHero.replace('npc_dota_hero_', ''),
      playerName: data.player.name
    });
  }

  lastGameState = currentGameState;
  lastHero = currentHero;
}

function logEvent(type, data) {
  const event = {
    type,
    timestamp: new Date(),
    data
  };

  events.unshift(event);

  // Keep only last 100 events
  if (events.length > 100) {
    events = events.slice(0, 100);
  }

  renderEventLog();
}

function renderEventLog() {
  if (events.length === 0) {
    eventLog.innerHTML = '<p class="no-data">No events recorded yet</p>';
    return;
  }

  const html = events.map(event => {
    const time = event.timestamp.toLocaleTimeString();
    const typeClass = `event-type-${event.type}`;
    
    let dataHtml = '';
    for (const [key, value] of Object.entries(event.data)) {
      dataHtml += `<div class="event-data-item"><strong>${key}:</strong> ${value}</div>`;
    }

    return `
      <div class="event-item ${typeClass}">
        <div class="event-header">
          <span class="event-type">${event.type.toUpperCase()}</span>
          <span class="event-time">${time}</span>
        </div>
        <div class="event-data">${dataHtml}</div>
      </div>
    `;
  }).join('');

  eventLog.innerHTML = html;
}

function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>"']/g, m => map[m]);
}