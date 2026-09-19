import { useMemo } from 'react'
import { clusterPops, dotRadius, WORLD_H, WORLD_W } from './popWorld'
import type { LivePop } from './useLivePops'
import { WORLD_LAND_COLS, WORLD_LAND_ROWS, worldLandRows } from './worldLand'

// The world as the welcome screen draws it — a lattice of white dots — but
// shaped as the planet (worldLand.ts, from Natural Earth), with the live pops
// clustered on top in the desk's dot design.
export default function DottedWorld({ pops, state }: { pops: readonly LivePop[]; state: 'loading' | 'ready' | 'error' }) {
  const land = useMemo(() => {
    const rows = worldLandRows(); const cw = WORLD_W / WORLD_LAND_COLS, ch = WORLD_H / WORLD_LAND_ROWS
    const out: { x: number; y: number; bright: boolean }[] = []
    rows.forEach((row, r) => { for (let c = 0; c < row.length; c++) if (row[c] === '1') out.push({ x: (c + 0.5) * cw, y: (r + 0.5) * ch, bright: (r + c) % 7 === 0 }) })
    return out
  }, [])
  const clusters = useMemo(() => clusterPops(pops), [pops])
  return <div className="pl-world" role="img" aria-label="Where pops are landing, by region">
    <svg viewBox={`0 0 ${WORLD_W} ${WORLD_H}`} preserveAspectRatio="xMidYMid meet">
      <g className="land">{land.map((d, i) => <circle key={i} cx={d.x} cy={d.y} r={d.bright ? 2.4 : 2} className={d.bright ? 'ld bright' : 'ld'} />)}</g>
      {clusters.map(c => {
        const r = dotRadius(c.count); const sim = c.real === 0 && c.sim > 0
        return <g key={c.key}>
          <circle className={`dot${sim ? ' sim' : ''}`} cx={c.x} cy={c.y} r={r} />
          {c.label && <>
            <text className="lbl" x={c.x + r + 5} y={c.y + 3}>{sim ? `SIM · ${c.label}` : c.label}</text>
            <text className="lbl-meta" x={c.x + r + 5} y={c.y + 15}>{c.count} {c.count === 1 ? 'pop' : 'pops'} · {Math.round(c.peakKm)} km peak</text>
          </>}
        </g>
      })}
    </svg>
    {state === 'ready' && !pops.length && <div className="pl-empty">No public pops on the map yet.</div>}
  </div>
}
