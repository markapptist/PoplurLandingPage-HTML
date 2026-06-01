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

  const sourcePath = path.resolve('assets/images/poplur-tv-ad-source.png');
  const sourceData = `data:image/png;base64,${fs.readFileSync(sourcePath).toString('base64')}`;

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  await page.setContent(
    `<!doctype html><html><body style="margin:0;background:#050710"><canvas id="c" width="${WIDTH}" height="${HEIGHT}"></canvas></body></html>`,
  );

  const base64 = await page.evaluate(
    async ({ durationSeconds, fps, mimeType, sourceData }) => {
      const canvas = document.getElementById('c');
      const ctx = canvas.getContext('2d');
      const source = await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = sourceData;
      });

      const stream = canvas.captureStream(fps);
      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const master = audioContext.createGain();
      master.gain.value = 0.1;
      master.connect(destination);

      function tone(start, duration, frequency, gainValue, type = 'sine') {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now + start);
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(gainValue, now + start + 0.035);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + 0.08);
      }

      function scheduleSoftPop() {
        const chords = [
          [261.63, 329.63, 392.0, 523.25],
          [196.0, 293.66, 392.0, 493.88],
          [220.0, 277.18, 329.63, 440.0],
          [174.61, 261.63, 349.23, 440.0],
        ];
        for (let bar = 0; bar < 6; bar += 1) {
          const start = bar * 2;
          const chord = chords[bar % chords.length];
          chord.forEach((frequency, index) => {
            tone(start, 1.86, frequency, 0.035 - index * 0.003, 'sine');
          });
          tone(start + 0.02, 1.55, chord[0] / 2, 0.04, 'triangle');
          for (let beat = 0; beat < 4; beat += 1) {
            tone(start + beat * 0.5, 0.1, 880 + (beat % 2) * 110, 0.012, 'triangle');
          }
          tone(start + 1.5, 0.24, chord[3], 0.018, 'sine');
        }
      }

      scheduleSoftPop();
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));

      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6000000,
        audioBitsPerSecond: 128000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      function easeInOutSine(value) {
        return -(Math.cos(Math.PI * value) - 1) / 2;
      }

      function easeOutCubic(value) {
        return 1 - Math.pow(1 - value, 3);
      }

      function easeInCubic(value) {
        return value * value * value;
      }

      function clamp(value, min = 0, max = 1) {
        return Math.max(min, Math.min(max, value));
      }

      function segment(progress, start, end) {
        return clamp((progress - start) / (end - start));
      }

      function drawRoundedRect(x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
      }

      function coverImage(img, cx, cy, scale = 1, cropX = 0.5, cropY = 0.5) {
        const baseScale = Math.max(canvas.width / img.width, canvas.height / img.height) * scale;
        const drawWidth = img.width * baseScale;
        const drawHeight = img.height * baseScale;
        const x = canvas.width * cx - drawWidth * cropX;
        const y = canvas.height * cy - drawHeight * cropY;
        ctx.drawImage(img, x, y, drawWidth, drawHeight);
      }

      function drawText(text, x, y, size, weight = 800, alpha = 1, align = 'left') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${weight} ${size}px Avenir Next, Inter, system-ui, sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,.48)';
        ctx.shadowBlur = 18;
        ctx.fillText(text, x, y);
        ctx.restore();
      }

      function drawKicker(text, x, y, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#38d0b4';
        ctx.font = '800 26px Avenir Next, Inter, system-ui, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(text.toUpperCase(), x, y);
        ctx.restore();
      }

      function drawPhone(x, y, width, height, alpha = 1, tilt = 0, glow = true) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(x + width / 2, y + height / 2);
        ctx.rotate(tilt);
        if (glow) {
          const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(width, height) * 0.75);
          aura.addColorStop(0, 'rgba(255,40,153,.45)');
          aura.addColorStop(1, 'rgba(255,40,153,0)');
          ctx.fillStyle = aura;
          ctx.fillRect(-height, -height, height * 2, height * 2);
        }
        ctx.fillStyle = '#101017';
        drawRoundedRect(-width / 2, -height / 2, width, height, width * 0.14);
        ctx.fill();
        const screen = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
        screen.addColorStop(0, '#ff1f96');
        screen.addColorStop(1, '#b41176');
        ctx.fillStyle = screen;
        drawRoundedRect(-width * 0.43, -height * 0.43, width * 0.86, height * 0.86, width * 0.1);
        ctx.fill();
        ctx.fillStyle = '#f9f9ff';
        ctx.font = `900 ${width * 0.36}px Avenir Next, Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.32)';
        ctx.shadowBlur = width * 0.05;
        ctx.fillText('P', 0, height * 0.04);
        ctx.restore();
      }

      function drawSocialBurst(progress, alpha = 1) {
        const points = [
          [0.24, 0.48, '#ff2a92'],
          [0.38, 0.36, '#38d0b4'],
          [0.54, 0.58, '#ffffff'],
          [0.71, 0.43, '#ff2a92'],
          [0.82, 0.63, '#38d0b4'],
        ];
        ctx.save();
        ctx.globalAlpha = alpha;
        points.forEach(([px, py, color], index) => {
          const pulse = (progress * 2 + index * 0.18) % 1;
          const x = canvas.width * px;
          const y = canvas.height * py;
          ctx.strokeStyle = color;
          ctx.globalAlpha = alpha * (1 - pulse) * 0.65;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(x, y, 24 + pulse * 72, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = alpha;
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 8, 0, Math.PI * 2);
          ctx.fill();
        });
        ctx.restore();
      }

      function drawEndLogo(alpha = 1, scale = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(canvas.width / 2, canvas.height * 0.43);
        ctx.scale(scale, scale);
        const size = 156;
        const gradient = ctx.createLinearGradient(-size / 2, -size / 2, size / 2, size / 2);
        gradient.addColorStop(0, '#ff36a3');
        gradient.addColorStop(1, '#cf0b7d');
        ctx.shadowColor = 'rgba(255,45,160,.58)';
        ctx.shadowBlur = 40;
        ctx.fillStyle = gradient;
        drawRoundedRect(-size / 2, -size / 2, size, size, 34);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = '900 110px Avenir Next, Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('P', 0, 12);
        ctx.restore();
      }

      function drawFrame(ms) {
        const progress = ((ms / 1000) % durationSeconds) / durationSeconds;
        const shimmer = Math.sin(progress * Math.PI * 2);
        const shotOne = segment(progress, 0, 0.27);
        const shotTwo = segment(progress, 0.22, 0.52);
        const shotThree = segment(progress, 0.48, 0.78);
        const endShot = segment(progress, 0.74, 1);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (progress < 0.28) {
          coverImage(source, 0.5 + shotOne * 0.025, 0.5, 1.02 + shotOne * 0.05, 0.5, 0.5);
          drawKicker('A night out becomes a launch', 86, 86, easeOutCubic(shotOne));
          drawText('Post the moment.', 86, 128, 58, 900, easeOutCubic(shotOne));
          drawPhone(902 + easeOutCubic(shotOne) * 34, 382 - easeOutCubic(shotOne) * 18, 126, 232, 0.78, -0.06);
          drawSocialBurst(shotOne, 0.55 * easeOutCubic(shotOne));
        } else if (progress < 0.54) {
          coverImage(source, 0.54 - shotTwo * 0.03, 0.46, 1.58 + shotTwo * 0.05, 0.48, 0.52);
          ctx.fillStyle = 'rgba(4,6,14,.38)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const slide = easeOutCubic(shotTwo);
          drawKicker('Location-powered reach', 708 - (1 - slide) * 90, 118, slide);
          drawText('Radius expands', 708 - (1 - slide) * 90, 164, 64, 900, slide);
          drawText('as people engage.', 708 - (1 - slide) * 90, 232, 46, 800, slide * 0.88);
          drawPhone(178 + slide * 34, 250, 142, 264, slide, 0.08);
          drawPhone(376 + slide * 20, 238, 128, 238, slide * 0.86, -0.05);
          drawPhone(550 + slide * 10, 260, 116, 216, slide * 0.74, 0.04);
          drawSocialBurst(shotTwo, 0.68 * slide);
        } else if (progress < 0.8) {
          coverImage(source, 0.44 + shotThree * 0.05, 0.52, 1.22 + shotThree * 0.04, 0.42, 0.56);
          ctx.fillStyle = 'rgba(3,4,12,.26)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const reveal = easeOutCubic(shotThree);
          drawKicker('From rooftop to everywhere', 86, 96, reveal);
          drawText('Poplur', 86, 142, 80, 900, reveal);
          drawText('turns local energy', 86, 232, 44, 800, reveal * 0.9);
          drawText('into global momentum.', 86, 282, 44, 800, reveal * 0.9);
          const cardX = 814 + (1 - reveal) * 120;
          ctx.save();
          ctx.globalAlpha = reveal;
          ctx.fillStyle = 'rgba(255,255,255,.13)';
          drawRoundedRect(cardX, 126, 326, 326, 28);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.1)';
          drawRoundedRect(cardX + 30, 174, 266, 22, 11);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,.18)';
          drawRoundedRect(cardX + 30, 224, 210, 18, 9);
          ctx.fill();
          ctx.fillStyle = 'rgba(56,208,180,.78)';
          drawRoundedRect(cardX + 30, 360, 186 + shimmer * 16, 20, 10);
          ctx.fill();
          ctx.restore();
          drawPhone(cardX + 84, 212, 116, 216, reveal, -0.04, false);
        } else {
          coverImage(source, 0.5, 0.5, 1.08, 0.5, 0.5);
          ctx.fillStyle = `rgba(4,5,14,${0.22 + easeInCubic(endShot) * 0.58})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const pop = 0.9 + Math.sin(Math.PI * clamp(endShot * 1.4)) * 0.14;
          drawEndLogo(easeOutCubic(endShot), pop);
          drawText('POPLUR', canvas.width / 2, 438, 62, 900, easeOutCubic(endShot), 'center');
          drawText('Post anywhere. Grow everywhere.', canvas.width / 2, 514, 32, 700, easeOutCubic(endShot), 'center');
        }

        const vignette = ctx.createRadialGradient(
          canvas.width * 0.5,
          canvas.height * 0.52,
          canvas.width * 0.18,
          canvas.width * 0.5,
          canvas.height * 0.52,
          canvas.width * 0.78,
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.55, 'rgba(0,0,0,.18)');
        vignette.addColorStop(1, 'rgba(0,0,0,.62)');
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const topWash = ctx.createLinearGradient(0, 0, 0, canvas.height);
        topWash.addColorStop(0, 'rgba(4,7,18,.42)');
        topWash.addColorStop(0.35, 'rgba(4,7,18,.12)');
        topWash.addColorStop(1, 'rgba(4,7,18,.5)');
        ctx.fillStyle = topWash;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const flareX = canvas.width * (0.18 + progress * 0.64);
        const flare = ctx.createRadialGradient(flareX, canvas.height * 0.28, 0, flareX, canvas.height * 0.28, 320);
        flare.addColorStop(0, 'rgba(255,70,166,.14)');
        flare.addColorStop(0.42, 'rgba(255,170,82,.08)');
        flare.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = flare;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.globalAlpha = 0.28 + Math.sin(progress * Math.PI * 2) * 0.06;
        ctx.translate(canvas.width * 0.82, canvas.height * 0.18);
        ctx.rotate(-0.38);
        const streak = ctx.createLinearGradient(-240, 0, 240, 0);
        streak.addColorStop(0, 'rgba(255,255,255,0)');
        streak.addColorStop(0.5, 'rgba(255,255,255,.16)');
        streak.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = streak;
        drawRoundedRect(-260, -18, 520, 36, 18);
        ctx.fill();
        ctx.restore();

        ctx.fillStyle = 'rgba(3,4,10,.08)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      recorder.start();
      for (let i = 0; i < durationSeconds * fps; i += 1) {
        drawFrame((i / fps) * 1000);
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

  const outPath = path.join(outDir, 'poplur-tv-ad-background.mp4');
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  await browser.close();
  console.log(`${outPath} ${fs.statSync(outPath).size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
