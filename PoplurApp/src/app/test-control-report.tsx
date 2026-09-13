import { useEffect, useRef, useState } from 'react';
import Head from 'expo-router/head';
import { useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { ReportReadRefused, readReport } from '@/services/testControl';
import { Connecting, Label } from '@/components/test-center/primitives';
import { ReportCompare, ReportMemo, isReportDay, refusalCopy, type ReportSlot } from '@/components/test-center/reports';
import { FONT, S, T } from '@/components/test-center/theme';

/**
 * The print route (algorithm-reports-design.md §4.1):
 * `/test-control-report?day=YYYY-MM-DD[&vs=YYYY-MM-DD]` — the browser's own
 * Save-as-PDF of a light-authored page, 0 dependencies. Plain document-flow
 * Views: no SafeAreaView, no ScrollView, no `height: 100%` — Chrome prints an
 * `overflow: scroll` container as one viewport page, so the memo is laid out
 * as a document and the page scrolls on screen the way it paginates on
 * paper. Every Fold is forced open (`mode="paper"`) because a collapsed Fold
 * prints empty. The report is read in an effect (nothing reads `window`
 * during render — `web.output: "server"`), then rendered once ready.
 */
const first = (value: string | string[] | undefined): string | null => (Array.isArray(value) ? value[0] : value) ?? null;

/** The stylesheet the route owns, mounted through `expo-router/head`.
 *
 *  It starts by undoing Expo's root reset: no `src/app/+html.tsx` exists, so
 *  every route ships the default root document's `ScrollViewStyleReset`
 *  (`#root,body,html{height:100%}body{overflow:hidden}#root{display:flex}`),
 *  under which a plain-View route neither scrolls on screen nor prints past
 *  one page. In the server HTML these rules follow the reset, but on
 *  hydration react-helmet-async re-inserts its tags at the START of <head>
 *  (probed 12 Sep: `STYLE[rh]` first, `#expo-reset` sixth), so source order
 *  cannot be relied on; the `:not(#expo-reset)` no-op raises each selector
 *  one id above the reset's own (`#root` → 2,0,0; `body`/`html` → 1,0,1) and
 *  wins in both orders without `!important`. Outside any `@media` block so
 *  the screen is governed too. A `+html.tsx` is rejected: it would replace
 *  the root document for `/test-control`'s ScrollView shell as well.
 *
 *  Then the paper palette: RN-web compiles StyleSheet styles to atomic
 *  classes, so a rule scoped to `#paper` (specificity 1,0,1) outranks every
 *  class-borne surface and text colour and flattens the clay to white — but
 *  never an inline style, which is how the memo keeps every hue that carries
 *  meaning (▲ growth, ▼ decay, the sim tone, the chips, the story bars): those
 *  are inline, chosen per mode inside `reports.tsx`.
 *
 *  Print rules use attribute selectors on the `nativeID`s RN-web emits as DOM
 *  ids — a Fold is `id="verdict-K2"`, the card `id="report-card-<day>"` — because
 *  RN-web Views take no class names. */
const PRINT_CSS = `
html:not(#expo-reset), body:not(#expo-reset), #root:not(#expo-reset) { height: auto; overflow: visible; display: block }
body:not(#expo-reset) { background: #ffffff; color: #1a0d16; font-family: ${FONT}; color-scheme: light }
#paper * { color: #1a0d16; background-color: transparent; background-image: none; box-shadow: none; backdrop-filter: none; -webkit-backdrop-filter: none; text-shadow: none; border-color: #d9c2cf }
#paper [id^="verdict-"], #paper [id^="report-card-"] { border: 1px solid #d9c2cf; border-radius: 10px }
#paper #report-story, #paper [id^="report-footer-"] { border-top: 1px solid #d9c2cf; padding-top: 8px }
@page { size: Letter; margin: 14mm }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact }
@media print {
  #report-controls, #tab-bar, #paper-controls { display: none }
  [id^="verdict-"], [id^="report-card-"] { break-inside: avoid }
  #report-story { break-before: page }
}
`;

export default function TestControlReportScreen() {
  const params = useLocalSearchParams<{ day?: string | string[]; vs?: string | string[] }>();
  const day = first(params.day), vs = first(params.vs);
  const [slots, setSlots] = useState<Record<string, ReportSlot>>({});
  // Each day is requested once; the slot is written only in the promise callbacks.
  const requested = useRef(new Set<string>());
  useEffect(() => {
    for (const wanted of [day, vs]) {
      if (!wanted || !isReportDay(wanted) || requested.current.has(wanted)) continue;
      requested.current.add(wanted);
      readReport(wanted)
        .then(read => setSlots(current => ({ ...current, [wanted]: read === null ? { state: 'absent', report: null, refusal: null, revision: 0, error: null } : read.report ? { state: 'ready', report: read.report, refusal: null, revision: read.report.revision, error: null } : { state: 'refused', report: null, refusal: read.refusal, revision: 0, error: null } })))
        .catch((error: unknown) => setSlots(current => ({ ...current, [wanted]: { state: 'error', report: null, refusal: null, revision: 0, error: error instanceof ReportReadRefused ? error.message : error instanceof Error ? error.message : 'The report could not be read.' } })));
    }
  }, [day, vs]);
  const slot = day ? slots[day] : undefined;
  const vsSlot = vs ? slots[vs] : undefined;
  const report = slot?.report ?? null;
  const title = day ? `poplur-algorithm-report-${day}${report && report.revision > 1 ? `-r${report.revision}` : ''}${vs ? `-vs-${vs}` : ''}` : 'poplur-algorithm-report';
  const body = (() => {
    if (!day || !isReportDay(day)) return <Text style={[T.body, styles.ink]}>Open this page as /test-control-report?day=YYYY-MM-DD (optionally &vs=YYYY-MM-DD) from the PRINT / SAVE AS PDF control of a report.</Text>;
    if (!slot || (vs && isReportDay(vs) && !vsSlot)) return <Connecting loading />;
    if (slot.state === 'absent') return <Text style={[T.body, styles.ink]}>No report for {day}: the digest writes one per Toronto day at the first complete run after midnight, and this day has none yet.</Text>;
    if (slot.state === 'refused' && slot.refusal) return <Text style={[T.body, styles.ink]}>{refusalCopy(slot.refusal)}</Text>;
    if (slot.state === 'error' || !report) return <Text style={[T.body, styles.ink]}>{slot.error ?? 'The report could not be read.'}</Text>;
    if (vs && isReportDay(vs) && vsSlot) {
      if (!vsSlot.report) return <Text style={[T.body, styles.ink]}>{vsSlot.state === 'absent' ? `No report for ${vs}.` : vsSlot.state === 'refused' && vsSlot.refusal ? refusalCopy(vsSlot.refusal) : vsSlot.error ?? `The report for ${vs} could not be read.`}</Text>;
      return <ReportCompare a={report} b={vsSlot.report} mode="paper" />;
    }
    return <ReportMemo report={report} mode="paper" />;
  })();
  return <View nativeID="paper" style={styles.paper}>
    <Head><title>{title}</title><style>{PRINT_CSS}</style></Head>
    <View nativeID="paper-controls" style={styles.controls}>
      <Label>PAPER · the browser print is the PDF · file name {title}</Label>
      <Pressable accessibilityRole="button" onPress={() => { if (typeof window !== 'undefined') window.print(); }} style={[S.buttonPrimary, styles.print]}><Text style={[T.cell, styles.printText]}>PRINT / SAVE AS PDF</Text></Pressable>
    </View>
    {body}
  </View>;
}

const styles = StyleSheet.create({
  // Document flow: a bounded column, no flex growth, no viewport height.
  paper: { width: '100%', maxWidth: 1000, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 48, gap: 16, backgroundColor: '#ffffff' },
  controls: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  print: { borderWidth: 1, borderColor: '#b5176f' },
  printText: { color: '#1a0d16', fontWeight: '800' },
  ink: { color: '#1a0d16' },
});
