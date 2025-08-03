const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

class ColamangaDownloader {
  constructor() {
    this.baseUrl = 'https://colamanga.com';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Upgrade-Insecure-Requests': '1',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none'
    };
  }

  async getChapterImages(chapterUrl) {
    try {
      const response = await axios.get(chapterUrl, { 
        headers: this.headers,
        timeout: 30000,
        maxRedirects: 5
      });
      const $ = cheerio.load(response.data);

      const images = [];

      // Try multiple selectors for colamanga
      const selectors = [
        'img.img-fluid',
        'img[data-src]',
        'img[src*="manga"]',
        '.chapter-img img',
        '.manga-img img',
        'img.lazy',
        'img[src*="colamanga"]'
      ];

      for (const selector of selectors) {
        $(selector).each((index, element) => {
          const src = $(element).attr('data-src') || $(element).attr('src');
          if (src && (src.includes('.jpg') || src.includes('.png') || src.includes('.jpeg') || src.includes('.webp'))) {
            const fullUrl = src.startsWith('http') ? src : this.baseUrl + src;
            if (!images.includes(fullUrl)) {
              images.push(fullUrl);
            }
          }
        });
      }

      // If no images found, try script tags for dynamic loading
      if (images.length === 0) {
        $('script').each((index, element) => {
          const scriptContent = $(element).html();
          if (scriptContent && scriptContent.includes('img')) {
            const matches = scriptContent.match(/https?:\/\/[^"'\s]+\.(?:jpg|jpeg|png|webp)/gi);
            if (matches) {
              images.push(...matches);
            }
          }
        });
      }

      return [...new Set(images)]; // Remove duplicates
    } catch (error) {
      throw new Error(`Failed to get chapter images: ${error.message}`);
    }
  }

  async downloadImage(imageUrl, chapterDir, index) {
    try {
      const response = await axios.get(imageUrl, {
        responseType: 'stream',
        headers: this.headers,
        timeout: 30000,
        maxRedirects: 5
      });

      const filename = `page_${String(index).padStart(3, '0')}.${imageUrl.split('.').pop().split('?')[0]}`;
      const filePath = path.join(chapterDir, filename);

      const writer = fs.createWriteStream(filePath);

      response.data.pipe(writer);

      return new Promise((resolve, reject) => {
        writer.on('finish', () => {
          console.log(`Downloaded image ${index}: ${filename}`);
          resolve({ success: true, filename: filename });
        });
        writer.on('error', (error) => {
          console.error(`Error writing image ${index}: ${error.message}`);
          fs.unlink(filePath, () => reject({ success: false, error: error.message }));
        });
      });
    } catch (error) {
      console.error(`Failed to download image ${index}: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  getChapterName(chapterUrl) {
    const parts = chapterUrl.split('/');
    return parts[parts.length - 2] || 'Unknown_Chapter';
  }

  async download({ url, downloadPath = './downloads' }) {
    try {
      console.log(`Starting Colamanga download from: ${url}`);

      // Validate URL
      if (!url.includes('colamanga.com')) {
        throw new Error('Invalid Colamanga URL');
      }

      const images = await this.getChapterImages(url);

      if (images.length === 0) {
        throw new Error('No images found on this page. The chapter might be behind a paywall or require login.');
      }

      console.log(`Found ${images.length} images for download`);

      const chapterName = this.getChapterName(url);
      const chapterDir = path.join(downloadPath, 'colamanga', chapterName);

      if (!fs.existsSync(chapterDir)) {
        fs.mkdirSync(chapterDir, { recursive: true });
      }

      // Download images with retry logic
      const downloadResults = [];
      for (let i = 0; i < images.length; i++) {
        try {
          const result = await this.downloadImage(images[i], chapterDir, i + 1);
          downloadResults.push(result);
        } catch (error) {
          console.warn(`Failed to download image ${i + 1}: ${error.message}`);
        }
      }

      const successCount = downloadResults.filter(r => r.success).length;

      return {
        success: successCount > 0,
        message: `Downloaded ${successCount}/${images.length} images`,
        path: chapterDir,
        totalImages: images.length,
        downloadedImages: successCount
      };
    } catch (error) {
      console.error('Colamanga download error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = ColamangaDownloader;