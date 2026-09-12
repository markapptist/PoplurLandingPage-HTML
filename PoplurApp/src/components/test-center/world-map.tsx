import { StyleSheet, Text, View, type ViewStyle } from 'react-native';
import BetaDotWorld from '@/components/BetaDotWorld';
import { betaMapPoint } from '@/components/betaMapProjection';
import type { BetaMapCell } from '@/services/testControl';

export function WorldMap({ cells, realtimeState }: { cells: BetaMapCell[]; realtimeState: 'connecting' | 'live' | 'offline' }) {
  const positionedCells = cells.slice(0, 12).map(cell => ({ cell, point: betaMapPoint(cell.place) })).filter((item): item is { cell: BetaMapCell; point: readonly [number, number] } => item.point !== null);
  return <View style={styles.map} accessibilityLabel="Coarse closed-beta activity map">
    <View style={[styles.mapGrid, WEB_ONLY.mapGrid]} />
    <View style={styles.mapHeading}><Text style={styles.kicker}>COARSE ACTIVITY MAP</Text><Text style={styles.mapTitle}>Where the beta is moving</Text><Text style={styles.mapRule}>City and regional buckets only — never coordinates.</Text></View>
    <View style={styles.mapViewport}><BetaDotWorld cells={cells} />
      {positionedCells.map(({ cell, point }) => { const [x, y] = point; const left = x * 100; const top = y * 100; const size = Math.min(33, 10 + cell.events * 3); const syntheticOnly = (cell.realEvents ?? 0) === 0 && (cell.syntheticEvents ?? 0) > 0; return <View key={cell.place} style={[styles.mapPoint, { left: `${left}%`, top: `${top}%` } as never]}><View style={[styles.pulse, syntheticOnly && styles.pulseSim, { width: size + 12, height: size + 12, borderRadius: size }]} /><View style={[styles.dot, syntheticOnly && styles.dotSim, { width: size, height: size, borderRadius: size }]} /><View style={styles.dotCopy}><Text style={styles.dotPlace}>{cell.place}</Text><Text style={styles.dotMeta}>{cell.realEvents ?? 0} beta · {cell.syntheticEvents ?? 0} sim · {Math.round(cell.peakRadiusKm)} km peak</Text></View></View>; })}
      {!cells.length && <View style={styles.mapEmpty}><Text style={styles.mapEmptyTitle}>NO PUBLIC POSTS ON THE MAP</Text><Text style={[styles.copy, styles.mapEmptyCopy]}>Published posts with an approximate public area will appear here the instant Firestore reports them.</Text></View>}
    </View>
    <View style={styles.mapFoot}><View style={[styles.liveDot, realtimeState === 'live' ? styles.statusLive : styles.statusAway]} /><Text style={styles.mapFootText}>FIRESTORE REALTIME · {realtimeState.toUpperCase()}</Text></View>
  </View>;
}

// The grid lines are CSS-only keys RN's ViewStyle does not know, kept out of
// the typed sheet and layered onto `mapGrid`.
const WEB_ONLY = { mapGrid: { backgroundImage: 'linear-gradient(rgba(255,72,161,.045) 1px, transparent 1px), linear-gradient(90deg, rgba(255,72,161,.045) 1px, transparent 1px)', backgroundSize: '32px 32px' } as unknown as ViewStyle };

const styles = StyleSheet.create({
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  kicker: { color: '#ff4aa3', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  map: { height: 470, position: 'relative', overflow: 'hidden', padding: 22, borderWidth: 2, borderColor: '#ff4aa3', borderRadius: 28, backgroundColor: '#130711', boxShadow: '0 22px 55px rgba(255,19,126,.18)' },
  mapGrid: { ...StyleSheet.absoluteFill, backgroundColor: '#130711' },
  mapViewport: { position: 'absolute', left: '3%', right: '3%', top: 84, bottom: 54 },
  mapHeading: { gap: 1, zIndex: 2 },
  mapTitle: { color: '#fff7fb', fontSize: 26, fontWeight: '900' },
  mapRule: { color: '#d5a7bf', fontSize: 12 },
  mapPoint: { position: 'absolute', width: 0, height: 0, alignItems: 'center', justifyContent: 'center', zIndex: 3 },
  pulse: { position: 'absolute', backgroundColor: 'rgba(255,39,141,.24)', borderWidth: 2, borderColor: '#fff' },
  pulseSim: { backgroundColor: 'rgba(143,88,255,.28)', borderColor: '#c9afff' },
  dot: { backgroundColor: '#ff1580', borderWidth: 3, borderColor: '#fff', boxShadow: '0 0 22px #ff1680' },
  dotSim: { backgroundColor: '#8d5cff', borderColor: '#f1e9ff', boxShadow: '0 0 22px #8d5cff' },
  dotCopy: { position: 'absolute', top: 21, left: 10, width: 160, padding: 9, borderRadius: 10, backgroundColor: 'rgba(31,5,20,.95)', borderWidth: 1, borderColor: '#ff4aa3' },
  dotPlace: { color: '#fff', fontSize: 10, fontWeight: '800' },
  dotMeta: { color: '#e2b4cb', fontSize: 9 },
  mapEmpty: { position: 'absolute', top: '47%', left: '15%', right: '15%', alignItems: 'center', gap: 4, zIndex: 3, paddingHorizontal: 14, paddingVertical: 11, borderRadius: 14, borderWidth: 1, borderColor: 'rgba(255,74,163,.55)', backgroundColor: 'rgba(20,4,14,.88)' },
  mapEmptyTitle: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1.3, textAlign: 'center', textShadowColor: '#ff1680', textShadowRadius: 8 },
  mapEmptyCopy: { textAlign: 'center', fontSize: 11, lineHeight: 16 },
  mapFoot: { position: 'absolute', left: 22, bottom: 18, flexDirection: 'row', gap: 7, alignItems: 'center', zIndex: 3 },
  mapFootText: { color: '#d4a1bc', fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  copy: { color: '#d5a7bf', fontSize: 13, lineHeight: 19 },
  statusLive: { backgroundColor: '#5af0a4' },
  statusAway: { backgroundColor: '#806476' },
});
