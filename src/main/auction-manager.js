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
        players
      });

      return this.currentMatch;
    } catch (error) {
      console.error('[Auction] Error starting match:', error);
      throw error;
    }
  }

  async endRound(dotaMatchId, customGameName, winningTeam, playerStats) {
    try {
      if (!this.currentMatch) {
        throw new Error('No active match');
      }

      this.roundNumber++;

      // Create round record
      this.currentRound = await supabase.createRound(
        this.currentMatch.id,
        this.roundNumber,
        dotaMatchId,
        customGameName,
        winningTeam
      );

      // Calculate gold changes
      const losingTeam = winningTeam === 'team1' ? 'teamA' : 'team1';
      const goldLosses = this.calculateGoldLosses(losingTeam);
      const goldGains = this.calculateGoldGains(winningTeam, goldLosses);

      // Save player stats and update gold
      for (const [steamId, stats] of Object.entries(playerStats)) {
        const team = this.getPlayerTeam(steamId);
        const goldBefore = this.playerGoldBalances.get(steamId);
        const goldAfter = team === winningTeam ? goldGains[steamId] : goldLosses[steamId];

        await supabase.addRoundParticipant(
          this.currentRound.id,
          steamId,
          team,
          stats.hero,
          stats.kills,
          stats.deaths,
          stats.assists,
          goldBefore,
          goldAfter
        );

        this.playerGoldBalances.set(steamId, goldAfter);
        await supabase.updateParticipantGold(this.currentMatch.id, steamId, goldAfter);
      }

      // Update match round number
      await supabase.updateMatch(this.currentMatch.id, {
        current_round: this.roundNumber
      });

      // Check for match winner (solo player on winning team)
      const winner = this.checkForMatchWinner(winningTeam);
      if (winner) {
        await this.endMatch(winner);
        return;
      }

      // Move to auction phase
      this.gamePhase = 'auction';
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
      throw error;
    }
  }

  calculateGoldLosses(losingTeam) {
    const losses = {};
    const teamPlayers = this.teamCompositions[losingTeam];

    for (const steamId of teamPlayers) {
      const currentGold = this.playerGoldBalances.get(steamId);
      losses[steamId] = Math.floor(currentGold * 0.5);
    }

    return losses;
  }

  calculateGoldGains(winningTeam, goldLosses) {
    const gains = {};
    const teamPlayers = this.teamCompositions[winningTeam];
    
    // Calculate total gold lost
    const totalLost = Object.values(goldLosses).reduce((sum, loss) => sum + loss, 0);
    
    // Distribute evenly among winners
    const sharePerPlayer = Math.floor(totalLost / teamPlayers.length);

    for (const steamId of teamPlayers) {
      const currentGold = this.playerGoldBalances.get(steamId);
      gains[steamId] = currentGold + 1000 + sharePerPlayer;
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
      offerLimits: this.getMinMaxOffer()
    };
  }
}

module.exports = AuctionManager;
