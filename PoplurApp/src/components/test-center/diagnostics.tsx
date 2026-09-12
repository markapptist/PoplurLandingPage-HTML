import { StyleSheet, Text, View } from 'react-native';
import type { BetaDashboard, RealtimeFeedPost, RealtimePublicPost } from '@/services/testControl';

export function SurfaceSyncBoard({
  posts,
  feedPosts,
  rows,
  publicState,
  privateState,
}: {
  posts: RealtimePublicPost[];
  feedPosts: RealtimeFeedPost[];
  rows: BetaDashboard['rows'];
  publicState: 'connecting' | 'live' | 'offline';
  privateState: 'connecting' | 'live' | 'offline';
}) {
  const channels = new Set(feedPosts.map(post => post.channelId));
  const activeScreens = new Set(rows.filter(row => row.state === 'active').map(row => row.screen));
  const surfaces = [
    { name: 'MAP', state: publicState, detail: `${posts.length} Firestore posts · add/change/delete` },
    { name: 'FEED', state: publicState, detail: `${feedPosts.length} posts across ${channels.size} live channels` },
    { name: 'PROFILE', state: privateState, detail: 'Owner account posts only · never globally projected' },
    { name: 'PHONE + HOUSE', state: publicState, detail: 'Realtime radius discovery · coordinates remain in app' },
    { name: 'NOTIFICATIONS', state: privateState, detail: 'Account listener · private notification content excluded' },
    { name: 'DM + CALLS', state: privateState, detail: 'Realtime app state only · private content excluded' },
    { name: 'EVERY SCREEN', state: privateState, detail: `${activeScreens.size} opted-in routes active now · route name only` },
  ];
  return <View style={styles.surfaceBoard}>
    <Text style={styles.kicker}>APP ↔ FIREBASE ↔ CONTROL ROOM</Text>
    <Text style={styles.cardTitle}>Realtime surface matrix</Text>
    <Text style={styles.copy}>Map receives canonical public posts globally; Feed applies each post’s earned radius before showing it. Profile remains strictly account-owned, while notifications, DMs and calls retain their account-scoped listeners. Consenting test devices publish only their current route. Messages, media, coordinates, keystrokes, camera and microphone data never enter this desk.</Text>
    <View style={styles.surfaceGrid}>{surfaces.map(surface => <View key={surface.name} style={styles.surfaceCard}><View style={styles.row}><Text style={styles.surfaceName}>{surface.name}</Text><Text style={[styles.surfaceState, surface.state === 'live' ? styles.simLive : styles.simPaused]}>{surface.state.toUpperCase()}</Text></View><Text style={styles.surfaceDetail}>{surface.detail}</Text></View>)}</View>
  </View>;
}

const styles = StyleSheet.create({
  kicker: { color: '#ff4aa3', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  cardTitle: { color: '#fff8fc', fontSize: 19, fontWeight: '800' },
  copy: { color: '#d5a7bf', fontSize: 13, lineHeight: 19 },
  simLive: { color: '#6ff5b0' },
  simPaused: { color: '#d1a0b9' },
  surfaceBoard: { gap: 12, padding: 18, borderRadius: 22, borderWidth: 2, borderColor: '#8fddff', backgroundColor: 'rgba(8,22,31,.9)', boxShadow: '0 16px 42px rgba(73,193,241,.12)' },
  surfaceGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  surfaceCard: { flexGrow: 1, flexBasis: 190, minHeight: 84, gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#34687d', backgroundColor: 'rgba(8,31,43,.85)' },
  surfaceName: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: .9 },
  surfaceState: { fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  surfaceDetail: { color: '#b7dce9', fontSize: 10, lineHeight: 15 },
});
