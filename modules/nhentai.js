const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth')();
const fs = require('fs-extra');
const path = require('path');

chromium.use(StealthPlugin);

async function scrapeNhentai({ url, title = 'nhentai_manga', cookies = [] }) {
  if (!url || typeof url !== 'string') {
    throw new Error('No URL provided to nhentai downloader. Received: ' + url);
  }
  const browser = await chromium.launch({ 
    headless: false,
    ignoreHTTPSErrors: true, // Add this
    args: [
      '--disable-features=IsolateOrigins,site-per-process',
      '--flag-switches-begin --ignore-certificate-errors --flag-switches-end'
    ]
  });
  const context = await browser.newContext();
  if (cookies.length) await context.addCookies(cookies);
  const page = await context.newPage();

  console.log('🌐 Opening:', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });

  const imgUrls = await page.$$eval('#thumbnail-container a', els =>
    els.map(a => a.href)
  );

  console.log(`Pages found: ${imgUrls.length}`);
  const folder = path.join(__dirname, '..', 'downloads', title.replace(/\s+/g, '_'));
  await fs.ensureDir(folder);

  let idx = 1;
  for (const pUrl of imgUrls) {
    await page.goto(pUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    const imgUrl = await page.$eval('#image-container img', img => img.src);
    const view = await page.goto(imgUrl);
    const buffer = await view.body();
    const ext = path.extname(new URL(imgUrl).pathname) || '.jpg';
    await fs.writeFile(path.join(folder, `${idx.toString().padStart(3, '0')}${ext}`), buffer);
    console.log(`Saved: ${idx}${ext}`);
    idx++;
  }

  await browser.close();
  return { success: true, count: idx - 1 };
}

module.exports = { download: scrapeNhentai };