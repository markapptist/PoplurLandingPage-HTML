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

  const browser = await chromium.launch({
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } });

  await page.setContent(`<!doctype html>
    <html>
      <body style="margin:0;background:#050710">
        <canvas id="canvas" width="${WIDTH}" height="${HEIGHT}"></canvas>
      </body>
    </html>`);

  const base64 = await page.evaluate(
    async ({ durationSeconds, fps, mimeType, sourceData }) => {
      const canvas = document.getElementById('canvas');
      const ctx = canvas.getContext('2d');
      const source = await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = sourceData;
      });

      const audioContext = new AudioContext();
      const destination = audioContext.createMediaStreamDestination();
      const master = audioContext.createGain();
      master.gain.value = 0.13;
      master.connect(destination);

      const phones = [
        { x: 538, y: 503, w: 106, h: 206, r: -0.08 },
        { x: 756, y: 575, w: 92, h: 188, r: -0.06 },
        { x: 866, y: 498, w: 120, h: 196, r: 0.08 },
        { x: 1130, y: 496, w: 116, h: 210, r: -0.04 },
      ];

      function clamp(value, min = 0, max = 1) {
        return Math.max(min, Math.min(max, value));
      }

      function segment(progress, start, end) {
        return clamp((progress - start) / (end - start));
      }

      function easeOutCubic(value) {
        return 1 - Math.pow(1 - clamp(value), 3);
      }

      function easeInOut(value) {
        return -(Math.cos(Math.PI * clamp(value)) - 1) / 2;
      }

      function roundedRect(x, y, width, height, radius) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
      }

      function tone(start, duration, frequency, gainValue, type = 'sine') {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;
        oscillator.type = type;
        oscillator.frequency.setValueAtTime(frequency, now + start);
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(gainValue, now + start + 0.04);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + 0.08);
      }

      function pluck(start, frequency, gainValue = 0.026, duration = 0.28) {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const now = audioContext.currentTime;
        oscillator.type = 'triangle';
        oscillator.frequency.setValueAtTime(frequency, now + start);
        gain.gain.setValueAtTime(0.0001, now + start);
        gain.gain.exponentialRampToValueAtTime(gainValue, now + start + 0.018);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration);
        oscillator.connect(gain);
        gain.connect(master);
        oscillator.start(now + start);
        oscillator.stop(now + start + duration + 0.04);
      }

      function bell(start, frequency, gainValue = 0.018) {
        tone(start, 0.5, frequency, gainValue, 'sine');
        tone(start + 0.01, 0.38, frequency * 2.01, gainValue * 0.32, 'sine');
      }

      function scheduleLifeSimMusic() {
        const chords = [
          [261.63, 329.63, 392.0, 493.88],
          [293.66, 369.99, 440.0, 554.37],
          [220.0, 277.18, 329.63, 440.0],
          [246.94, 311.13, 392.0, 493.88],
        ];
        for (let bar = 0; bar < 6; bar += 1) {
          const start = bar * 2;
          const chord = chords[bar % chords.length];
          chord.forEach((frequency, index) => {
            tone(start + index * 0.025, 1.84, frequency, 0.015 - index * 0.0016, 'sine');
          });
          pluck(start + 0.02, chord[0] / 2, 0.036, 0.34);
          pluck(start + 0.5, chord[1], 0.022, 0.18);
          pluck(start + 0.75, chord[2], 0.018, 0.16);
          pluck(start + 1.0, chord[3], 0.024, 0.2);
          pluck(start + 1.38, chord[1] * 2, 0.016, 0.14);
          bell(start + 1.62, chord[3] * 2, 0.012);
        }
      }

      function mapPoint(x, y, crop) {
        return {
          x: ((x - crop.x) / crop.w) * canvas.width,
          y: ((y - crop.y) / crop.h) * canvas.height,
        };
      }

      function drawScene(crop, progress) {
        const drift = Math.sin(progress * Math.PI * 2);
        const sx = crop.x + drift * crop.driftX;
        const sy = crop.y + Math.cos(progress * Math.PI * 2) * crop.driftY;
        ctx.drawImage(source, sx, sy, crop.w, crop.h, 0, 0, canvas.width, canvas.height);
      }

      function drawGrade(progress, strength = 1) {
        const warm = ctx.createRadialGradient(126, 84, 0, 126, 84, 420);
        warm.addColorStop(0, `rgba(255,166,78,${0.18 * strength})`);
        warm.addColorStop(1, 'rgba(255,166,78,0)');
        ctx.fillStyle = warm;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const magenta = ctx.createRadialGradient(
          canvas.width * (0.48 + Math.sin(progress * Math.PI * 2) * 0.08),
          canvas.height * 0.68,
          0,
          canvas.width * 0.52,
          canvas.height * 0.66,
          canvas.width * 0.54,
        );
        magenta.addColorStop(0, `rgba(255,34,151,${0.18 * strength})`);
        magenta.addColorStop(1, 'rgba(255,34,151,0)');
        ctx.fillStyle = magenta;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const vignette = ctx.createRadialGradient(
          canvas.width * 0.5,
          canvas.height * 0.52,
          canvas.width * 0.18,
          canvas.width * 0.5,
          canvas.height * 0.52,
          canvas.width * 0.82,
        );
        vignette.addColorStop(0, 'rgba(0,0,0,0)');
        vignette.addColorStop(0.68, `rgba(0,0,0,${0.16 * strength})`);
        vignette.addColorStop(1, `rgba(0,0,0,${0.54 * strength})`);
        ctx.fillStyle = vignette;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      function drawText(text, x, y, size, alpha, align = 'left', weight = 900) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#ffffff';
        ctx.font = `${weight} ${size}px Avenir Next, Inter, system-ui, sans-serif`;
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,.56)';
        ctx.shadowBlur = 18;
        ctx.fillText(text, x, y);
        ctx.restore();
      }

      function drawKicker(text, x, y, alpha, align = 'left') {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = '#38d0b4';
        ctx.font = '900 24px Avenir Next, Inter, system-ui, sans-serif';
        ctx.textAlign = align;
        ctx.textBaseline = 'top';
        ctx.shadowColor = 'rgba(0,0,0,.5)';
        ctx.shadowBlur = 14;
        ctx.fillText(text.toUpperCase(), x, y);
        ctx.restore();
      }

      function drawPhoneScreen(phone, crop, progress, alpha = 1) {
        const center = mapPoint(phone.x + phone.w / 2, phone.y + phone.h / 2, crop);
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;
        const width = phone.w * scaleX;
        const height = phone.h * scaleY;
        const pulse = 0.5 + Math.sin(progress * Math.PI * 8) * 0.5;

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(center.x, center.y);
        ctx.rotate(phone.r);

        const aura = ctx.createRadialGradient(0, 0, 0, 0, 0, height * 0.66);
        aura.addColorStop(0, `rgba(255,42,146,${0.36 + pulse * 0.18})`);
        aura.addColorStop(1, 'rgba(255,42,146,0)');
        ctx.fillStyle = aura;
        ctx.fillRect(-height, -height, height * 2, height * 2);

        const screen = ctx.createLinearGradient(0, -height / 2, 0, height / 2);
        screen.addColorStop(0, '#ff2ca2');
        screen.addColorStop(0.58, '#d91186');
        screen.addColorStop(1, '#96105f');
        ctx.fillStyle = screen;
        roundedRect(-width * 0.38, -height * 0.38, width * 0.76, height * 0.76, width * 0.1);
        ctx.fill();

        ctx.strokeStyle = `rgba(255,255,255,${0.42 + pulse * 0.24})`;
        ctx.lineWidth = Math.max(1, width * 0.025);
        roundedRect(-width * 0.38, -height * 0.38, width * 0.76, height * 0.76, width * 0.1);
        ctx.stroke();

        const feedOffset = (progress * height * 1.25) % (height * 0.32);
        ctx.fillStyle = 'rgba(255,255,255,.18)';
        for (let index = 0; index < 3; index += 1) {
          const y = -height * 0.24 + index * height * 0.16 - feedOffset * 0.35;
          roundedRect(-width * 0.25, y, width * (0.36 + index * 0.05), height * 0.036, height * 0.018);
          ctx.fill();
        }

        ctx.fillStyle = '#ffffff';
        ctx.font = `900 ${width * 0.34}px Avenir Next, Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,.34)';
        ctx.shadowBlur = width * 0.08;
        ctx.fillText('P', 0, height * 0.05);

        ctx.restore();
      }

      function drawRadiusFrom(phone, crop, progress, color, alpha = 1) {
        const center = mapPoint(phone.x + phone.w / 2, phone.y + phone.h / 2, crop);
        ctx.save();
        for (let i = 0; i < 3; i += 1) {
          const ring = (progress + i / 3) % 1;
          ctx.globalAlpha = alpha * (1 - ring) * 0.42;
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.arc(center.x, center.y, 24 + ring * 116, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.globalAlpha = alpha;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(center.x, center.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function drawSwipeCue(phone, crop, progress, alpha = 1) {
        const center = mapPoint(phone.x + phone.w / 2, phone.y + phone.h / 2, crop);
        const scaleX = canvas.width / crop.w;
        const scaleY = canvas.height / crop.h;
        const width = phone.w * scaleX;
        const height = phone.h * scaleY;
        const travel = easeInOut((progress * 2.5) % 1);

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(center.x, center.y);
        ctx.rotate(phone.r);
        ctx.strokeStyle = 'rgba(255,255,255,.82)';
        ctx.lineWidth = Math.max(2, width * 0.035);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-width * 0.18, height * (0.22 - travel * 0.34));
        ctx.lineTo(width * 0.18, height * (-0.02 - travel * 0.34));
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.92)';
        ctx.beginPath();
        ctx.arc(width * 0.18, height * (-0.02 - travel * 0.34), width * 0.055, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      function drawSceneScreens(crop, progress, alpha = 1) {
        phones.forEach((phone, index) => {
          drawPhoneScreen(phone, crop, progress + index * 0.11, alpha);
        });
        drawRadiusFrom(phones[0], crop, (progress * 2.2) % 1, '#ff2a92', alpha * 0.9);
        drawRadiusFrom(phones[2], crop, (progress * 2.2 + 0.3) % 1, '#38d0b4', alpha * 0.75);
        drawRadiusFrom(phones[3], crop, (progress * 2.2 + 0.62) % 1, '#ffffff', alpha * 0.62);
      }

      function drawLightSweep(progress, alpha = 1) {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(canvas.width * (0.08 + progress * 0.86), canvas.height * 0.27);
        ctx.rotate(-0.28);
        const shine = ctx.createLinearGradient(-240, 0, 240, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0)');
        shine.addColorStop(0.5, 'rgba(255,255,255,.18)');
        shine.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = shine;
        roundedRect(-260, -16, 520, 32, 16);
        ctx.fill();
        ctx.restore();
      }

      function drawFrame(ms) {
        const progress = ((ms / 1000) % durationSeconds) / durationSeconds;
        const full = { x: 40, y: 0, w: 1600, h: 900, driftX: 10, driftY: 4 };
        const phonesClose = { x: 432, y: 292, w: 950, h: 534, driftX: 8, driftY: 4 };
        const groupClose = { x: 220, y: 194, w: 1160, h: 653, driftX: 8, driftY: 5 };
        const rightClose = { x: 760, y: 266, w: 820, h: 461, driftX: 6, driftY: 3 };

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (progress < 0.28) {
          const t = segment(progress, 0, 0.28);
          drawScene(groupClose, progress);
          drawGrade(progress, 0.92);
          drawSceneScreens(groupClose, progress, 0.82);
          drawSwipeCue(phones[1], groupClose, progress, easeOutCubic(t) * 0.8);
          drawKicker('This exact rooftop goes live', 72, 76, easeOutCubic(t));
          drawText('Everyone posts.', 72, 118, 58, easeOutCubic(t));
        } else if (progress < 0.55) {
          const t = segment(progress, 0.28, 0.55);
          drawScene(phonesClose, progress);
          ctx.fillStyle = 'rgba(3,5,14,.22)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawGrade(progress, 0.72);
          drawSceneScreens(phonesClose, progress, 1);
          drawSwipeCue(phones[2], phonesClose, progress, 0.9);
          drawKicker('Poplur spreads by proximity', 698, 86, easeOutCubic(t));
          drawText('The radius', 698, 132, 56, easeOutCubic(t));
          drawText('keeps growing.', 698, 192, 56, easeOutCubic(t) * 0.95);
        } else if (progress < 0.8) {
          const t = segment(progress, 0.55, 0.8);
          drawScene(rightClose, progress);
          ctx.fillStyle = 'rgba(3,5,14,.26)';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          drawGrade(progress, 0.82);
          drawSceneScreens(rightClose, progress, 1);
          drawSwipeCue(phones[3], rightClose, progress, 0.9);
          drawKicker('Real friends. Real phones.', 72, 88, easeOutCubic(t));
          drawText('One post can', 72, 136, 60, easeOutCubic(t));
          drawText('move the room.', 72, 202, 60, easeOutCubic(t) * 0.95);
        } else {
          const t = segment(progress, 0.8, 1);
          drawScene(full, progress);
          drawGrade(progress, 1);
          drawSceneScreens(full, progress, 0.88);
          ctx.fillStyle = `rgba(3,4,12,${0.26 + easeOutCubic(t) * 0.44})`;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          const logoScale = 1 + Math.sin(Math.PI * clamp(t * 1.3)) * 0.12;
          ctx.save();
          ctx.globalAlpha = easeOutCubic(t);
          ctx.translate(canvas.width / 2, canvas.height * 0.42);
          ctx.scale(logoScale, logoScale);
          const gradient = ctx.createLinearGradient(-72, -72, 72, 72);
          gradient.addColorStop(0, '#ff3aa6');
          gradient.addColorStop(1, '#c90b7b');
          ctx.shadowColor = 'rgba(255,45,160,.58)';
          ctx.shadowBlur = 42;
          ctx.fillStyle = gradient;
          roundedRect(-74, -74, 148, 148, 32);
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#ffffff';
          ctx.font = '900 104px Avenir Next, Inter, system-ui, sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('P', 0, 12);
          ctx.restore();
          drawText('POPLUR', canvas.width / 2, 426, 62, easeOutCubic(t), 'center');
          drawText('Post local. Grow everywhere.', canvas.width / 2, 504, 32, easeOutCubic(t), 'center', 800);
        }

        drawLightSweep(progress, 0.38);
        ctx.fillStyle = 'rgba(4,5,12,.06)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }

      scheduleLifeSimMusic();
      const stream = canvas.captureStream(fps);
      destination.stream.getAudioTracks().forEach((track) => stream.addTrack(track));
      const recorder = new MediaRecorder(stream, {
        mimeType,
        videoBitsPerSecond: 6_000_000,
        audioBitsPerSecond: 128_000,
      });
      const chunks = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      const done = new Promise((resolve) => {
        recorder.onstop = resolve;
      });

      recorder.start(250);
      const startTime = performance.now();
      await audioContext.resume();
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

  const outPath = path.join(outDir, 'poplur-tv-ad-background.mp4');
  fs.writeFileSync(outPath, Buffer.from(base64, 'base64'));
  await browser.close();
  console.log(`${outPath} ${fs.statSync(outPath).size}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
