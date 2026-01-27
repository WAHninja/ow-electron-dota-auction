const EventEmitter = require('events');

class EventTracker extends EventEmitter {
  constructor(steamId) {
    super();
    this.steamId = steamId;
    this.currentGame = null;
    this.isInGame = false;
  }

  processGameState(data) {
    if (!data || !data.player) return;

    const playerSteamId = data.player.steamid;
    
    // Only track events for the logged-in user
    if (playerSteamId !== this.steamId) return;

    // Check for game start
    if (!this.isInGame && data.map && data.map.game_state === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS') {
      this.handleGameStart(data);
    }

    // Check for game end
    if (this.isInGame && data.map && data.map.game_state === 'DOTA_GAMERULES_STATE_POST_GAME') {
      this.handleGameEnd(data);
    }

    // Track hero changes
    if (data.hero && data.hero.name !== this.currentGame?.hero) {
      this.handleHeroChange(data);
    }
  }

  handleGameStart(data) {
    this.isInGame = true;
    
    this.currentGame = {
      gameStartTime: Date.now(),
      customGame: data.map?.customgamename || null,
      hero: data.hero?.name || null,
      playerName: data.player?.name || null,
      steamId: this.steamId
    };

    console.log('Game Started:', this.currentGame);
    this.emit('game-start', this.currentGame);
  }

  handleGameEnd(data) {
    if (!this.currentGame) return;

    this.isInGame = false;
    
    const gameEndData = {
      ...this.currentGame,
      gameEndTime: Date.now(),
      duration: Date.now() - this.currentGame.gameStartTime,
      win: data.player?.team_name === data.map?.win_team
    };

    console.log('Game Ended:', gameEndData);
    this.emit('game-end', gameEndData);
    
    // Send to your backend API here
    // await this.sendToBackend(gameEndData);

    this.currentGame = null;
  }

  handleHeroChange(data) {
    if (this.currentGame) {
      this.currentGame.hero = data.hero.name;
      console.log('Hero Selected:', data.hero.name);
      this.emit('hero-change', data.hero.name);
    }
  }

  async sendToBackend(gameData) {
    // Implement your API call here
    // Example:
    // await fetch('https://your-api.com/games', {
    //   method: 'POST',
    //   headers: { 'Content-Type': 'application/json' },
    //   body: JSON.stringify(gameData)
    // });
  }
}

module.exports = EventTracker;