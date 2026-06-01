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

  const sourcePath = path.resolve('assets/videos/pexels-classy-rooftop-source.mp4');
  const sourceData = `data:video/mp4;base64,${fs.readFileSync(sourcePath).toString('base64')}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  await page.setContent(`<!doctype html>
    <html>
      <body style="margin:0;background:#050710">
        <video id="source" muted playsinline loop style="display:none"></video>
        <canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
      </body>
    </html>`);

  const base64 = await page.evaluate(
    async ({ durationSeconds, fps, mimeType, sourceData }) => {
      const source = document.getElementById('source');
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      source.src = sourceData;

      await new Promise((resolve, reject) => {
        source.onloadedmetadata = resolve;
        source.onerror = reject;
      });
      source.currentTime = Math.min(0.2, Math.max(0, source.duration - 0.2));
      await new Promise((resolve) => {
        source.onseeked = resolve;
      });
      await source.play();

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const master = audioContext.createGain();
      master.gain.value = 0.13;
      master.connect(destination);

      function tone(start, duration, frequency, gainValue, type = 'sine') {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime + start);
        gain.gain.setValueAtTime(0.0001, audioContext.currentTime + start);
        gain.gain.exponentialRampToValueAtTime(gainValue, audioContext.currentTime + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(audioContext.currentTime + start);
        oscillator.stop(audioContext.currentTime + start + duration + 0.05);
      }

      function scheduleMusic() {
        const chords = [
          [261.63, 329.63, 392.0],
          [220.0, 329.63, 440.0],
          [246.94, 293.66, 392.0],
          [196.0, 293.66, 392.0],
        ];
        for (let bar = 0; bar < 6; bar += 1) {
          const chord = chords[bar % chords.length];
          const start = bar * 2;
          chord.forEach((frequency, index) => tone(start, 1.9, frequency, 0.055 - index * 0.007));
          tone(start + 0.04, 1.5, chord[0] / 2, 0.04, 'triangle');
          for (let beat = 0; beat < 4; beat += 1) {
            tone(start + beat * 0.5, 0.12, 880, 0.018, 'triangle');
          }
        }
      }

      scheduleMusic();

      const videoStream = canvas.captureStream(fps);
      destination.stream.getAudioTracks().forEach((track) => videoStream.addTrack(track));
      const recorder = new MediaRecorder(videoStream, {
        mimeType,
        videoBitsPerSecond: 5000000,
        audioBitsPerSecond: 128000,
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

      function drawFrame(ms) {
        const progress = ((ms / 1000) % durationSeconds) / durationSeconds;
        const imageRatio = source.videoWidth / source.videoHeight;
        const canvasRatio = canvas.width / canvas.height;
        const baseScale = imageRatio > canvasRatio ? canvas.height / source.videoHeight : canvas.width / source.videoWidth;
        const scale = baseScale * 1.1;
        const drawWidth = source.videoWidth * scale;
        const drawHeight = source.videoHeight * scale;
        const x = (canvas.width - drawWidth) / 2 + Math.sin(progress * Math.PI * 2) * 28;
        const y = (canvas.height - drawHeight) / 2 + Math.cos(progress * Math.PI * 2) * 10;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(source, x, y, drawWidth, drawHeight);

        const grade = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grade.addColorStop(0, 'rgba(2,4,12,.34)');
        grade.addColorStop(0.5, 'rgba(2,4,12,.16)');
        grade.addColorStop(1, 'rgba(2,4,12,.52)');
        ctx.fillStyle = grade;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const vignette = ctx.createRadialGradient(
          canvas.width * 0.5,
          canvas.height * 0.48,
          canvas.width * 0.12,
          canvas.width * 0.5,
          canvas.height * 0.48,
          canvas.width * 0.78,
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.65, 'rgba(0,0,0,.2)');
        vignette.addColorStop(1, 'rgba(0,0,0,.66)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.translate(canvas.width * (0.16 + progress * 0.66), canvas.height * 0.22);
        ctx.rotate(-0.25);
        const shine = ctx.createLinearGradient(-220, 0, 220, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)');
        shine.addColorStop(0.5, 'rgba(255,255,255,.18)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        roundedRect(-240, -16, 480, 32, 16);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = 'rgba(1,2,8,.12)';
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
      await audioContext.close();

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
    { durationSeconds: DURATION_SECONDS, fps: FPS, mimeType: MIME_TYPE, sourceData },
  );

  const outPath = path.join(outDir, 'poplur-live-ad-background.mp4');
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  await browser.close();
  console.log(`${outPath} ${fs.statSync(outPath).size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
