const { createClient } = require('@supabase/supabase-js');
const Store = require('electron-store');

const store = new Store();

class SupabaseClient {
  constructor() {
    this.client = null;
    this.initialized = false;
  }

  initialize(supabaseUrl, supabaseKey) {
    if (!supabaseUrl || !supabaseKey) {
      console.error('[Supabase] Missing URL or API key');
      return false;
    }

    try {
      this.client = createClient(supabaseUrl, supabaseKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
        db: {
          schema: 'public',
        },
        global: {
          headers: {
            Prefer: 'return=representation',
          },
        },
      });

      this.initialized = true;

      store.set('supabase.url', supabaseUrl);
      store.set('supabase.key', supabaseKey);

      console.log('[Supabase] Client initialized successfully');
      this.testConnection();

      return true;
    } catch (error) {
      console.error('[Supabase] Initialization error:', error);
      return false;
    }
  }

  async testConnection() {
    try {
      const { error } = await this.client
        .from('matches')
        .select('id')
        .limit(1);

      if (error) {
        console.error('[Supabase] Connection test failed:', error);
      } else {
        console.log('[Supabase] Connection test successful');
      }
    } catch (error) {
      console.error('[Supabase] Connection test error:', error);
    }
  }

  loadFromStore() {
    const url = store.get('supabase.url');
    const key = store.get('supabase.key');
    return url && key ? this.initialize(url, key) : false;
  }

  isInitialized() {
    return this.initialized;
  }

  /* =======================
     Player operations
  ======================= */

  async upsertPlayer(steamId, username, avatarUrl = null, profileUrl = null) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('players')
      .upsert(
        {
          steam_id: steamId,
          username,
          avatar_url: avatarUrl,
          profile_url: profileUrl,
          last_login: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'steam_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error upserting player:', error);
      throw error;
    }

    return data;
  }

  async updatePlayerLogin(steamId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('players')
      .update({ last_login: new Date().toISOString() })
      .eq('steam_id', steamId)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error updating player login:', error);
      throw error;
    }

    return data;
  }

  async getPlayer(steamId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('players')
      .select('*')
      .eq('steam_id', steamId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('[Supabase] Error getting player:', error);
      throw error;
    }

    return data;
  }

  async getAllPlayers() {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('players')
      .select('*')
      .order('last_login', { ascending: false });

    if (error) {
      console.error('[Supabase] Error getting all players:', error);
      throw error;
    }

    return data;
  }

  /* =======================
     Match operations
  ======================= */

  async createMatch(matchName) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('matches')
      .insert({
        match_name: matchName,
        status: 'active',
        current_round: 0,
      })
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error creating match:', error);
      throw error;
    }

    return data;
  }

  async updateMatch(matchId, updates) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('matches')
      .update(updates)
      .eq('id', matchId)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error updating match:', error);
      throw error;
    }

    return data;
  }

  async getMatch(matchId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('matches')
      .select('*')
      .eq('id', matchId)
      .single();

    if (error) {
      console.error('[Supabase] Error getting match:', error);
      throw error;
    }

    return data;
  }

  /* =======================
     Match participants
  ======================= */

  async addMatchParticipant(matchId, playerSteamId, initialTeam) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('match_participants')
      .insert({
        match_id: matchId,
        player_steam_id: playerSteamId,
        initial_team: initialTeam,
        current_gold: 1000,
      })
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error adding match participant:', error);
      throw error;
    }

    return data;
  }

  async updateParticipantGold(matchId, playerSteamId, goldAmount) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('match_participants')
      .update({ current_gold: goldAmount })
      .eq('match_id', matchId)
      .eq('player_steam_id', playerSteamId)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error updating participant gold:', error);
      throw error;
    }

    return data;
  }

  async getMatchParticipants(matchId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('match_participants')
      .select('*, players(*)')
      .eq('match_id', matchId);

    if (error) {
      console.error('[Supabase] Error getting match participants:', error);
      throw error;
    }

    return data;
  }

  /* =======================
     Rounds
  ======================= */

  async createRound(matchId, roundNumber, dotaMatchId, customGameName, winningTeam) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('rounds')
      .insert({
        match_id: matchId,
        round_number: roundNumber,
        dota_match_id: dotaMatchId,
        custom_game_name: customGameName,
        winning_team: winningTeam,
      })
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error creating round:', error);
      throw error;
    }

    return data;
  }

  async getRoundsByMatch(matchId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('rounds')
      .select('*')
      .eq('match_id', matchId)
      .order('round_number', { ascending: true });

    if (error) {
      console.error('[Supabase] Error getting rounds:', error);
      throw error;
    }

    return data;
  }

  /* =======================
     Offers
  ======================= */

  async createOffer(roundId, offeringPlayerSteamId, offeredPlayerSteamId, goldAmount) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('offers')
      .insert({
        round_id: roundId,
        offering_player_steam_id: offeringPlayerSteamId,
        offered_player_steam_id: offeredPlayerSteamId,
        gold_amount: goldAmount,
        is_accepted: false,
      })
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error creating offer:', error);
      throw error;
    }

    return data;
  }

  async acceptOffer(offerId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('offers')
      .update({ is_accepted: true })
      .eq('id', offerId)
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error accepting offer:', error);
      throw error;
    }

    return data;
  }

  async getOffersByRound(roundId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('offers')
      .select(`
        *,
        offering_player:players!offers_offering_player_steam_id_fkey(*),
        offered_player:players!offers_offered_player_steam_id_fkey(*)
      `)
      .eq('round_id', roundId);

    if (error) {
      console.error('[Supabase] Error getting offers:', error);
      throw error;
    }

    return data;
  }

  /* =======================
     Transfers
  ======================= */

  async createTransfer(matchId, roundId, playerSteamId, fromTeam, toTeam, goldPaid) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('transfers')
      .insert({
        match_id: matchId,
        round_id: roundId,
        player_steam_id: playerSteamId,
        from_team: fromTeam,
        to_team: toTeam,
        gold_paid: goldPaid,
      })
      .select()
      .single();

    if (error) {
      console.error('[Supabase] Error creating transfer:', error);
      throw error;
    }

    return data;
  }

  async getTransfersByMatch(matchId) {
    if (!this.initialized) throw new Error('Supabase not initialized');

    const { data, error } = await this.client
      .from('transfers')
      .select('*, players(*)')
      .eq('match_id', matchId)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('[Supabase] Error getting transfers:', error);
      throw error;
    }

    return data;
  }
}

module.exports = new SupabaseClient();
