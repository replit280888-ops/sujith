const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Video download API
  downloadVideo: (url) => ipcRenderer.invoke('download-video', url),
  onVideoProgress: (callback) => ipcRenderer.on('video-progress', callback),
  onVideoEvent: (callback) => ipcRenderer.on('video-event', callback),
  removeVideoListeners: () => {
    ipcRenderer.removeAllListeners('video-progress');
    ipcRenderer.removeAllListeners('video-event');
  },
  getAdBlockEnabled: () => ipcRenderer.invoke('get-adblock-enabled'),
  setAdBlockEnabled: (enabled) => ipcRenderer.invoke('set-adblock-enabled', enabled),
  getGlobalAdblockState: () => ipcRenderer.invoke('get-adblock-enabled'),
  navigateTo: (url) => ipcRenderer.invoke('navigate-to', url),
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),
  closeBrowser: () => ipcRenderer.invoke('close-browser'),
  getBrowserUrl: () => ipcRenderer.invoke('get-browser-url'),
  downloadManga: (module, url, options) => 
    ipcRenderer.invoke('download-manga', { module, url, options }),
  selectDownloadFolder: () => ipcRenderer.invoke('select-download-folder'),
  navigateBrowser: (action) => ipcRenderer.invoke('navigate-browser', action),
  resizeBrowserView: (showSidebar) => 
    ipcRenderer.invoke('resize-browser-view', showSidebar),
  // setAdBlockEnabled already defined above
  windowClose: () => ipcRenderer.send('window-close'),
  
  // Event listeners
  onBrowserUrlChanged: (callback) => 
    ipcRenderer.on('browser-url-changed', callback),
  removeBrowserUrlListener: () => 
    ipcRenderer.removeAllListeners('browser-url-changed'),
  addTrustedDomain: (domain) => ipcRenderer.invoke('add-trusted-domain', domain),
});