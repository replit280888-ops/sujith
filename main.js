// Bypass certificate errors for all sites
// Bypass certificate errors for all sites
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
// Place all ipcMain.handle calls after requires
ipcMain.handle('get-adblock-enabled', () => adBlockEnabled);

const { ElectronBlocker } = require('@cliqz/adblocker-electron');
// yt-dlp binary path
let ytDlpPath;
app.whenReady().then(() => {
  ytDlpPath = path.join(app.getPath('userData'), 'yt-dlp');
  if (process.platform === 'win32') {
    ytDlpPath += '.exe';
  }
});

// Ensure yt-dlp binary exists
async function ensureYtDlpBinary() {
  if (!fs.existsSync(ytDlpPath)) {
    console.log('Downloading yt-dlp binary...');
    await YtDlpWrap.downloadFromGithub(ytDlpPath);
    console.log('yt-dlp binary downloaded to', ytDlpPath);
  }
}
// IPC handler for video download
ipcMain.handle('download-video', async (event, url) => {
  try {
    await ensureYtDlpBinary();
    const ytDlp = new YtDlpWrap(ytDlpPath);
    const downloadPath = path.join(app.getPath('downloads'), 'videos');
    if (!fs.existsSync(downloadPath)) {
      fs.mkdirSync(downloadPath, { recursive: true });
    }
    return new Promise((resolve, reject) => {
      ytDlp.exec([
        url,
        '-o', path.join(downloadPath, '%(title)s.%(ext)s'),
        '--format', 'bestvideo+bestaudio/best',
        '--merge-output-format', 'mp4'
      ])
      .on('progress', (progress) => {
        if (mainWindow && mainWindow.webContents)
          mainWindow.webContents.send('video-progress', progress);
      })
      .on('ytDlpEvent', (eventType, eventData) => {
        if (mainWindow && mainWindow.webContents)
          mainWindow.webContents.send('video-event', { eventType, eventData });
      })
      .on('error', (error) => reject(error))
      .on('close', () => resolve({ success: true }));
    });
  } catch (error) {
    return { success: false, error: error.message };
  }
});

let mainWindow;
let browserView = null;
let isBrowserVisible = true; // Track visibility state
const trustedDomains = new Set();

let blocker = null;
let adBlockEnabled = true;
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
  // Add this to prevent race conditions
  app.on('before-quit', () => {
    if (browserView) {
      browserView.webContents.destroy();
      browserView = null;
    }
  });

  // Improved resize handler for better fit
  let resizeTimeout;
  mainWindow.on('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (browserView && isBrowserVisible) {
        // Always use up-to-date window size and sidebar state
        const [width, height] = mainWindow.getContentSize();
        const rightSidebarWidth = (typeof sidebarVisible !== 'undefined' ? sidebarVisible : true) ? 320 : 0;
        browserView.setBounds({
          x: 64, // sidebar-left width
          y: 48, // header height
          width: width - 64 - rightSidebarWidth,
          height: height - 48
        });
      }
    }, 100);
  });

  // Fullscreen toggle on F12
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') {
      const isFull = mainWindow.isFullScreen();
      mainWindow.setFullScreen(!isFull);
      event.preventDefault();
    }
  });
}


function createBrowserView(url) {
  if (!mainWindow) return;
  // Prevent multiple views
  if (browserView && !browserView.webContents.isDestroyed()) {
    mainWindow.removeBrowserView(browserView);
    browserView.webContents.destroy();
  }
  browserView = null;
  // Create new BrowserView
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
  // Add event listeners
  browserView.webContents.on('did-finish-load', () => {
    const currentUrl = browserView.webContents.getURL();
    mainWindow.webContents.send('browser-url-changed', currentUrl);
    // Inject CSS to hide YouTube's bottom right subscribe button/white box
    if (currentUrl.includes('youtube.com')) {
      browserView.webContents.insertCSS(`
        ytd-button-renderer.style-scope.ytd-subscribe-button-renderer,
        ytd-subscribe-button-renderer.style-scope.ytd-video-secondary-info-renderer,
        #subscribe-button,
        ytd-mealbar-promo-renderer,
        ytd-mealbar-promo-renderer[slot="bottom-row"] {
          display: none !important;
        }
        .ytp-ce-element, .ytp-ce-bottom-right-cta, .ytp-ce-element.ytp-ce-bottom-right-cta {
          display: none !important;
        }
      `);
    }
  });
  browserView.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error(`Failed to load ${url}: ${errorDescription} (${errorCode})`);
  });
  // Enable adblocking only if enabled
  if (blocker && adBlockEnabled) {
    blocker.enableBlockingInSession(browserView.webContents.session, { allowlist: ALLOWLIST });
  }
  // Position the BrowserView
  resizeBrowserView(typeof sidebarVisible !== 'undefined' ? sidebarVisible : true);
  // Load the URL
  try {
    browserView.webContents.loadURL(url);
    browserView.webContents.focus();
  } catch (err) {
    console.error(`Error loading URL: ${url}`, err);
  }
}

function toggleBrowserView(visible) {
  isBrowserVisible = visible;
  if (browserView) {
    if (visible) {
      // Show and position browser
      const [width, height] = mainWindow.getSize();
      browserView.setBounds({ 
        x: 60, 
        y: 60, 
        width: width - 410, 
        height: height - 100 
      });
      browserView.webContents.focus();
    } else {
      // Hide browser by moving it off-screen
      browserView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
  }
}

function resizeBrowserView(showSidebar) {
  if (!browserView || !mainWindow) return;
  const [width, height] = mainWindow.getContentSize();
  const rightSidebarWidth = showSidebar ? 320 : 0;
  // Ensure we don't set negative dimensions
  const viewWidth = Math.max(100, width - 64 - rightSidebarWidth);
  const viewHeight = Math.max(100, height - 48);
  browserView.setBounds({ 
    x: 64, 
    y: 48, 
    width: viewWidth, 
    height: viewHeight 
  });
}

app.whenReady().then(async () => {
  try {
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
    });
  } catch (e) {
    console.error('Adblocker initialization failed:', e);
    blocker = null;
  }
  createWindow();
  // Remove adblocker enable here; handled in set-adblock-enabled
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

// IPC Handlers

ipcMain.handle('open-browser', async (event, url) => {
  createBrowserView(url);
  toggleBrowserView(true);
  return true;
});

ipcMain.handle('close-browser', async () => {
  toggleBrowserView(false);
  return true;
});

ipcMain.handle('get-browser-url', async () => {
  if (browserView && isBrowserVisible) {
    return browserView.webContents.getURL();
  }
  return null;
});

// Add IPC handler for navigation
ipcMain.handle('navigate-to', async (event, url) => {
  if (browserView) {
    browserView.webContents.loadURL(url);
  }
});

ipcMain.handle('download-manga', async (event, { module, url, options }) => {
  // Debug log for module and URL
  console.log('[Main] Download request received:', { module, url, options });
  try {
    const downloaderModule = require(`./modules/${module.toLowerCase()}.js`);
    // Always pass an object with url and options spread in
    const result = await downloaderModule.download({ url, ...options });
    return { success: true, result };
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
  trustedDomains.add(domain);
});

ipcMain.handle('set-adblock-enabled', async (event, enabled) => {
  adBlockEnabled = enabled;
  if (blocker) {
    // Update all existing sessions
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
          // Always resolve true, ignore all errors for disabling
        }
      }
    });
    // Reload active browser view
    if (browserView && !browserView.webContents.isDestroyed()) {
      browserView.webContents.reload();
    }
  }
  return true;
});

app.on('certificate-error', (event, webContents, url, error, certificate, callback) => {
  event.preventDefault();
  callback(true);
});
// Global error handler for SSL client certificates
app.on('select-client-certificate', (event, webContents, url, list, callback) => {
  event.preventDefault();
  if (list.length > 0) {
    callback(list[0]); // Always select the first certificate
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

ipcMain.handle('resize-browser-view', async (event, showSidebar) => {
  if (!browserView) return;
  const [width, height] = mainWindow.getSize();
  const rightSidebarWidth = showSidebar ? 350 : 0;
  browserView.setBounds({ 
    x: 60, 
    y: 60, 
    width: width - 60 - rightSidebarWidth, 
    height: height - 100 
  });
});

ipcMain.on('window-close', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.close();
  }
});