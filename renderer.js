function isValidUrl(url) {
  // Accept 'about:blank' and valid http/https URLs
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
    this.isDownloading = false;
    this.browserVisible = false;
    this.sidebarCollapsed = false;
    this.adBlockEnabled = true; // Default to enabled
    this.videoDownloading = false;
    this.videoProgress = 0;
    this.modules = [
      { name: 'Colamanga', url: 'https://colamanga.com', color: '#FF6B6B' },
      { name: 'Asura', url: 'https://asuracomic.net/', color: '#4ECDC4' },
      { name: 'ErosScan', url: 'https://erosvoids.xyz/', color: '#45B7D1' },
      { name: 'nHentai', url: 'https://nhentai.net', color: '#96CEB4', adult: true },
      { name: 'Hentai2Read', url: 'https://hentai2read.com/', color: '#FFEAA7', adult: true },
      { name: 'MangaDex', url: 'https://mangadex.org', color: '#DDA0DD' },
      { name: 'Hitomi', url: 'https://hitomi.la', color: '#98D8C8',adult: true }
    ];
    this.init();
  }

  async downloadVideo() {
    if (!this.currentUrl) {
      alert('Please enter or paste a URL first');
      return;
    }

    try {
      this.videoDownloading = true;
      this.videoProgress = 0;
      this.updateUI();

      // Setup progress listeners
      window.electronAPI.onVideoProgress((event, progress) => {
        this.videoProgress = progress.percent;
        this.updateUI();
      });

      window.electronAPI.onVideoEvent((event, data) => {
        console.log('Video event:', data);
      });

      const result = await window.electronAPI.downloadVideo(this.currentUrl);
      if (result.success) {
        alert('Video downloaded successfully!');
      } else {
        alert(`Video download failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Video download error:', error);
      alert(`Video download failed: ${error.message || 'Unknown error'}`);
    } finally {
      this.videoDownloading = false;
      window.electronAPI.removeVideoListeners();
      this.updateUI();
    }
  }
  
  init() {
    console.log('MangaDownloader init called');
    this.renderModuleButtons();
    this.setupEventListeners();
    // Get initial ad block state
    window.electronAPI.getGlobalAdblockState().then((enabled) => {
      this.adBlockEnabled = enabled;
      this.updateUI();
    }).catch((error) => {
      console.error('Error getting ad block state:', error);
      this.adBlockEnabled = true;
      this.updateUI();
    });
    // Listen for browser URL changes
    window.electronAPI.onBrowserUrlChanged((event, url) => {
      // Update URL display in browser header
      document.getElementById('url-edit').value = url;
      this.currentUrl = url;
      this.updateUI();
    });
  }
  
  renderModuleButtons() {
    console.log('renderModuleButtons called');
    const container = document.getElementById('module-buttons');
    const filteredModules = this.getFilteredModules();
    console.log('Filtered modules:', filteredModules);
    container.innerHTML = '';
    filteredModules.forEach(module => {
      const button = document.createElement('button');
      button.className = 'module-button';
      button.style.backgroundColor = module.color;
      button.textContent = module.name.substring(0, 2).toUpperCase();
      button.title = module.name;
      button.onclick = () => {
        console.log('Module button clicked:', module);
        this.selectModule(module);
      };
      if (module.name === this.activeModule) {
        button.classList.add('active');
      }
      container.appendChild(button);
    });
    console.log('Module buttons rendered:', container.children.length);
  }
  
  getFilteredModules() {
    return this.modules.filter(module => this.adultMode || !module.adult);
  }
  
  selectModule(module) {
    this.activeModule = module.name;
    // Add domain to trusted list
    try {
      const domain = new URL(module.url).hostname;
      window.electronAPI.addTrustedDomain(domain);
    } catch (e) {
      console.error('Error adding trusted domain:', e);
    }
    // Add YouTube to trusted domains if using blank browser
    if (this.activeModule === 'None') {
      window.electronAPI.addTrustedDomain('youtube.com');
      window.electronAPI.addTrustedDomain('www.youtube.com');
      window.electronAPI.addTrustedDomain('youtu.be');
    }
    this.currentUrl = module.url;
    this.updateUI();
    // Always open browser when selecting module
    window.electronAPI.openBrowser(this.currentUrl);
    setTimeout(() => {
      window.electronAPI.resizeBrowserView(!this.sidebarCollapsed);
    }, 100);
  }
  
  setupEventListeners() {
    // Add close button functionality
    const closeButton = document.getElementById('close-button');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        window.electronAPI.windowClose();
      });
    }
    // ...existing code for event listeners...
    // Browser toggle
    document.getElementById('browser-toggle').onclick = () => {
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
    // Navigation controls
    document.getElementById('browser-back').onclick = () => {
      window.electronAPI.navigateBrowser('back');
    };
    document.getElementById('browser-forward').onclick = () => {
      window.electronAPI.navigateBrowser('forward');
    };
    document.getElementById('browser-refresh').onclick = () => {
      window.electronAPI.navigateBrowser('refresh');
    };
    const closeBtn = document.getElementById('close-browser');
    if (closeBtn) {
      closeBtn.onclick = () => {
        this.browserEnabled = false;
        window.electronAPI.closeBrowser();
        this.updateUI();
      };
    }
    // Adult mode toggle
    document.getElementById('adult-toggle').onclick = () => {
      this.adultMode = !this.adultMode;
      this.renderModuleButtons();
      this.updateUI();
    };
    
    // AdBlock toggle
    document.getElementById('adblock-toggle').onclick = async () => {
      const newState = !this.adBlockEnabled;

      // Optimistically update UI
      this.adBlockEnabled = newState;
      this.updateUI();

      try {
        const success = await window.electronAPI.setAdBlockEnabled(newState);
        if (!success) {
          // Revert if operation failed
          this.adBlockEnabled = !newState;
          this.updateUI();
          alert('Failed to update ad blocker settings');
        }
      } catch (error) {
        console.error('Error toggling ad block:', error);
        this.adBlockEnabled = !newState;
        this.updateUI();
        alert(`Error: ${error.message || 'Unknown error'}`);
      }
    };
    
    // URL input
    const urlInput = document.getElementById('url-input');
    urlInput.oninput = (e) => {
      this.currentUrl = e.target.value;
      this.updateUI();
    };
    
    // Paste button
    document.getElementById('paste-btn').onclick = async () => {
      const url = await window.electronAPI.getBrowserUrl();
      if (url) {
        urlInput.value = url;
        this.currentUrl = url;
        this.updateUI();
      }
    };
    

    // Download button
    document.getElementById('download-btn').onclick = () => {
      if (this.isDownloading) {
        this.cancelDownload();
      } else {
        this.downloadManga();
      }
    };

    // Download video button
    document.getElementById('download-video-btn').onclick = () => {
      this.downloadVideo();
    };
    
    // Add handler for URL input box (Enter key)
    urlInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        const url = urlInput.value.trim();
        if (url) {
          window.electronAPI.openBrowser(url);
        }
      }
    };
    // Add handler for Go button (if present)
    const goBtn = document.getElementById('go-btn');
    if (goBtn) {
      goBtn.onclick = () => {
        const url = urlInput.value.trim();
        if (url) {
          window.electronAPI.openBrowser(url);
        }
      };
    }
    // Blank browser button handler
    const blankBtn = document.getElementById('blank-browser-btn');
    if (blankBtn) {
      blankBtn.onclick = () => {
        this.activeModule = 'None';
        this.currentUrl = 'about:blank';
        this.updateUI();
        window.electronAPI.openBrowser(this.currentUrl);
      };
    }
    // Browser header navigation
    const urlEdit = document.getElementById('url-edit');
    if (urlEdit) {
      urlEdit.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          this.navigateFromBrowserHeader();
        }
      });
    }

    if (goBtn) {
      goBtn.addEventListener('click', () => {
        this.navigateFromBrowserHeader();
      });
    }
    // Sidebar toggle
    document.getElementById('sidebar-toggle').onclick = () => {
      this.toggleSidebar();
    };
    document.getElementById('expand-sidebar-btn').onclick = () => {
      this.toggleSidebar();
    };
    // Traffic lights handler for red button
    const redBtn = document.getElementById('red');
    if (redBtn) {
      redBtn.onclick = () => {
        window.electronAPI.windowClose();
      };
    }
  }
  
  async downloadManga() {
    if (!this.currentUrl) {
      alert('Please enter or paste a URL first');
      return;
    }

    try {
      this.isDownloading = true;
      this.updateUI();
      const result = await window.electronAPI.downloadManga(
        this.activeModule,
        this.currentUrl,
        { adultMode: this.adultMode }
      );
      if (result.success) {
        alert(`Download started successfully from ${this.activeModule}`);
      } else {
        alert(`Download failed: ${result.error}`);
      }
    } catch (error) {
      console.error('Download error:', error);
      alert(`Download failed: ${error.message || 'Unknown error'}`);
    } finally {
      this.isDownloading = false;
      this.updateUI();
    }
  }
  
  cancelDownload() {
        this.lastCustomUrl = ''; // Added property to store last custom URL
    if (confirm('Abort current download?')) {
      this.isDownloading = false;
      this.downloadQueue = [];
      this.updateUI();
    }
  }
  
  toggleSidebar() {
    this.sidebarCollapsed = !this.sidebarCollapsed;
    this.updateUI();
    // Send to main process to resize browser view
    window.electronAPI.resizeBrowserView(!this.sidebarCollapsed);
  }
  
  navigateFromBrowserHeader() {
    const urlEdit = document.getElementById('url-edit');
    let url = urlEdit.value.trim();
    if (!url) {
      url = 'about:blank';
    }
    // Add trusted domains for social media
    const socialDomains = [
      'instagram.com', 'www.instagram.com',
      'facebook.com', 'www.facebook.com',
      'twitter.com', 'x.com', 'www.twitter.com', 'www.x.com'
    ];
    socialDomains.forEach(domain => {
      window.electronAPI.addTrustedDomain(domain);
    });
    // Smart protocol handling
    if (url === 'about:blank' || isValidUrl(url)) {
      window.electronAPI.openBrowser(url);
      // Update currentUrl to keep UI in sync
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
    // Update active module display
    document.getElementById('active-module-name').textContent = this.activeModule;
    
    // Update toggles
    const browserToggle = document.getElementById('browser-toggle');
    const adultToggle = document.getElementById('adult-toggle');
    const adblockToggle = document.getElementById('adblock-toggle');
    
    browserToggle.classList.toggle('active', this.browserEnabled);
    adultToggle.classList.toggle('active', this.adultMode);
    adblockToggle.classList.toggle('active', this.adBlockEnabled);
    

    // Update download button
    const downloadBtn = document.getElementById('download-btn');
    downloadBtn.disabled = !this.currentUrl;
    if (this.isDownloading) {
      downloadBtn.innerHTML = `<i class="fas fa-stop-circle"></i> Cancel Download`;
    } else {
      downloadBtn.innerHTML = `<i class="fas fa-download"></i> Download`;
    }

    // Video download button
    const videoBtn = document.getElementById('download-video-btn');
    if (videoBtn) {
      videoBtn.disabled = !this.currentUrl || this.videoDownloading;
      videoBtn.innerHTML = this.videoDownloading ? 
        `<i class="fas fa-sync fa-spin"></i> Downloading...` : 
        `<i class="fas fa-video"></i> Download Video`;
    }

    // Video progress
    const videoProgressElem = document.getElementById('video-progress');
    if (videoProgressElem) {
      videoProgressElem.textContent = `${Math.round(this.videoProgress)}%`;
    }

    // Add progress bar to UI
    let progressContainer = document.querySelector('.progress-container');
    if (!progressContainer) {
      progressContainer = document.createElement('div');
      progressContainer.className = 'progress-container';
      const progressBar = document.createElement('div');
      progressBar.className = 'progress-bar';
      progressBar.id = 'video-progress-bar';
      progressContainer.appendChild(progressBar);
      const statusInfo = document.querySelector('.status-info');
      if (statusInfo) statusInfo.appendChild(progressContainer);
    }
    const progressBarElem = document.getElementById('video-progress-bar');
    if (progressBarElem) {
      progressBarElem.style.width = `${this.videoProgress}%`;
    }

    // Explicitly enable/disable URL input field
    const urlInput = document.getElementById('url-input');
    if (urlInput) {
      urlInput.disabled = false;
    }
    
    // Update status
    const filteredModules = this.getFilteredModules();
    document.getElementById('module-count').textContent = `${filteredModules.length} loaded`;
    document.getElementById('mode-display').textContent = this.adultMode ? 'Adult' : 'Regular';
    
    // Update module buttons
    document.querySelectorAll('.module-button').forEach(btn => {
      btn.classList.remove('active');
      if (btn.title === this.activeModule) {
        btn.classList.add('active');
      }
    });
    
    // Browser visibility
    const placeholder = document.getElementById('browser-placeholder');
    if (this.browserEnabled) {
      placeholder.style.display = 'none';
    } else {
      placeholder.style.display = 'flex';
    }
    // Update URL input field
    if (urlInput) {
      urlInput.value = this.currentUrl;
    }
    const sidebar = document.querySelector('.sidebar-right');
    const mainContent = document.querySelector('.main-content');
    const expandBtn = document.getElementById('expand-sidebar-btn');
    sidebar.classList.toggle('collapsed', this.sidebarCollapsed);
    mainContent.classList.toggle('expanded', this.sidebarCollapsed);
    expandBtn.style.display = this.sidebarCollapsed ? 'block' : 'none';
  }
}

// Initialize app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new MangaDownloader();
});