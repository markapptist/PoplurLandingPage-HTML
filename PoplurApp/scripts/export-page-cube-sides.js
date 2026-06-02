const fs = require('node:fs');
const path = require('node:path');

function loadPlaywright() {
  try {
    return require('playwright');
  } catch {
    return require('/Users/matrix/.npm/_npx/e41f203b7505f1fb/node_modules/playwright');
  }
}

const { chromium } = loadPlaywright();

const OUTPUT_DIR = path.join(__dirname, '..', 'exports', 'cube-sides');
const FACE_SIZE = 512;

const faces = [
  { id: 'front-home', label: 'Home', foreground: '#fff7fb', accent: '#ff1797' },
  { id: 'right-beta', label: 'Beta', foreground: '#fff7fb', accent: '#ff49b6' },
  { id: 'bottom-about', label: 'About', foreground: '#fff7fb', accent: '#ff1797' },
  { id: 'left-home', label: 'Home', foreground: '#fff7fb', accent: '#ff1797' },
  { id: 'top-home', label: 'Home', foreground: '#fff7fb', accent: '#ff1797' },
  { id: 'back-home', label: 'Home', foreground: '#fff7fb', accent: '#ff1797' },
];

function pngBufferFromDataUrl(dataUrl) {
  return Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 }, deviceScaleFactor: 1 });

  const result = await page.evaluate(({ faces, faceSize }) => {
    function createFaceCanvas(label, foreground, accent = '#ff1797') {
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = faceSize;
      canvas.height = faceSize;
      if (!context) return canvas;

      const base = context.createLinearGradient(0, 0, canvas.width, canvas.height);
      base.addColorStop(0, '#4a0a3b');
      base.addColorStop(0.45, '#1a071f');
      base.addColorStop(1, '#7b0d52');
      context.fillStyle = base;
      context.fillRect(0, 0, canvas.width, canvas.height);

      const petalCenters = [
        [228, 196],
        [316, 196],
        [228, 284],
        [316, 284],
      ];
      for (const [x, y] of petalCenters) {
        const petal = context.createRadialGradient(x, y, 8, x, y, 92);
        petal.addColorStop(0, accent);
        petal.addColorStop(0.58, '#ee0088');
        petal.addColorStop(1, 'rgba(255, 23, 151, 0)');
        context.fillStyle = petal;
        context.beginPath();
        context.arc(x, y, 92, 0, Math.PI * 2);
        context.fill();
      }

      const glow = context.createRadialGradient(256, 248, 20, 256, 248, 245);
      glow.addColorStop(0, 'rgba(255, 255, 255, 0.22)');
      glow.addColorStop(0.45, 'rgba(255, 23, 151, 0.16)');
      glow.addColorStop(1, 'rgba(255, 23, 151, 0)');
      context.fillStyle = glow;
      context.fillRect(0, 0, canvas.width, canvas.height);

      const shine = context.createLinearGradient(92, 36, 430, 376);
      shine.addColorStop(0, 'rgba(255, 255, 255, 0)');
      shine.addColorStop(0.5, 'rgba(255, 255, 255, 0.24)');
      shine.addColorStop(1, 'rgba(255, 255, 255, 0)');
      context.save();
      context.translate(256, 256);
      context.rotate(-0.28);
      context.fillStyle = shine;
      context.fillRect(-260, -190, 520, 82);
      context.restore();

      context.lineWidth = 18;
      context.strokeStyle = 'rgba(255, 73, 182, 0.88)';
      context.strokeRect(18, 18, canvas.width - 36, canvas.height - 36);

      const fontStack = 'Arial Rounded MT Bold, Avenir Next, Inter, system-ui, sans-serif';
      let fontSize = 88;
      context.font = `900 ${fontSize}px ${fontStack}`;
      while (context.measureText(label).width > 350 && fontSize > 52) {
        fontSize -= 4;
        context.font = `900 ${fontSize}px ${fontStack}`;
      }

      context.shadowColor = 'rgba(0, 0, 0, 0.48)';
      context.shadowBlur = 16;
      context.shadowOffsetY = 7;
      context.lineJoin = 'round';
      context.lineWidth = Math.max(10, fontSize * 0.13);
      context.strokeStyle = 'rgba(255, 23, 151, 0.92)';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.strokeText(label, canvas.width / 2, canvas.height / 2);
      context.fillStyle = foreground;
      context.fillText(label, canvas.width / 2, canvas.height / 2);

      return canvas;
    }

    const renderedFaces = faces.map((face) => {
      const canvas = createFaceCanvas(face.label, face.foreground, face.accent);
      return { id: face.id, dataUrl: canvas.toDataURL('image/png') };
    });

    const tile = 512;
    const labelHeight = 64;
    const gap = 32;
    const columns = 3;
    const rows = 2;
    const sheet = document.createElement('canvas');
    const ctx = sheet.getContext('2d');
    sheet.width = columns * tile + (columns + 1) * gap;
    sheet.height = rows * (tile + labelHeight) + (rows + 1) * gap;

    if (ctx) {
      ctx.fillStyle = '#120816';
      ctx.fillRect(0, 0, sheet.width, sheet.height);
      ctx.font = '700 28px Avenir Next, Inter, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      renderedFaces.forEach((face, index) => {
        const source = createFaceCanvas(
          faces[index].label,
          faces[index].foreground,
          faces[index].accent
        );
        const col = index % columns;
        const row = Math.floor(index / columns);
        const x = gap + col * (tile + gap);
        const y = gap + row * (tile + labelHeight + gap);
        ctx.drawImage(source, x, y);
        ctx.fillStyle = '#fff7fb';
        ctx.fillText(face.id, x + tile / 2, y + tile + labelHeight / 2);
      });
    }

    return {
      faces: renderedFaces,
      contactSheet: sheet.toDataURL('image/png'),
    };
  }, { faces, faceSize: FACE_SIZE });

  for (const face of result.faces) {
    fs.writeFileSync(path.join(OUTPUT_DIR, `${face.id}.png`), pngBufferFromDataUrl(face.dataUrl));
  }
  fs.writeFileSync(
    path.join(OUTPUT_DIR, 'page-cube-sides.png'),
    pngBufferFromDataUrl(result.contactSheet)
  );

  await browser.close();

  console.log(`Exported ${result.faces.length + 1} PNG files to ${OUTPUT_DIR}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
