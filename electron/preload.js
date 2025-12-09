const { contextBridge, ipcRenderer } = require('electron');

// Expose protected methods that allow the renderer process to use
// the ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Server info
  getServerInfo: () => ipcRenderer.invoke('get-server-info'),
  onServerInfo: (callback) => ipcRenderer.on('server-info', (event, data) => callback(data)),
  
  // API key setup
  onShowApiSetup: (callback) => ipcRenderer.on('show-api-setup', () => callback()),
  saveApiKey: (apiKey) => ipcRenderer.invoke('save-api-key', apiKey),
  
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  saveConfig: (config) => ipcRenderer.invoke('save-config', config),
  
  // Window controls
  toggleFullscreen: () => ipcRenderer.invoke('toggle-fullscreen'),
  
  // Remove listeners
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});
