const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

async function downloadFromHentai2Read({ url, ...rest }) {
  if (!url || typeof url !== 'string') {
    throw new Error('No URL provided to Hentai2Read downloader. Received: ' + url);
  }
  const browser = await chromium.launch({ 
    headless: true,
    ignoreHTTPSErrors: true, // Add this
    args: [
      '--disable-features=IsolateOrigins,site-per-process',
      '--flag-switches-begin --ignore-certificate-errors --flag-switches-end'
    ]
  });
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log(`🌐 Opening: ${url}`);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  let rawTitle = await page.title();
  rawTitle = rawTitle.split('|')[0].trim();
  const safeTitle = rawTitle.replace(/[^a-z0-9-_ ]/gi, '').replace(/\s+/g, '_').toLowerCase();

  const outputFolder = path.join(__dirname, '..', 'downloads', safeTitle);
  await fs.ensureDir(outputFolder);
  console.log(`📘 Manga Title: ${safeTitle}`);

  let pageIndex = 1;
  let prevImgUrl = '';

  while (true) {
    try {
      await page.waitForSelector('#arf-reader', { timeout: 10000 });
      const imgUrl = await page.$eval('#arf-reader', img => img.src);

      if (imgUrl === prevImgUrl || !imgUrl.endsWith('.jpg')) {
        console.log('✅ Done. Total pages:', pageIndex - 1);
        break;
      }

      const filePath = path.join(outputFolder, `${String(pageIndex).padStart(3, '0')}.jpg`);
      const view = await page.$('#arf-reader');
      const buffer = await view.screenshot({ type: 'jpeg' });
      await fs.writeFile(filePath, buffer);
      console.log(`📥 Saved image ${pageIndex}: ${filePath}`);

      prevImgUrl = imgUrl;
      pageIndex++;

      await page.waitForTimeout(5000); // delay before clicking next

      const clicked = await page.evaluate(() => {
        const btn = document.querySelector('#reader-nav-next');
        if (btn) {
          btn.click();
          return true;
        }
        return false;
      });

      if (!clicked) {
        console.log('❌ Could not find or click next button.');
        break;
      }

      await page.waitForFunction(
        prev => document.querySelector('#arf-reader')?.src !== prev,
        prevImgUrl,
        { timeout: 10000 }
      );

      await page.waitForTimeout(800);
    } catch (err) {
      console.error(`❌ Error at page ${pageIndex}: ${err.message}`);
      break;
    }
  }

  await browser.close();
}

module.exports = { download: downloadFromHentai2Read };