const { ipcRenderer, shell } = require('electron');

document.getElementById('loginBtn').addEventListener('click', () => {
  const steamId = document.getElementById('steamIdInput').value.trim();
  
  if (steamId && /^\d{17}$/.test(steamId)) {
    ipcRenderer.send('steam-login', steamId);
  } else {
    alert('Please enter a valid Steam ID (17 digits)');
  }
});

document.getElementById('steamIdInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    document.getElementById('loginBtn').click();
  }
});

document.getElementById('findSteamId').addEventListener('click', (e) => {
  e.preventDefault();
  shell.openExternal('https://steamid.io/');
});