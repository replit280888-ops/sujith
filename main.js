
const { app, BrowserWindow, BrowserView, ipcMain, dialog, shell, session } = require('electron');
const YtDlpWrap = require('yt-dlp-wrap').default;
const fs = require('fs');
const path = require('path');

const ALLOWLIST = [
  'youtube.com', 'www.youtube.com', 'youtu.be', '*.googlevideo.com',
  'instagram.com', '*.instagram.com',
  'facebook.com', '*.facebook.com',
  'twitter.com', 'x.com', '*.twitter.com', '*.x.com',
  '*.google.com'
];

const { ElectronBlocker } = require('@cliqz/adblocker-electron');

// Global variables
let mainWindow;
let browserView = null;
let isBrowserVisible = true;
let blocker = null;
let adBlockEnabled = true;
let ytDlpPath;
let activeDownloads = new Map();
let downloadQueue = [];
let maxConcurrentDownloads = 3;

// Download management
class DownloadManager {
  constructor() {
    this.activeDownloads = new Map();
    this.downloadQueue = [];
    this.maxConcurrent = 3;
  }

  async addDownload(downloadInfo) {
    if (this.activeDownloads.size >= this.maxConcurrent) {
      this.downloadQueue.push(downloadInfo);
      return { queued: true, position: this.downloadQueue.length };
    }

    return this.startDownload(downloadInfo);
  }

  async startDownload(downloadInfo) {
    const downloadId = Date.now() + Math.random();
    this.activeDownloads.set(downloadId, downloadInfo);

    try {
      const result = await this.executeDownload(downloadInfo, downloadId);
      this.activeDownloads.delete(downloadId);
      this.processQueue();
      return { success: true, result, downloadId };
    } catch (error) {
      this.activeDownloads.delete(downloadId);
      this.processQueue();
      return { success: false, error: error.message, downloadId };
    }
  }

  async executeDownload(downloadInfo, downloadId) {
    const { module, url, options } = downloadInfo;
    const startTime = Date.now();
    
    // Send progress updates
    mainWindow?.webContents.send('download-progress', {
      downloadId,
      status: 'starting',
      progress: 0,
      startTime
    });

    try {
      const moduleFile = `./modules/${module.toLowerCase()}.js`;
      const downloaderModule = require(moduleFile);
      
      // Add timeout for downloads
      const downloadPromise = downloaderModule.download({ url, ...options });
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Download timeout after 30 minutes')), 1800000)
      );
      
      const result = await Promise.race([downloadPromise, timeoutPromise]);
      
      mainWindow?.webContents.send('download-progress', {
        downloadId,
        status: 'complete',
        progress: 100,
        endTime: Date.now(),
        duration: Date.now() - startTime
      });

      return result;
    } catch (error) {
      mainWindow?.webContents.send('download-progress', {
        downloadId,
        status: 'error',
        progress: 0,
        error: error.message,
        endTime: Date.now(),
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  processQueue() {
    if (this.downloadQueue.length > 0 && this.activeDownloads.size < this.maxConcurrent) {
      const nextDownload = this.downloadQueue.shift();
      this.startDownload(nextDownload);
    }
  }

  cancelDownload(downloadId) {
    if (this.activeDownloads.has(downloadId)) {
      this.activeDownloads.delete(downloadId);
      mainWindow?.webContents.send('download-progress', {
        downloadId,
        status: 'cancelled',
        progress: 0
      });
      this.processQueue();
      return true;
    }
    return false;
  }

  getActiveDownloads() {
    return Array.from(this.activeDownloads.keys());
  }

  getQueueLength() {
    return this.downloadQueue.length;
  }
}

const downloadManager = new DownloadManager();

// Initialize yt-dlp
app.whenReady().then(() => {
  ytDlpPath = path.join(app.getPath('userData'), 'yt-dlp');
  if (process.platform === 'win32') {
    ytDlpPath += '.exe';
  }
});

async function ensureYtDlpBinary() {
  if (!fs.existsSync(ytDlpPath)) {
    console.log('Downloading yt-dlp binary...');
    await YtDlpWrap.downloadFromGithub(ytDlpPath);
    console.log('yt-dlp binary downloaded to', ytDlpPath);
  }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      webSecurity: false
    },
    icon: path.join(__dirname, 'assets/icon.png'),
    titleBarStyle: 'default',
    show: false
  });

  mainWindow.loadFile('index.html');
  
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('close', () => {
    if (browserView) {
      try {
        mainWindow.removeBrowserView(browserView);
        browserView.webContents.destroy();
      } catch (e) {
        console.error('Cleanup error:', e);
      }
      browserView = null;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Optimized resize handler with RAF and better debouncing
  let resizeTimeout;
  let isResizing = false;
  let animationFrameId;
  
  const handleResize = () => {
    if (isResizing) return;
    
    clearTimeout(resizeTimeout);
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
    
    resizeTimeout = setTimeout(() => {
      animationFrameId = requestAnimationFrame(() => {
        isResizing = true;
        if (browserView && isBrowserVisible && !browserView.webContents.isDestroyed()) {
          const [width, height] = mainWindow.getContentSize();
          const leftSidebarWidth = mainWindow.webContents.isDevToolsOpened() ? 60 : 60;
          const rightSidebarWidth = 300;
          const newBounds = {
            x: leftSidebarWidth,
            y: 48,
            width: Math.max(100, width - leftSidebarWidth - rightSidebarWidth),
            height: Math.max(100, height - 48)
          };
          browserView.setBounds(newBounds);
        }
        isResizing = false;
      });
    }, 16); // ~60fps
  };
  
  mainWindow.on('resize', handleResize);
  mainWindow.on('maximize', handleResize);
  mainWindow.on('unmaximize', handleResize);
}

function createBrowserView(url) {
  if (!mainWindow) return;
  
  // Clean up existing browser view more thoroughly
  if (browserView && !browserView.webContents.isDestroyed()) {
    try {
      browserView.webContents.removeAllListeners();
      mainWindow.removeBrowserView(browserView);
      browserView.webContents.destroy();
    } catch (e) {
      console.error('Error cleaning up browser view:', e);
    }
  }
  browserView = null;

  browserView = new BrowserView({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false,
      allowRunningInsecureContent: true
    }
  });

  mainWindow.addBrowserView(browserView);
  browserView.webContents.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
  );

  browserView.webContents.on('did-finish-load', () => {
    const currentUrl = browserView.webContents.getURL();
    mainWindow.webContents.send('browser-url-changed', currentUrl);
  });

  browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Failed to load ${url}: ${errorDescription} (${errorCode})`);
  });

  if (blocker && adBlockEnabled) {
    blocker.enableBlockingInSession(browserView.webContents.session, { allowlist: ALLOWLIST });
  }

  resizeBrowserView();

  try {
    browserView.webContents.loadURL(url);
    browserView.webContents.focus();
  } catch (err) {
    console.error(`Error loading URL: ${url}`, err);
  }
}

function resizeBrowserView() {
  if (!browserView || !mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  const rightSidebarWidth = 300;
  const viewWidth = Math.max(100, width - 60 - rightSidebarWidth);
  const viewHeight = Math.max(100, height - 48);
  
  browserView.setBounds({ 
    x: 60, 
    y: 48, 
    width: viewWidth, 
    height: viewHeight 
  });
}

app.whenReady().then(async () => {
  try {
    // Initialize ad blocker with optimized settings
    blocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, {
      path: path.join(app.getPath('userData'), 'adblocker-engine.bin'),
      read: async (path) => {
        try {
          return await fs.promises.readFile(path);
        } catch {
          return undefined;
        }
      },
      write: async (path, data) => {
        await fs.promises.writeFile(path, data);
      },
      enableCompression: true,
      loadCosmeticFilters: true,
      loadGenericCosmeticFilters: false, // Optimize performance
    });
    
    // Enable on default session immediately
    if (adBlockEnabled) {
      blocker.enableBlockingInSession(session.defaultSession, { 
        allowlist: ALLOWLIST,
        guessRequestTypeFromUrl: true
      });
    }
  } catch (e) {
    console.error('Adblocker initialization failed:', e);
    blocker = null;
  }
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.on('before-quit', () => {
  if (browserView) {
    browserView.webContents.destroy();
    browserView = null;
  }
});

// Certificate error handling
app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});

app.on('select-client-certificate', (event, webContents, url, list, callback) => {
  event.preventDefault();
  if (list.length > 0) {
    callback(list[0]);
  }
});

// IPC Handlers
ipcMain.handle('get-adblock-enabled', () => adBlockEnabled);

ipcMain.handle('open-browser', async (event, url) => {
  createBrowserView(url);
  isBrowserVisible = true;
  return true;
});

ipcMain.handle('close-browser', async () => {
  isBrowserVisible = false;
  if (browserView) {
    browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  }
  return true;
});

ipcMain.handle('get-browser-url', async () => {
  if (browserView && isBrowserVisible) {
    return browserView.webContents.getURL();
  }
  return null;
});

ipcMain.handle('navigate-to', async (event, url) => {
  if (browserView) {
    browserView.webContents.loadURL(url);
  }
});

ipcMain.handle('navigate-browser', async (event, action) => {
  if (browserView) {
    switch(action) {
      case 'back':
        if (browserView.webContents.navigationHistory.canGoBack()) {
          browserView.webContents.navigationHistory.goBack();
        }
        break;
      case 'forward':
        if (browserView.webContents.navigationHistory.canGoForward()) {
          browserView.webContents.navigationHistory.goForward();
        }
        break;
      case 'refresh':
        browserView.webContents.reload();
        break;
    }
  }
});

ipcMain.handle('download-manga', async (event, { module, url, options }) => {
  console.log('[Main] Download request received:', { module, url, options });
  
  const downloadInfo = { module, url, options };
  const result = await downloadManager.addDownload(downloadInfo);
  
  return result;
});

ipcMain.handle('cancel-download', async (event, downloadId) => {
  return downloadManager.cancelDownload(downloadId);
});

ipcMain.handle('get-download-status', async () => {
  return {
    active: downloadManager.getActiveDownloads().length,
    queued: downloadManager.getQueueLength()
  };
});

ipcMain.handle('download-video', async (event, url, options = {}) => {
  try {
    await ensureYtDlpBinary();
    const ytDlp = new YtDlpWrap(ytDlpPath);
    const downloadPath = path.join(app.getPath('downloads'), 'videos');
    
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }

    const formatSelector = options.quality === '4k' ? 'bestvideo[height<=2160]+bestaudio/best[height<=2160]' :
                          options.quality === '1080p' ? 'bestvideo[height<=1080]+bestaudio/best[height<=1080]' :
                          options.quality === '720p' ? 'bestvideo[height<=720]+bestaudio/best[height<=720]' :
                          options.quality === '480p' ? 'bestvideo[height<=480]+bestaudio/best[height<=480]' :
                          options.quality === '360p' ? 'bestvideo[height<=360]+bestaudio/best[height<=360]' :
                          'bestvideo+bestaudio/best';

    return new Promise((resolve, reject) => {
      ytDlp.exec([
        url,
        '-o', path.join(downloadPath, '%(title)s.%(ext)s'),
        '--format', formatSelector,
        '--merge-output-format', 'mp4'
      ])
      .on('progress', (progress) => {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('video-progress', progress);
        }
      })
      .on('ytDlpEvent', (eventType, eventData) => {
        if (mainWindow && mainWindow.webContents) {
          mainWindow.webContents.send('video-event', { eventType, eventData });
        }
      })
      .on('error', (error) => reject(error))
      .on('close', () => resolve({ success: true }));
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

ipcMain.handle('select-download-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory']
  });
  
  if (!result.canceled) {
    return result.filePaths[0];
  }
  return null;
});

ipcMain.handle('add-trusted-domain', (event, domain) => {
  // Add domain to trusted list if needed
  console.log('Added trusted domain:', domain);
});

ipcMain.handle('set-adblock-enabled', async (event, enabled) => {
  adBlockEnabled = enabled;
  if (blocker) {
    const sessions = [
      session.defaultSession,
      ...BrowserWindow.getAllWindows().map(w => w.webContents.session)
    ];
    
    if (browserView && !sessions.includes(browserView.webContents.session)) {
      sessions.push(browserView.webContents.session);
    }
    
    sessions.forEach(sess => {
      if (enabled) {
        blocker.enableBlockingInSession(sess, { allowlist: ALLOWLIST });
      } else {
        try {
          blocker.disableBlockingInSession(sess);
        } catch (err) {
          // Ignore errors when disabling
        }
      }
    });
    
    if (browserView && !browserView.webContents.isDestroyed()) {
      browserView.webContents.reload();
    }
  }
  return true;
});

ipcMain.handle('resize-browser-view', async (event, showSidebar) => {
  resizeBrowserView();
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});
