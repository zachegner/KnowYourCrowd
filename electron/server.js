const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const { v4: uuidv4 } = require('uuid');

const GameLogic = require('../services/game-logic');
const RoomManager = require('../services/room-manager');
const ClaudeService = require('../services/claude-service');
const ScoreCalculator = require('../services/score-calculator');

let app, server, io;
let config = {};
let gameLogic, roomManager, claudeService, scoreCalculator;

// Get local IP address
function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Find available port
function findAvailablePort(startPort = 3000) {
  return new Promise((resolve, reject) => {
    const testServer = http.createServer();
    testServer.listen(startPort, () => {
      const port = testServer.address().port;
      testServer.close(() => resolve(port));
    });
    testServer.on('error', () => {
      resolve(findAvailablePort(startPort + 1));
    });
  });
}

async function startServer(appConfig) {
  config = appConfig;
  
  app = express();
  server = http.createServer(app);
  io = new Server(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Initialize services
  roomManager = new RoomManager();
  scoreCalculator = new ScoreCalculator(config);
  claudeService = new ClaudeService(config);
  gameLogic = new GameLogic(io, roomManager, claudeService, scoreCalculator, config);

  // Serve static files
  app.use('/styles', express.static(path.join(__dirname, '..', 'src', 'styles')));
  app.use('/scripts', express.static(path.join(__dirname, '..', 'src', 'scripts')));
  app.use('/assets', express.static(path.join(__dirname, '..', 'src', 'assets')));

  // Routes
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'src', 'views', 'player-phone.html'));
  });

  app.get('/host', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'src', 'views', 'host-phone.html'));
  });

  app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'src', 'views', 'main-screen.html'));
  });

  // Test pages
  app.get('/test/matching', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'src', 'views', 'test-matching-ui.html'));
  });

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', roomCode: roomManager.getCurrentRoomCode() });
  });

  // QR Code endpoint
  app.get('/qr', async (req, res) => {
    const localIP = getLocalIP();
    const port = server.address()?.port || config.serverPort;
    const roomCode = roomManager.getCurrentRoomCode();
    const url = `http://${localIP}:${port}?room=${roomCode}`;
    
    try {
      const qrDataUrl = await QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: {
          dark: '#3E2723',
          light: '#F4E8C1'
        }
      });
      res.json({ qr: qrDataUrl, url, roomCode: roomManager.getCurrentRoomCode() });
    } catch (err) {
      res.status(500).json({ error: 'Failed to generate QR code' });
    }
  });

  // API endpoint for game state
  app.get('/api/game-state', (req, res) => {
    res.json(gameLogic.getGameState());
  });

  // Socket.io connection handling
  io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    // Player joining
    socket.on('join_room', (data) => {
      gameLogic.handlePlayerJoin(socket, data);
    });

    // Host joining
    socket.on('join_as_display', () => {
      gameLogic.handleDisplayJoin(socket);
    });

    // Host phone joining
    socket.on('join_as_host_phone', (data) => {
      gameLogic.handleHostPhoneJoin(socket, data);
    });

    // Start game
    socket.on('start_game', () => {
      gameLogic.handleStartGame(socket);
    });

    // Start game from display/main screen
    socket.on('display_start_game', () => {
      gameLogic.handleDisplayStartGame(socket);
    });

    // Request themes
    socket.on('request_themes', () => {
      gameLogic.handleRequestThemes(socket);
    });

    // Host selects theme
    socket.on('host_select_theme', (data) => {
      gameLogic.handleThemeSelect(socket, data);
    });

    // Player submits answer
    socket.on('submit_answer', (data) => {
      gameLogic.handleAnswerSubmit(socket, data);
    });

    // Host requests matching data (fallback for missed events)
    socket.on('request_matching_data', () => {
      gameLogic.handleRequestMatchingData(socket);
    });

    // Host submits matches
    socket.on('host_submit_matches', (data) => {
      gameLogic.handleMatchesSubmit(socket, data);
    });

    // Request next round
    socket.on('next_round', () => {
      gameLogic.handleNextRound(socket);
    });

    // Play again
    socket.on('play_again', () => {
      gameLogic.handlePlayAgain(socket);
    });

    // Disconnect handling
    socket.on('disconnect', () => {
      console.log('Client disconnected:', socket.id);
      gameLogic.handleDisconnect(socket);
    });

    // Reconnection
    socket.on('reconnect_player', (data) => {
      gameLogic.handleReconnect(socket, data);
    });
  });

  // Find and use available port
  const port = config.serverPort || await findAvailablePort(3000);
  
  return new Promise((resolve, reject) => {
    server.listen(port, () => {
      const localIP = getLocalIP();
      const roomCode = roomManager.createRoom();
      
      const serverInfo = {
        port,
        localIP,
        url: `http://${localIP}:${port}`,
        roomCode,
        updateApiKey: (newKey) => {
          config.apiKey = newKey;
          claudeService.updateApiKey(newKey);
        }
      };
      
      resolve(serverInfo);
    });
    
    server.on('error', reject);
  });
}

function stopServer() {
  if (server) {
    io.close();
    server.close();
    console.log('Server stopped');
  }
}

function getServerInfo() {
  if (!server) return null;
  
  return {
    port: server.address()?.port,
    localIP: getLocalIP(),
    roomCode: roomManager?.getCurrentRoomCode()
  };
}

module.exports = { startServer, stopServer, getServerInfo };
