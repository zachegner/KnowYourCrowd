const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const { startServer, stopServer, getServerInfo } = require('./server');
const DatabaseService = require('../services/database');
const fs = require('fs');

let mainWindow;
let serverInfo = null;
let db = null;

// Config file path
const configPath = path.join(__dirname, '..', 'config', 'default-config.json');

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: false,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '..', 'src', 'assets', 'images', 'icon.png'),
    title: 'Know Your Crowd',
    backgroundColor: '#36454F'
  });

  // Remove menu bar
  mainWindow.setMenuBarVisibility(false);

  // Load the main screen from the Express server so CSS/JS paths resolve correctly
  // serverInfo is set before createWindow is called
  mainWindow.loadURL(`http://localhost:${serverInfo.port}/display`);

  // Open DevTools in development
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeApp() {
  // Initialize database
  const dbPath = path.join(app.getPath('userData'), 'know-your-crowd.db');
  db = new DatabaseService(dbPath);
  
  try {
    db.initialize();
    console.log('Database initialized successfully');
    
    // Clean up old games (7+ days)
    const cleaned = db.cleanupOldGames(7);
    if (cleaned > 0) {
      console.log(`Cleaned up ${cleaned} old game(s)`);
    }
  } catch (err) {
    console.error('Database initialization failed:', err);
    dialog.showErrorBox('Database Error', 'Failed to initialize the database. The app may not function correctly.');
  }

  // Load config and check for API key
  let config;
  try {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    // Override with environment variable if set
    if (process.env.ANTHROPIC_API_KEY) {
      config.apiKey = process.env.ANTHROPIC_API_KEY;
    }
  } catch (err) {
    console.error('Failed to load config:', err);
    config = { apiKey: process.env.ANTHROPIC_API_KEY || '' };
  }

  // Start the server (pass database instance)
  try {
    serverInfo = await startServer(config, db);
    console.log(`Server started at http://${serverInfo.localIP}:${serverInfo.port}`);
  } catch (err) {
    console.error('Failed to start server:', err);
    dialog.showErrorBox('Server Error', 'Failed to start the game server. Please try again.');
    app.quit();
    return;
  }

  createWindow();

  // Send server info to renderer once window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    // Only send serializable data to renderer
    const serializableInfo = {
      port: serverInfo.port,
      localIP: serverInfo.localIP,
      url: serverInfo.url,
      roomCode: serverInfo.roomCode
    };
    mainWindow.webContents.send('server-info', serializableInfo);
    
    // Check if API key needs to be set
    if (!config.apiKey || config.apiKey === 'YOUR_ANTHROPIC_API_KEY_HERE') {
      mainWindow.webContents.send('show-api-setup');
    }
  });
}

// App lifecycle
app.whenReady().then(initializeApp);

app.on('window-all-closed', () => {
  stopServer();
  if (db) {
    db.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    initializeApp();
  }
});

app.on('before-quit', () => {
  stopServer();
  if (db) {
    db.close();
  }
});

// IPC handlers
ipcMain.handle('get-server-info', () => {
  if (!serverInfo) return null;
  // Only return serializable data
  return {
    port: serverInfo.port,
    localIP: serverInfo.localIP,
    url: serverInfo.url,
    roomCode: serverInfo.roomCode
  };
});

ipcMain.handle('save-api-key', async (event, apiKey) => {
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config.apiKey = apiKey;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
    
    // Update running server with new API key
    if (serverInfo && serverInfo.updateApiKey) {
      serverInfo.updateApiKey(apiKey);
    }
    
    return { success: true };
  } catch (err) {
    console.error('Failed to save API key:', err);
    return { success: false, error: err.message };
  }
});

ipcMain.handle('get-config', () => {
  try {
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    return null;
  }
});

ipcMain.handle('save-config', async (event, newConfig) => {
  try {
    fs.writeFileSync(configPath, JSON.stringify(newConfig, null, 2));
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle('toggle-fullscreen', () => {
  if (mainWindow) {
    mainWindow.setFullScreen(!mainWindow.isFullScreen());
    return mainWindow.isFullScreen();
  }
  return false;
});
