import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import RadiusLab from '@/components/radius-lab';

/**
 * Standalone route for the Radius Lab (http://127.0.0.1:8084/radius-lab).
 * The same widget also sits inside the Beta Control Room; this page keeps it
 * reachable on its own while the control room is being reworked.
 */
export default function RadiusLabScreen() {
  return <SafeAreaView style={styles.safe} edges={['top', 'bottom']}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.broadcast}><View style={styles.broadcastLeft}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE BETA DESK</Text></View><Text style={styles.broadcastRight}>PRIVATE · LOCAL OWNER VIEW</Text></View>
    <View style={styles.header}><Text style={styles.brand}>POPLUR</Text><Text style={styles.title}>Radius Lab</Text><Text style={styles.subtitle}>One synthetic pin, one radius, and the production map repainting its clay territory as you move it.</Text></View>
    <RadiusLab />
  </ScrollView></SafeAreaView>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#12020c' },
  page: { flexGrow: 1, width: '100%', maxWidth: 1120, alignSelf: 'center', paddingHorizontal: 20, paddingBottom: 48, gap: 16, backgroundImage: 'radial-gradient(circle at 50% 0%, #501032 0%, #18030f 38%, #080409 76%)' },
  broadcast: { minHeight: 42, marginHorizontal: -20, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#f20b69', borderBottomWidth: 3, borderBottomColor: '#8d0642' },
  broadcastLeft: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#fff' },
  liveText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 1.2 },
  broadcastRight: { color: '#ffe1ef', fontWeight: '800', fontSize: 10, letterSpacing: 1 },
  header: { paddingTop: 28, gap: 5 },
  brand: { color: '#ff4aa3', fontWeight: '900', fontSize: 13, letterSpacing: 4, textShadowColor: '#ff1680', textShadowRadius: 12 },
  title: { color: '#fff7fb', fontSize: 42, fontWeight: '900', letterSpacing: -1.6 },
  subtitle: { color: '#e0b8cc', fontSize: 15, lineHeight: 21, maxWidth: 700 },
});
