const EventEmitter = require('events');
const { v4: uuidv4 } = require('uuid');

class JitsiManager extends EventEmitter {
  constructor() {
    super();
    this.mainRoomName = null;
    this.auctionRoomName = null;
    this.currentRoom = null;
    this.jitsiDomain = 'meet.jit.si'; // Can be customized to self-hosted
    this.sessionId = null; // Unique ID for the app session
    this.isMainRoomAvailable = false;
  }

  /**
   * Initialize main room on app start
   * This room is always available for players to join
   */
  initializeMainRoom() {
    // Create a unique session ID for this app instance
    this.sessionId = uuidv4();
    this.mainRoomName = `dota-auction-session-${this.sessionId}`;
    this.currentRoom = this.mainRoomName;
    this.isMainRoomAvailable = true;

    console.log('[Jitsi] Main room initialized and available');
    console.log('[Jitsi] Main room:', this.mainRoomName);
    console.log('[Jitsi] Players can join anytime for coordination');
    
    this.emit('main-room-ready', {
      type: 'main',
      roomName: this.mainRoomName,
      domain: this.jitsiDomain,
      available: true
    });

    return {
      mainRoomName: this.mainRoomName,
      domain: this.jitsiDomain,
      sessionId: this.sessionId
    };
  }

  /**
   * Optional: Update main room name when match starts
   * This keeps the same room but with a more descriptive name
   */
  updateMainRoomForMatch(matchId, matchName) {
    console.log('[Jitsi] Match started:', matchName);
    console.log('[Jitsi] Main room remains active for all players');
    
    // Keep the same room, just update metadata
    this.emit('match-started', {
      type: 'main',
      roomName: this.mainRoomName,
      domain: this.jitsiDomain,
      matchId: matchId,
      matchName: matchName
    });

    return {
      mainRoomName: this.mainRoomName,
      domain: this.jitsiDomain
    };
  }

  /**
   * Move losing team to private auction room
   * Returns room info for losing team members to join
   */
  startAuctionPhase(losingTeamPlayers, roundNumber) {
    // Generate new auction room for this round
    this.auctionRoomName = `dota-auction-${this.sessionId}-round${roundNumber}-${uuidv4()}`;
    
    console.log('[Jitsi] Auction phase started for round', roundNumber);
    console.log('[Jitsi] Auction room:', this.auctionRoomName);
    console.log('[Jitsi] Losing team players:', losingTeamPlayers);
    console.log('[Jitsi] Winning team remains in main room');

    this.emit('auction-room-created', {
      type: 'auction',
      roomName: this.auctionRoomName,
      domain: this.jitsiDomain,
      participants: losingTeamPlayers,
      roundNumber: roundNumber
    });

    return {
      mainRoomName: this.mainRoomName,
      auctionRoomName: this.auctionRoomName,
      domain: this.jitsiDomain,
      losingTeamPlayers,
      roundNumber
    };
  }

  /**
   * Move everyone back to main room after offer accepted
   */
  endAuctionPhase() {
    console.log('[Jitsi] Auction phase ended - all players return to main room');
    
    this.emit('return-to-main', {
      type: 'main',
      roomName: this.mainRoomName,
      domain: this.jitsiDomain
    });

    // Clear auction room reference
    const previousAuctionRoom = this.auctionRoomName;
    this.auctionRoomName = null;

    return {
      roomName: this.mainRoomName,
      domain: this.jitsiDomain,
      previousAuctionRoom
    };
  }

  /**
   * Get configuration for a specific player
   * Returns which room they should be in based on team and phase
   */
  getPlayerRoomConfig(playerSteamId, isLosingTeam, phase) {
    // During auction phase, losing team goes to auction room
    if (phase === 'auction' && isLosingTeam && this.auctionRoomName) {
      return {
        roomName: this.auctionRoomName,
        domain: this.jitsiDomain,
        type: 'auction'
      };
    }

    // Everyone else (or when not in auction) uses main room
    return {
      roomName: this.mainRoomName,
      domain: this.jitsiDomain,
      type: 'main'
    };
  }

  /**
   * Get main room info (always available)
   */
  getMainRoomInfo() {
    return {
      roomName: this.mainRoomName,
      domain: this.jitsiDomain,
      type: 'main',
      available: this.isMainRoomAvailable,
      sessionId: this.sessionId
    };
  }

  /**
   * Clean up on app close
   */
  cleanup() {
    console.log('[Jitsi] Cleaning up rooms');
    
    this.emit('cleanup', {
      mainRoomName: this.mainRoomName,
      sessionId: this.sessionId
    });

    this.mainRoomName = null;
    this.auctionRoomName = null;
    this.currentRoom = null;
    this.sessionId = null;
    this.isMainRoomAvailable = false;
  }

  /**
   * Set custom Jitsi domain (for self-hosted instances)
   */
  setJitsiDomain(domain) {
    this.jitsiDomain = domain;
    console.log('[Jitsi] Domain updated to:', domain);
    
    // Notify all clients of domain change
    this.emit('domain-changed', {
      domain: domain,
      mainRoomName: this.mainRoomName
    });
  }

  getCurrentState() {
    return {
      mainRoomName: this.mainRoomName,
      auctionRoomName: this.auctionRoomName,
      currentRoom: this.currentRoom,
      domain: this.jitsiDomain,
      sessionId: this.sessionId,
      isMainRoomAvailable: this.isMainRoomAvailable
    };
  }
}

module.exports = JitsiManager;