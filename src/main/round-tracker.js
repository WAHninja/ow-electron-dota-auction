const EventEmitter = require('events');

/**
 * Round Tracker - Automatically detects Dota 2 rounds and maps them to match rounds
 * 
 * Logic:
 * 1. When a match starts, begin monitoring GSI data
 * 2. Detect when a Dota game enters "IN_PROGRESS" state
 * 3. Track all participating players and their teams
 * 4. When game ends (POST_GAME state), determine winner
 * 5. Automatically trigger auction phase
 */
class RoundTracker extends EventEmitter {
  constructor() {
    super();
    this.activeMatch = null;
    this.currentRound = null;
    this.previousGameState = null;
    this.gameStartTime = null;
    this.playersInGame = new Map(); // steamId -> { team, hero, stats }
    this.customGameName = null;
    this.dotaMatchId = null;
  }

  /**
   * Start tracking rounds for a match
   */
  startTracking(match, teamCompositions) {
    this.activeMatch = match;
    this.teamCompositions = teamCompositions; // { team1: [steamIds], teamA: [steamIds] }
    this.currentRound = null;
    this.playersInGame.clear();
    
    console.log('[RoundTracker] Started tracking match:', match.id);
    console.log('[RoundTracker] Team 1:', teamCompositions.team1);
    console.log('[RoundTracker] Team A:', teamCompositions.teamA);
  }

  /**
   * Process GSI data to detect round start/end
   */
  processGSIData(gsiData) {
    if (!this.activeMatch) return;

    if (!gsiData || !gsiData.map || !gsiData.player) return;

    const gameState = gsiData.map.game_state;
    const playerSteamId = gsiData.player.steamid;

    // Check if this player is in the current match
    const playerTeam = this.getPlayerTeam(playerSteamId);
    if (!playerTeam) {
      // Player not in this match, ignore
      return;
    }

    // Detect round start
    if (this.detectRoundStart(gameState)) {
      this.handleRoundStart(gsiData);
    }

    // Track player data during game
    if (gameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS') {
      this.trackPlayerData(gsiData);
    }

    // Detect round end
    if (this.detectRoundEnd(gameState)) {
      this.handleRoundEnd(gsiData);
    }

    this.previousGameState = gameState;
  }

  /**
   * Detect when a new Dota game starts
   */
  detectRoundStart(currentState) {
    // Game transitions from any state to IN_PROGRESS
    return (
      this.previousGameState !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
      currentState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
      !this.currentRound // Not already tracking a round
    );
  }

  /**
   * Handle round start
   */
  handleRoundStart(gsiData) {
    this.currentRound = {
      startTime: Date.now(),
      dotaMatchId: gsiData.map.matchid,
      customGameName: gsiData.map.customgamename || '',
      roundNumber: (this.activeMatch.current_round || 0) + 1
    };

    this.dotaMatchId = gsiData.map.matchid;
    this.customGameName = gsiData.map.customgamename;
    this.playersInGame.clear();

    console.log('[RoundTracker] Round started:', this.currentRound.roundNumber);
    console.log('[RoundTracker] Dota Match ID:', this.dotaMatchId);
    console.log('[RoundTracker] Custom Game:', this.customGameName);

    this.emit('round-started', {
      roundNumber: this.currentRound.roundNumber,
      dotaMatchId: this.dotaMatchId,
      customGameName: this.customGameName
    });
  }

  /**
   * Track player data throughout the game
   */
  trackPlayerData(gsiData) {
    if (!this.currentRound) return;

    const steamId = gsiData.player.steamid;
    const team = this.getPlayerTeam(steamId);

    if (!team) return;

    // Store/update player data
    this.playersInGame.set(steamId, {
      team: team,
      hero: gsiData.hero?.name || 'unknown',
      kills: gsiData.hero?.kills || 0,
      deaths: gsiData.hero?.deaths || 0,
      assists: gsiData.hero?.assists || 0,
      level: gsiData.hero?.level || 0,
      netWorth: gsiData.hero?.gold || 0
    });
  }

  /**
   * Detect when a Dota game ends
   */
  detectRoundEnd(currentState) {
    // Game transitions from IN_PROGRESS to POST_GAME
    return (
      this.previousGameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
      currentState === 'DOTA_GAMERULES_STATE_POST_GAME' &&
      this.currentRound // We're tracking a round
    );
  }

  /**
   * Handle round end and determine winner
   */
  handleRoundEnd(gsiData) {
    if (!this.currentRound) return;

    const winningTeam = this.determineWinner(gsiData);
    const losingTeam = winningTeam === 'team1' ? 'teamA' : 'team1';

    console.log('[RoundTracker] Round ended');
    console.log('[RoundTracker] Winning team:', winningTeam);
    console.log('[RoundTracker] Players in game:', this.playersInGame.size);

    // Convert player stats to object format
    const playerStats = {};
    this.playersInGame.forEach((data, steamId) => {
      playerStats[steamId] = {
        hero: data.hero,
        kills: data.kills,
        deaths: data.deaths,
        assists: data.assists
      };
    });

    // Emit round-ended event
    this.emit('round-ended', {
      roundNumber: this.currentRound.roundNumber,
      dotaMatchId: this.dotaMatchId,
      customGameName: this.customGameName,
      winningTeam: winningTeam,
      losingTeam: losingTeam,
      playerStats: playerStats,
      duration: Date.now() - this.currentRound.startTime
    });

    // Reset current round
    this.currentRound = null;
  }

  /**
   * Determine which team won based on GSI data
   * 
   * Strategy:
   * 1. Check map.win_team if available (Radiant/Dire)
   * 2. Map Radiant/Dire to team1/teamA based on player team assignments
   * 3. Cross-reference with player.team_name from GSI
   */
  determineWinner(gsiData) {
    // Method 1: Check win_team from map data
    if (gsiData.map && gsiData.map.win_team) {
      const winningDotaTeam = gsiData.map.win_team.toLowerCase(); // 'radiant' or 'dire'
      console.log('[RoundTracker] GSI win_team:', winningDotaTeam);

      // Check if current player is on winning team
      const currentPlayerSteamId = gsiData.player.steamid;
      const currentPlayerTeam = this.getPlayerTeam(currentPlayerSteamId);
      const currentPlayerDotaTeam = gsiData.player.team_name?.toLowerCase();

      if (currentPlayerDotaTeam === winningDotaTeam) {
        console.log('[RoundTracker] Winner determined by GSI data:', currentPlayerTeam);
        return currentPlayerTeam;
      } else {
        // Current player lost, so other team won
        const otherTeam = currentPlayerTeam === 'team1' ? 'teamA' : 'team1';
        console.log('[RoundTracker] Winner determined by GSI data:', otherTeam);
        return otherTeam;
      }
    }

    // Method 2: Check ancient health (if available)
    if (gsiData.buildings) {
      // Count standing ancients per team
      // This is a fallback method
      console.log('[RoundTracker] Checking buildings for winner...');
    }

    // Method 3: Fallback - can't determine automatically
    console.warn('[RoundTracker] Could not determine winner automatically');
    this.emit('manual-winner-selection-required', {
      roundNumber: this.currentRound.roundNumber,
      dotaMatchId: this.dotaMatchId
    });

    return null;
  }

  /**
   * Get which team a player is on
   */
  getPlayerTeam(steamId) {
    if (this.teamCompositions.team1.includes(steamId)) {
      return 'team1';
    }
    if (this.teamCompositions.teamA.includes(steamId)) {
      return 'teamA';
    }
    return null;
  }

  /**
   * Manually set winner (if automatic detection fails)
   */
  manuallySetWinner(winningTeam) {
    if (!this.currentRound) {
      console.error('[RoundTracker] No active round to set winner for');
      return false;
    }

    const losingTeam = winningTeam === 'team1' ? 'teamA' : 'team1';

    // Convert player stats to object format
    const playerStats = {};
    this.playersInGame.forEach((data, steamId) => {
      playerStats[steamId] = {
        hero: data.hero,
        kills: data.kills,
        deaths: data.deaths,
        assists: data.assists
      };
    });

    this.emit('round-ended', {
      roundNumber: this.currentRound.roundNumber,
      dotaMatchId: this.dotaMatchId,
      customGameName: this.customGameName,
      winningTeam: winningTeam,
      losingTeam: losingTeam,
      playerStats: playerStats,
      duration: Date.now() - this.currentRound.startTime,
      manuallySet: true
    });

    this.currentRound = null;
    return true;
  }

  /**
   * Stop tracking (when match ends)
   */
  stopTracking() {
    console.log('[RoundTracker] Stopped tracking');
    this.activeMatch = null;
    this.currentRound = null;
    this.playersInGame.clear();
    this.teamCompositions = null;
  }

  /**
   * Get current round info
   */
  getCurrentRoundInfo() {
    if (!this.currentRound) return null;

    return {
      roundNumber: this.currentRound.roundNumber,
      dotaMatchId: this.dotaMatchId,
      customGameName: this.customGameName,
      startTime: this.currentRound.startTime,
      playersTracked: this.playersInGame.size,
      duration: Date.now() - this.currentRound.startTime
    };
  }
}

module.exports = RoundTracker;
