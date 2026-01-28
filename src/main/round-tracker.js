const EventEmitter = require('events');

class RoundTracker extends EventEmitter {
  constructor() {
    super();
    this.activeMatch = null;
    this.teamCompositions = null;
    this.currentRound = null;
    this.previousGameState = null;
    this.roundStartTime = null;
    this.playerStats = new Map(); // Track stats during round
  }

  startTracking(match, teamCompositions) {
    this.activeMatch = match;
    this.teamCompositions = teamCompositions;
    this.currentRound = null;
    this.previousGameState = null;
    this.roundStartTime = null;
    this.playerStats.clear();
    
    console.log('[RoundTracker] Started tracking for match:', match.id);
  }

  stopTracking() {
    this.activeMatch = null;
    this.teamCompositions = null;
    this.currentRound = null;
    this.previousGameState = null;
    this.roundStartTime = null;
    this.playerStats.clear();
    
    console.log('[RoundTracker] Stopped tracking');
  }

  processGSIData(gsiData) {
    if (!this.activeMatch) {
      return; // Not tracking any match
    }

    const currentState = gsiData?.map?.game_state;
    
    if (!currentState) {
      return; // No game state available
    }

    // Update player stats continuously
    this.updatePlayerStats(gsiData);

    // Detect round start
    if (this.detectRoundStart(currentState)) {
      this.handleRoundStart(gsiData);
    }

    // Detect round end
    if (this.detectRoundEnd(currentState)) {
      this.handleRoundEnd(gsiData);
    }

    this.previousGameState = currentState;
  }

  detectRoundStart(currentState) {
    return (
      this.previousGameState !== 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
      currentState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
      !this.currentRound &&
      this.activeMatch // Make sure we have an active match
    );
  }

  detectRoundEnd(currentState) {
    return (
      this.previousGameState === 'DOTA_GAMERULES_STATE_GAME_IN_PROGRESS' &&
      currentState === 'DOTA_GAMERULES_STATE_POST_GAME' &&
      this.currentRound
    );
  }

  handleRoundStart(gsiData) {
    const roundNumber = (this.activeMatch.current_round || 0) + 1;
    
    this.currentRound = {
      roundNumber,
      dotaMatchId: gsiData.map?.matchid || `manual_${Date.now()}`,
      customGameName: gsiData.map?.customgamename || '',
      startTime: Date.now()
    };
    
    this.roundStartTime = Date.now();
    this.playerStats.clear(); // Reset stats for new round

    console.log('[RoundTracker] Round started:', roundNumber);
    
    this.emit('round-started', {
      roundNumber,
      dotaMatchId: this.currentRound.dotaMatchId,
      customGameName: this.currentRound.customGameName
    });
  }

  handleRoundEnd(gsiData) {
    const winningTeam = this.determineWinner(gsiData);
    
    if (!winningTeam) {
      console.log('[RoundTracker] Could not determine winner automatically');
      this.emit('manual-winner-selection-required', {
        roundNumber: this.currentRound.roundNumber,
        dotaMatchId: this.currentRound.dotaMatchId
      });
      return;
    }

    // Calculate game duration
    const gameDuration = this.roundStartTime 
      ? Math.floor((Date.now() - this.roundStartTime) / 1000)
      : null;

    // Extract comprehensive player stats
    const playerStats = this.extractAllPlayerStats(gsiData);
    
    // Calculate team net worths
    const teamNetWorths = this.calculateTeamNetWorths(playerStats);

    console.log('[RoundTracker] Round ended. Winner:', winningTeam);
    console.log('[RoundTracker] Game duration:', gameDuration, 'seconds');
    console.log('[RoundTracker] Team net worths:', teamNetWorths);
    
    this.emit('round-ended', {
      roundNumber: this.currentRound.roundNumber,
      dotaMatchId: this.currentRound.dotaMatchId,
      customGameName: this.currentRound.customGameName,
      winningTeam,
      playerStats,
      gameDuration, // NEW
      teamNetWorths, // NEW
      gameMode: gsiData.map?.game_mode || null // NEW
    });

    this.currentRound = null;
    this.roundStartTime = null;
    this.playerStats.clear();
  }

  updatePlayerStats(gsiData) {
    // NEW: Continuously update player stats during the game
    if (!gsiData.player || !gsiData.hero) {
      return;
    }

    const steamId = gsiData.player.steamid;
    if (!steamId) return;

    const stats = {
      steam_id: steamId,
      hero_name: gsiData.hero.name,
      hero_id: gsiData.hero.id,
      level: gsiData.hero.level || 1,
      kills: gsiData.hero.kills || 0,
      deaths: gsiData.hero.deaths || 0,
      assists: gsiData.hero.assists || 0,
      last_hits: gsiData.hero.last_hits || 0,
      denies: gsiData.hero.denies || 0,
      gold: gsiData.hero.gold || 0,
      gold_per_min: gsiData.hero.gpm || 0,
      xp_per_min: gsiData.hero.xpm || 0,
      net_worth: gsiData.hero.net_worth || 0,
      hero_damage: gsiData.hero.hero_damage || 0,
      tower_damage: gsiData.hero.tower_damage || 0,
      hero_healing: gsiData.hero.hero_healing || 0,
      items: this.extractItems(gsiData.items),
      alive: gsiData.hero.alive || false,
      respawn_seconds: gsiData.hero.respawn_seconds || 0
    };

    this.playerStats.set(steamId, stats);
  }

  extractItems(itemsData) {
    // NEW: Extract item data from GSI
    if (!itemsData) return [];
    
    const items = [];
    
    // Inventory slots (0-5)
    for (let i = 0; i < 6; i++) {
      const slot = `slot${i}`;
      if (itemsData[slot]) {
        items.push({
          slot: i,
          name: itemsData[slot].name,
          purchaser: itemsData[slot].purchaser,
          can_cast: itemsData[slot].can_cast || false,
          cooldown: itemsData[slot].cooldown || 0,
          passive: itemsData[slot].passive || false
        });
      }
    }
    
    // Backpack slots (6-8)
    for (let i = 6; i < 9; i++) {
      const slot = `slot${i}`;
      if (itemsData[slot]) {
        items.push({
          slot: i,
          name: itemsData[slot].name,
          purchaser: itemsData[slot].purchaser,
          backpack: true
        });
      }
    }
    
    // Neutral item (slot9)
    if (itemsData.slot9) {
      items.push({
        slot: 9,
        name: itemsData.slot9.name,
        neutral: true
      });
    }
    
    return items;
  }

  extractAllPlayerStats(gsiData) {
    // NEW: Return all accumulated player stats
    const allStats = {};
    
    // Convert Map to object
    for (const [steamId, stats] of this.playerStats.entries()) {
      allStats[steamId] = stats;
    }
    
    // If we only have one player's data (current client), try to use it
    if (Object.keys(allStats).length === 0 && gsiData.player) {
      const steamId = gsiData.player.steamid;
      if (steamId) {
        this.updatePlayerStats(gsiData);
        allStats[steamId] = this.playerStats.get(steamId);
      }
    }
    
    return allStats;
  }

  calculateTeamNetWorths(playerStats) {
    // NEW: Calculate team net worths from player stats
    let team1Total = 0;
    let teamATotal = 0;

    for (const [steamId, stats] of Object.entries(playerStats)) {
      const team = this.getPlayerTeam(steamId);
      const netWorth = stats.net_worth || 0;

      if (team === 'team1') {
        team1Total += netWorth;
      } else if (team === 'teamA') {
        teamATotal += netWorth;
      }
    }

    return {
      team1: team1Total,
      teamA: teamATotal
    };
  }

  determineWinner(gsiData) {
    // Method 1: Check game state and radiant/dire win
    if (gsiData.map?.win_team) {
      return this.mapDotaTeamToAuctionTeam(gsiData.map.win_team);
    }

    // Method 2: Check if one team has all dead ancient
    if (gsiData.buildings) {
      const radiantAncient = gsiData.buildings.radiant?.find(b => b.includes('ancient'));
      const direAncient = gsiData.buildings.dire?.find(b => b.includes('ancient'));
      
      if (radiantAncient === 'destroyed') {
        return this.mapDotaTeamToAuctionTeam('dire');
      }
      if (direAncient === 'destroyed') {
        return this.mapDotaTeamToAuctionTeam('radiant');
      }
    }

    // Method 3: Manual fallback
    return null;
  }

  mapDotaTeamToAuctionTeam(dotaTeam) {
    // Map Dota team (radiant/dire) to auction team (team1/teamA)
    // This requires knowing which players are on which Dota team
    
    // For now, we'll need to track this based on player data
    // This is a simplified version - you may need to enhance this
    
    if (!this.teamCompositions) {
      return null;
    }

    // Check which team the current player is on
    const playerSteamId = gsiData?.player?.steamid;
    const playerDotaTeam = gsiData?.player?.team_name; // 'radiant' or 'dire'
    
    if (!playerSteamId || !playerDotaTeam) {
      return null;
    }

    // Determine player's auction team
    let playerAuctionTeam = null;
    if (this.teamCompositions.team1.includes(playerSteamId)) {
      playerAuctionTeam = 'team1';
    } else if (this.teamCompositions.teamA.includes(playerSteamId)) {
      playerAuctionTeam = 'teamA';
    }

    if (!playerAuctionTeam) {
      return null;
    }

    // If player's Dota team matches winning team, their auction team won
    if (playerDotaTeam === dotaTeam) {
      return playerAuctionTeam;
    } else {
      // Other team won
      return playerAuctionTeam === 'team1' ? 'teamA' : 'team1';
    }
  }

  getPlayerTeam(steamId) {
    if (!this.teamCompositions) return null;
    
    if (this.teamCompositions.team1.includes(steamId)) {
      return 'team1';
    }
    if (this.teamCompositions.teamA.includes(steamId)) {
      return 'teamA';
    }
    return null;
  }

  manuallySetWinner(winningTeam) {
    if (!this.currentRound) {
      console.error('[RoundTracker] No active round to set winner');
      return false;
    }

    console.log('[RoundTracker] Manually setting winner:', winningTeam);

    // Calculate game duration
    const gameDuration = this.roundStartTime 
      ? Math.floor((Date.now() - this.roundStartTime) / 1000)
      : null;

    // Use accumulated stats
    const playerStats = this.extractAllPlayerStats({});
    const teamNetWorths = this.calculateTeamNetWorths(playerStats);

    this.emit('round-ended', {
      roundNumber: this.currentRound.roundNumber,
      dotaMatchId: this.currentRound.dotaMatchId,
      customGameName: this.currentRound.customGameName,
      winningTeam,
      playerStats,
      gameDuration,
      teamNetWorths,
      gameMode: null,
      manual: true
    });

    this.currentRound = null;
    this.roundStartTime = null;
    this.playerStats.clear();
    
    return true;
  }

  getCurrentRoundInfo() {
    if (!this.currentRound) {
      return null;
    }

    const duration = this.roundStartTime 
      ? Math.floor((Date.now() - this.roundStartTime) / 1000)
      : 0;

    return {
      ...this.currentRound,
      duration,
      playerCount: this.playerStats.size,
      inProgress: true
    };
  }
}

module.exports = RoundTracker;