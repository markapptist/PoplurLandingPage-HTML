import { Link } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import RadiusLab from '@/components/radius-lab';
import { formatKm } from '@/services/radiusLab';
import type { useRadiusLabSummary } from './hooks';
import { Strip } from './primitives';
import { C, T } from './theme';

type LabSummary = ReturnType<typeof useRadiusLabSummary>;

/** The Radius Lab tab's status (spec §4.6) and its caption — the pin, then
 *  the cohort; the caption is the pin half alone so it fits under the label. */
export function labStatus({ state, link }: LabSummary): { text: string; caption: string; tone: 'live' | 'warn' | 'off' } {
  const pin = state?.pin ?? null;
  const cohort = state?.cohort ?? [];
  const head = link === 'offline' ? 'LAB OFFLINE' : link === 'connecting' ? 'CONNECTING' : pin ? `pin ${pin.latitude.toFixed(4)}, ${pin.longitude.toFixed(4)} · ${formatKm(pin.radiusMeters)}` : 'no pin';
  return {
    text: `${head} · ${cohort.length ? `${cohort.length} cohort pops` : 'no cohort'}`,
    caption: head,
    tone: link === 'offline' ? 'warn' : pin ? 'live' : 'off',
  };
}

/** The Radius Lab tab: the status strip with the full-page Link beside it
 *  (a sibling of nothing pressable — spec §4.6), then the widget, which owns
 *  its own 8098 subscription while this panel is mounted (spec §4.5). The
 *  strip shows the last summary the route heard before the widget took over.
 *  The widget keeps its own StyleSheet (spec decision 17, §3.3) — the
 *  `lab-widget` id is the carve-out the restyle probes scope around. */
export function LabPanel({ summary }: { summary: LabSummary }) {
  const status = labStatus(summary);
  return <View style={styles.panel}>
    <View style={styles.head}>
      <View style={styles.strip}><Strip text={status.text} tone={status.tone} /></View>
      <Link href="/radius-lab" style={styles.link}><Text style={[T.meta, styles.linkText]}>Open full page →</Text></Link>
    </View>
    <View nativeID="lab-widget"><RadiusLab /></View>
  </View>;
}

const styles = StyleSheet.create({
  panel: { gap: 12 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  strip: { flex: 1, minWidth: 0 },
  link: { paddingVertical: 8 },
  linkText: { color: C.people, fontWeight: '700' },
});
