
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Browser controls
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
  closeBrowser: () => ipcRenderer.invoke('close-browser'),
  navigateBrowser: (direction) => ipcRenderer.invoke('navigate-browser', direction),
  getBrowserUrl: () => ipcRenderer.invoke('get-browser-url'),
  
  // Download functionality
  downloadManga: (options) => ipcRenderer.invoke('download-manga', options),
  downloadVideo: (url, options) => ipcRenderer.invoke('download-video', url, options),
  
  // Ad blocker
  setAdBlockEnabled: (enabled) => ipcRenderer.invoke('set-adblock-enabled', enabled),
  getAdblockEnabled: () => ipcRenderer.invoke('get-adblock-enabled'),
  
  // File system
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  
  // Domain management
  addTrustedDomain: (domain) => ipcRenderer.invoke('add-trusted-domain', domain),
  
  // Event listeners
  onBrowserUrlChanged: (callback) => ipcRenderer.on('browser-url-changed', callback),
  onVideoProgress: (callback) => ipcRenderer.on('video-progress', callback),
  onVideoEvent: (callback) => ipcRenderer.on('video-event', callback),
  
  // Cleanup functions
  removeVideoListeners: () => {

contextBridge.exposeInMainWorld('electronAPI', {
  // Browser controls
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
  closeBrowser: () => ipcRenderer.invoke('close-browser'),
  navigateBrowser: (action) => ipcRenderer.invoke('navigate-browser', action),
  getBrowserUrl: () => ipcRenderer.invoke('get-browser-url'),
  
  // Download functions
  downloadManga: (downloadInfo) => ipcRenderer.invoke('download-manga', downloadInfo),
  downloadVideo: (url, options) => ipcRenderer.invoke('download-video', url, options),
  cancelDownload: (downloadId) => ipcRenderer.invoke('cancel-download', downloadId),
  getDownloadStatus: () => ipcRenderer.invoke('get-download-status'),
  
  // Ad blocker
  getAdblockEnabled: () => ipcRenderer.invoke('get-adblock-enabled'),
  setAdBlockEnabled: (enabled) => ipcRenderer.invoke('set-adblock-enabled', enabled),
  
  // Utilities
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  addTrustedDomain: (domain) => ipcRenderer.invoke('add-trusted-domain', domain),
  resizeBrowserView: (showSidebar) => ipcRenderer.invoke('resize-browser-view', showSidebar),
  
  // Event listeners
  onBrowserUrlChanged: (callback) => ipcRenderer.on('browser-url-changed', callback),
  onVideoProgress: (callback) => ipcRenderer.on('video-progress', callback),
  onVideoEvent: (callback) => ipcRenderer.on('video-event', callback),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', callback),
  
  // Cleanup
  removeVideoListeners: () => {
    ipcRenderer.removeAllListeners('video-progress');
    ipcRenderer.removeAllListeners('video-event');
  },
  
  removeDownloadListeners: () => {
    ipcRenderer.removeAllListeners('download-progress');
  }
});
