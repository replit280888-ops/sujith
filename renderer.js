
function isValidUrl(url) {
  if (url === 'about:blank') return true;
  try {
    const u = new URL(url);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

class MangaDownloader {
  constructor() {
    this.activeModule = 'Colamanga';
    this.browserEnabled = true;
    this.adultMode = false;
    this.currentUrl = '';
    this.downloadQueue = [];
    this.activeDownloads = new Map();
    this.downloadHistory = [];
    this.isDownloading = false;
    this.browserVisible = false;
    this.sidebarCollapsed = false;
    this.adBlockEnabled = true;
    this.videoDownloading = false;
    this.videoProgress = 0;
    this.downloadPath = '/Users/Downloads';
    this.maxConcurrentDownloads = 3;
    this.modules = [
      { name: 'Colamanga', url: 'https://colamanga.com', color: '#FF6B6B' },
      { name: 'Asura', url: 'https://asuracomic.net/', color: '#4ECDC4' },
      { name: 'ErosScan', url: 'https://erosvoids.xyz/', color: '#45B7D1' },
      { name: 'nHentai', url: 'https://nhentai.net', color: '#96CEB4', adult: true },
      { name: 'Hentai2Read', url: 'https://hentai2read.com/', color: '#FFEAA7', adult: true },
      { name: 'MangaDex', url: 'https://mangadex.org', color: '#DDA0DD' },
      { name: 'Hitomi', url: 'https://hitomi.la', color: '#98D8C8', adult: true }
    ];
    this.init();
  }

  init() {
    console.log('MangaDownloader init called');
    this.renderModuleButtons();
    this.setupEventListeners();
    this.loadDownloadHistory();
    this.initializeBrowserState();
    
    // Add cleanup on page unload
    window.addEventListener('beforeunload', () => this.cleanup());
  }
  
  cleanup() {
    // Remove all event listeners to prevent memory leaks
    if (this._videoProgressHandler) {
      window.electronAPI.removeVideoListeners();
    }
    if (this._cachedElements) {
      this._cachedElements = null;
    }
  }

  async initializeBrowserState() {
    try {
      // Get initial ad block state
      const enabled = await window.electronAPI.getAdblockEnabled();
      this.adBlockEnabled = enabled;
      this.updateUI();
    } catch (error) {
      console.error('Error getting ad block state:', error);
      this.adBlockEnabled = true;
      this.updateUI();
    }

    // Listen for browser URL changes
    window.electronAPI.onBrowserUrlChanged((event, url) => {
      const urlEdit = document.getElementById('url-edit');
      const urlInput = document.getElementById('url-input');
      if (urlEdit) urlEdit.value = url;
      if (urlInput && !urlInput.value) urlInput.value = url;
      this.currentUrl = url;
      this.updateUI();
    });
  }

  renderModuleButtons() {
    const container = document.getElementById('module-buttons');
    const filteredModules = this.getFilteredModules();
    
    container.innerHTML = '';
    filteredModules.forEach(module => {
      const button = document.createElement('button');
      button.className = 'module-button';
      button.style.backgroundColor = module.color;
      button.dataset.module = module.name.toLowerCase();
      
      const span = document.createElement('span');
      span.textContent = module.name.substring(0, 2).toUpperCase();
      button.appendChild(span);
      
      button.title = module.name;
      button.onclick = () => {
        this.selectModule(module);
      };
      
      if (module.name === this.activeModule) {
        button.classList.add('active');
      }
      
      container.appendChild(button);
    });
  }

  getFilteredModules() {
    return this.modules.filter(module => this.adultMode || !module.adult);
  }

  selectModule(module) {
    // Remove active class from all buttons
    document.querySelectorAll('.module-button').forEach(btn => {
      btn.classList.remove('active');
    });
    
    // Add active class to selected button
    document.querySelector(`[data-module="${module.name.toLowerCase()}"]`)?.classList.add('active');
    
    this.activeModule = module.name;
    
    // Update active module dot color
    const dot = document.getElementById('active-module-dot');
    if (dot) {
      dot.style.backgroundColor = module.color;
    }
    
    // Add domain to trusted list
    try {
      const domain = new URL(module.url).hostname;
      window.electronAPI.addTrustedDomain(domain);
    } catch (e) {
      console.error('Error adding trusted domain:', e);
    }

    this.currentUrl = module.url;
    this.updateUI();
    
    // Always open browser when selecting module
    window.electronAPI.openBrowser(this.currentUrl);
  }

  setupEventListeners() {
    console.log('Setting up event listeners...');
    
    // Hamburger menu toggle
    const hamburgerToggle = document.getElementById('hamburger-toggle');
    const sidebarLeft = document.querySelector('.sidebar-left');
    const sidebarRight = document.querySelector('.sidebar-right');
    const sidebarRightToggle = document.getElementById('sidebar-right-toggle');
    let mobileOverlay = document.querySelector('.mobile-overlay');
    
    // Create mobile overlay if it doesn't exist
    if (!mobileOverlay) {
      mobileOverlay = document.createElement('div');
      mobileOverlay.className = 'mobile-overlay';
      mobileOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.5);
        z-index: 999;
        display: none;
      `;
      document.body.appendChild(mobileOverlay);
    }
    
    if (hamburgerToggle) {
      hamburgerToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = hamburgerToggle.classList.contains('active');
        
        hamburgerToggle.classList.toggle('active', !isActive);
        sidebarLeft.classList.toggle('mobile-open', !isActive);
        sidebarRight.classList.toggle('mobile-open', !isActive);
        mobileOverlay.style.display = isActive ? 'none' : 'block';
      });
    }
    
    // Close menu when clicking overlay
    if (mobileOverlay) {
      mobileOverlay.addEventListener('click', () => {
        hamburgerToggle.classList.remove('active');
        sidebarLeft.classList.remove('mobile-open');
        sidebarRight.classList.remove('mobile-open');
        mobileOverlay.style.display = 'none';
      });
    }
    
    // Right sidebar toggle
    if (sidebarRightToggle) {
      sidebarRightToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        sidebarRight.classList.toggle('collapsed');
        sidebarRightToggle.classList.toggle('active');
      });
    }

    // Close menu on window resize to desktop size
    window.addEventListener('resize', () => {
      if (window.innerWidth > 900) {
        hamburgerToggle.classList.remove('active');
        sidebarLeft.classList.remove('mobile-open');
        sidebarRight.classList.remove('mobile-open');
        sidebarRight.classList.remove('collapsed');
        if (mobileOverlay) mobileOverlay.style.display = 'none';
      }
    });

    // Module buttons - ensure they're properly mapped
    document.querySelectorAll('.module-button[data-module]').forEach(button => {
      button.addEventListener('click', () => {
        const moduleName = button.dataset.module;
        const module = this.modules.find(m => m.name.toLowerCase() === moduleName);
        if (module) {
          this.selectModule(module);
        }
      });
    });

    // Navigation controls
    const backBtn = document.getElementById('browser-back');
    const forwardBtn = document.getElementById('browser-forward');
    const refreshBtn = document.getElementById('browser-refresh');
    
    if (backBtn) {
      backBtn.onclick = () => {
        console.log('Back button clicked');
        window.electronAPI.navigateBrowser('back');
      };
    }
    
    if (forwardBtn) {
      forwardBtn.onclick = () => {
        console.log('Forward button clicked');
        window.electronAPI.navigateBrowser('forward');
      };
    }
    
    if (refreshBtn) {
      refreshBtn.onclick = () => {
        console.log('Refresh button clicked');
        window.electronAPI.navigateBrowser('refresh');
      };
    }

    // URL navigation
    const urlEdit = document.getElementById('url-edit');
    const goBtn = document.getElementById('go-btn');
    
    if (urlEdit) {
      urlEdit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          console.log('Enter pressed in URL bar');
          this.navigateFromBrowserHeader();
        }
      });
    }
    
    if (goBtn) {
      goBtn.addEventListener('click', () => {
        console.log('Go button clicked');
        this.navigateFromBrowserHeader();
      });
    }

    // Close browser
    const closeBrowserBtn = document.getElementById('close-browser');
    if (closeBrowserBtn) {
      closeBrowserBtn.addEventListener('click', () => {
        this.browserEnabled = false;
        window.electronAPI.closeBrowser();
        this.updateUI();
      });
    }

    // Download history button
    const historyBtn = document.getElementById('download-history-btn');
    if (historyBtn) {
      historyBtn.onclick = () => {
        console.log('Download history button clicked');
        this.showDownloadHistory();
      };
    }

    // Toggles
    const browserToggle = document.getElementById('browser-toggle');
    const adultToggle = document.getElementById('adult-toggle');
    
    if (browserToggle) {
      browserToggle.onclick = () => {
        console.log('Browser toggle clicked');
        this.browserEnabled = !this.browserEnabled;
        this.updateUI();
        if (this.browserEnabled) {
          const activeModule = this.modules.find(m => m.name === this.activeModule);
          if (activeModule) {
            window.electronAPI.openBrowser(activeModule.url);
          }
        } else {
          window.electronAPI.closeBrowser();
        }
      };
    }

    if (adultToggle) {
      adultToggle.onclick = () => {
        console.log('Adult mode toggle clicked');
        this.adultMode = !this.adultMode;
        this.renderModuleButtons();
        this.updateUI();
      };
    }

    document.getElementById('adblock-toggle').onclick = async () => {
      const toggle = document.getElementById('adblock-toggle');
      const newState = !this.adBlockEnabled;
      
      // Prevent rapid clicking
      toggle.style.pointerEvents = 'none';
      
      try {
        this.adBlockEnabled = newState;
        this.updateUI();
        
        const success = await window.electronAPI.setAdBlockEnabled(newState);
        if (!success) {
          this.adBlockEnabled = !newState;
          this.updateUI();
          console.warn('Failed to update ad blocker settings');
        }
      } catch (error) {
        console.error('Error toggling ad block:', error);
        this.adBlockEnabled = !newState;
        this.updateUI();
      } finally {
        // Re-enable after 500ms to prevent rapid toggling
        setTimeout(() => {
          toggle.style.pointerEvents = 'auto';
        }, 500);
      }
    };

    // Download path
    const changePathBtn = document.getElementById('change-path-btn');
    if (changePathBtn) {
      changePathBtn.onclick = () => {
        console.log('Change path button clicked');
        this.showDownloadPathModal();
      };
    }

    // URL input
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
      urlInput.oninput = (e) => {
        this.currentUrl = e.target.value;
        this.updateUI();
      };
    }

    // Paste button
    const pasteBtn = document.getElementById('paste-btn');
    if (pasteBtn) {
      pasteBtn.onclick = async () => {
        console.log('Paste button clicked');
        try {
          const url = await window.electronAPI.getBrowserUrl();
          if (url && urlInput) {
            urlInput.value = url;
            this.currentUrl = url;
            this.updateUI();
          }
        } catch (error) {
          console.error('Error pasting URL:', error);
        }
      };
    }

    // Download buttons
    const downloadBtn = document.getElementById('download-btn');
    const downloadVideoBtn = document.getElementById('download-video-btn');
    
    if (downloadBtn) {
      downloadBtn.addEventListener('click', () => {
        if (this.isDownloading) {
          this.cancelAllDownloads();
        } else {
          this.downloadManga();
        }
      });
    }

    if (downloadVideoBtn) {
      downloadVideoBtn.addEventListener('click', () => {
        this.showVideoQualityModal();
      });
    }

    // Blank browser button
    const blankBrowserBtn = document.getElementById('blank-browser-btn');
    if (blankBrowserBtn) {
      blankBrowserBtn.onclick = () => {
        this.activeModule = 'None';
        this.currentUrl = 'about:blank';
        this.updateUI();
        window.electronAPI.openBrowser(this.currentUrl);
      };
    }

    // Settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
      settingsBtn.onclick = () => {
        console.log('Settings clicked');
        // Add settings functionality here
      };
    }

    // Modal event listeners
    this.setupModalEventListeners();
  }

  setupModalEventListeners() {
    // Download History Modal
    const historyModal = document.getElementById('download-history-modal');
    const closeHistoryBtn = document.getElementById('close-history-modal');
    
    if (closeHistoryBtn) {
      closeHistoryBtn.onclick = () => {
        historyModal.classList.remove('active');
      };
    }

    document.getElementById('clear-completed-btn').onclick = () => {
      this.clearCompletedDownloads();
    };

    document.getElementById('clear-all-btn').onclick = () => {
      if (confirm('Are you sure you want to clear all download history?')) {
        this.clearAllDownloads();
      }
    };

    // Video Quality Modal
    const qualityModal = document.getElementById('video-quality-modal');
    const closeQualityBtn = document.getElementById('close-quality-modal');
    
    if (closeQualityBtn) {
      closeQualityBtn.onclick = () => {
        qualityModal.classList.remove('active');
      };
    }

    // Quality option selection
    document.querySelectorAll('.quality-option').forEach(option => {
      option.onclick = () => {
        document.querySelectorAll('.quality-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
      };
    });

    document.getElementById('start-video-download-btn').onclick = () => {
      const selectedQuality = document.querySelector('.quality-option.selected')?.dataset.quality;
      qualityModal.classList.remove('active');
      this.downloadVideo(selectedQuality);
    };

    // Download Path Modal
    const pathModal = document.getElementById('download-path-modal');
    const closePathBtn = document.getElementById('close-path-modal');
    const cancelPathBtn = document.getElementById('cancel-path-btn');
    const selectPathBtn = document.getElementById('select-path-btn');
    
    if (closePathBtn) {
      closePathBtn.onclick = () => {
        pathModal.classList.remove('active');
      };
    }
    
    if (cancelPathBtn) {
      cancelPathBtn.onclick = () => {
        pathModal.classList.remove('active');
      };
    }

    // Path option selection
    document.querySelectorAll('.path-option').forEach(option => {
      option.onclick = () => {
        document.querySelectorAll('.path-option').forEach(opt => opt.classList.remove('selected'));
        option.classList.add('selected');
        
        const customPathInput = document.querySelector('.custom-path-input');
        if (option.classList.contains('custom-path')) {
          customPathInput.style.display = 'block';
        } else {
          customPathInput.style.display = 'none';
        }
      };
    });

    selectPathBtn.onclick = () => {
      const selectedOption = document.querySelector('.path-option.selected');
      if (selectedOption.classList.contains('custom-path')) {
        const customPath = document.getElementById('custom-path-input').value.trim();
        if (customPath) {
          this.downloadPath = customPath;
        }
      } else {
        const pathLocation = selectedOption.querySelector('.path-location')?.textContent;
        if (pathLocation) {
          this.downloadPath = pathLocation;
        }
      }
      
      this.updateDownloadPathDisplay();
      pathModal.classList.remove('active');
    };

    // Close modals when clicking outside
    [historyModal, qualityModal, pathModal].forEach(modal => {
      modal.onclick = (e) => {
        if (e.target === modal) {
          modal.classList.remove('active');
        }
      };
    });
  }

  showDownloadHistory() {
    const modal = document.getElementById('download-history-modal');
    this.renderDownloadHistory();
    modal.classList.add('active');
  }

  showVideoQualityModal() {
    if (!this.currentUrl) {
      alert('Please enter or paste a URL first');
      return;
    }
    
    const modal = document.getElementById('video-quality-modal');
    modal.classList.add('active');
  }

  showDownloadPathModal() {
    const modal = document.getElementById('download-path-modal');
    modal.classList.add('active');
  }

  renderDownloadHistory() {
    const container = document.getElementById('download-list');
    container.innerHTML = '';

    if (this.downloadHistory.length === 0) {
      container.innerHTML = '<div style="text-align: center; color: #888; padding: 20px;">No downloads yet</div>';
      return;
    }

    this.downloadHistory.forEach((download, index) => {
      const item = document.createElement('div');
      item.className = 'download-item';
      
      item.innerHTML = `
        <div class="download-header">
          <div class="download-title">${download.title}</div>
          <div class="download-actions">
            <button title="Open File" onclick="app.openDownloadFile('${download.path}')">
              <i class="fas fa-external-link-alt"></i>
            </button>
            <button title="Remove from History" onclick="app.removeFromHistory(${index})">
              <i class="fas fa-trash"></i>
            </button>
          </div>
        </div>
        <div class="download-info">${download.url}</div>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${download.progress}%"></div>
        </div>
        <div class="download-status">
          <span class="status-badge ${download.status}">${download.status.toUpperCase()}</span>
          <span class="download-size">${download.size || '0 MB'}</span>
        </div>
      `;
      
      container.appendChild(item);
    });
  }

  addToDownloadHistory(download) {
    this.downloadHistory.unshift({
      id: Date.now(),
      title: download.title || 'Unknown',
      url: download.url,
      path: download.path || '',
      status: download.status || 'downloading',
      progress: download.progress || 0,
      size: download.size || '0 MB',
      timestamp: new Date()
    });
    
    // Keep only last 50 downloads
    this.downloadHistory = this.downloadHistory.slice(0, 50);
    this.saveDownloadHistory();
  }

  updateDownloadProgress(downloadId, progress, status) {
    const download = this.downloadHistory.find(d => d.id === downloadId);
    if (download) {
      download.progress = progress;
      download.status = status;
      this.saveDownloadHistory();
      
      // Update UI if modal is open
      if (document.getElementById('download-history-modal').classList.contains('active')) {
        this.renderDownloadHistory();
      }
    }
  }

  clearCompletedDownloads() {
    this.downloadHistory = this.downloadHistory.filter(d => d.status !== 'complete');
    this.saveDownloadHistory();
    this.renderDownloadHistory();
  }

  clearAllDownloads() {
    this.downloadHistory = [];
    this.saveDownloadHistory();
    this.renderDownloadHistory();
  }

  removeFromHistory(index) {
    this.downloadHistory.splice(index, 1);
    this.saveDownloadHistory();
    this.renderDownloadHistory();
  }

  openDownloadFile(path) {
    // This would need to be implemented in the main process
    console.log('Opening file:', path);
  }

  saveDownloadHistory() {
    localStorage.setItem('downloadHistory', JSON.stringify(this.downloadHistory));
  }

  loadDownloadHistory() {
    const saved = localStorage.getItem('downloadHistory');
    if (saved) {
      try {
        this.downloadHistory = JSON.parse(saved);
      } catch (e) {
        console.error('Failed to load download history:', e);
        this.downloadHistory = [];
      }
    }
  }

  updateDownloadPathDisplay() {
    const display = document.getElementById('download-path-display');
    const span = display.querySelector('span');
    if (span) {
      span.textContent = this.downloadPath;
    }
  }

  async downloadManga() {
    const urlInput = document.getElementById('url-input');
    const currentUrl = this.currentUrl || urlInput.value.trim();
    
    if (!currentUrl || currentUrl === 'about:blank') {
      alert('Please enter or paste a valid URL first');
      return;
    }

    if (this.activeDownloads.size >= this.maxConcurrentDownloads) {
      alert(`Maximum ${this.maxConcurrentDownloads} concurrent downloads allowed`);
      return;
    }

    try {
      const downloadId = Date.now();
      this.isDownloading = true;
      this.activeDownloads.set(downloadId, { url: currentUrl, status: 'downloading' });
      
      // Add to history
      this.addToDownloadHistory({
        id: downloadId,
        title: `${this.activeModule} - ${new URL(currentUrl).pathname}`,
        url: currentUrl,
        status: 'downloading',
        progress: 0
      });
      
      this.updateUI();
      
      const result = await window.electronAPI.downloadManga({
        module: this.activeModule,
        url: currentUrl,
        options: { 
          adultMode: this.adultMode,
          downloadPath: this.downloadPath
        }
      });
      
      if (result.success) {
        this.updateDownloadProgress(downloadId, 100, 'complete');
        alert(`Download completed successfully from ${this.activeModule}`);
      } else {
        this.updateDownloadProgress(downloadId, 0, 'error');
        alert(`Download failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert(`Download failed: ${error.message || 'Unknown error'}`);
    } finally {
      this.activeDownloads.delete(downloadId);
      if (this.activeDownloads.size === 0) {
        this.isDownloading = false;
      }
      this.updateUI();
    }
  }

  async downloadVideo(quality = '1080p') {
    const urlInput = document.getElementById('url-input');
    const currentUrl = this.currentUrl || urlInput.value.trim();
    
    if (!currentUrl || currentUrl === 'about:blank') {
      alert('Please enter or paste a valid URL first');
      return;
    }

    try {
      const downloadId = Date.now();
      this.videoDownloading = true;
      this.videoProgress = 0;
      
      // Add to history
      this.addToDownloadHistory({
        id: downloadId,
        title: `Video - ${quality}`,
        url: currentUrl,
        status: 'downloading',
        progress: 0
      });
      
      this.updateUI();

      // Setup progress listeners
      window.electronAPI.onVideoProgress((event, progress) => {
        this.videoProgress = progress.percent || 0;
        this.updateDownloadProgress(downloadId, this.videoProgress, 'downloading');
        this.updateUI();
      });

      window.electronAPI.onVideoEvent((event, data) => {
        console.log('Video event:', data);
      });

      const result = await window.electronAPI.downloadVideo(currentUrl, { quality });
      
      if (result.success) {
        this.updateDownloadProgress(downloadId, 100, 'complete');
        alert('Video downloaded successfully!');
      } else {
        this.updateDownloadProgress(downloadId, 0, 'error');
        alert(`Video download failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Video download error:', error);
      alert(`Video download failed: ${error.message || 'Unknown error'}`);
    } finally {
      this.videoDownloading = false;
      this.videoProgress = 0;
      if (window.electronAPI.removeVideoListeners) {
        window.electronAPI.removeVideoListeners();
      }
      this.updateUI();
    }
  }

  cancelAllDownloads() {
    if (confirm('Cancel all active downloads?')) {
      this.activeDownloads.clear();
      this.isDownloading = false;
      this.videoDownloading = false;
      this.downloadQueue = [];
      this.updateUI();
    }
  }

  navigateFromBrowserHeader() {
    const urlEdit = document.getElementById('url-edit');
    let url = urlEdit.value.trim();
    
    if (!url) {
      url = 'about:blank';
    }

    // Smart protocol handling
    if (url === 'about:blank' || isValidUrl(url)) {
      window.electronAPI.openBrowser(url);
      this.currentUrl = url;
      this.updateUI();
    } else {
      // Try to fix missing protocol
      if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
      }
      if (isValidUrl(url)) {
        window.electronAPI.openBrowser(url);
        this.currentUrl = url;
        this.updateUI();
      } else {
        window.electronAPI.openBrowser('about:blank');
        this.currentUrl = 'about:blank';
        this.updateUI();
      }
    }
  }

  updateUI() {
    // Cache DOM elements to reduce lookups
    if (!this._cachedElements) {
      this._cachedElements = {
        activeModuleName: document.getElementById('active-module-name'),
        browserToggle: document.getElementById('browser-toggle'),
        adultToggle: document.getElementById('adult-toggle'),
        adblockToggle: document.getElementById('adblock-toggle'),
        downloadBtn: document.getElementById('download-btn'),
        videoBtn: document.getElementById('download-video-btn'),
        urlInput: document.getElementById('url-input'),
        moduleCount: document.getElementById('module-count'),
        modeDisplay: document.getElementById('mode-display'),
        videoProgress: document.getElementById('video-progress')
      };
    }
    
    const elements = this._cachedElements;
    
    // Update active module display
    if (elements.activeModuleName.textContent !== this.activeModule) {
      elements.activeModuleName.textContent = this.activeModule;
    }
    
    // Update toggles only if state changed
    elements.browserToggle.classList.toggle('active', this.browserEnabled);
    elements.adultToggle.classList.toggle('active', this.adultMode);
    elements.adblockToggle.classList.toggle('active', this.adBlockEnabled);

    // Update download button
    const downloadBtn = document.getElementById('download-btn');
    const urlInput = document.getElementById('url-input');
    const hasValidUrl = this.currentUrl && this.currentUrl !== 'about:blank' || (urlInput && urlInput.value.trim() && urlInput.value.trim() !== 'about:blank');
    
    if (downloadBtn) {
      downloadBtn.disabled = !hasValidUrl;
      
      if (this.isDownloading || this.activeDownloads.size > 0) {
        downloadBtn.innerHTML = `<i class="fas fa-stop-circle"></i> Cancel Downloads (${this.activeDownloads.size})`;
        downloadBtn.classList.add('downloading');
      } else {
        downloadBtn.innerHTML = `<i class="fas fa-download"></i> Download`;
        downloadBtn.classList.remove('downloading');
      }
    }

    // Video download button
    const videoBtn = document.getElementById('download-video-btn');
    if (videoBtn) {
      videoBtn.disabled = !hasValidUrl || this.videoDownloading;
      videoBtn.innerHTML = this.videoDownloading ? 
        `<i class="fas fa-sync fa-spin"></i> Downloading... ${Math.round(this.videoProgress)}%` : 
        `<i class="fas fa-video"></i> Download Video`;
    }

    // Update URL input
    const urlInput = document.getElementById('url-input');
    if (urlInput && urlInput.value !== this.currentUrl) {
      urlInput.value = this.currentUrl;
    }

    // Update status
    const filteredModules = this.getFilteredModules();
    document.getElementById('module-count').textContent = `${filteredModules.length} loaded`;
    document.getElementById('mode-display').textContent = this.adultMode ? 'Adult' : 'Regular';
    document.getElementById('video-progress').textContent = `${Math.round(this.videoProgress)}%`;

    // Browser visibility
    const placeholder = document.getElementById('browser-placeholder');
    if (this.browserEnabled) {
      placeholder.style.display = 'none';
    } else {
      placeholder.style.display = 'flex';
    }

    // Update download path display
    this.updateDownloadPathDisplay();
  }
}

// Global reference for modal callbacks
let app;

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  app = new MangaDownloader();
});
