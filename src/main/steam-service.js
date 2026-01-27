const axios = require('axios');

class SteamService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseUrl = 'https://api.steampowered.com';
  }

  /**
   * Fetch Steam profile data (username and avatar)
   * @param {string} steamId - 64-bit Steam ID
   * @returns {Object} - { username, avatarUrl, profileUrl }
   */
  async getPlayerSummary(steamId) {
    try {
      if (!this.apiKey) {
        console.warn('[Steam] No API key configured, using Steam ID as username');
        return {
          username: `Player_${steamId.slice(-4)}`,
          avatarUrl: null,
          profileUrl: `https://steamcommunity.com/profiles/${steamId}`
        };
      }

      const url = `${this.baseUrl}/ISteamUser/GetPlayerSummaries/v0002/`;
      const response = await axios.get(url, {
        params: {
          key: this.apiKey,
          steamids: steamId
        }
      });

      if (response.data && response.data.response && response.data.response.players.length > 0) {
        const player = response.data.response.players[0];
        
        return {
          username: player.personaname || `Player_${steamId.slice(-4)}`,
          avatarUrl: player.avatarfull || player.avatarmedium || player.avatar,
          profileUrl: player.profileurl || `https://steamcommunity.com/profiles/${steamId}`,
          realName: player.realname || null,
          countryCode: player.loccountrycode || null
        };
      }

      // Fallback if no data returned
      return {
        username: `Player_${steamId.slice(-4)}`,
        avatarUrl: null,
        profileUrl: `https://steamcommunity.com/profiles/${steamId}`
      };
    } catch (error) {
      console.error('[Steam] Error fetching player summary:', error.message);
      
      // Return fallback data
      return {
        username: `Player_${steamId.slice(-4)}`,
        avatarUrl: null,
        profileUrl: `https://steamcommunity.com/profiles/${steamId}`
      };
    }
  }

  /**
   * Validate Steam ID format (64-bit Steam ID)
   * @param {string} steamId 
   * @returns {boolean}
   */
  isValidSteamId(steamId) {
    // 64-bit Steam IDs are 17 digits starting with 7656119
    const regex = /^7656119[0-9]{10}$/;
    return regex.test(steamId);
  }

  /**
   * Get multiple player summaries at once
   * @param {Array<string>} steamIds - Array of Steam IDs
   * @returns {Array<Object>}
   */
  async getMultiplePlayerSummaries(steamIds) {
    if (!steamIds || steamIds.length === 0) return [];

    try {
      if (!this.apiKey) {
        return steamIds.map(id => ({
          steamId: id,
          username: `Player_${id.slice(-4)}`,
          avatarUrl: null,
          profileUrl: `https://steamcommunity.com/profiles/${id}`
        }));
      }

      // Steam API allows up to 100 Steam IDs per request
      const chunks = this.chunkArray(steamIds, 100);
      const results = [];

      for (const chunk of chunks) {
        const url = `${this.baseUrl}/ISteamUser/GetPlayerSummaries/v0002/`;
        const response = await axios.get(url, {
          params: {
            key: this.apiKey,
            steamids: chunk.join(',')
          }
        });

        if (response.data && response.data.response && response.data.response.players) {
          results.push(...response.data.response.players.map(player => ({
            steamId: player.steamid,
            username: player.personaname,
            avatarUrl: player.avatarfull || player.avatarmedium || player.avatar,
            profileUrl: player.profileurl
          })));
        }
      }

      return results;
    } catch (error) {
      console.error('[Steam] Error fetching multiple player summaries:', error.message);
      return steamIds.map(id => ({
        steamId: id,
        username: `Player_${id.slice(-4)}`,
        avatarUrl: null,
        profileUrl: `https://steamcommunity.com/profiles/${id}`
      }));
    }
  }

  chunkArray(array, size) {
    const chunks = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

module.exports = SteamService;
