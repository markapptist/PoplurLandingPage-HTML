const fs = require('fs');
const path = require('path');

const { chromium } = require('/Users/matrix/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const WIDTH = 1280;
const HEIGHT = 720;
const DURATION_SECONDS = 8;
const FPS = 30;
const FORMAT = process.argv.includes('--mp4') ? 'mp4' : 'webm';
const MIME_TYPE = FORMAT === 'mp4' ? 'video/mp4;codecs=avc1.42E01E' : 'video/webm;codecs=vp8';

async function main() {
  const outDir = path.resolve('assets/videos');
  fs.mkdirSync(outDir, { recursive: true });

  const logoData = `data:image/png;base64,${fs.readFileSync('assets/images/logo3.png').toString('base64')}`;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#111"><canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas></body></html>`,
  );

  const base64 = await page.evaluate(
    async ({ durationSeconds, fps, logoData, mimeType }) => {
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      const logo = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = logoData;
      });

      const stream = canvas.captureStream(fps);
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 5000000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      function roundRect(x, y, w, h, r) {
        const rr = Math.min(r, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
        ctx.closePath();
      }

      function glow(x, y, r, color, alpha = 1) {
        const gradient = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, r * 0.1, x, y, r);
        gradient.addColorStop(0, color);
        gradient.addColorStop(1, 'rgba(5,7,16,0)');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      function heart(x, y, scale, alpha) {
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(scale, scale);
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ff4eaa';
        ctx.beginPath();
        ctx.moveTo(0, 16);
        ctx.bezierCurveTo(-42, -18, -12, -42, 0, -18);
        ctx.bezierCurveTo(12, -42, 42, -18, 0, 16);
        ctx.fill();
        ctx.restore();
        ctx.globalAlpha = 1;
      }

      function drawPerson(person, t) {
        const bob = Math.sin(t * 2 * Math.PI + person.phase) * 10;
        const sway = Math.sin(t * 2 * Math.PI + person.phase * 0.7) * 4;
        ctx.save();
        ctx.translate(person.x + sway, person.y + bob);
        ctx.scale(person.scale, person.scale);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.fillStyle = person.shadow;
        ctx.beginPath();
        ctx.ellipse(0, 170, 72, 18, 0, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = person.skin;
        ctx.lineWidth = 24;
        ctx.beginPath();
        ctx.moveTo(-26, 32);
        ctx.quadraticCurveTo(-74, 72, -76, 112);
        ctx.moveTo(28, 34);
        ctx.quadraticCurveTo(74, 60, 78, 102);
        ctx.stroke();

        ctx.strokeStyle = person.pants;
        ctx.lineWidth = 30;
        ctx.beginPath();
        ctx.moveTo(-24, 116);
        ctx.lineTo(-48, 178);
        ctx.moveTo(24, 116);
        ctx.lineTo(52, 178);
        ctx.stroke();

        ctx.fillStyle = person.shirt;
        roundRect(-54, 42, 108, 94, 32);
        ctx.fill();

        ctx.fillStyle = person.skin;
        ctx.beginPath();
        ctx.arc(0, 0, 42, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = person.hair;
        ctx.beginPath();
        ctx.arc(-4, -15, 44, Math.PI * 0.95, Math.PI * 2.08);
        ctx.quadraticCurveTo(35, -42, 44, -8);
        ctx.quadraticCurveTo(6, -24, -34, -4);
        ctx.fill();

        ctx.fillStyle = '#1d2030';
        ctx.beginPath();
        ctx.arc(-13, 1, 4, 0, Math.PI * 2);
        ctx.arc(15, 1, 4, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#8b315b';
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(1, 15, 13, 0, Math.PI);
        ctx.stroke();

        ctx.save();
        ctx.translate(person.phoneX, 84 + Math.sin(t * 2 * Math.PI + person.phase + 1) * 3);
        ctx.rotate(person.phoneRotation + Math.sin(t * 2 * Math.PI + person.phase) * 0.04);
        ctx.fillStyle = '#171923';
        roundRect(-26, -42, 52, 84, 12);
        ctx.fill();
        ctx.fillStyle = '#f9f4ff';
        roundRect(-20, -34, 40, 68, 8);
        ctx.fill();
        ctx.drawImage(logo, -14, -22, 28, 28);
        ctx.fillStyle = '#ff2a93';
        roundRect(-13, 10, 26, 6, 3);
        ctx.fill();
        ctx.fillStyle = '#20c6ff';
        roundRect(-10, 21, 20, 5, 3);
        ctx.fill();
        ctx.restore();

        ctx.restore();
      }

      const people = [
        {
          x: 250,
          y: 360,
          scale: 1.05,
          phase: 0.1,
          skin: '#f6bd8b',
          hair: '#2c1724',
          shirt: '#25b8ff',
          pants: '#2f3760',
          shadow: 'rgba(0,0,0,.2)',
          phoneX: 64,
          phoneRotation: 0.1,
        },
        {
          x: 640,
          y: 352,
          scale: 1.18,
          phase: 0.45,
          skin: '#8b5b45',
          hair: '#17131b',
          shirt: '#ff4c9a',
          pants: '#252947',
          shadow: 'rgba(0,0,0,.22)',
          phoneX: -66,
          phoneRotation: -0.13,
        },
        {
          x: 1010,
          y: 372,
          scale: 1,
          phase: 0.8,
          skin: '#d99a65',
          hair: '#57301d',
          shirt: '#ffe06b',
          pants: '#34485e',
          shadow: 'rgba(0,0,0,.18)',
          phoneX: 62,
          phoneRotation: 0.16,
        },
      ];

      function frame(milliseconds) {
        const t = ((milliseconds / 1000) % durationSeconds) / durationSeconds;
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        const gradient = ctx.createLinearGradient(0, 0, width, height);
        gradient.addColorStop(0, '#17111f');
        gradient.addColorStop(0.45, '#163047');
        gradient.addColorStop(1, '#35162f');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, width, height);

        glow(220 + Math.sin(t * 2 * Math.PI) * 30, 140, 270, 'rgba(255,75,172,.34)', 0.8);
        glow(880 + Math.cos(t * 2 * Math.PI) * 45, 120, 310, 'rgba(33,191,255,.3)', 0.75);
        glow(650, 650, 420, 'rgba(255,224,107,.2)', 0.8);

        ctx.strokeStyle = 'rgba(255,255,255,.12)';
        ctx.lineWidth = 2;
        for (let i = 0; i < 16; i += 1) {
          const x = ((i * 110 + t * 180) % 1400) - 60;
          ctx.beginPath();
          ctx.arc(x, 100 + Math.sin(i + t * 5) * 48, 18 + (i % 3) * 6, 0, Math.PI * 2);
          ctx.stroke();
        }

        people.forEach((person) => drawPerson(person, t));

        for (let i = 0; i < 9; i += 1) {
          const floatT = (t + i / 9) % 1;
          heart(
            150 + i * 135 + Math.sin(floatT * Math.PI * 2) * 30,
            610 - floatT * 520,
            0.22 + 0.08 * Math.sin(floatT * Math.PI * 2),
            0.15 + 0.45 * (1 - floatT),
          );
        }

        ctx.save();
        ctx.globalAlpha = 0.94;
        ctx.translate(width / 2, 112 + Math.sin(t * Math.PI * 2) * 8);
        ctx.fillStyle = 'rgba(255,255,255,.12)';
        roundRect(-155, -42, 310, 84, 42);
        ctx.fill();
        ctx.drawImage(logo, -36, -31, 72, 72);
        ctx.fillStyle = 'rgba(255,255,255,.9)';
        ctx.font = '700 26px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('Poplur moments', 0, 72);
        ctx.restore();

        ctx.fillStyle = 'rgba(0,0,0,.2)';
        ctx.fillRect(0, 0, width, height);
      }

      recorder.start();
      for (let i = 0; i < durationSeconds * fps; i += 1) {
        frame((i / fps) * 1000);
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
    { durationSeconds: DURATION_SECONDS, fps: FPS, logoData, mimeType: MIME_TYPE },
  );

  const outPath = path.join(outDir, `poplur-fun-background.${FORMAT}`);
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  await browser.close();
  console.log(`${outPath} ${fs.statSync(outPath).size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
