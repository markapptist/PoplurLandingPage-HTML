const fs = require('fs');
const path = require('path');

const { chromium } = require('/Users/matrix/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');

const WIDTH = 1080;
const HEIGHT = 1080;
const FPS = 30;
const MIME_TYPE = 'video/mp4;codecs=avc1.42E01E';

async function main() {
  const videoPath = path.resolve('assets/videos/poplr-explainer.mp4');
  const audioPath = path.resolve('assets/videos/poplr-explainer-narration.wav');
  const outputPath = path.resolve('assets/videos/poplr-explainer-narrated.mp4');

  const videoData = `data:video/mp4;base64,${fs.readFileSync(videoPath).toString('base64')}`;
  const audioData = `data:audio/wav;base64,${fs.readFileSync(audioPath).toString('base64')}`;

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  await page.setContent(`<!doctype html>
    <html>
      <body style="margin:0;background:#050710">
        <video id="source" muted playsinline style="display:none"></video>
        <audio id="voice" style="display:none"></audio>
        <canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
      </body>
    </html>`);

  const base64 = await page.evaluate(
    async ({ videoData, audioData, fps, mimeType }) => {
      const video = document.getElementById('source');
      const voice = document.getElementById('voice');
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      video.src = videoData;
      voice.src = audioData;

      await Promise.all([
        new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
        }),
        new Promise((resolve, reject) => {
          voice.onloadedmetadata = resolve;
          voice.onerror = reject;
        }),
      ]);

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const source = audioContext.createMediaElementSource(voice);
      const gain = audioContext.createGain();
      gain.gain.value = 1.0;
      source.connect(gain);
      gain.connect(destination);

      const stream = canvas.captureStream(fps);
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 7_500_000,
        audioBitsPerSecond: 128_000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      function drawBrandBackdrop() {
        const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
        gradient.addColorStop(0, '#2a0628');
        gradient.addColorStop(0.45, '#120015');
        gradient.addColorStop(1, '#ff0a8a');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.globalAlpha = 0.34;
        ctx.fillStyle = '#ff0a8a';
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.2, canvas.height * 0.24, 220, 220, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(canvas.width * 0.84, canvas.height * 0.78, 260, 260, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        drawBrandBackdrop();

        const sourceRatio = video.videoWidth / video.videoHeight;
        const targetRatio = canvas.width / canvas.height;
        let drawWidth = canvas.width;
        let drawHeight = canvas.height;
        if (sourceRatio > targetRatio) {
          drawWidth = canvas.width;
          drawHeight = canvas.width / sourceRatio;
        } else {
          drawHeight = canvas.height;
          drawWidth = canvas.height * sourceRatio;
        }
        const x = (canvas.width - drawWidth) / 2;
        const y = (canvas.height - drawHeight) / 2;

        ctx.save();
        ctx.shadowColor = 'rgba(255, 10, 138, 0.38)';
        ctx.shadowBlur = 44;
        ctx.drawImage(video, x, y, drawWidth, drawHeight);
        ctx.restore();
      }

      recorder.start(250);
      video.currentTime = 0;
      voice.currentTime = 0;
      await audioContext.resume();
      await Promise.all([video.play(), voice.play()]);

      const startedAt = performance.now();
      const durationMs = Math.max(video.duration, voice.duration) * 1000;
      while (performance.now() - startedAt < durationMs + 250) {
        draw();
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
    { videoData, audioData, fps: FPS, mimeType: MIME_TYPE },
  );

  fs.writeFileSync(outputPath, Buffer.from(base64, 'base64'));
  await browser.close();
  console.log(`${outputPath} ${fs.statSync(outputPath).size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
