import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import BetaDotWorld from '@/components/BetaDotWorld';
import { betaMapPoint } from '@/components/betaMapProjection';
import type { BetaMapCell } from '@/services/testControl';
import { Empty, Num, SimTag } from './primitives';
import { C, S, T } from './theme';

/** The world map holds this many labelled cells; the projection has no
 *  collision rule, so more labels would only overlap. */
const LABELLED_CELLS = 12;

/** Where pops are landing: city buckets only, never coordinates. Its host
 *  draws the title and the meta; this is the card. A cell with any real pop
 *  draws in the pop tone; a simulation-only cell in the simulation fill with
 *  the `SIM` tag on its label, so colour never carries the meaning alone. */
export function WorldMap({ cells, height = 280 }: { cells: BetaMapCell[]; height?: number }) {
  const positionedCells = cells.slice(0, LABELLED_CELLS).map(cell => ({ cell, point: betaMapPoint(cell.place) })).filter((item): item is { cell: BetaMapCell; point: readonly [number, number] } => item.point !== null);
  return <View style={[S.card, styles.map, { height }]} accessibilityLabel="Where pops are landing, by city bucket">
    <View style={[styles.grid, WEB_ONLY.grid]} />
    <View style={styles.viewport}><BetaDotWorld cells={cells} />
      {positionedCells.map(({ cell, point }) => {
        const [x, y] = point;
        const size = Math.min(33, 10 + cell.events * 3);
        const simulationOnly = (cell.realEvents ?? 0) === 0 && (cell.syntheticEvents ?? 0) > 0;
        return <View key={cell.place} style={[styles.point, { left: `${x * 100}%`, top: `${y * 100}%` } as never]}>
          <View style={[styles.dot, simulationOnly && styles.dotSim, { width: size, height: size, borderRadius: size }]} />
          <View style={styles.label}>
            <View style={styles.labelLine}>{simulationOnly && <SimTag />}<Text style={T.name} numberOfLines={1}>{cell.place}</Text></View>
            <Text style={T.meta}><Num real={cell.realEvents ?? 0} sim={cell.syntheticEvents ?? 0} /> · {Math.round(cell.peakRadiusKm)} km peak</Text>
          </View>
        </View>;
      })}
      {!cells.length && <View style={[S.panel, styles.empty]}><Empty text="No public posts on the map yet." /></View>}
    </View>
  </View>;
}

// The grid lines are CSS-only keys RN's ViewStyle does not know, kept out of
// the typed sheet and layered onto `grid`.
const WEB_ONLY = { grid: { backgroundImage: 'linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px)', backgroundSize: '32px 32px' } as unknown as ViewStyle };

const styles = StyleSheet.create({
  map: { position: 'relative', overflow: 'hidden', padding: 0 },
  grid: { ...StyleSheet.absoluteFill, backgroundColor: C.bg },
  viewport: { position: 'absolute', left: '3%', right: '3%', top: 12, bottom: 12 },
  point: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  dot: { backgroundColor: C.pop, borderWidth: 2, borderColor: C.ink },
  dotSim: { backgroundColor: C.simFill, borderColor: C.sim },
  label: { position: 'absolute', top: 21, left: 10, width: 160, gap: 2, padding: 8, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.panel },
  labelLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  empty: { position: 'absolute', top: '44%', left: '15%', right: '15%', alignItems: 'center', zIndex: 3 },
});
