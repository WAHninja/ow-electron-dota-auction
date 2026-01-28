const EventEmitter = require('events');
const supabase = require('./supabase-client');

class AuctionManager extends EventEmitter {
  constructor() {
    super();
    this.currentMatch = null;
    this.currentRound = null;
    this.roundNumber = 0;
    this.playerGoldBalances = new Map(); // steamId -> gold amount
    this.teamCompositions = {
      team1: [],
      teamA: []
    };
    this.pendingOffers = [];
    this.gamePhase = 'idle'; // idle, playing, auction, complete
  }

  async startMatch(matchName, players) {
    try {
      // Create match in database
      this.currentMatch = await supabase.createMatch(matchName);
      this.roundNumber = 0;
      this.gamePhase = 'playing';

      // Initialize players
      for (const player of players) {
        await supabase.upsertPlayer(player.steamId, player.username);
        await supabase.addMatchParticipant(
          this.currentMatch.id,
          player.steamId,
          player.team
        );

        this.playerGoldBalances.set(player.steamId, 1000);
        
        if (player.team === 'team1') {
          this.teamCompositions.team1.push(player.steamId);
        } else {
          this.teamCompositions.teamA.push(player.steamId);
        }
      }

      console.log('[Auction] Match started:', this.currentMatch.id);
      this.emit('match-started', {
        matchId: this.currentMatch.id,
        matchName,
        players,
        teamCompositions: this.teamCompositions
      });

      return this.currentMatch;
    } catch (error) {
      console.error('[Auction] Error starting match:', error);
      throw error;
    }
  }

  async endRound(dotaMatchId, customGameName, winningTeam, playerStats, gameDuration = null, teamNetWorths = null, gameMode = null) {
    try {
      if (!this.currentMatch) {
        throw new Error('No active match');
      }

      this.roundNumber++;

      // Calculate team net worths if not provided
      if (!teamNetWorths && playerStats) {
        teamNetWorths = this.calculateTeamNetWorths(playerStats);
      }

      // Create round record with enhanced data
      this.currentRound = await supabase.createRound(
        this.currentMatch.id,
        this.roundNumber,
        dotaMatchId,
        customGameName,
        winningTeam,
        teamNetWorths?.team1 || null, // NEW: Team 1 net worth
        teamNetWorths?.teamA || null, // NEW: Team A net worth
        gameDuration, // NEW: Game duration in seconds
        gameMode // NEW: Game mode
      );

      // Calculate gold changes
      const losingTeam = winningTeam === 'team1' ? 'teamA' : 'team1';
      const goldLosses = this.calculateGoldLosses(losingTeam);
      const goldGains = this.calculateGoldGains(winningTeam, goldLosses);

      // Save comprehensive player stats and update gold
      // IMPORTANT: We need to update gold for ALL players, not just those with stats
      const allPlayers = [...this.teamCompositions.team1, ...this.teamCompositions.teamA];
      
      for (const steamId of allPlayers) {
        const team = this.getPlayerTeam(steamId);
        const goldBefore = this.playerGoldBalances.get(steamId);
        const goldAfter = team === winningTeam ? goldGains[steamId] : goldLosses[steamId];
        
        // Get stats for this player (may be empty if not available)
        const stats = playerStats[steamId] || {};

        // Save comprehensive stats
        await supabase.addRoundParticipant(
          this.currentRound.id,
          steamId,
          team,
          stats.hero_name || stats.hero || 'unknown', // Support both field names
          stats.kills || 0,
          stats.deaths || 0,
          stats.assists || 0,
          goldBefore,
          goldAfter,
          // NEW PARAMETERS:
          stats.last_hits || 0,
          stats.denies || 0,
          stats.gold_per_min || 0,
          stats.xp_per_min || 0,
          stats.hero_damage || 0,
          stats.tower_damage || 0,
          stats.hero_healing || 0,
          stats.level || 1,
          stats.items || null, // JSON array
          stats.net_worth || 0,
          stats.hero_id || null
        );

        // Update in-memory gold balance
        this.playerGoldBalances.set(steamId, goldAfter);
        
        // Update database gold balance
        await supabase.updateParticipantGold(this.currentMatch.id, steamId, goldAfter);
        
        console.log(`[Auction] Updated ${steamId} gold in DB: ${goldBefore} → ${goldAfter}`);
      }

      // Update match round number
      await supabase.updateMatch(this.currentMatch.id, {
        current_round: this.roundNumber
      });

      // Log event
      await supabase.logMatchEvent(
        this.currentMatch.id,
        this.currentRound.id,
        'round_ended',
        {
          round_number: this.roundNumber,
          winning_team: winningTeam,
          losing_team: losingTeam,
          team_net_worths: teamNetWorths,
          game_duration: gameDuration
        }
      );

      // Check for match winner (solo player on winning team)
      const winner = this.checkForMatchWinner(winningTeam);
      if (winner) {
        await this.endMatch(winner);
        return;
      }

      // Move to auction phase
      this.gamePhase = 'auction';
      
      // Log auction start
      await supabase.logMatchEvent(
        this.currentMatch.id,
        this.currentRound.id,
        'auction_started',
        {
          losing_team: losingTeam,
          gold_losses: goldLosses
        }
      );

      this.emit('round-ended', {
        roundId: this.currentRound.id,
        roundNumber: this.roundNumber,
        winningTeam,
        losingTeam,
        goldChanges: { goldLosses, goldGains }
      });

      return this.currentRound;
    } catch (error) {
      console.error('[Auction] Error ending round:', error);
      
      // Log error event
      await supabase.logMatchEvent(
        this.currentMatch.id,
        this.currentRound?.id,
        'error_occurred',
        {
          error: error.message,
          context: 'end_round'
        }
      );
      
      throw error;
    }
  }

  calculateTeamNetWorths(playerStats) {
    // NEW METHOD: Calculate team net worths from player stats
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

  calculateGoldLosses(losingTeam) {
    // LOSING TEAM: Each player loses 50% of their gold
    const losses = {};
    const teamPlayers = this.teamCompositions[losingTeam];

    for (const steamId of teamPlayers) {
      const currentGold = this.playerGoldBalances.get(steamId);
      const goldLost = Math.floor(currentGold * 0.5);
      const newBalance = currentGold - goldLost;
      
      losses[steamId] = newBalance;
      
      console.log(`[Gold] ${steamId} (losing team): ${currentGold} → ${newBalance} (lost ${goldLost})`);
    }

    return losses;
  }

  calculateGoldGains(winningTeam, goldLosses) {
    // WINNING TEAM: Each player gets:
    // 1. Base win bonus: +1000 gold
    // 2. Share of gold lost by losing team (split evenly among winners)
    
    const gains = {};
    const teamPlayers = this.teamCompositions[winningTeam];
    
    // Calculate total gold lost by losing team (for redistribution)
    // goldLosses contains new balances, so we need to calculate what was actually lost
    let totalLostGold = 0;
    const losingTeam = winningTeam === 'team1' ? 'teamA' : 'team1';
    const losingPlayers = this.teamCompositions[losingTeam];
    
    for (const steamId of losingPlayers) {
      const oldBalance = this.playerGoldBalances.get(steamId);
      const newBalance = goldLosses[steamId];
      const amountLost = oldBalance - newBalance;
      totalLostGold += amountLost;
    }
    
    console.log(`[Gold] Total gold lost by losing team: ${totalLostGold}`);
    
    // Split lost gold evenly among winners
    const sharePerPlayer = Math.floor(totalLostGold / teamPlayers.length);
    const baseWinBonus = 1000;

    for (const steamId of teamPlayers) {
      const currentGold = this.playerGoldBalances.get(steamId);
      const totalGain = baseWinBonus + sharePerPlayer;
      const newBalance = currentGold + totalGain;
      
      gains[steamId] = newBalance;
      
      console.log(`[Gold] ${steamId} (winning team): ${currentGold} → ${newBalance} (+${baseWinBonus} base + ${sharePerPlayer} share = +${totalGain})`);
    }

    return gains;
  }

  getPlayerTeam(steamId) {
    if (this.teamCompositions.team1.includes(steamId)) return 'team1';
    if (this.teamCompositions.teamA.includes(steamId)) return 'teamA';
    return null;
  }

  checkForMatchWinner(winningTeam) {
    const teamPlayers = this.teamCompositions[winningTeam];
    if (teamPlayers.length === 1) {
      return teamPlayers[0];
    }
    return null;
  }

  async createOffer(offeringPlayerSteamId, offeredPlayerSteamId, goldAmount) {
    try {
      if (!this.currentRound) {
        throw new Error('No active round');
      }

      if (this.gamePhase !== 'auction') {
        throw new Error('Not in auction phase');
      }

      // Validate offer is from winning team member
      const winningTeam = this.currentRound.winning_team;
      const offeringTeam = this.getPlayerTeam(offeringPlayerSteamId);
      
      if (offeringTeam !== winningTeam) {
        throw new Error('Only winning team can make offers');
      }

      // Validate not offering themselves
      if (offeringPlayerSteamId === offeredPlayerSteamId) {
        throw new Error('Cannot offer yourself');
      }

      // Validate offered player is on same team
      const offeredTeam = this.getPlayerTeam(offeredPlayerSteamId);
      if (offeredTeam !== winningTeam) {
        throw new Error('Can only offer players on your team');
      }

      // Validate gold amount
      const minOffer = 500 + ((this.roundNumber - 1) * 250);
      const maxOffer = 2000 + ((this.roundNumber - 1) * 500);

      if (goldAmount < minOffer || goldAmount > maxOffer) {
        throw new Error(`Offer must be between ${minOffer} and ${maxOffer}`);
      }

      const offer = await supabase.createOffer(
        this.currentRound.id,
        offeringPlayerSteamId,
        offeredPlayerSteamId,
        goldAmount
      );

      this.pendingOffers.push(offer);

      // NEW: Log event
      await supabase.logMatchEvent(
        this.currentMatch.id,
        this.currentRound.id,
        'offer_created',
        {
          offer_id: offer.id,
          offering_player: offeringPlayerSteamId,
          offered_player: offeredPlayerSteamId,
          gold_amount: goldAmount
        },
        offeringPlayerSteamId
      );

      this.emit('offer-created', offer);
      
      return offer;
    } catch (error) {
      console.error('[Auction] Error creating offer:', error);
      throw error;
    }
  }

  async acceptOffer(offerId) {
    try {
      if (this.gamePhase !== 'auction') {
        throw new Error('Not in auction phase');
      }

      const offer = this.pendingOffers.find(o => o.id === offerId);
      if (!offer) {
        throw new Error('Offer not found');
      }

      // Accept offer in database
      await supabase.acceptOffer(offerId);

      // Transfer player
      const winningTeam = this.currentRound.winning_team;
      const losingTeam = winningTeam === 'team1' ? 'teamA' : 'team1';

      await this.transferPlayer(
        offer.offered_player_steam_id,
        winningTeam,
        losingTeam,
        offer.gold_amount
      );

      // Update offering player's gold
      const offeringGold = this.playerGoldBalances.get(offer.offering_player_steam_id);
      const newGold = offeringGold + offer.gold_amount;
      this.playerGoldBalances.set(offer.offering_player_steam_id, newGold);
      await supabase.updateParticipantGold(
        this.currentMatch.id,
        offer.offering_player_steam_id,
        newGold
      );

      // Clear pending offers
      this.pendingOffers = [];

      // Back to playing phase
      this.gamePhase = 'playing';

      // NEW: Log events
      await supabase.logMatchEvent(
        this.currentMatch.id,
        this.currentRound.id,
        'offer_accepted',
        {
          offer_id: offerId,
          offering_player: offer.offering_player_steam_id,
          offered_player: offer.offered_player_steam_id,
          gold_amount: offer.gold_amount,
          from_team: winningTeam,
          to_team: losingTeam
        }
      );

      await supabase.logMatchEvent(
        this.currentMatch.id,
        this.currentRound.id,
        'auction_ended',
        {
          accepted_offer_id: offerId
        }
      );

      this.emit('offer-accepted', {
        offer,
        transferredPlayer: offer.offered_player_steam_id,
        fromTeam: winningTeam,
        toTeam: losingTeam
      });

      return offer;
    } catch (error) {
      console.error('[Auction] Error accepting offer:', error);
      throw error;
    }
  }

  async transferPlayer(steamId, fromTeam, toTeam, goldPaid) {
    // Remove from old team
    const fromTeamArray = this.teamCompositions[fromTeam];
    const index = fromTeamArray.indexOf(steamId);
    if (index > -1) {
      fromTeamArray.splice(index, 1);
    }

    // Add to new team
    this.teamCompositions[toTeam].push(steamId);

    // Record transfer
    await supabase.createTransfer(
      this.currentMatch.id,
      this.currentRound.id,
      steamId,
      fromTeam,
      toTeam,
      goldPaid
    );

    console.log(`[Auction] Player ${steamId} transferred from ${fromTeam} to ${toTeam}`);
  }

  async endMatch(winnerSteamId) {
    try {
      await supabase.updateMatch(this.currentMatch.id, {
        status: 'completed',
        winner_steam_id: winnerSteamId,
        completed_at: new Date().toISOString()
      });

      this.gamePhase = 'complete';

      this.emit('match-ended', {
        matchId: this.currentMatch.id,
        winnerSteamId,
        totalRounds: this.roundNumber
      });

      console.log(`[Auction] Match completed! Winner: ${winnerSteamId}`);
    } catch (error) {
      console.error('[Auction] Error ending match:', error);
      throw error;
    }
  }

  getMinMaxOffer() {
    const minOffer = 500 + ((this.roundNumber - 1) * 250);
    const maxOffer = 2000 + ((this.roundNumber - 1) * 500);
    return { minOffer, maxOffer };
  }

  getCurrentState() {
    return {
      matchId: this.currentMatch?.id,
      roundNumber: this.roundNumber,
      gamePhase: this.gamePhase,
      teamCompositions: this.teamCompositions,
      playerGoldBalances: Object.fromEntries(this.playerGoldBalances),
      pendingOffers: this.pendingOffers,
      offerLimits: this.getMinMaxOffer(),
      currentRound: this.currentRound
    };
  }
}

module.exports = AuctionManager;