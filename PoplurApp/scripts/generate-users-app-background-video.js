const fs = require('fs');
const path = require('path');

const { chromium } = require('/Users/matrix/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const WIDTH = 1280;
const HEIGHT = 720;
const DURATION_SECONDS = 12;
const FPS = 30;
const MIME_TYPE = 'video/mp4;codecs=avc1.42E01E';

async function main() {
  const outDir = path.resolve('assets/videos');
  fs.mkdirSync(outDir, { recursive: true });

  const sourcePath = '/Users/matrix/Desktop/download.png';
  const sourceData = `data:image/png;base64,${fs.readFileSync(sourcePath).toString('base64')}`;
  const logoData = `data:image/png;base64,${fs.readFileSync('assets/images/logo3.png').toString('base64')}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  await page.setContent(`<!doctype html>
    <html>
      <body style="margin:0;background:#050710">
        <canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
      </body>
    </html>`);

  const base64 = await page.evaluate(
    async ({ durationSeconds, fps, logoData, mimeType, sourceData }) => {
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      const image = new Image();
      image.src = sourceData;
      const logo = new Image();
      logo.src = logoData;
      await Promise.all([image.decode(), logo.decode()]);

      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5200000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      function roundedRect(x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
      }

      function drawPhoneLogo(cx, cy, width, height, rotation, alpha) {
        ctx.save();
        ctx.translate(cx, cy);
        ctx.rotate(rotation);

        ctx.globalAlpha = alpha;
        roundedRect(-width / 2, -height / 2, width, height, Math.min(width, height) * 0.16);
        ctx.fillStyle = 'rgba(255, 10, 138, 0.9)';
        ctx.fill();

        const glow = ctx.createRadialGradient(0, 0, 4, 0, 0, width * 0.78);
        glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
        glow.addColorStop(0.5, 'rgba(255, 10, 138, 0.24)');
        glow.addColorStop(1, 'rgba(255, 10, 138, 0)');
        ctx.fillStyle = glow;
        ctx.fillRect(-width, -height, width * 2, height * 2);

        ctx.shadowColor = 'rgba(255, 10, 138, 0.7)';
        ctx.shadowBlur = 18;
        ctx.drawImage(logo, -width * 0.32, -width * 0.32, width * 0.64, width * 0.64);
        ctx.restore();
      }

      function drawFrame(ms) {
        const progress = ((ms / 1000) % durationSeconds) / durationSeconds;
        const imageRatio = image.width / image.height;
        const canvasRatio = canvas.width / canvas.height;
        const baseScale = imageRatio > canvasRatio ? canvas.height / image.height : canvas.width / image.width;
        const breathing = 1.055 + Math.sin(progress * Math.PI * 2) * 0.018;
        const drawWidth = image.width * baseScale * breathing;
        const drawHeight = image.height * baseScale * breathing;
        const x = (canvas.width - drawWidth) / 2 + Math.sin(progress * Math.PI * 2) * 26;
        const y = (canvas.height - drawHeight) / 2 + Math.cos(progress * Math.PI * 2) * 9;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, x, y, drawWidth, drawHeight);

        const imageToCanvasX = (sourceX) => x + (sourceX / image.width) * drawWidth;
        const imageToCanvasY = (sourceY) => y + (sourceY / image.height) * drawHeight;
        const scale = drawWidth / image.width;
        const logoPulse = 0.92 + Math.sin(progress * Math.PI * 2) * 0.05;
        const phoneLogos = [
          { x: 93, y: 608, w: 150, h: 246, r: -0.04, a: 0.78 },
          { x: 744, y: 654, w: 132, h: 226, r: -0.06, a: 0.92 },
          { x: 1242, y: 554, w: 178, h: 270, r: -0.28, a: 0.96 },
        ];
        phoneLogos.forEach((phone) => {
          drawPhoneLogo(
            imageToCanvasX(phone.x),
            imageToCanvasY(phone.y),
            phone.w * scale * logoPulse,
            phone.h * scale * logoPulse,
            phone.r,
            phone.a,
          );
        });

        const grade = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grade.addColorStop(0, 'rgba(1,5,14,.14)');
        grade.addColorStop(0.46, 'rgba(1,5,14,.02)');
        grade.addColorStop(1, 'rgba(1,5,14,.38)');
        ctx.fillStyle = grade;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const magentaGlow = ctx.createRadialGradient(
          canvas.width * (0.48 + Math.sin(progress * Math.PI * 2) * 0.02),
          canvas.height * 0.64,
          10,
          canvas.width * 0.48,
          canvas.height * 0.64,
          canvas.width * 0.42,
        );
        magentaGlow.addColorStop(0, 'rgba(255, 23, 151, .18)');
        magentaGlow.addColorStop(1, 'rgba(255, 23, 151, 0)');
        ctx.fillStyle = magentaGlow;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const sweepX = -260 + progress * (canvas.width + 520);
        ctx.save();
        ctx.globalAlpha = 0.16;
        ctx.translate(sweepX, canvas.height * 0.42);
        ctx.rotate(-0.22);
        const shine = ctx.createLinearGradient(-180, 0, 180, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)');
        shine.addColorStop(0.5, 'rgba(255,255,255,.32)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        roundedRect(-190, -12, 380, 24, 12);
        ctx.fill();
        ctx.restore();

        const vignette = ctx.createRadialGradient(
          canvas.width * 0.5,
          canvas.height * 0.48,
          canvas.width * 0.22,
          canvas.width * 0.5,
          canvas.height * 0.48,
          canvas.width * 0.82,
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.68, 'rgba(0,0,0,.12)');
        vignette.addColorStop(1, 'rgba(0,0,0,.58)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      recorder.start();
      const startTime = performance.now();
      while (performance.now() - startTime < durationSeconds * 1000) {
        drawFrame(performance.now() - startTime);
        await new Promise(requestAnimationFrame);
      }
      recorder.stop();
      await done;

      const blob = new Blob(chunks, { type: mimeType });
      const arrayBuffer = await blob.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      let binary = '';
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return btoa(binary);
    },
    { durationSeconds: DURATION_SECONDS, fps: FPS, logoData, mimeType: MIME_TYPE, sourceData },
  );

  const outPath = path.join(outDir, 'poplur-users-app-background.mp4');
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  await browser.close();
  console.log(`${outPath} ${fs.statSync(outPath).size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
