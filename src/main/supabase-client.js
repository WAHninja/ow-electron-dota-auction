const { createClient } = require('@supabase/supabase-js');
const Store = require('electron-store');

class SupabaseClient {
  constructor() {
    this.client = null;
    this.store = new Store();
  }

  initialize(supabaseUrl, supabaseKey) {
    try {
      this.client = createClient(supabaseUrl, supabaseKey);
      
      // Store credentials (encrypted storage recommended in production)
      this.store.set('supabase.url', supabaseUrl);
      this.store.set('supabase.key', supabaseKey);
      
      console.log('[Supabase] Client initialized successfully');
      return true;
    } catch (error) {
      console.error('[Supabase] Initialization failed:', error);
      return false;
    }
  }

  isInitialized() {
    return this.client !== null;
  }

  // ============================================================================
  // PLAYER METHODS
  // ============================================================================

  async upsertPlayer(steamId, username, avatarUrl = null, profileUrl = null) {
    const { data, error } = await this.client
      .from('players')
      .upsert({
        steam_id: steamId,
        username,
        avatar_url: avatarUrl,
        profile_url: profileUrl,
        last_login: new Date().toISOString()
      }, {
        onConflict: 'steam_id'
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPlayer(steamId) {
    const { data, error } = await this.client
      .from('players')
      .select('*')
      .eq('steam_id', steamId)
      .single();

    if (error) throw error;
    return data;
  }

  async getAllPlayers() {
    const { data, error } = await this.client
      .from('players')
      .select('*')
      .order('username');

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // MATCH METHODS
  // ============================================================================

  async createMatch(matchName) {
    const { data, error } = await this.client
      .from('matches')
      .insert({
        match_name: matchName,
        status: 'active',
        current_round: 0
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getMatch(matchId) {
    const { data, error } = await this.client
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (error) throw error;
    return data;
  }

  async updateMatch(matchId, updates) {
    const { data, error } = await this.client
      .from('matches')
      .update(updates)
      .eq('id', matchId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getActiveMatches() {
    const { data, error } = await this.client
      .from('matches')
      .select('*')
      .eq('status', 'active')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  async getMatchesByPlayer(steamId) {
    const { data, error } = await this.client
      .from('match_participants')
      .select('match_id, matches(*)')
      .eq('player_steam_id', steamId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data.map(item => item.matches);
  }

  // ============================================================================
  // MATCH PARTICIPANT METHODS
  // ============================================================================

  async addMatchParticipant(matchId, steamId, initialTeam, currentGold = 1000) {
    const { data, error } = await this.client
      .from('match_participants')
      .insert({
        match_id: matchId,
        player_steam_id: steamId,
        initial_team: initialTeam,
        current_team: initialTeam, // NEW: Set current team same as initial
        current_gold: currentGold
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getMatchParticipants(matchId) {
    const { data, error } = await this.client
      .from('match_participants')
      .select(`
        *,
        players (
          steam_id,
          username,
          avatar_url
        )
      `)
      .eq('match_id', matchId);

    if (error) throw error;
    return data;
  }

  async updateParticipantGold(matchId, steamId, newGold) {
    const { error } = await this.client
      .from('match_participants')
      .update({ current_gold: newGold })
      .eq('match_id', matchId)
      .eq('player_steam_id', steamId);

    if (error) throw error;
  }

  async updateParticipantTeam(matchId, steamId, newTeam) {
    // NEW METHOD: Update current team when player transfers
    const { error } = await this.client
      .from('match_participants')
      .update({ current_team: newTeam })
      .eq('match_id', matchId)
      .eq('player_steam_id', steamId);

    if (error) throw error;
  }

  // ============================================================================
  // ROUND METHODS (UPDATED)
  // ============================================================================

  async createRound(matchId, roundNumber, dotaMatchId, customGameName, winningTeam, 
                    team1NetWorth = null, teamANetWorth = null, gameDuration = null, gameMode = null) {
    // UPDATED: Now accepts team net worths and game duration
    const { data, error } = await this.client
      .from('rounds')
      .insert({
        match_id: matchId,
        round_number: roundNumber,
        dota_match_id: dotaMatchId,
        custom_game_name: customGameName,
        winning_team: winningTeam,
        team1_total_net_worth: team1NetWorth, // NEW
        team_a_total_net_worth: teamANetWorth, // NEW
        game_duration_seconds: gameDuration, // NEW
        game_mode: gameMode, // NEW
        ended_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getRound(roundId) {
    const { data, error } = await this.client
      .from('rounds')
      .select('*')
      .eq('id', roundId)
      .single();

    if (error) throw error;
    return data;
  }

  async getRoundsByMatch(matchId) {
    const { data, error } = await this.client
      .from('rounds')
      .select('*')
      .eq('match_id', matchId)
      .order('round_number');

    if (error) throw error;
    return data;
  }

  async getLatestRound(matchId) {
    const { data, error } = await this.client
      .from('rounds')
      .select('*')
      .eq('match_id', matchId)
      .order('round_number', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') throw error; // Ignore "not found" error
    return data;
  }

  // ============================================================================
  // ROUND PARTICIPANT METHODS (UPDATED)
  // ============================================================================

  async addRoundParticipant(
    roundId, 
    steamId, 
    team, 
    heroName, 
    kills = 0, 
    deaths = 0, 
    assists = 0, 
    goldBefore = 0, 
    goldAfter = 0,
    // NEW PARAMETERS:
    lastHits = 0,
    denies = 0,
    goldPerMin = 0,
    xpPerMin = 0,
    heroDamage = 0,
    towerDamage = 0,
    heroHealing = 0,
    level = 1,
    items = null,
    netWorth = 0,
    heroId = null
  ) {
    // UPDATED: Now accepts comprehensive game statistics
    const { data, error } = await this.client
      .from('round_participants')
      .insert({
        round_id: roundId,
        player_steam_id: steamId,
        team,
        hero_name: heroName,
        hero_id: heroId, // NEW
        kills,
        deaths,
        assists,
        gold_before: goldBefore,
        gold_after: goldAfter,
        last_hits: lastHits, // NEW
        denies: denies, // NEW
        gold_per_min: goldPerMin, // NEW
        xp_per_min: xpPerMin, // NEW
        hero_damage: heroDamage, // NEW
        tower_damage: towerDamage, // NEW
        hero_healing: heroHealing, // NEW
        level: level, // NEW
        items: items, // NEW (JSON)
        net_worth: netWorth // NEW
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getRoundParticipants(roundId) {
    const { data, error } = await this.client
      .from('round_participants')
      .select(`
        *,
        players (
          steam_id,
          username,
          avatar_url
        )
      `)
      .eq('round_id', roundId);

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // OFFER METHODS (UPDATED)
  // ============================================================================

  async createOffer(roundId, offeringPlayerSteamId, offeredPlayerSteamId, goldAmount) {
    const { data, error } = await this.client
      .from('offers')
      .insert({
        round_id: roundId,
        offering_player_steam_id: offeringPlayerSteamId,
        offered_player_steam_id: offeredPlayerSteamId,
        gold_amount: goldAmount,
        is_accepted: false,
        rejected: false // NEW
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getOffersByRound(roundId) {
    const { data, error } = await this.client
      .from('offers')
      .select('*')
      .eq('round_id', roundId)
      .order('created_at');

    if (error) throw error;
    return data;
  }

  async acceptOffer(offerId) {
    // UPDATED: Trigger will automatically set accepted_at timestamp
    const { data, error } = await this.client
      .from('offers')
      .update({ is_accepted: true })
      .eq('id', offerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async rejectOffer(offerId) {
    // NEW METHOD: Mark offer as rejected
    const { data, error } = await this.client
      .from('offers')
      .update({ rejected: true })
      .eq('id', offerId)
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getPendingOffers(roundId) {
    // NEW METHOD: Get only pending offers
    const { data, error } = await this.client
      .from('offers')
      .select('*')
      .eq('round_id', roundId)
      .eq('is_accepted', false)
      .eq('rejected', false)
      .order('created_at');

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // TRANSFER METHODS
  // ============================================================================

  async createTransfer(matchId, roundId, steamId, fromTeam, toTeam, goldPaid) {
    // NOTE: Trigger will automatically update match_participants.current_team
    const { data, error } = await this.client
      .from('transfers')
      .insert({
        match_id: matchId,
        round_id: roundId,
        player_steam_id: steamId,
        from_team: fromTeam,
        to_team: toTeam,
        gold_paid: goldPaid
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  }

  async getTransfersByMatch(matchId) {
    const { data, error } = await this.client
      .from('transfers')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at');

    if (error) throw error;
    return data;
  }

  async getTransfersByPlayer(steamId) {
    const { data, error } = await this.client
      .from('transfers')
      .select(`
        *,
        matches (
          match_name
        ),
        rounds (
          round_number
        )
      `)
      .eq('player_steam_id', steamId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // MATCH EVENT METHODS (NEW)
  // ============================================================================

  async logMatchEvent(matchId, roundId, eventType, eventData, playerSteamId = null) {
    // NEW: Log events for audit trail
    const { error } = await this.client
      .from('match_events')
      .insert({
        match_id: matchId,
        round_id: roundId,
        event_type: eventType,
        event_data: eventData,
        player_steam_id: playerSteamId
      });

    // Don't throw - event logging is non-critical
    if (error) {
      console.error('[Supabase] Failed to log event:', error);
    }
  }

  async getMatchEvents(matchId) {
    // NEW: Get all events for a match
    const { data, error } = await this.client
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .order('created_at');

    if (error) throw error;
    return data;
  }

  async getMatchEventsByType(matchId, eventType) {
    // NEW: Get events of specific type
    const { data, error } = await this.client
      .from('match_events')
      .select('*')
      .eq('match_id', matchId)
      .eq('event_type', eventType)
      .order('created_at');

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // PLAYER STATISTICS METHODS (NEW)
  // ============================================================================

  async getPlayerStatistics(steamId) {
    // NEW: Get player statistics
    const { data, error } = await this.client
      .from('player_statistics')
      .select('*')
      .eq('player_steam_id', steamId)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  }

  async getLeaderboard(limit = 10, orderBy = 'matches_won') {
    // NEW: Get player leaderboard using view
    const { data, error } = await this.client
      .from('player_leaderboard')
      .select('*')
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async updatePlayerFavoriteHero(steamId, heroName, gameCount) {
    // NEW: Update favorite hero
    const { error } = await this.client
      .from('player_statistics')
      .update({
        favorite_hero: heroName,
        favorite_hero_games: gameCount
      })
      .eq('player_steam_id', steamId);

    if (error) throw error;
  }

  // ============================================================================
  // ANALYTICS VIEWS (NEW)
  // ============================================================================

  async getActiveMatchesSummary() {
    // NEW: Get active matches with team counts
    const { data, error } = await this.client
      .from('active_matches_summary')
      .select('*');

    if (error) throw error;
    return data;
  }

  async getRoundPerformance(matchId) {
    // NEW: Get detailed round performance
    const { data, error } = await this.client
      .from('round_performance')
      .select('*')
      .eq('match_id', matchId)
      .order('round_number');

    if (error) throw error;
    return data;
  }

  async getMatchHistory(limit = 10) {
    // NEW: Get match history with winner info
    const { data, error } = await this.client
      .from('match_history')
      .select('*')
      .limit(limit);

    if (error) throw error;
    return data;
  }

  // ============================================================================
  // HERO STATISTICS (NEW)
  // ============================================================================

  async getHeroStatistics(heroName) {
    // NEW: Get statistics for a specific hero
    const { data, error } = await this.client
      .from('round_participants')
      .select('*')
      .eq('hero_name', heroName);

    if (error) throw error;

    // Calculate aggregates
    const totalGames = data.length;
    const totalKills = data.reduce((sum, p) => sum + p.kills, 0);
    const totalDeaths = data.reduce((sum, p) => sum + p.deaths, 0);
    const totalAssists = data.reduce((sum, p) => sum + p.assists, 0);
    const avgKDA = totalDeaths > 0 ? (totalKills + totalAssists) / totalDeaths : totalKills + totalAssists;

    return {
      hero_name: heroName,
      total_games: totalGames,
      total_kills: totalKills,
      total_deaths: totalDeaths,
      total_assists: totalAssists,
      average_kda: avgKDA.toFixed(2),
      win_rate: 0 // Would need to join with rounds table
    };
  }

  async getMostPlayedHeroes(limit = 10) {
    // NEW: Get most played heroes
    const { data, error } = await this.client
      .from('round_participants')
      .select('hero_name')
      .not('hero_name', 'is', null);

    if (error) throw error;

    // Count occurrences
    const counts = {};
    data.forEach(p => {
      counts[p.hero_name] = (counts[p.hero_name] || 0) + 1;
    });

    // Sort and limit
    return Object.entries(counts)
      .map(([hero, count]) => ({ hero_name: hero, games_played: count }))
      .sort((a, b) => b.games_played - a.games_played)
      .slice(0, limit);
  }

  // ============================================================================
  // ADVANCED QUERIES (NEW)
  // ============================================================================

  async getPlayerRoundHistory(steamId, limit = 20) {
    // NEW: Get recent round performance for a player
    const { data, error } = await this.client
      .from('round_participants')
      .select(`
        *,
        rounds (
          round_number,
          winning_team,
          game_duration_seconds,
          matches (
            match_name
          )
        )
      `)
      .eq('player_steam_id', steamId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;
    return data;
  }

  async getTeamPerformance(matchId, team) {
    // NEW: Get aggregate team performance across all rounds
    const { data, error } = await this.client
      .from('round_participants')
      .select(`
        *,
        rounds!inner (
          match_id,
          round_number
        )
      `)
      .eq('rounds.match_id', matchId)
      .eq('team', team);

    if (error) throw error;

    // Calculate team aggregates
    const totalKills = data.reduce((sum, p) => sum + p.kills, 0);
    const totalDeaths = data.reduce((sum, p) => sum + p.deaths, 0);
    const totalAssists = data.reduce((sum, p) => sum + p.assists, 0);
    const avgNetWorth = data.reduce((sum, p) => sum + (p.net_worth || 0), 0) / data.length;

    return {
      team,
      total_rounds: [...new Set(data.map(p => p.rounds.round_number))].length,
      total_kills: totalKills,
      total_deaths: totalDeaths,
      total_assists: totalAssists,
      team_kda: totalDeaths > 0 ? ((totalKills + totalAssists) / totalDeaths).toFixed(2) : totalKills + totalAssists,
      average_net_worth: Math.round(avgNetWorth)
    };
  }

  // ============================================================================
  // REAL-TIME SUBSCRIPTIONS (OPTIONAL)
  // ============================================================================

  subscribeToOffers(roundId, callback) {
    // NEW: Subscribe to offer changes in real-time
    return this.client
      .channel(`offers:${roundId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'offers',
          filter: `round_id=eq.${roundId}`
        },
        callback
      )
      .subscribe();
  }

  subscribeToMatchEvents(matchId, callback) {
    // NEW: Subscribe to match events in real-time
    return this.client
      .channel(`match_events:${matchId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'match_events',
          filter: `match_id=eq.${matchId}`
        },
        callback
      )
      .subscribe();
  }

  unsubscribe(subscription) {
    // NEW: Unsubscribe from real-time channel
    if (subscription) {
      this.client.removeChannel(subscription);
    }
  }
}

// Singleton instance
const supabase = new SupabaseClient();

module.exports = supabase;