const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

class ColaMangaDownloader {
  constructor() {
    this.baseUrl = 'https://colamanga.com';
    this.browser = null;
    this.page = null;
  }

  async initialize() {
    try {
      this.browser = await chromium.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      this.page = await this.browser.newPage();
      await this.page.setUserAgent(
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
      );
    } catch (error) {
      console.error('Failed to initialize browser:', error);
      throw error;
    }
  }

  async extractChapterInfo(url) {
    try {
      await this.page.goto(url, { waitUntil: 'networkidle' });

      const title = await this.page.textContent('h1, .manga-title, .chapter-title').catch(() => 'Unknown');
      const images = await this.page.$$eval('img[src*="manga"], .chapter-image img, .page-image img', 
        imgs => imgs.map(img => img.src).filter(src => src && src.includes('http'))
      );

      return {
        title: title.trim(),
        images: images,
        totalPages: images.length
      };
    } catch (error) {
      console.error('Error extracting chapter info:', error);
      throw error;
    }
  }

  async downloadImages(chapterInfo, downloadPath) {
    const { title, images } = chapterInfo;
    const sanitizedTitle = title.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_');
    const chapterDir = path.join(downloadPath, sanitizedTitle);

    await fs.ensureDir(chapterDir);

    for (let i = 0; i < images.length; i++) {
      try {
        const imageUrl = images[i];
        const extension = path.extname(new URL(imageUrl).pathname) || '.jpg';
        const filename = `page_${String(i + 1).padStart(3, '0')}${extension}`;
        const imagePath = path.join(chapterDir, filename);

        const response = await this.page.goto(imageUrl);
        const buffer = await response.body();
        await fs.writeFile(imagePath, buffer);

        console.log(`Downloaded: ${filename}`);
      } catch (error) {
        console.error(`Failed to download image ${i + 1}:`, error);
      }
    }

    return chapterDir;
  }

  async cleanup() {
    if (this.browser) {
      await this.browser.close();
    }
  }
}

async function download({ url, downloadPath = './downloads', ...options }) {
  const downloader = new ColaMangaDownloader();

  try {
    await downloader.initialize();
    const chapterInfo = await downloader.extractChapterInfo(url);

    if (chapterInfo.images.length === 0) {
      throw new Error('No images found on this page');
    }

    const savedPath = await downloader.downloadImages(chapterInfo, downloadPath);

    return {
      success: true,
      title: chapterInfo.title,
      totalPages: chapterInfo.totalPages,
      savedPath: savedPath
    };
  } catch (error) {
    console.error('Download failed:', error);
    return {
      success: false,
      error: error.message
    };
  } finally {
    await downloader.cleanup();
  }
}

module.exports = { download };