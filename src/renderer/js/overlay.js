const { ipcRenderer } = require('electron');

const overlayInfo = document.getElementById('overlayInfo');

ipcRenderer.on('game-state-update', (event, data) => {
  if (!data.hero || !data.player) {
    overlayInfo.textContent = 'Waiting for game data...';
    return;
  }

  const heroName = data.hero.name ? data.hero.name.replace('npc_dota_hero_', '') : 'Unknown';
  const level = data.hero.level || '?';
  const alive = data.hero.alive ? 'Alive' : 'Dead';
  
  overlayInfo.innerHTML = `
    <div><strong>Hero:</strong> ${heroName}</div>
    <div><strong>Level:</strong> ${level}</div>
    <div><strong>Status:</strong> ${alive}</div>
  `;
});