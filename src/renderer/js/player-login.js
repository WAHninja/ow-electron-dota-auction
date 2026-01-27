const { ipcRenderer, shell } = require('electron');

// UI Elements
const steamIdInput = document.getElementById('steamIdInput');
const loginBtn = document.getElementById('loginBtn');
const loginError = document.getElementById('loginError');
const loadingPlayer = document.getElementById('loadingPlayer');
const playerPreview = document.getElementById('playerPreview');
const playerAvatar = document.getElementById('playerAvatar');
const playerUsername = document.getElementById('playerUsername');
const playerSteamId = document.getElementById('playerSteamId');
const confirmLoginBtn = document.getElementById('confirmLoginBtn');
const backBtn = document.getElementById('backBtn');
const findSteamIdBtn = document.getElementById('findSteamIdBtn');

let currentPlayerData = null;

// Event Listeners
loginBtn.addEventListener('click', handleLogin);
steamIdInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') handleLogin();
});
findSteamIdBtn.addEventListener('click', () => {
  shell.openExternal('https://steamid.io/');
});
confirmLoginBtn.addEventListener('click', confirmLogin);
backBtn.addEventListener('click', () => {
  playerPreview.style.display = 'none';
  document.querySelector('.player-login-form').style.display = 'block';
  steamIdInput.value = '';
  currentPlayerData = null;
});

async function handleLogin() {
  const steamId = steamIdInput.value.trim();

  // Validate Steam ID
  if (!steamId) {
    showError('Please enter your Steam ID');
    return;
  }

  if (!/^7656119[0-9]{10}$/.test(steamId)) {
    showError('Please enter a valid 17-digit Steam ID starting with 7656119');
    return;
  }

  // Show loading
  document.querySelector('.player-login-form').style.display = 'none';
  loadingPlayer.style.display = 'block';
  hideError();

  try {
    // Fetch player data from Steam
    const result = await ipcRenderer.invoke('fetch-steam-profile', steamId);

    if (result.success) {
      currentPlayerData = result.data;
      showPlayerPreview(result.data);
    } else {
      showError(result.error || 'Failed to fetch Steam profile');
      document.querySelector('.player-login-form').style.display = 'block';
      loadingPlayer.style.display = 'none';
    }
  } catch (error) {
    showError('Error fetching Steam profile: ' + error.message);
    document.querySelector('.player-login-form').style.display = 'block';
    loadingPlayer.style.display = 'none';
  }
}

function showPlayerPreview(playerData) {
  loadingPlayer.style.display = 'none';
  playerPreview.style.display = 'block';

  // Set player data
  playerUsername.textContent = playerData.username;
  playerSteamId.textContent = `Steam ID: ${playerData.steamId}`;

  // Set avatar with fallback
  if (playerData.avatarUrl) {
    playerAvatar.src = playerData.avatarUrl;
    playerAvatar.style.display = 'block';
  } else {
    playerAvatar.style.display = 'none';
  }
}

async function confirmLogin() {
  if (!currentPlayerData) return;

  confirmLoginBtn.disabled = true;
  confirmLoginBtn.innerHTML = '<span class="spinner"></span> Registering...';

  try {
    const result = await ipcRenderer.invoke('register-player', currentPlayerData);

    if (result.success) {
      console.log('[Login] Player registered successfully');
      // Main process will handle navigation to dashboard
    } else {
      showError(result.error || 'Failed to register player');
      confirmLoginBtn.disabled = false;
      confirmLoginBtn.innerHTML = '<span class="btn-icon">✓</span> Continue as this player';
    }
  } catch (error) {
    showError('Error registering player: ' + error.message);
    confirmLoginBtn.disabled = false;
    confirmLoginBtn.innerHTML = '<span class="btn-icon">✓</span> Continue as this player';
  }
}

function showError(message) {
  loginError.textContent = message;
  loginError.style.display = 'block';
}

function hideError() {
  loginError.style.display = 'none';
}