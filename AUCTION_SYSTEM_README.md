# Dota 2 Auction Game Tracker

## Overview
This application tracks a custom Dota 2 auction-style competition using Game State Integration (GSI), Supabase for data persistence, and Jitsi Meet for voice chat.

## Features

### ✅ Game Management
- Match creation and tracking
- Round-based gameplay
- Automatic gold calculations
- Player transfers between teams
- Win detection

### ✅ Voice Chat (Jitsi Integration)
- **Main Room**: All players together during gameplay
- **Auction Room**: Private chat for losing team during auction phase
- **Automatic Room Switching**: Players move between rooms based on game phase
- **Self-Hosted Option**: Can use your own Jitsi server

### ✅ Data Tracking
- Player statistics (K/D/A)
- Hero selections
- Gold balances
- Team compositions
- Complete match history

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Set Up Supabase

1. Create a new project at [supabase.com](https://supabase.com)
2. Run the SQL schema from `Supabase Database Schema` artifact in your Supabase SQL editor
3. Get your project URL and anon/public API key from Settings → API

### 3. Configure GSI

Copy `gameEventsCfg/Dota2GSI.cfg` to:
- **Windows**: `C:\Program Files (x86)\Steam\steamapps\common\dota 2 beta\game\dota\cfg\gamestate_integration\`
- **Linux**: `~/.steam/steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/`

### 4. (Optional) Set Up Custom Jitsi Server

By default, the app uses the public Jitsi Meet server (meet.jit.si). For better performance and privacy, you can:
- Host your own Jitsi server ([Jitsi Setup Guide](https://jitsi.github.io/handbook/docs/devops-guide/devops-guide-quickstart))
- Use the app's settings to change the Jitsi domain

### 5. Run the Application
```bash
npm start
```

On first launch, you'll be prompted to enter your Supabase URL and API key.

## Game Flow

### 1. Start Match
- Enter match name
- Add players with their Steam IDs and initial team assignments
- Players join the main Jitsi voice chat room
- Click "Start Match"

### 2. Play Round
- All players are in the main voice chat
- Players join the custom Dota 2 game
- GSI automatically tracks game state
- When round ends, click "End Round" and select winning team

### 3. Auction Phase
**Automatic Voice Chat Transition:**
- Losing team members are automatically moved to a private Jitsi room
- Winning team stays in the main room
- Losing team can discuss offers privately

**Making Offers (Winning Team):**
- Each member selects a teammate to offer
- Set gold amount (500-2000 base, scaling each round)
- Submit offer

**Accepting Offers (Losing Team):**
- Review all incoming offers in private chat
- Discuss and select one offer to accept
- Click "Accept Offer"

**After Acceptance:**
- All players automatically return to main voice chat
- Offered player transfers to losing team
- Offering player receives gold
- Teams reshuffle

### 4. Continue
- Next round starts
- Repeat until one player wins solo

## Voice Chat Details

### Room Management
```
Match Start → Main Room (All Players)
     ↓
Round Ends → Losing Team → Auction Room (Private)
             Winning Team → Stay in Main Room
     ↓
Offer Accepted → All Players → Return to Main Room
     ↓
Next Round → Stay in Main Room
```

### Room Types

**Main Room:**
- All players together
- Open communication
- Used during gameplay and between rounds

**Auction Room:**
- Losing team only
- Private discussion space
- Used during auction phase
- New room created each auction phase for privacy

### Jitsi Features Available
- Audio/Video toggle
- Screen sharing
- Text chat
- Participant list
- Settings

## Gold Mechanics

### Round Win
- Losing team: Each player loses 50% of current gold
- Winning team: Each player gains 1000 + equal share of lost gold

### Offers
- Round 1: 500-2000 gold
- Each subsequent round:
  - Minimum increases by 250
  - Maximum increases by 500

### Transfers
- Offering player receives the gold amount
- Offered player transfers to losing team

## API Reference

### IPC Handlers

```javascript
// Start a new match
ipcRenderer.invoke('start-match', {
  matchName: 'Tournament Finals',
  players: [
    { steamId: '76561198...', username: 'Player1', team: 'team1' },
    { steamId: '76561198...', username: 'Player2', team: 'teamA' }
  ]
})

// End current round
ipcRenderer.invoke('end-round', {
  dotaMatchId: '123456789',
  customGameName: 'Custom Game',
  winningTeam: 'team1',
  playerStats: {
    '76561198...': { hero: 'pudge', kills: 5, deaths: 2, assists: 10 }
  }
})

// Create offer
ipcRenderer.invoke('create-offer', {
  offeringPlayerSteamId: '76561198...',
  offeredPlayerSteamId: '76561198...',
  goldAmount: 1500
})

// Accept offer
ipcRenderer.invoke('accept-offer', {
  offerId: 'uuid...'
})

// Get Jitsi configuration
ipcRenderer.invoke('get-jitsi-config', {
  playerSteamId: '76561198...',
  isLosingTeam: true,
  phase: 'auction'
})

// Set custom Jitsi domain
ipcRenderer.invoke('set-jitsi-domain', {
  domain: 'meet.yourdomain.com'
})

// Get current match state
ipcRenderer.invoke('get-current-state')

// Get match data from database
ipcRenderer.invoke('get-match-data', {
  matchId: 'uuid...'
})
```

### Events

```javascript
// Listen for match events
ipcRenderer.on('match-started', (event, data) => {
  // data includes jitsi.mainRoomName and jitsi.domain
})

ipcRenderer.on('round-ended', (event, data) => {
  // data includes jitsi.auctionRoomName and jitsi.losingTeamPlayers
})

ipcRenderer.on('offer-created', (event, data) => {})

ipcRenderer.on('offer-accepted', (event, data) => {
  // data includes jitsi room info for return to main
})

ipcRenderer.on('match-ended', (event, data) => {})

// Jitsi-specific events
ipcRenderer.on('jitsi-room-created', (event, data) => {})
ipcRenderer.on('jitsi-auction-room-created', (event, data) => {})
ipcRenderer.on('jitsi-return-to-main', (event, data) => {})

// GSI events
ipcRenderer.on('game-state-update', (event, data) => {})
```

## Database Schema

See `Supabase Database Schema` artifact for complete schema.

### Key Tables
- `players` - Player profiles
- `matches` - Match records
- `match_participants` - Player rosters and gold
- `rounds` - Individual game rounds
- `round_participants` - Player stats per round
- `offers` - Auction offers
- `transfers` - Player team changes

## Development Notes

### File Structure
```
src/
├── main/
│   ├── index.js              # Main process with Jitsi integration
│   ├── gsi-server.js         # GSI HTTP server
│   ├── auction-manager.js    # Auction logic
│   ├── jitsi-manager.js      # Voice chat room management
│   └── supabase-client.js    # Database client
├── renderer/
│   ├── setup.html            # Supabase setup
│   ├── index.html            # Main dashboard
│   ├── jitsi-component.html  # Jitsi voice chat UI
│   ├── overlay.html          # In-game overlay
│   ├── css/
│   │   └── styles.css
│   └── js/
│       ├── setup.js
│       ├── auction.js
│       ├── jitsi.js          # Jitsi room management
│       └── overlay.js
```

### Jitsi Room Naming Convention
```
Main Room: dota-auction-{matchId}-main
Auction Room: dota-auction-{matchId}-auction-{uuid}
```
Each auction phase gets a new UUID for privacy.

## Troubleshooting

### GSI Not Working
1. Verify config file location
2. Completely restart Dota 2
3. Check console for requests
4. Test with `http://localhost:3000/test`

### Supabase Errors
1. Verify URL and API key
2. Check RLS policies
3. Review console logs
4. Confirm schema is created

### Jitsi Connection Issues
1. Check firewall settings
2. Verify internet connection
3. Try different Jitsi server
4. Check browser console for errors

### Voice Chat Not Switching Rooms
1. Verify player Steam IDs match
2. Check team assignments
3. Review console logs for Jitsi events
4. Ensure auction phase triggered correctly

### Gold Calculations Wrong
1. Check team assignments
2. Verify round number
3. Review playerGoldBalances map
4. Check database records

## Privacy & Security

### Jitsi Privacy
- Each auction room uses a unique UUID
- Rooms are temporary and disposed after use
- Only invited players know the room names
- Consider self-hosting for maximum privacy

### Supabase Security
- Use Row Level Security (RLS) policies
- Keep API keys secure
- Consider auth integration for production
- Regular backups recommended