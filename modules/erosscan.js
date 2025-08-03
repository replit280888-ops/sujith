const { chromium } = require('playwright');
const fs = require('fs-extra');
const path = require('path');

async function scrapeErosScans({ url, title = 'eros_manga' }) {
  const browser = await chromium.launch({ 
    headless: true,
    ignoreHTTPSErrors: true, // Add this
    args: [
      '--disable-features=IsolateOrigins,site-per-process',
      '--flag-switches-begin --ignore-certificate-errors --flag-switches-end'
    ]
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/110 Safari/537.36'
  });

  const page = await context.newPage();
  page.on('popup', popup => popup.close()); // Prevent mini-tabs

  console.log(`🌐 Opening: ${url}`);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
  } catch (err) {
    console.error(`❌ Failed to load page: ${err.message}`);
    await browser.close();
    return;
  }

  await page.evaluate(() => window.scrollBy(0, 400));
  await page.waitForTimeout(1500);

  const imgLinks = await page.$$eval('#readerarea img.ts-main-image', imgs =>
    imgs.map(img => img.src)
  );

  console.log(`🖼️ Found ${imgLinks.length} images`);

  const folder = path.join(__dirname, '..', 'downloads', title.replace(/\s+/g, '_'));
  await fs.ensureDir(folder);

  let index = 1;
  for (const imgUrl of imgLinks) {
    try {
      const view = await page.goto(imgUrl);
      const buffer = await view.body();
      const ext = path.extname(imgUrl).split('?')[0] || '.webp';
      const filePath = path.join(folder, `${index}${ext}`);
      await fs.writeFile(filePath, buffer);
      console.log(`✅ Saved image ${index}: ${filePath}`);
      index++;
    } catch (err) {
      console.error(`❌ Failed to download: ${imgUrl}`);
    }
  }

  await browser.close();
}

module.exports = { download: scrapeErosScans };