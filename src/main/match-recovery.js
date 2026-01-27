const EventEmitter = require('events');

/**
 * Match Recovery System
 * Handles resuming matches after crashes or between sessions
 */
class MatchRecovery extends EventEmitter {
  constructor(supabase) {
    super();
    this.supabase = supabase;
  }

  /**
   * Check if there are any active matches that can be resumed
   * @param {string} playerSteamId - Current logged-in player's Steam ID
   * @returns {Array} - List of resumable matches
   */
  async getResumableMatches(playerSteamId) {
    try {
      // Find active matches where this player is a participant
      const { data: participants, error: partError } = await this.supabase.client
        .from('match_participants')
        .select('match_id')
        .eq('player_steam_id', playerSteamId);

      if (partError) throw partError;
      if (!participants || participants.length === 0) {
        return [];
      }

      const matchIds = participants.map(p => p.match_id);

      // Get active matches
      const { data: matches, error: matchError } = await this.supabase.client
        .from('matches')
        .select('*')
        .in('id', matchIds)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (matchError) throw matchError;

      // Get participant details for each match
      const matchesWithDetails = await Promise.all(
        (matches || []).map(async (match) => {
          const participants = await this.supabase.getMatchParticipants(match.id);
          const rounds = await this.supabase.getRoundsByMatch(match.id);
          
          return {
            ...match,
            participants,
            totalRounds: rounds.length,
            lastActivity: this.getLastActivity(match, rounds)
          };
        })
      );

      console.log('[MatchRecovery] Found', matchesWithDetails.length, 'resumable matches');
      return matchesWithDetails;
    } catch (error) {
      console.error('[MatchRecovery] Error getting resumable matches:', error);
      return [];
    }
  }

  /**
   * Restore a match to the app state
   * @param {string} matchId - Match to restore
   * @returns {Object} - Restored match state
   */
  async restoreMatch(matchId) {
    try {
      console.log('[MatchRecovery] Restoring match:', matchId);

      // Get match details
      const match = await this.supabase.getMatch(matchId);
      const participants = await this.supabase.getMatchParticipants(matchId);
      const rounds = await this.supabase.getRoundsByMatch(matchId);
      const transfers = await this.supabase.getTransfersByMatch(matchId);

      // Reconstruct team compositions
      const teamCompositions = this.reconstructTeamCompositions(
        participants,
        transfers,
        match.current_round
      );

      // Reconstruct gold balances
      const playerGoldBalances = this.reconstructGoldBalances(participants);

      // Get latest round info
      const latestRound = rounds.length > 0 ? rounds[rounds.length - 1] : null;

      // Determine current game phase
      const gamePhase = this.determineGamePhase(match, latestRound);

      // Get pending offers if in auction phase
      let pendingOffers = [];
      if (gamePhase === 'auction' && latestRound) {
        pendingOffers = await this.supabase.getOffersByRound(latestRound.id);
      }

      const restoredState = {
        match,
        participants,
        rounds,
        transfers,
        teamCompositions,
        playerGoldBalances,
        currentRound: match.current_round,
        roundNumber: match.current_round,
        gamePhase,
        latestRound,
        pendingOffers,
        offerLimits: this.calculateOfferLimits(match.current_round)
      };

      console.log('[MatchRecovery] Match restored successfully');
      console.log('[MatchRecovery] Current round:', match.current_round);
      console.log('[MatchRecovery] Game phase:', gamePhase);
      console.log('[MatchRecovery] Team 1:', teamCompositions.team1);
      console.log('[MatchRecovery] Team A:', teamCompositions.teamA);

      this.emit('match-restored', restoredState);

      return restoredState;
    } catch (error) {
      console.error('[MatchRecovery] Error restoring match:', error);
      throw error;
    }
  }

  /**
   * Reconstruct team compositions based on transfers
   */
  reconstructTeamCompositions(participants, transfers, currentRound) {
    const teamCompositions = {
      team1: [],
      teamA: []
    };

    // Start with initial teams
    participants.forEach(participant => {
      const team = participant.initial_team;
      if (team === 'team1') {
        teamCompositions.team1.push(participant.player_steam_id);
      } else {
        teamCompositions.teamA.push(participant.player_steam_id);
      }
    });

    // Apply all transfers in chronological order
    transfers.forEach(transfer => {
      const playerSteamId = transfer.player_steam_id;
      const fromTeam = transfer.from_team;
      const toTeam = transfer.to_team;

      // Remove from old team
      const fromIndex = teamCompositions[fromTeam].indexOf(playerSteamId);
      if (fromIndex > -1) {
        teamCompositions[fromTeam].splice(fromIndex, 1);
      }

      // Add to new team (if not already there)
      if (!teamCompositions[toTeam].includes(playerSteamId)) {
        teamCompositions[toTeam].push(playerSteamId);
      }
    });

    return teamCompositions;
  }

  /**
   * Reconstruct current gold balances
   */
  reconstructGoldBalances(participants) {
    const goldBalances = new Map();

    participants.forEach(participant => {
      goldBalances.set(
        participant.player_steam_id,
        participant.current_gold
      );
    });

    return goldBalances;
  }

  /**
   * Determine current game phase based on match state
   */
  determineGamePhase(match, latestRound) {
    if (match.status === 'completed') {
      return 'complete';
    }

    if (!latestRound) {
      return 'playing'; // No rounds yet, waiting for first game
    }

    // Check if latest round has a winner and is recent
    if (latestRound.winning_team && !latestRound.ended_at) {
      return 'auction'; // Round ended but no auction completion recorded
    }

    // Check if we're between rounds (last round ended recently)
    const lastRoundTime = new Date(latestRound.started_at).getTime();
    const now = Date.now();
    const timeSinceLastRound = now - lastRoundTime;

    // If last round was within 2 hours, likely in auction or preparing for next round
    if (timeSinceLastRound < 2 * 60 * 60 * 1000) {
      // Check for pending offers
      return 'auction';
    }

    return 'playing';
  }

  /**
   * Calculate offer limits based on round number
   */
  calculateOfferLimits(roundNumber) {
    const minOffer = 500 + ((roundNumber - 1) * 250);
    const maxOffer = 2000 + ((roundNumber - 1) * 500);
    return { minOffer, maxOffer };
  }

  /**
   * Get last activity timestamp for a match
   */
  getLastActivity(match, rounds) {
    if (rounds.length === 0) {
      return match.created_at;
    }

    const lastRound = rounds[rounds.length - 1];
    return lastRound.started_at;
  }

  /**
   * Create a match snapshot for recovery
   * (Can be called periodically during a match)
   */
  async createMatchSnapshot(matchState) {
    try {
      console.log('[MatchRecovery] Creating match snapshot...');

      // The match is already being saved to database in real-time
      // through auction-manager operations, so we don't need to do much here

      // Could add additional snapshot data if needed
      const snapshot = {
        matchId: matchState.matchId,
        timestamp: new Date().toISOString(),
        roundNumber: matchState.roundNumber,
        gamePhase: matchState.gamePhase,
        teamCounts: {
          team1: matchState.teamCompositions.team1.length,
          teamA: matchState.teamCompositions.teamA.length
        }
      };

      console.log('[MatchRecovery] Snapshot created:', snapshot);
      return snapshot;
    } catch (error) {
      console.error('[MatchRecovery] Error creating snapshot:', error);
    }
  }

  /**
   * Validate match integrity after restoration
   */
  validateMatchState(restoredState) {
    const issues = [];

    // Check team sizes
    const team1Size = restoredState.teamCompositions.team1.length;
    const team2Size = restoredState.teamCompositions.teamA.length;

    if (team1Size === 0 || team2Size === 0) {
      issues.push('One team has no players');
    }

    // Check if all participants are accounted for
    const totalPlayers = team1Size + team2Size;
    const participantCount = restoredState.participants.length;

    if (totalPlayers !== participantCount) {
      issues.push(`Player count mismatch: ${totalPlayers} in teams vs ${participantCount} participants`);
    }

    // Check gold balances
    const playersWithGold = Array.from(restoredState.playerGoldBalances.keys()).length;
    if (playersWithGold !== participantCount) {
      issues.push('Some players missing gold balance');
    }

    // Check round consistency
    if (restoredState.rounds.length !== restoredState.currentRound) {
      issues.push(`Round count mismatch: ${restoredState.rounds.length} rounds vs current round ${restoredState.currentRound}`);
    }

    if (issues.length > 0) {
      console.warn('[MatchRecovery] Match validation issues:', issues);
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  /**
   * Archive completed matches older than specified days
   */
  async archiveOldMatches(daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const { data, error } = await this.supabase.client
        .from('matches')
        .update({ status: 'archived' })
        .eq('status', 'completed')
        .lt('completed_at', cutoffDate.toISOString());

      if (error) throw error;

      console.log('[MatchRecovery] Archived', data?.length || 0, 'old matches');
      return data;
    } catch (error) {
      console.error('[MatchRecovery] Error archiving matches:', error);
      return null;
    }
  }

  /**
   * Abandon a match (mark as incomplete/abandoned)
   */
  async abandonMatch(matchId) {
    try {
      const { data, error } = await this.supabase.client
        .from('matches')
        .update({ 
          status: 'abandoned',
          completed_at: new Date().toISOString()
        })
        .eq('id', matchId);

      if (error) throw error;

      console.log('[MatchRecovery] Match abandoned:', matchId);
      return { success: true };
    } catch (error) {
      console.error('[MatchRecovery] Error abandoning match:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = MatchRecovery;
