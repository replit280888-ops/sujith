const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { chromium } = require('playwright');

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
}

function getGalleryJSUrl(galleryId) {
  const part = Math.floor(Number(galleryId) / 1000) * 1000;
  return `https://hitomi.la/galleries/${part}/${galleryId}.js`;
}

function buildImageUrl(hash, ext) {
  const bucket = parseInt(hash.slice(-2), 16) % 2 === 0 ? 'a' : 'b';
  return `https://${bucket}.hitomi.la/images/${hash}.${ext}`;
}

async function downloadHitomi({ url }) {
  console.log(`🌐 Launching browser for: ${url}`);

  const browser = await chromium.launch({ 
    headless: true,
    ignoreHTTPSErrors: true, // Add this
    args: [
      '--disable-features=IsolateOrigins,site-per-process',
      '--flag-switches-begin --ignore-certificate-errors --flag-switches-end'
    ]
  });

  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  });

  const page = await context.newPage();

  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // Wait for JS to populate

  // Extract gallery ID from URL or fallback to in-page JS
  let galleryId = url.match(/(\d+)\.html$/)?.[1];

  if (!galleryId) {
    galleryId = await page.evaluate(() => window.galleryinfo?.id?.toString());
  }

  const titleRaw = await page.title();
  await browser.close();

  if (!galleryId) {
    throw new Error('❌ Could not extract gallery ID');
  }

  const title = sanitizeFilename(titleRaw.split('|')[0].trim());
  const outputDir = path.join(__dirname, '..', 'downloads', title);
  await fs.ensureDir(outputDir);

  const jsUrl = getGalleryJSUrl(galleryId);
  console.log(`📄 Fetching metadata: ${jsUrl}`);
  const res = await axios.get(jsUrl);
  const jsonMatch = res.data.match(/\{[\s\S]+\}/);
  if (!jsonMatch) throw new Error('❌ Invalid gallery JSON');

  const data = JSON.parse(jsonMatch[0]);
  const files = data.files;
  if (!Array.isArray(files)) throw new Error('❌ No file list found');

  console.log(`📥 Downloading "${title}" with ${files.length} images...`);
  let count = 0;

  for (const f of files) {
    const ext = f.name.split('.').pop();
    const imgUrl = buildImageUrl(f.hash, ext);
    const outputPath = path.join(outputDir, `${String(++count).padStart(3, '0')}.${ext}`);

    try {
      const imgRes = await axios.get(imgUrl, { responseType: 'arraybuffer' });
      await fs.writeFile(outputPath, imgRes.data);
      console.log(`✅ Saved: ${outputPath}`);
    } catch (err) {
      console.error(`❌ Failed to download: ${imgUrl}`);
    }

    await new Promise((r) => setTimeout(r, 300)); // Delay to avoid hammering server
  }

  console.log(`🎉 Download complete: ${title} (${count} images)`);
  return { title, count };
}

module.exports = { download: downloadHitomi };