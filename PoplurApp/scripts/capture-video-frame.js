const fs = require('fs');
const path = require('path');

const { chromium } = require('/Users/matrix/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

async function main() {
  const [sourcePath, outPath, seconds = '1.5'] = process.argv.slice(2);
  if (!sourcePath || !outPath) {
    throw new Error('Usage: node scripts/capture-video-frame.js <source.mp4> <out.png> [seconds]');
  }

  const sourceData = `data:video/mp4;base64,${fs.readFileSync(path.resolve(sourcePath)).toString('base64')}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.setContent(`
    <!doctype html>
    <html>
      <body style="margin:0;background:#111">
        <video id="v" src="${sourceData}" muted playsinline style="width:1280px;height:720px;object-fit:cover"></video>
      </body>
    </html>
  `);
  const info = await page.evaluate(async (time) => {
    const video = document.getElementById('v');
    await new Promise((resolve, reject) => {
      video.onloadedmetadata = resolve;
      video.onerror = reject;
    });
    video.currentTime = Math.min(Number(time), Math.max(0, video.duration - 0.1));
    await new Promise((resolve) => {
      video.onseeked = resolve;
    });
    return {
      duration: video.duration,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  }, seconds);
  await page.screenshot({ path: path.resolve(outPath) });
  await browser.close();
  console.log(JSON.stringify(info));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
