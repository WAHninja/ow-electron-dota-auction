const express = require('express');
const bodyParser = require('body-parser');
const EventEmitter = require('events');
const fs = require('fs');
const path = require('path');

class GSIServer extends EventEmitter {
  constructor(port = 3000) {
    super();
    this.port = port;
    this.app = express();
    this.server = null;
    this.previousState = null;
    this.lastReceived = null;
    this.requestCount = 0;

    // Create logs directory
    const logsDir = path.join(__dirname, '../../logs');
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    this.logFile = path.join(logsDir, 'gsi-debug.log');

    // CRITICAL: Parse body as text first, then try JSON
    this.app.use(bodyParser.text({ type: '*/*' }));

    // Log all incoming requests with details
    this.app.use((req, res, next) => {
      this.requestCount++;
      const logMsg = `\n[${new Date().toISOString()}] Request #${this.requestCount}
Method: ${req.method}
Path: ${req.path}
Headers: ${JSON.stringify(req.headers, null, 2)}
Body Type: ${typeof req.body}
Body Length: ${req.body ? req.body.length : 0}
Body Preview: ${req.body ? req.body.substring(0, 500) : 'empty'}
---`;
      
      console.log(logMsg);
      this.logToFile(logMsg);
      next();
    });

    // Main GSI endpoint - handle POST from Dota 2
    this.app.post('/', (req, res) => {
      console.log('[GSI] ✓ POST request received from Dota 2');
      
      let gameData = null;
      
      try {
        // Try to parse as JSON
        if (typeof req.body === 'string') {
          gameData = JSON.parse(req.body);
          console.log('[GSI] Successfully parsed JSON from string body');
        } else if (typeof req.body === 'object') {
          gameData = req.body;
          console.log('[GSI] Body is already an object');
        }
      } catch (e) {
        console.error('[GSI] Failed to parse body as JSON:', e.message);
        this.logToFile(`Parse error: ${e.message}\nBody: ${req.body}`);
      }

      if (gameData) {
        console.log('[GSI] Game data keys:', Object.keys(gameData));
        this.logToFile(`Game data received: ${JSON.stringify(gameData, null, 2)}`);
        this.handleGameState(gameData);
      } else {
        console.error('[GSI] No game data could be extracted');
      }
      
      res.status(200).send('OK');
    });

    // Health check endpoint
    this.app.get('/', (req, res) => {
      const status = {
        status: 'running',
        port: this.port,
        requestCount: this.requestCount,
        lastReceived: this.lastReceived,
        message: this.lastReceived 
          ? `GSI Server is running. Last data received at ${new Date(this.lastReceived).toLocaleTimeString()}`
          : 'GSI Server is running. Waiting for Dota 2 data...',
        help: 'POST game state data to this endpoint'
      };
      res.json(status);
    });

    // Status endpoint for detailed info
    this.app.get('/status', (req, res) => {
      res.json({
        status: 'running',
        port: this.port,
        requestCount: this.requestCount,
        lastReceived: this.lastReceived,
        hasData: !!this.previousState,
        uptime: process.uptime(),
        logFile: this.logFile
      });
    });

    // Test endpoint to simulate Dota 2 data
    this.app.get('/test', (req, res) => {
      const testData = {
        provider: { name: "test", appid: 570, version: 1 },
        map: { 
          name: "test_map",
          matchid: "123456789",
          game_time: 0,
          clock_time: 0,
          game_state: "DOTA_GAMERULES_STATE_GAME_IN_PROGRESS",
          customgamename: ""
        },
        player: {
          steamid: "12345678901234567",
          name: "TestPlayer",
          team_name: "radiant"
        },
        hero: {
          name: "npc_dota_hero_pudge",
          level: 1,
          alive: true
        }
      };
      
      console.log('[GSI] Sending test data');
      this.handleGameState(testData);
      res.json({ message: 'Test data sent', data: testData });
    });
  }

  logToFile(message) {
    try {
      fs.appendFileSync(this.logFile, message + '\n');
    } catch (e) {
      console.error('[GSI] Failed to write to log file:', e.message);
    }
  }

  handleGameState(data) {
    console.log('[GSI] ✓ Processing game state data');
    console.log('[GSI] Data structure:', JSON.stringify(data, null, 2).substring(0, 500));
    
    this.lastReceived = Date.now();
    this.emit('game-state', data);
    this.previousState = data;
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      console.log('\n========================================');
      console.log(`[GSI] Server listening on http://localhost:${this.port}`);
      console.log('[GSI] Waiting for Dota 2 to send game state data...');
      console.log('[GSI] Debug log file:', this.logFile);
      console.log('\n[GSI] TROUBLESHOOTING:');
      console.log('[GSI] 1. Make sure Dota 2 is COMPLETELY RESTARTED after adding the config file');
      console.log('[GSI] 2. Config file location:');
      console.log('[GSI]    Windows: C:\\Program Files (x86)\\Steam\\steamapps\\common\\dota 2 beta\\game\\dota\\cfg\\gamestate_integration\\Dota2GSI.cfg');
      console.log('[GSI]    Linux: ~/.steam/steam/steamapps/common/dota 2 beta/game/dota/cfg/gamestate_integration/Dota2GSI.cfg');
      console.log('[GSI] 3. Test the server: http://localhost:3000/test');
      console.log('[GSI] 4. Check this console for incoming requests');
      console.log('========================================\n');
    });

    this.server.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`[GSI] ERROR: Port ${this.port} is already in use!`);
        console.error('[GSI] Please close any other applications using this port and restart the app.');
      } else {
        console.error('[GSI] Server error:', error);
      }
    });
  }

  stop() {
    if (this.server) {
      this.server.close(() => {
        console.log('[GSI] Server stopped');
      });
    }
  }
}

module.exports = GSIServer;