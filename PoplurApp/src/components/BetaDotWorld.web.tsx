import { useEffect, useMemo, useRef } from 'react';
import { betaMapPoint } from './betaMapProjection';

type ActivityCell = { place: string; events: number };

const LAND: [number, number][][] = [
  [[.02,.13],[.08,.08],[.17,.07],[.25,.12],[.31,.20],[.27,.27],[.23,.30],[.21,.38],[.15,.43],[.10,.37],[.06,.34],[.03,.27]],
  [[.20,.04],[.27,.05],[.30,.11],[.27,.17],[.22,.15],[.18,.09]],
  [[.16,.39],[.23,.40],[.29,.47],[.31,.57],[.28,.68],[.25,.79],[.22,.91],[.18,.82],[.16,.70],[.13,.56],[.13,.46]],
  [[.39,.18],[.45,.14],[.53,.16],[.56,.23],[.52,.29],[.46,.28],[.40,.24]],
  [[.40,.28],[.51,.27],[.57,.36],[.56,.49],[.52,.62],[.47,.72],[.42,.62],[.38,.47],[.38,.35]],
  [[.51,.14],[.63,.08],[.76,.08],[.89,.14],[.98,.23],[.95,.33],[.87,.36],[.82,.44],[.73,.42],[.68,.37],[.60,.37],[.54,.30],[.51,.23]],
  [[.61,.34],[.68,.37],[.73,.47],[.80,.52],[.78,.59],[.71,.56],[.66,.49]],
  [[.70,.65],[.80,.60],[.90,.64],[.94,.74],[.87,.83],[.76,.81],[.69,.73]],
  [[.93,.40],[.96,.43],[.95,.50],[.92,.48]], [[.58,.69],[.60,.73],[.59,.80],[.57,.77]],
];

function insideLand(x: number, y: number, polygon: [number, number][]) {
  let hit = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const [xi, yi] = polygon[index]; const [xj, yj] = polygon[previous];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / ((yj - yi) || 1e-6) + xi) hit = !hit;
  }
  return hit;
}

const DOTS = Array.from({ length: 27 }, (_, row) => Array.from({ length: 56 }, (_, column) => {
  const x = (column + .5) / 56; const y = .04 + ((row + .5) / 27) * .88;
  if (!LAND.some(polygon => insideLand(x, y, polygon))) return null;
  const hash = Math.abs(row * 73 + column * 151 + row * column * 19) % 47;
  if (hash > 31) return null;
  return { x, y, phase: (hash * .77 + row * .19 + column * .31) % (Math.PI * 2) };
}).filter(Boolean)).flat() as { x: number; y: number; phase: number }[];

const ACTIVITY_COLOURS = ['#8ddeff', '#ffd24b', '#6ff5b0', '#b878ff'];

export default function BetaDotWorld({ cells }: { cells: ActivityCell[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawRef = useRef<(() => void) | null>(null);
  const signature = JSON.stringify(cells.slice(0, 12).map(cell => ({ place: cell.place, events: cell.events })));
  const palette = useMemo(() => {
    const activeCells = JSON.parse(signature) as ActivityCell[];
    const active = activeCells.map((cell, index) => ({ point: betaMapPoint(cell.place), colour: ACTIVITY_COLOURS[index % ACTIVITY_COLOURS.length] })).filter(item => item.point !== null);
    return DOTS.map(dot => active.find(item => item.point && Math.hypot(dot.x - item.point[0], dot.y - item.point[1]) < .075)?.colour ?? null);
  }, [signature]);
  const paletteRef = useRef<(string | null)[]>(palette);
  useEffect(() => { paletteRef.current = palette; drawRef.current?.(); }, [palette]);
  useEffect(() => {
    const canvas = canvasRef.current; const context = canvas?.getContext('2d', { alpha: true });
    if (!canvas || !context) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let width = 1; let height = 1; let visible = true; let pageVisible = !document.hidden; let frame = 0; let lastDraw = 0;
    const circle = (x: number, y: number, radius: number, fill: string) => { context.beginPath(); context.arc(x, y, radius, 0, Math.PI * 2); context.fillStyle = fill; context.fill(); };
    const draw = (now: number) => {
      context.clearRect(0, 0, width, height);
      const spacing = Math.max(5.8, Math.min(10, width / 56));
      DOTS.forEach((dot, index) => {
        const pulse = motion.matches ? .62 : .5 + .5 * Math.sin(now / 620 + dot.phase);
        const radius = Math.max(1.55, spacing * .21) * (.86 + pulse * .28);
        const activityColour = paletteRef.current[index];
        const top = activityColour ?? '#ffc4e0'; const middle = activityColour ?? '#ff74ba';
        const x = dot.x * width; const y = dot.y * height;
        circle(x, y + 1.3, radius, `rgba(120,6,60,${.30 + pulse * .22})`);
        circle(x, y - .8, radius, top);
        context.globalAlpha = .54 + pulse * .42; circle(x, y, radius * .94, middle); context.globalAlpha = 1;
        if (!motion.matches && pulse > .92) circle(x, y, radius * 2.25, `rgba(255,255,255,${(pulse - .92) * 1.7})`);
      });
    };
    drawRef.current = () => draw(performance.now());
    const stop = () => { if (frame) cancelAnimationFrame(frame); frame = 0; };
    const shouldAnimate = () => visible && pageVisible && !motion.matches;
    const start = () => { if (!frame && shouldAnimate()) frame = requestAnimationFrame(tick); };
    const tick = (now: number) => { frame = 0; if (!shouldAnimate()) return; if (now - lastDraw >= 40) { draw(now); lastDraw = now; } start(); };
    const resize = () => { const bounds = canvas.getBoundingClientRect(); width = Math.max(1, bounds.width); height = Math.max(1, bounds.height); const ratio = Math.min(2, window.devicePixelRatio || 1); canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0); draw(performance.now()); };
    const observer = new ResizeObserver(resize); const intersection = new IntersectionObserver(entries => { visible = entries[0]?.isIntersecting !== false; if (visible) { draw(performance.now()); start(); } else stop(); });
    const motionChanged = () => { stop(); draw(performance.now()); start(); };
    const visibilityChanged = () => { pageVisible = !document.hidden; if (pageVisible) { draw(performance.now()); start(); } else stop(); };
    observer.observe(canvas); intersection.observe(canvas); motion.addEventListener?.('change', motionChanged); document.addEventListener('visibilitychange', visibilityChanged); resize(); start();
    return () => { drawRef.current = null; stop(); observer.disconnect(); intersection.disconnect(); motion.removeEventListener?.('change', motionChanged); document.removeEventListener('visibilitychange', visibilityChanged); };
  }, []);
  return <canvas ref={canvasRef} aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />;
}
