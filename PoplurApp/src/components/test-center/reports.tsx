import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';
import {
  ReportReadRefused,
  compareReports,
  estimateReportRange,
  readReport,
  reportChips,
  reportCompareCsv,
  reportCompareFilename,
  reportCsvFilename,
  reportDaysCsv,
  reportMetricsCsv,
  reportPostsCsv,
  reportVerdictsCsv,
  reportsRangeCsv,
  reportsRangeFilename,
  saveCsv,
  type BetaAlgorithmDay,
  type BetaAlgorithmReport,
  type BetaReportCheck,
  type BetaReportGate,
  type BetaReportIndex,
  type BetaReportIndexRow,
  type BetaReportKnobId,
  type BetaReportRefusal,
  type BetaReportVerdict,
  type BetaReportWindow,
  type BetaReportWindowName,
} from '@/services/testControl';
import { Change, Delta, Empty, Fact, Fold, Label, Num, Section, SimTag, Strip } from './primitives';
import { PostDrilldown, type DrillState } from './testers';
import { C, FONT, S, T, dayLabel, km, stamp } from './theme';

/**
 * The Reports tab (algorithm-reports-design.md §3): the list of daily
 * reports, the memo for one, the compare view for two, and the exports. A
 * report is a pure render the digest wrote once per Toronto day; nothing on
 * this tab applies anything — the SUGGESTION card names a change the owner
 * may decide on, and every REAL figure arrives gated from the document (the
 * page never divides, never invents confidence: a null value under an
 * insufficient gate renders as the grey `Gated` tile, never as a number).
 *
 * `mode: 'paper'` is the print route's rendering of the same memo
 * (§4.1): every Fold forced open, plain document flow, and the hues it
 * paints itself taken from the light palette below — the surfaces are
 * flattened by the route's own print stylesheet, which cannot reach the
 * inline colours a value carries, so those are chosen here per mode.
 */
export type ReportMode = 'desk' | 'paper';

/** One day's body in the route cache (§3.1): written only in promise
 *  callbacks; `loading` is derived by the tab from the absence (or a stale
 *  revision) of a slot, never stored. */
export type ReportSlot = {
  state: 'ready' | 'refused' | 'absent' | 'error';
  report: BetaAlgorithmReport | null;
  refusal: BetaReportRefusal | null;
  /** The index revision the slot was fetched for; a higher one in the index invalidates it. */
  revision: number;
  error: string | null;
};
export type ReportBodies = Record<string, ReportSlot>;

/** The list pages 14 rows at a time (§3.3, the PopsList shape). */
const LIST_PAGE = 14;
/** Posts on this day: ≤ 50 rows (§3.4 item 8). */
const POSTS_ON_DAY = 50;
/** The fixed-by-decision rows that share one Fold (§3.4 item 3); K13 keeps
 *  its own for the anchors line, K10 and K14 theirs for their findings. */
const SHARED_FIXED_KNOBS: readonly BetaReportKnobId[] = ['K8', 'K9', 'K11', 'K12', 'K15', 'K16', 'K17'];
/** Short knob names for the list cell and the caption, where the verdict
 *  row's own `name` is not to hand (the index row carries the id only). */
export const KNOB_SHORT: Record<BetaReportKnobId, string> = {
  K1: 'first view', K2: 'like', K3: 'comment', K4: 'dislike', K5: 'repeat base', K6: 'repeat interval', K7: 'decay', K8: 'dust floor', K9: 'seed floor',
  K10: 'claim ceiling', K11: 'slider step', K12: 'boost default', K13: 'world ceiling', K14: 'trial switch', K15: 'stress t½', K16: 'feed weights', K17: 'sim shape',
};
const KNOB_UNIT: Partial<Record<BetaReportKnobId, string>> = { K1: 'm', K2: 'm', K3: 'm', K4: 'm', K5: 'm', K7: '/day' };
/** Hold reasons in the order the verdict table lists them (§3.4 item 3). */
const HOLD_ORDER = ['open', 'cool-down', 'in-range', 'invariant-capped', 'concentration', 'conflicting-evidence', 'reversal-guard', 'production-unverified', 'deferred', 'changed-recently'];
const FIXED_REASONS = new Set(['owner-fixed', 'paid', 'ui', 'simulation', 'rank-only', 'finding', 'experiment-switch']);
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const isReportDay = (raw: string) => DAY_RE.test(raw);

/** The hues a value carries inline, per mode: the desk's tokens, or the
 *  light set that keeps every meaning at print contrast (§4.1). */
const HUE = {
  desk: { ink: C.ink, meta: C.ink4, pop: C.pop, decay: C.decay, boost: C.boost, now: C.now, sim: C.sim, simFill: C.simFill, people: C.people, away: C.away, track: C.ghost, rule: C.hairlineSoft },
  paper: { ink: '#1a0d16', meta: '#5e4a56', pop: '#0f7a45', decay: '#b3461f', boost: '#8a6300', now: '#b5176f', sim: '#5c5566', simFill: 'rgba(92,85,102,.28)', people: '#1f5fa8', away: '#8a7a84', track: 'rgba(0,0,0,.06)', rule: 'rgba(0,0,0,.14)' },
} as const;
type Hue = typeof HUE.desk | typeof HUE.paper;

// ── Formatting ──────────────────────────────────────────────────────────────

const fmt = (value: number | null | undefined, places?: number): string => value == null || !Number.isFinite(value) ? '—'
  : value.toLocaleString('en-CA', places === undefined ? { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 } : { minimumFractionDigits: places, maximumFractionDigits: places });
/** A knob's declared value in its own unit: `+1,000 m` for a grant, `−1,000 m` for the dislike, `0.05 /day`, `30 s`. */
export const knobValue = (knob: BetaReportKnobId, value: number | null, unit: string | null): string => {
  if (value === null) return '—';
  if (unit === 'm') return `${knob === 'K1' || knob === 'K2' || knob === 'K3' ? '+' : value < 0 ? '−' : ''}${fmt(Math.abs(value))} m`;
  if (unit === 'ms') return `${fmt(value / 1000)} s`;
  if (unit === '/day') return `${fmt(value, 2)} /day`;
  if (unit === '×') return `×${fmt(value)}`;
  if (unit === 'h') return `${fmt(value)} h`;
  return fmt(value);
};
/** An evidence cell's value in the unit the generator stamped on it. */
const cellValue = (value: number | string | boolean | null, unit: string | null): string => {
  if (value === null) return '—';
  if (typeof value === 'boolean') return value ? 'yes' : 'no';
  if (typeof value === 'string') return value;
  if (unit === 'm') return `${fmt(value)} m`;
  if (unit === 'ratio') return fmt(value, 2);
  if (unit === 'm/post-day') return `${fmt(value)} m/post-day`;
  if (unit === '×') return `×${fmt(value)}`;
  if (unit === 'cad') return `CA$${fmt(value, 4)}`;
  if (unit === 'days') return `${fmt(value, 1)} d`;
  return fmt(value);
};
/** The one place a `to` is printed beside its knob: `→ 1,250 m`, `→ 0.04 /day`. */
const toValue = (knob: BetaReportKnobId, value: number | null): string => value === null ? '—' : knobValue(knob, value, KNOB_UNIT[knob] ?? null).replace(/^\+/, '');
const gateSummary = (gates: BetaReportGate[]): string => gates.map(gate => `${gate.id} ${fmt(gate.n)}/${fmt(gate.minN)}`).join(' · ');

/** The list cell / caption text for an index row: the verb form, so a
 *  suggestion never reads as applied (§3.3, refuter 23). */
export const suggestionCell = (row: BetaReportIndexRow): { text: string; tone: 'now' | 'boost' | 'meta' } => {
  if (row.decision === 'suggest' && row.knob) return { text: `SUGGESTS ${row.knob} ${KNOB_SHORT[row.knob]} → ${toValue(row.knob, row.to)}`, tone: 'now' };
  if (row.decision === 'verify') return { text: 'VERIFY drift', tone: 'boost' };
  return { text: `no suggestion · ${row.counts.insufficient} insufficient · ${row.counts.fixed} fixed`, tone: 'meta' };
};

/** The chips that cannot be missed (§3.3, judge 3): the trial, the revision
 *  and the three provenance flags, on the list row, the document, the paper
 *  and (as identity columns) every CSV. */
type ChipSource = Parameters<typeof reportChips>[0];
const chipColor = (chip: string, hue: Hue): string => chip.startsWith('TRIAL') ? hue.decay : chip.startsWith('REV') || chip === 'PARTIAL' || chip === 'STALE DATA' ? hue.boost : hue.away;
export function ReportChips({ row, hue }: { row: ChipSource; hue: Hue }) {
  const chips = reportChips(row);
  if (!chips.length) return null;
  return <View style={styles.chips}>{chips.map(chip => <View key={chip} style={[S.chip, styles.chip, { borderColor: chipColor(chip, hue) }]}><Text style={[styles.chipText, { color: chipColor(chip, hue) }]}>{chip}</Text></View>)}</View>;
}

/** Signed metres: the `Delta` primitive on the desk; on paper the same
 *  grammar through `Change` with the light hues, and the simulation tone as
 *  its `sim ` prefix (§4.1 — a primitive's inline desk hue would print). */
function Meters({ meters, hue, tone = 'real', style }: { meters: number; hue: Hue; tone?: 'real' | 'sim'; style?: StyleProp<TextStyle> }) {
  if (hue === HUE.desk) return <Delta meters={meters} tone={tone} style={style} />;
  const colors = tone === 'sim' ? { up: hue.sim, down: hue.sim, flat: hue.sim } : { up: hue.pop, down: hue.decay, flat: hue.away };
  return <Text style={[styles.meters, style, { color: colors.flat }]}>{tone === 'sim' ? 'sim ' : ''}<Change value={meters} unit="m" colors={colors} /></Text>;
}

// ── The tab ─────────────────────────────────────────────────────────────────

/** Loading is derived: a slot the route has not filled, or one fetched for
 *  an older revision than the index now lists, is `loading`. */
export function reportSlotState(slot: ReportSlot | undefined, indexRevision: number): ReportSlot['state'] | 'loading' {
  if (!slot) return 'loading';
  if (indexRevision > slot.revision) return 'loading';
  return slot.state;
}

export function ReportsTab({ index, open, vs, bodies, onOpen, onCompare, onClose, onRetry, drill, onOpenPost }: {
  index: BetaReportIndex | null;
  open: string | null;
  vs: string | null;
  bodies: ReportBodies;
  onOpen: (day: string) => void;
  onCompare: (day: string | null) => void;
  onClose: () => void;
  onRetry: (day: string) => void;
  drill: DrillState;
  onOpenPost: (postId: string) => void;
}) {
  const [shown, setShown] = useState(LIST_PAGE);
  const [armed, setArmed] = useState(false);
  const rows = index?.days ?? [];
  const rowOf = (day: string | null) => (day ? rows.find(row => row.day === day) : undefined) ?? null;
  const revisionOf = (day: string | null) => rowOf(day)?.revision ?? 0;
  const openRow = rowOf(open), vsRow = rowOf(vs);
  const openState = open ? reportSlotState(bodies[open], revisionOf(open)) : null;
  const vsState = vs ? reportSlotState(bodies[vs], revisionOf(vs)) : null;
  const press = (day: string) => {
    if (open && armed && day !== open) { setArmed(false); onCompare(day); return; }
    onOpen(day);
  };
  const renderRow = (row: BetaReportIndexRow, selected: boolean) => {
    const cell = suggestionCell(row);
    return <Pressable key={row.day} accessibilityRole="button" aria-selected={selected} onPress={() => press(row.day)} style={[S.row, styles.listRow, selected && S.open]}>
      <View style={styles.listDay}><Text style={T.name}>{dayLabel(row.day)}</Text><Text style={T.meta}>{stamp(row.generatedAtMillis)} · v{row.digestVersion}</Text></View>
      <View style={styles.listCell}>
        <Text numberOfLines={2} style={[T.cell, cell.tone === 'now' ? styles.cellNow : cell.tone === 'boost' ? styles.cellBoost : T.meta]}>{cell.text}</Text>
        <ReportChips row={row} hue={HUE.desk} />
      </View>
      <Text style={[T.meta, styles.listEpoch]}>{row.productionEpoch}</Text>
    </Pressable>;
  };
  const listMeta = 'one per Toronto day · written by the hourly digest at the first complete run after midnight · 0 reads to list';
  const compareChip = open ? <Pressable accessibilityRole="switch" aria-checked={armed || !!vs} onPress={() => (vs ? onCompare(null) : setArmed(current => !current))} style={[S.chip, (armed || !!vs) && S.chipOn]}>
    <Label style={styles.chipLabel}>{vs ? '× COMPARE' : armed ? 'PICK A SECOND DAY' : 'COMPARE'}</Label>
  </Pressable> : null;
  // The list collapses to the selected row(s) with a way back once a report is open (§3.4).
  if (open) {
    return <>
      <Section id="reports" title="Daily reports" meta={listMeta} right={compareChip}>
        <View>
          <Pressable accessibilityRole="button" onPress={onClose} style={[S.button, styles.back]}><Text style={T.cell}>← all reports</Text></Pressable>
          {openRow ? renderRow(openRow, true) : <View style={[S.row, styles.listRow]}><Text style={T.meta}>{dayLabel(open)} · not in the listed 120 days — read by id</Text></View>}
          {vs ? (vsRow ? renderRow(vsRow, true) : <View style={[S.row, styles.listRow]}><Text style={T.meta}>{dayLabel(vs)} · not in the listed 120 days — read by id</Text></View>) : null}
          {armed && !vs && <Text style={[T.meta, styles.armedHint]}>Press another day below to compare it with {dayLabel(open)}.</Text>}
          {armed && !vs && rows.filter(row => row.day !== open).slice(0, shown).map(row => renderRow(row, false))}
        </View>
      </Section>
      {vs
        ? <CompareSlot a={open} b={vs} aState={openState!} bState={vsState!} bodies={bodies} onRetry={onRetry} />
        : <MemoSlot day={open} state={openState!} slot={bodies[open]} onRetry={onRetry} drill={drill} onOpenPost={onOpenPost} />}
    </>;
  }
  return <Section id="reports" title="Daily reports" meta={listMeta}>
    <View>
      {!rows.length && <Empty text={index ? 'No daily report yet — the first one lands at the first complete digest run after Toronto midnight.' : 'No report index yet — the proxy watches testControl/algorithmReports and lists its days here.'} />}
      {rows.slice(0, shown).map(row => renderRow(row, false))}
      {rows.length > shown && <Pressable accessibilityRole="button" onPress={() => setShown(current => current + LIST_PAGE)} style={[S.button, styles.showMore]}><Text style={T.cell}>Show {Math.min(LIST_PAGE, rows.length - shown)} more</Text></Pressable>}
      {rows.length > 0 && <RangeExport rows={rows} bodies={bodies} />}
    </View>
  </Section>;
}

/** The open day's body in its four states; the memo once it is ready. */
function MemoSlot({ day, state, slot, onRetry, drill, onOpenPost }: { day: string; state: ReportSlot['state'] | 'loading'; slot: ReportSlot | undefined; onRetry: (day: string) => void; drill: DrillState; onOpenPost: (postId: string) => void }) {
  if (state === 'loading') return <View style={[S.card, styles.slotState]}><Text style={T.body}>Reading the report for {dayLabel(day)}… (1 read the first time, cached after)</Text></View>;
  if (state === 'absent') return <View style={[S.card, styles.slotState]}><Text style={T.body}>No report for {dayLabel(day)}: the digest writes one per Toronto day at the first complete run after midnight, and this day has none yet.</Text></View>;
  if (state === 'refused' && slot?.refusal) return <View style={[S.card, styles.slotState]}><Text style={T.body}>{refusalCopy(slot.refusal)}</Text></View>;
  if (state === 'error' || !slot?.report) return <View style={[S.card, styles.slotState]}><Text style={T.body}>{slot?.error ?? 'The report could not be read.'}</Text><Pressable accessibilityRole="button" onPress={() => onRetry(day)} style={S.button}><Label>RETRY</Label></Pressable></View>;
  return <ReportMemo report={slot.report} mode="desk" drill={drill} onOpenPost={onOpenPost} />;
}

function CompareSlot({ a, b, aState, bState, bodies, onRetry }: { a: string; b: string; aState: ReportSlot['state'] | 'loading'; bState: ReportSlot['state'] | 'loading'; bodies: ReportBodies; onRetry: (day: string) => void }) {
  const pending = [[a, aState], [b, bState]].filter(([, state]) => state === 'loading') as [string, string][];
  if (pending.length) return <View style={[S.card, styles.slotState]}><Text style={T.body}>Reading {pending.map(([day]) => dayLabel(day)).join(' and ')}… (≤ 2 reads uncached)</Text></View>;
  const missing = [[a, aState, bodies[a]], [b, bState, bodies[b]]].filter(([, state]) => state !== 'ready') as [string, string, ReportSlot | undefined][];
  if (missing.length) return <View style={[S.card, styles.slotState]}>
    {missing.map(([day, state, slot]) => <Text key={day} style={T.body}>{dayLabel(day)}: {state === 'absent' ? 'no report for this day' : state === 'refused' && slot?.refusal ? refusalCopy(slot.refusal) : slot?.error ?? 'could not be read'}</Text>)}
    {missing.some(([, state]) => state === 'error') && <Pressable accessibilityRole="button" onPress={() => missing.forEach(([day]) => onRetry(day))} style={S.button}><Label>RETRY</Label></Pressable>}
  </View>;
  return <ReportCompare a={bodies[a]!.report!} b={bodies[b]!.report!} mode="desk" />;
}

/** The `algorithmDigestRefusal` grammar (W:1278-1286) for a report. */
export const refusalCopy = (refusal: BetaReportRefusal): string => refusal.reason === 'unsupported-version'
  ? `Report schema ${refusal.version ?? '?'} is unsupported here (this page reads schema 1) — nothing is rendered rather than zeros.`
  : refusal.reason === 'oversize' ? `The report for ${refusal.day ?? 'this day'} was refused as oversize — nothing is rendered rather than a trimmed guess.`
  : `The report for ${refusal.day ?? 'this day'} carries an evidence block that does not parse — nothing is rendered rather than zeros.`;

/** `EXPORT RANGE · metrics` (§4.2): the one report action that can spend more
 *  than 2 reads. The estimate is printed before the press; a day already in
 *  the route cache costs nothing; the proxy's 429 is surfaced as the ledger
 *  export's is. Written only in the handler and its promise callbacks. */
function RangeExport({ rows, bodies }: { rows: BetaReportIndexRow[]; bodies: ReportBodies }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const estimate = estimateReportRange(rows.map(row => row.day), Object.entries(bodies).filter(([, slot]) => slot.report).map(([day]) => day));
  const run = async () => {
    setBusy(true); setNote(null);
    try {
      const reports: BetaAlgorithmReport[] = [];
      for (const row of rows) {
        const cached = bodies[row.day]?.report;
        if (cached) { reports.push(cached); continue; }
        const read = await readReport(row.day);
        if (read?.report) reports.push(read.report);
      }
      if (!reports.length) { setNote('No report body could be read.'); return; }
      saveCsv(reportsRangeFilename(reports), reportsRangeCsv(reports));
      setNote(`${reports.length} reports exported.`);
    } catch (error) {
      setNote(error instanceof ReportReadRefused ? error.message : error instanceof Error ? error.message : 'The range export failed.');
    } finally { setBusy(false); }
  };
  return <View style={styles.rangeRow}>
    <Pressable accessibilityRole="button" disabled={busy} onPress={run} style={[S.button, busy && S.disabled]}><Text style={T.cell}>EXPORT RANGE · metrics · {estimate.reports} reports · ≈ {estimate.reads} reads · CA${estimate.cad.toFixed(5)}</Text></Pressable>
    {!!note && <Text style={T.meta}>{note}</Text>}
  </View>;
}

// ── The memo (§3.4) ─────────────────────────────────────────────────────────

/** The document, in the fixed order of §3.4 — identical on screen, on paper
 *  and in the CSVs. `nativeID="report-<day>"`; the first text node inside it
 *  is `firstLine` verbatim. */
export function ReportMemo({ report, mode, drill, onOpenPost }: { report: BetaAlgorithmReport; mode: ReportMode; drill?: DrillState; onOpenPost?: (postId: string) => void }) {
  const hue = HUE[mode];
  const paper = mode === 'paper';
  const chipRow: ChipSource = { partial: report.partial, backfilled: report.backfilled, catchUp: report.catchUp, revision: report.revision, trialOn: report.trialOnDay, trialMultiplier: report.trialMultiplierOnDay };
  return <View nativeID={`report-${report.day}`} style={styles.memo}>
    {/* Never clamped (§0, §4.1 page 1): a trial-day first line runs ≈ 260
        characters — three lines on the 736-px desk pane and at Letter width —
        and its tail is the anchors line the owner reads second. */}
    <Strip text={report.firstLine} tone={report.trialOnDay ? 'warn' : 'off'} lines={0} />
    <View style={styles.identityRow}>
      <Text style={[T.meta, { color: hue.meta }]}>POPLUR · ALGORITHM REPORT · {dayLabel(report.day)} {report.day} ({report.timeZone.replace('_', ' ')}) · digest v{report.digestVersion} · source {report.sourcePolicyVersion} · knobs {report.knobsHash} · epoch {report.productionEpoch} · rules {report.ruleSetVersion} · written {stamp(report.generatedAtMillis)} · rev {report.revision}{report.supersedes ? ` (supersedes ${report.supersedes.runId}, ${report.supersedes.entriesOnDay} entries then)` : ''}</Text>
      <ReportChips row={chipRow} hue={hue} />
    </View>
    <SuggestionCard report={report} hue={hue} />
    <VerdictTable report={report} hue={hue} paper={paper} />
    <ChecksStrip report={report} hue={hue} />
    <StoryStrip report={report} hue={hue} />
    <WindowsTable report={report} hue={hue} />
    <SinceYesterday report={report} hue={hue} />
    <PostsOnDay report={report} hue={hue} drill={paper ? undefined : drill} onOpenPost={paper ? undefined : onOpenPost} />
    <ReportFooter report={report} hue={hue} paper={paper} />
  </View>;
}

/** Titled SUGGESTION, never DECISION — the owner decides (refuter 23). */
function SuggestionCard({ report, hue }: { report: BetaAlgorithmReport; hue: Hue }) {
  const { decision } = report;
  const knobRow = decision.knob ? report.verdicts.find(row => row.knob === decision.knob) ?? null : null;
  const edge = decision.kind === 'suggest' ? hue.now : decision.kind === 'verify' ? hue.boost : hue.rule;
  const pays = decision.productionPays;
  const paysText = pays && pays.value !== null ? `${knobValue(pays.knob, pays.value, KNOB_UNIT[pays.knob] ?? null).replace(/^\+/, '')} (${pays.knob}, n ${fmt(pays.n)}, ${pays.basis})` : 'an unverified value (n < 30)';
  return <View nativeID={`report-card-${report.day}`} style={[S.card, S.open, styles.card, { borderLeftColor: edge }]}>
    <Label>SUGGESTION</Label>
    <Text style={[T.panelTitle, { color: hue.ink }]}>{decision.sentence}</Text>
    {knobRow && decision.action && <View style={styles.facts}>
      <Fact label="DECLARED (SOURCE)" value={knobValue(knobRow.knob, knobRow.declaredValue, knobRow.unit)} meta="the digest's synced copy — never printed as current" />
      <Fact label={`SEEN (PRODUCTION, ALL CLASSES, n ${fmt(knobRow.seenN)})`} value={knobRow.seenValue === null ? 'unseen' : knobValue(knobRow.knob, knobRow.seenValue, knobRow.unit)} meta={knobRow.seenBasis} />
      <Fact label="FROM → TO" value={`${toValue(knobRow.knob, decision.action.from)} → ${toValue(knobRow.knob, decision.action.to)}`} meta={`${decision.action.where}`} />
    </View>}
    {decision.action && <View style={styles.stack}>
      <Text style={[T.meta, { color: hue.meta }]}>to apply it you would</Text>
      <Text style={[T.meta, { color: hue.meta }]}>1. edit {decision.action.where}</Text>
      {decision.action.deploy.map((step, i) => <Text key={step} style={[T.meta, { color: hue.meta }]}>{i + 2}. {step}</Text>)}
    </View>}
    <Text style={[T.body, styles.applied, { color: hue.ink }]}>nothing is applied by this report; production pays {paysText} until you deploy</Text>
    {decision.deferred.length > 0 && <Text style={[T.meta, { color: hue.meta }]}>also fired, held by the one-knob rule: {decision.deferred.map(item => `${item.knob} ${KNOB_SHORT[item.knob]} → ${toValue(item.knob, item.to)} (${item.ruleId})`).join(' · ')}</Text>}
    {decision.open.map(item => <Text key={item.knob} style={[T.meta, { color: hue.meta }, item.outcome === 'withdrawn' && styles.struck]}>open suggestion · {item.knob} {KNOB_SHORT[item.knob]} → {toValue(item.knob, item.to)} · rule {item.ruleId} · open since {item.openSinceDay} · outcome {item.outcome ?? 'open'} · missed reports {item.missedReports}</Text>)}
    {!!decision.ownerQuestion && <Text style={[T.body, { color: hue.ink }]}>Standing owner question: {decision.ownerQuestion}</Text>}
  </View>;
}

/** The GatedValue grammar (D:97-101), built here from `Fact` + `T.meta`: below
 *  a gate the tile says `insufficient evidence — n = {n} · needs {minN}` and no
 *  number of the value's kind is shown. */
function Gated({ gate, label, hue, children }: { gate: BetaReportGate | null; label: string; hue: Hue; children: ReactNode }) {
  if (!gate || gate.sufficient) return <>{children}</>;
  return <View style={styles.gateTile}>
    <Label>{label}</Label>
    <Text style={[T.cell, { color: hue.away }]}>insufficient evidence — n = {fmt(gate.n)} · needs {fmt(gate.minN)}</Text>
    {/* The gate's label is the rule (§2.5) and prints whole — a clamp in a
        140-px tile cut `no one person > 60 %` and the basis on paper. */}
    <Text style={[T.meta, { color: hue.meta }]}>{gate.label}{gate.note ? ` · ${gate.note}` : ''}{gate.basis ? ` · ${gate.basis}` : ''}</Text>
  </View>;
}

const verdictRank = (row: BetaReportVerdict): number => {
  if (row.verdict === 'suggest') return 0;
  if (row.verdict === 'verify') return 1;
  if (row.verdict === 'hold') return FIXED_REASONS.has(row.reason) ? 400 : 100 + Math.max(0, HOLD_ORDER.indexOf(row.reason));
  return 300;
};
const knobNumber = (knob: BetaReportKnobId) => Number(knob.slice(1));
const verdictTone = (row: BetaReportVerdict): 'live' | 'warn' | 'off' => row.verdict === 'suggest' || row.verdict === 'verify' ? 'warn' : row.verdict === 'hold' && row.reason === 'in-range' ? 'live' : 'off';
/** The Fold's one-line status: the verdict word, the value it names, the rule and the gates (§3.4 item 3). */
const verdictStatus = (row: BetaReportVerdict): string => {
  const head = row.verdict.toUpperCase();
  const value = row.suggestion ? ` → ${toValue(row.knob, row.suggestion.to)} · rule ${row.suggestion.ruleId}` : row.deferred ? ` (deferred → ${toValue(row.knob, row.deferred.to)} · rule ${row.deferred.ruleId})` : '';
  const gates = row.gates.length ? ` · ${gateSummary(row.gates)}` : '';
  return `${head}${value} · ${row.reason}${gates} — ${row.reasonText}`;
};
const seenText = (row: BetaReportVerdict, report: BetaAlgorithmReport): string => {
  if (row.knob === 'K7') return report.headline.trialSeenOnDay !== null ? `rate unobservable (multiplier ×${report.headline.trialSeenOnDay} seen)` : 'rate unobservable';
  if (row.seenValue === null) return `unseen (n ${fmt(row.seenN)})`;
  return `${knobValue(row.knob, row.seenValue, row.unit).replace(/^\+/, '')} (n ${fmt(row.seenN)}, all classes)`;
};

function VerdictTable({ report, hue, paper }: { report: BetaAlgorithmReport; hue: Hue; paper: boolean }) {
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const rows = useMemo(() => report.verdicts.slice().sort((a, b) => verdictRank(a) - verdictRank(b) || knobNumber(a.knob) - knobNumber(b.knob)), [report.verdicts]);
  const shared = rows.filter(row => SHARED_FIXED_KNOBS.includes(row.knob));
  const own = rows.filter(row => !SHARED_FIXED_KNOBS.includes(row.knob));
  const isOpen = (id: string, fallback: boolean) => paper || (opened[id] ?? fallback);
  const toggle = (id: string, fallback: boolean) => setOpened(current => ({ ...current, [id]: !(current[id] ?? fallback) }));
  return <View style={styles.stack}>
    <Label>VERDICTS · declared (source) · seen (production, ALL classes, n) · verdict · evidence (n / minN)</Label>
    {own.map(row => {
      const primary = row.knob === report.primarySuggestion;
      const id = `verdict-${row.knob}`;
      return <Fold key={row.knob} id={id} title={`${row.knob} · ${row.name} · declared ${knobValue(row.knob, row.declaredValue, row.unit)}${row.knob === 'K5' && row.declaredValue !== null ? ` (${fmt(report.policy.source.knobs.repeatViewLifetimeMeters)} lifetime)` : ''} · seen ${seenText(row, report)}`} status={verdictStatus(row)} tone={verdictTone(row)} open={isOpen(id, primary)} onToggle={() => toggle(id, primary)} right={primary ? <View style={[S.chip, styles.chip, { borderColor: hue.now }]}><Text style={[styles.chipText, { color: hue.now }]}>PRIMARY</Text></View> : undefined}>
        <VerdictBody row={row} report={report} hue={hue} />
      </Fold>;
    })}
    {shared.length > 0 && <Fold id="verdict-fixed" title={`${shared.map(row => row.knob).join(' ')} · fixed by decision`} status={`HOLD · ${shared.map(row => `${row.knob} ${row.reason} (${KNOB_SHORT[row.knob]})`).join(' · ')}`} tone="off" open={isOpen('verdict-fixed', false)} onToggle={() => toggle('verdict-fixed', false)}>
      {shared.map(row => <View key={row.knob} style={styles.stack}>
        <Text style={[T.name, { color: hue.ink }]}>{row.knob} · {row.name} · declared {knobValue(row.knob, row.declaredValue, row.unit)}</Text>
        <VerdictBody row={row} report={report} hue={hue} />
      </View>)}
    </Fold>}
  </View>;
}

function VerdictBody({ row, report, hue }: { row: BetaReportVerdict; report: BetaAlgorithmReport; hue: Hue }) {
  const curveAt = (curve: { points: { startMeters: number; days: number }[] } | null, start: number) => curve?.points.find(point => point.startMeters === start)?.days ?? null;
  return <View style={styles.stack}>
    <Text style={[T.body, { color: hue.ink }]}>{row.reasonText}</Text>
    {row.gates.length > 0 && <View style={styles.facts}>{row.gates.map(gate => <Gated key={gate.id} gate={gate} label={gate.id} hue={hue}><Fact label={gate.id} value={`${fmt(gate.n)} / ${fmt(gate.minN)} · sufficient`} meta={`${gate.label}${gate.note ? ` · ${gate.note}` : ''}`} /></Gated>)}</View>}
    {row.evidence.length > 0 && <View style={styles.facts}>{row.evidence.map((cell, i) => <Fact key={`${cell.id}-${i}`} label={cell.id} value={cellValue(cell.value, cell.unit)} meta={[cell.label, cell.n !== null ? `n ${fmt(cell.n)}` : null, cell.numerator !== null || cell.denominator !== null ? `${fmt(cell.numerator)} / ${fmt(cell.denominator)}` : null].filter(Boolean).join(' · ') || undefined} />)}</View>}
    {!!row.arithmetic && <Text style={[styles.arithmetic, { color: hue.ink }]}>{row.arithmetic}</Text>}
    {!!row.rule && <Text style={[T.meta, { color: hue.meta }]}>rule {row.rule.id}: {row.rule.text}</Text>}
    {row.suggestion && <View style={styles.stack}>
      <Text style={[T.cell, { color: hue.ink }]}>suggest {row.suggestion.direction === 'raise' ? 'raising' : 'lowering'} {toValue(row.knob, row.suggestion.from)} → {toValue(row.knob, row.suggestion.to)} · step {fmt(row.suggestion.step)} · {row.suggestion.rationale}</Text>
      {row.suggestion.respects.length > 0 && <Text style={[T.meta, { color: hue.meta }]}>respects {row.suggestion.respects.join(' · ')}</Text>}
    </View>}
    {row.deferred && <Text style={[T.meta, { color: hue.meta }]}>deferred → {toValue(row.knob, row.deferred.to)} by rule {row.deferred.ruleId} (the one-knob rule; queued on the card)</Text>}
    <Text selectable style={[T.meta, { color: hue.meta }]}>where: {row.where}{row.deploy.length ? ` · deploy: ${row.deploy.join(' → ')}` : ''}</Text>
    {/* Below a gate no number of the knob's own kind is shown — yesterday's `to` included (§1.5). */}
    {(row.previous || row.outcome || row.frozenUntilDay || row.withdrawnDay) && <Text style={[T.meta, { color: hue.meta }]}>
      {row.previous ? `previous ${row.previous.verdict}/${row.previous.reason}${row.previous.to !== null && row.verdict !== 'insufficient' ? ` → ${toValue(row.knob, row.previous.to)}` : ''}` : 'previous —'}
      {row.outcome ? ` → outcome ${row.outcome}${row.openSinceDay ? ` since ${row.openSinceDay}` : ''}${row.withdrawnDay ? ` · withdrawn ${row.withdrawnDay} — the evidence no longer supports it` : ''}${row.outcomeNote ? ` · ${row.outcomeNote}` : ''}` : ''}
      {row.frozenUntilDay ? ` · frozen until ${row.frozenUntilDay}` : ''}
    </Text>}
    {row.knob === 'K7' && row.curveCurrent && <Text style={[T.meta, { color: hue.meta }]}>curve: 1 km → {fmt(curveAt(row.curveCurrent, 1_000), 1)} d today{row.curveAtSuggested && row.suggestion ? ` → ${fmt(curveAt(row.curveAtSuggested, 1_000), 1)} d at ${fmt(row.suggestion.to, 2)}` : ''} · half-life {fmt(row.curveCurrent.halfLifeDays, 2)} d{row.curveAtSuggested ? ` → ${fmt(row.curveAtSuggested.halfLifeDays, 2)} d` : ''} · 468 m floor in {fmt(row.curveCurrent.daysToFloorAt468m, 1)} d{report.evidence.snapshots?.curve.trial ? ` · under ×${report.evidence.snapshots.curve.trial.multiplier ?? '?'}: 1 km → ${fmt(curveAt(report.evidence.snapshots.curve.trial, 1_000), 1)} d` : ''}</Text>}
  </View>;
}

const checkOf = (report: BetaAlgorithmReport, id: string): BetaReportCheck | null => report.checks.find(check => check.id === id) ?? null;
/** Six `Fact`s (§3.4 item 4): drift (all classes), farm bound, claim ceiling, anchors, surface, seed reach. */
function ChecksStrip({ report, hue }: { report: BetaAlgorithmReport; hue: Hue }) {
  const drift = checkOf(report, 'drift'), farm = checkOf(report, 'farmBound'), claim = checkOf(report, 'claimCeiling'), anchors = checkOf(report, 'anchors'), surface = checkOf(report, 'surface'), seed = checkOf(report, 'seedReach');
  const driftRows = drift ? Object.entries(drift.rows).filter(([kind]) => kind !== 'seed').map(([kind, row]) => `${kind} ${row.seen === null ? 'unseen' : fmt(row.seen)}×${fmt(row.n)}`).join(' · ') : '';
  const contamination = report.evidence.snapshots?.contamination.d7 ?? null;
  return <View style={styles.stack}>
    <Label>CHECKS</Label>
    <View style={styles.facts}>
      <Fact label="DRIFT · ALL CLASSES" value={drift ? drift.status : '—'} meta={drift ? `${drift.verify.length ? drift.verify.join(' · ') : driftRows ? `${driftRows} = declared` : 'no observed grant yet'} · ${drift.basis ?? ''}` : undefined} />
      <Fact label="FARM BOUND" value={farm ? farm.status : '—'} meta={farm?.detail ?? undefined} />
      <Fact label="CLAIM CEILING" value={claim ? claim.status : '—'} meta={claim ? `${claim.direction ? `${claim.direction} · ` : ''}${claim.claimsD30 ? `d30 ${claim.claimsD30.count} claims · ${claim.claimsD30.atFloor} at floor · median ${fmt(claim.claimsD30.medianMeters)} m · ${claim.claimsD30.aboveFloorThatEarned} above floor earned` : ''} · as of ${claim.asOfCommit ?? '?'}` : undefined} />
      <Fact label="ANCHORS" value={anchors ? `${anchors.status} · ${fmt(anchors.numbers.atWorld)}/${fmt(anchors.numbers.everAtWorld)} at world` : '—'} meta={anchors?.worst ? `worst ${anchors.worst.postId.slice(0, 8)} ${km(anchors.worst.radiusMeters)} (${fmt(anchors.worst.ratePerPassSeen * 100, 2)} %/pass)` : 'no anchor below the world'} />
      <Fact label="SURFACE" value={surface ? `${surface.status} · ${fmt(surface.numbers.labelledEntries)} labelled` : '—'} meta={surface?.note ?? undefined} />
      <Fact label="SEED REACH" value={seed ? seed.status === 'hidden' ? 'hidden while the trial runs' : seed.status : '—'} meta={seed ? `${seed.numbers.atClaimShare !== null && seed.numbers.atClaimShare !== undefined ? `at-claim share ${fmt(seed.numbers.atClaimShare, 2)} · ` : ''}live ${fmt(seed.numbers.livePosts)} · pairs ${fmt(seed.numbers.pairs)} · near-miss ${fmt(seed.numbers.nearMissPairs)} · ${seed.basis ?? ''}${seed.note ? ` · ${seed.note}` : ''}` : undefined} />
    </View>
    {contamination && <Text style={[T.meta, { color: hue.meta }]}>CONTAMINATION 7 d · <Text style={{ color: hue.sim }}>synthetic {fmt(contamination.syntheticMeters)} m over {fmt(contamination.syntheticEntries)} entries on {fmt(contamination.posts.length)} posts</Text> · owner on real posts {fmt(contamination.ownerMeters)} m · review {fmt(contamination.reviewMeters)} m · simulation owner uid {contamination.simulationOwnerUid}</Text>}
    {!contamination && <Text style={[T.meta, { color: hue.meta }]}>CONTAMINATION 7 d · no snapshot on this day{report.backfilled ? ' (backfilled)' : ''}</Text>}
  </View>;
}

/** The last 30 days (§3.4 item 5): plain-View bar tracks in the DailyStrip
 *  recipe — real gain, real net (▲/▼), day-distinct real viewers, and the
 *  simulation's gain as a separate fourth track, never stacked on real.
 *  Ticks: production epoch boundaries (incl. trial), source knob changes,
 *  the trial's on/off day, the selected day. */
function StoryStrip({ report, hue }: { report: BetaAlgorithmReport; hue: Hue }) {
  const days = report.evidence.days;
  if (!days.length) return <Section id="report-story" title="The last 30 days" frame="none"><Empty text="No day rows in this report." /></Section>;
  const rawByDay = new Map(report.evidence.daysRaw.map(row => [String(row.day), row] as const));
  const gain = (day: BetaAlgorithmDay) => day.realPostGain.real.total;
  const net = (day: BetaAlgorithmDay) => day.realPostGain.real.total - day.realPostDecayLoss.byClass.real;
  const sim = (day: BetaAlgorithmDay) => day.realPostGain.synthetic.total;
  const maxGain = Math.max(1, ...days.map(day => Math.abs(gain(day))));
  const maxNet = Math.max(1, ...days.map(day => Math.abs(net(day))));
  const maxViewers = Math.max(1, ...days.map(day => day.distinctRealViewers));
  const maxSim = Math.max(1, ...days.map(day => Math.abs(sim(day))));
  const boundaries = new Map(report.epochs.filter(epoch => epoch.boundaryCause !== 'window-start').map(epoch => [epoch.fromDay, epoch.boundaryCause] as const));
  const sourceTicks = new Set(Object.values(report.policy.source.knobChangedDays).filter((day): day is string => !!day));
  const trialTicks = new Set<string>();
  let lastClass: string | null = null;
  for (const day of days) {
    const trialClass = (rawByDay.get(day.day)?.trialClass as string | null | undefined) ?? null;
    if (trialClass !== null) { if (lastClass !== null && trialClass !== lastClass) trialTicks.add(day.day); lastClass = trialClass; }
  }
  const pct = (value: number, max: number) => `${Math.round(Math.min(1, Math.abs(value) / max) * 100)}%` as const;
  const totalGain = days.reduce((sum, day) => sum + gain(day), 0);
  const totalNet = days.reduce((sum, day) => sum + net(day), 0);
  const totalSim = days.reduce((sum, day) => sum + sim(day), 0);
  return <Section id="report-story" title="The last 30 days" meta={`${days.length} days ending ${dayLabel(report.day)} · real gain ${km(totalGain)} · real net ${totalNet >= 0 ? '▲' : '▼'} ${km(Math.abs(totalNet))} · simulation ${km(totalSim)} (never summed)`} frame="none">
    <View style={[S.card, styles.stack]}>
      <View style={styles.legend}>
        {[['REAL GAIN', hue.pop], ['REAL NET ▲/▼', hue.decay], ['REAL VIEWERS (DAY-DISTINCT)', hue.people], ['SIMULATION GAIN', hue.simFill], ['EPOCH · TRIAL', hue.boost], ['SOURCE CHANGE', hue.away], ['THIS DAY', hue.now]].map(([label, color]) => <View key={label} style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: color }]} /><Label>{label}</Label></View>)}
      </View>
      <View style={styles.storyRow}>
        {days.map(day => {
          const tick = boundaries.get(day.day) ?? null;
          const isDay = day.day === report.day;
          const n = net(day);
          return <View key={day.day} style={styles.storyCol}>
            <View style={[styles.storyBars, isDay && { borderColor: hue.now, borderWidth: 1 }, tick && { borderLeftColor: hue.boost, borderLeftWidth: 2 }, sourceTicks.has(day.day) && { borderRightColor: hue.away, borderRightWidth: 2 }, trialTicks.has(day.day) && { borderTopColor: hue.boost, borderTopWidth: 2 }]}>
              <View style={[styles.storyTrack, { backgroundColor: hue.track }]}><View style={[styles.storyBar, { height: pct(gain(day), maxGain), backgroundColor: hue.pop }]} /></View>
              <View style={[styles.storyTrack, { backgroundColor: hue.track }]}><View style={[styles.storyBar, { height: pct(n, maxNet), backgroundColor: n >= 0 ? hue.pop : hue.decay }]} /></View>
              <View style={[styles.storyTrack, { backgroundColor: hue.track }]}><View style={[styles.storyBar, { height: pct(day.distinctRealViewers, maxViewers), backgroundColor: hue.people }]} /></View>
              <View style={[styles.storyTrack, { backgroundColor: hue.track }]}><View style={[styles.storyBar, { height: pct(sim(day), maxSim), backgroundColor: hue.simFill }]} /></View>
            </View>
            <Text numberOfLines={1} style={[styles.storyNum, { color: hue.pop }]}>{gain(day) ? km(gain(day)) : '·'}</Text>
            <Text numberOfLines={1} style={[styles.storyNum, { color: n > 0 ? hue.pop : n < 0 ? hue.decay : hue.away }]}>{n > 0 ? '▲' : n < 0 ? '▼' : '·'}</Text>
            <Text numberOfLines={1} style={[styles.storyNum, { color: hue.people }]}>{day.distinctRealViewers || '·'}</Text>
            <Text numberOfLines={1} style={[T.meta, styles.storyDay, { color: isDay ? hue.now : hue.meta }]}>{day.day.slice(8)}</Text>
          </View>;
        })}
      </View>
      <Text style={[T.meta, { color: hue.meta }]}>Epochs: {report.epochs.map(epoch => `${epoch.id} ${epoch.fromDay}…${epoch.toDay} (${epoch.days} d, ${epoch.boundaryCause}${epoch.movedFields.length ? `: ${epoch.movedFields.join(', ')}` : ''}${epoch.signature.trial ? ` · ${epoch.signature.trial}${epoch.signature.trialMultiplier !== null ? ` ×${epoch.signature.trialMultiplier}` : ''}` : ''})`).join(' · ') || 'none'}. The signature is a rolling 7-day mode over every actor class: a detected boundary can trail a deploy by 1–4 days and, when nobody engages, may not move at all; a decay-rate change is never detected here — before/after are detected, not deployed.</Text>
    </View>
  </Section>;
}

const WINDOW_NAMES: BetaReportWindowName[] = ['d1', 'd7', 'd30', 'before', 'after'];
/** d1 / d7 / d30 (+ before / after) as Fact columns (§3.4 item 6): real
 *  unmarked, simulation via `sim`, rates through `Gated` with the bucket's
 *  `posts / 8` — already null below it in the document. */
function WindowsTable({ report, hue }: { report: BetaAlgorithmReport; hue: Hue }) {
  const present = WINDOW_NAMES.map(name => [name, report.evidence.windows[name]] as const).filter((pair): pair is readonly [BetaReportWindowName, BetaReportWindow] => !!pair[1]);
  const bucketGate = (posts: number): BetaReportGate => ({ id: 'Gposts', label: `≥ 8 tester posts in the age bucket`, n: posts, minN: 8, sufficient: posts >= 8, basis: 'netReal.byAge', note: null });
  return <View style={styles.stack}>
    <Label>WINDOWS · real unmarked · simulation in the sim tone · never summed</Label>
    <View style={styles.windowRow}>
      {present.map(([name, win]) => {
        const real = win.realPostGain.real, synthetic = win.realPostGain.synthetic;
        const net = real.total - win.realPostDecayLoss.byClass.real;
        return <View key={name} style={styles.windowCol}>
          <Text style={[T.panelTitle, { color: hue.ink }]}>{name.toUpperCase()} · {win.days} d{win.spanned.length > 1 ? ' · mixed policy — compare days, not windows' : ''}</Text>
          <Fact label="REAL GAIN" value={<Meters meters={real.total} hue={hue} />} sim={synthetic.total ? <Meters meters={synthetic.total} hue={hue} tone="sim" /> : undefined} meta={`n ${fmt(real.n)} real events · first views ${fmt(real.firstViews)} · repeats ${fmt(real.repeatViews)} (${fmt(real.repeatMeters)} m) · clamped ${fmt(real.clamped)}`} />
          <Fact label="REAL DECAY LOSS" value={<Meters meters={-win.realPostDecayLoss.byClass.real} hue={hue} />} meta={`modes: normal ${fmt(win.realPostDecayLoss.byMode.normal)} · trial ${fmt(win.realPostDecayLoss.byMode.trial)} · stress ${fmt(win.realPostDecayLoss.byMode.stress)} · undetermined ${fmt(win.realPostDecayLoss.byMode.undetermined)} m${win.realPostDecayLoss.trialMultiplierSeen !== null ? ` · ×${win.realPostDecayLoss.trialMultiplierSeen} seen` : ''}`} />
          <Fact label="REAL NET" value={<Meters meters={net} hue={hue} />} meta={`seed loss ${fmt(win.realPostSeedLoss)} m · boost loss ${fmt(win.realPostBoostLoss)} m · boosts ${fmt(win.boosts.n)} (${fmt(win.boosts.meters)} m)`} />
          <Fact label="PEOPLE (DAY-DISTINCT)" value={<Num real={win.distinctRealViewers} />} meta={`viewers ${fmt(win.distinctRealViewers)} · likers ${fmt(win.distinctRealLikers)} · commenters ${fmt(win.distinctRealCommenters)} — day-distinct sums, gate nothing`} />
          <Fact label="POSTS CREATED" value={<Num real={win.postsCreated.real} sim={win.postsCreated.synthetic} />} meta={`owner ${fmt(win.postsCreated.owner)} · review ${fmt(win.postsCreated.review)} · official ${fmt(win.postsCreated.official)} · lab ${fmt(win.postsCreated.lab)} · entries real ${fmt(win.entries.real)} / official ${fmt(win.entries.official)}`} />
          {(['lt7d', 'd7to30', 'gt30d'] as const).map(bucket => {
            const b = win.netReal.byAge[bucket];
            return <Gated key={bucket} gate={bucketGate(b.posts)} label={`NET / POST-DAY · ${bucket}`} hue={hue}>
              <Fact label={`NET / POST-DAY · ${bucket}`} value={b.perPostDay === null ? '—' : <Change value={b.perPostDay} unit="perPostDay" colors={hue === HUE.desk ? undefined : { up: hue.pop, down: hue.decay, flat: hue.away }} />} meta={`${fmt(b.posts)} posts · ${fmt(b.netPositive)} net-positive · ${fmt(b.postDays, 1)} post-days · gain ${fmt(b.gainRealMeters)} m · loss share ${fmt(b.lossRealShareMeters)} m`} />
            </Gated>;
          })}
          <Gated gate={{ id: 'Gclean', label: '≥ 8 clean posts', n: win.viewWorth.cleanPosts, minN: 8, sufficient: win.viewWorth.cleanPosts >= 8, basis: 'viewWorth', note: null }} label="VIEW WORTH" hue={hue}>
            <Fact label="VIEW WORTH" value={win.viewWorth.views === null ? '—' : `${fmt(win.viewWorth.views, 1)} views / m`} meta={`${fmt(win.viewWorth.metersPaid)} m paid over ${fmt(win.viewWorth.paidViews)} paid views · ${fmt(win.viewWorth.cleanPosts)} clean posts · ${fmt(win.viewWorth.viewSampleDays)} sample days`} />
          </Gated>
          <Text style={[T.meta, { color: hue.meta }]}>epochs {win.spanned.join(' → ') || '—'} (report) · digest hash-based {win.observedPolicySpanned.join(' → ') || '—'}</Text>
        </View>;
      })}
    </View>
  </View>;
}

/** The light hues for a `Change` on paper; undefined on the desk (the primitive's own). */
const paperColors = (hue: Hue) => hue === HUE.desk ? undefined : { up: hue.pop, down: hue.decay, flat: hue.away };
const changeUnit = (unit: string): 'm' | 'count' | 'ratio' | 'perPostDay' | 'days' | 'cad' => unit === 'm' ? 'm' : unit === 'ratio' ? 'ratio' : unit === 'm/post-day' ? 'perPostDay' : unit === 'days' ? 'days' : unit === 'cad' ? 'cad' : 'count';
/** `previous.changed[]` as Fact cells (§3.4 item 7): a gate flip is a chip, never a number. */
function SinceYesterday({ report, hue }: { report: BetaAlgorithmReport; hue: Hue }) {
  const previous = report.previous;
  return <View style={styles.stack}>
    <Label>SINCE YESTERDAY</Label>
    {!previous && <Text style={[T.meta, { color: hue.meta }]}>{report.previousUnavailable === 'amendment' ? 'unavailable on an amendment (the D−1 memo is not stored per day)' : report.previousUnavailable === 'reset' ? 'unavailable: the first report after a digest reset' : 'unavailable: the first report ever'}</Text>}
    {previous && <>
      <Text style={[T.meta, { color: hue.meta }]}>vs {dayLabel(previous.day)} rev {previous.revision} · {previous.sameEpoch ? 'same epoch' : `epoch ${previous.productionEpoch} → ${report.productionEpoch}`}{previous.gap ? ' · GAP: the previous report is not the day before' : ''}{!previous.changed.length && !previous.verdictChanges.length ? ' · nothing moved' : ''}</Text>
      {previous.changed.length > 0 && <View style={styles.facts}>{previous.changed.map(change => {
        const metric = report.evidence.metrics[change.id];
        return <Fact key={change.id} label={change.id} value={<>{change.gateFlip ? <Text style={{ color: change.gateFlip === 'gained' ? hue.pop : hue.decay }}>{change.gateFlip === 'gained' ? 'INSUFFICIENT → SUFFICIENT' : 'SUFFICIENT → INSUFFICIENT'}</Text> : <Change value={change.delta} unit={changeUnit(metric?.unit ?? 'count')} colors={paperColors(hue)} />}</>} meta={`${fmt(change.from)} → ${fmt(change.to)}${metric ? ` · ${metric.unit}` : ''}`} />;
      })}</View>}
      {previous.verdictChanges.map(change => <Text key={change.knob} style={[T.cell, { color: hue.ink }]}>{change.knob} {KNOB_SHORT[change.knob]}: {change.from.verdict}/{change.from.reason}{change.from.to !== null ? ` → ${toValue(change.knob, change.from.to)}` : ''} ⇒ {change.to.verdict}/{change.to.reason}{change.to.to !== null ? ` → ${toValue(change.knob, change.to.to)}` : ''}</Text>)}
    </>}
  </View>;
}

/** ≤ 50 rows, real first, simulation-touched rows tagged (§3.4 item 8); a press opens the ledger under the row (desk only). */
function PostsOnDay({ report, hue, drill, onOpenPost }: { report: BetaAlgorithmReport; hue: Hue; drill?: DrillState; onOpenPost?: (postId: string) => void }) {
  const posts = report.evidence.posts.slice().sort((a, b) => Number(a.cls !== 'real') - Number(b.cls !== 'real') || (b.dayGain?.gr ?? 0) - (a.dayGain?.gr ?? 0)).slice(0, POSTS_ON_DAY);
  return <View style={styles.stack}>
    <Label>POSTS ON THIS DAY · {posts.length} of {report.evidence.posts.length}{report.headline.coverage.trimmed ? ' · trimmed by the size guard' : ''}</Label>
    {!posts.length && <Text style={[T.meta, { color: hue.meta }]}>No post rows in this report.</Text>}
    {posts.map(post => {
      const touched = post.syntheticGain !== 0 || (post.dayGain?.gs ?? 0) !== 0 || post.ownerClass !== 'real';
      const open = !!drill && drill.openPostId === post.postId && drill.origin === 'reports';
      const row = <View style={styles.postRow}>
        {touched && <SimTag />}
        <View style={styles.postMain}>
          <Text numberOfLines={1} style={[T.cell, { color: hue.ink }]}>{post.postId.slice(0, 12)} · {post.cls}/{post.ownerClass} · {post.channelId || '—'} · {post.ageBucketAtD ?? '—'}{post.expired ? ' · expired' : ''}{post.clean ? '' : ' · pumped'}</Text>
          <Text numberOfLines={2} style={[T.meta, { color: hue.meta }]}>now {km(post.currentMeters)} (organic {km(post.organicMeters)}, seed {km(post.seedMeters)}) · real d30 {fmt(post.realGainD30)} m · rk v{post.rk?.v ?? '—'} l{post.rk?.l ?? '—'} c{post.rk?.c ?? '—'} d{post.rk?.d ?? '—'} · views {fmt(post.dayGain?.vc ?? post.viewCount)} · last real {post.lastRealAtMillis ? stamp(post.lastRealAtMillis) : 'never'}</Text>
        </View>
        <View style={styles.postDeltas}>
          <Meters meters={post.dayGain?.gr ?? 0} hue={hue} style={styles.postDelta} />
          <Meters meters={post.dayGain?.gs ?? 0} hue={hue} tone="sim" style={styles.postDelta} />
          <Meters meters={post.dayGain?.go ?? 0} hue={hue} tone="sim" style={styles.postDelta} />
        </View>
      </View>;
      return <Fragment key={post.postId}>
        {drill && onOpenPost
          ? <Pressable accessibilityRole="button" aria-selected={open} onPress={() => onOpenPost(post.postId)} style={[S.row, open && S.open]}>{row}</Pressable>
          : <View style={S.row}>{row}</View>}
        {open && drill && <PostDrilldown key={post.postId} postId={post.postId} history={drill.history} state={drill.state} />}
      </Fragment>;
    })}
    {posts.length > 0 && <Text style={[T.meta, { color: hue.meta }]}>columns: real gain on the day · sim gain (sim tone) · owner gain (sim tone)</Text>}
  </View>;
}

/** The policy stamp, coverage, cost and the controls (§3.4 item 9). */
function ReportFooter({ report, hue, paper }: { report: BetaAlgorithmReport; hue: Hue; paper: boolean }) {
  const { policy, headline } = report;
  const knobs = policy.source.knobs;
  return <Section id={`report-footer-${report.day}`} title="Policy stamp, coverage, cost" meta={`report schema ${policy.reportSchemaVersion} · digest schema ${policy.digestSchema} · run ${policy.runId}`} frame="none" right={paper ? undefined : <ReportControls report={report} />}>
    <View style={[S.card, styles.stack]}>
      <View style={styles.facts}>
        <Fact label="SOURCE" value={policy.source.sourcePolicyVersion} meta={`knobs ${policy.source.knobsHash} · synced ${stamp(policy.source.syncedAtMillis)} (${policy.source.lastSyncNote})${policy.source.knobsStale ? ' · KNOBS STALE > 14 d' : ''}`} />
        <Fact label="PRODUCTION" value={policy.production.observedPolicy?.version ?? 'unobserved'} meta={`day ${policy.production.dayObservedPolicy.version ?? '—'} (${policy.production.dayObservedPolicy.earned ? 'earned' : 'inherited'}) · source matches observed: ${policy.production.sourceMatchesObserved === null ? 'null (a signature field is unseen)' : policy.production.sourceMatchesObserved ? 'yes' : 'NO — source ahead'}`} />
        <Fact label="EPOCH" value={policy.productionEpoch} meta={`rolling 7-day signature: view ${fmt(policy.production.rolling7dSignature.view)} · like ${fmt(policy.production.rolling7dSignature.like)} · comment ${fmt(policy.production.rolling7dSignature.comment)} · dislike ${fmt(policy.production.rolling7dSignature.dislike)} · repeat ${fmt(policy.production.rolling7dSignature.repeatBase)} · seed ${fmt(policy.production.rolling7dSignature.seedSeen)} (all classes)`} />
        <Fact label="RULES" value={policy.ruleSetVersion} meta="the frozen RULES table's hash — a rule edit is as visible as a knob edit" />
        <Fact label="DECAY" value={`${fmt(policy.decay.declaredRatePerDay, 2)} /day declared`} meta={`observed rate: ${policy.decay.observedRateNote} · switch ${policy.decay.switch ? `${policy.decay.switch.enabled ? 'ON' : 'off'} ×${policy.decay.switch.multiplier} ${policy.decay.switch.scope}` : 'absent'} · due decay ${policy.decay.dueDecayEnabled ? 'on' : 'off'} · seen on D: ${policy.decay.seenOnDay.trialMultiplierSeen !== null ? `×${policy.decay.seenOnDay.trialMultiplierSeen}` : 'none'} (${policy.decay.seenOnDay.trialClass ?? 'unseen'})`} />
        <Fact label="SIMULATION" value={policy.simulation.simulationEnabled ? 'on' : 'off'} meta={`runner ${policy.simulation.runnerEnabled ? 'on' : 'off'} · daily ${policy.simulation.dailySimulationEnabled ? 'on' : 'off'} · owner uid ${policy.simulation.simulationOwnerUid}`} />
      </View>
      <Text selectable style={[T.meta, { color: hue.meta }]}>knobs: first view {fmt(knobs.firstViewMeters)} · like {fmt(knobs.likeMeters)} · comment {fmt(knobs.commentMeters)} · dislike {fmt(knobs.dislikeMeters)} · repeat base {fmt(knobs.repeatViewBaseMeters)} (lifetime {fmt(knobs.repeatViewLifetimeMeters)}) · repeat interval {fmt(knobs.repeatViewMinMs / 1000)} s · decay {fmt(knobs.decayPerDay, 2)}/day (t½ {fmt(knobs.decayHalfLifeDays, 2)} d) · dust floor {fmt(knobs.decayFloorMeters)} · seed {fmt(knobs.seedMeters)} · ceiling {fmt(knobs.maxRadiusMeters)} · stress t½ {fmt(knobs.syntheticStressHalfLifeHours)} h · boost {fmt(knobs.boostDefaultMeters)} m / {fmt(knobs.boostDefaultHours)} h · changed: {Object.entries(policy.source.knobChangedDays).filter(([, day]) => day).map(([knob, day]) => `${knob} ${day}`).join(', ') || 'none since the reports began'}</Text>
      <Text style={[T.meta, { color: hue.meta }]}>coverage: {headline.coverage.complete ? 'complete' : 'INCOMPLETE'} · {fmt(headline.coverage.postsBehindHorizon)} posts behind horizon · {fmt(headline.coverage.evicted)} evicted · {fmt(headline.coverage.entriesFoldedOnDay)} entries folded on D · registered {headline.coverage.registeredPosts ? `${fmt(headline.coverage.registeredPosts.real)} real / ${fmt(headline.coverage.registeredPosts.official)} official` : '—'} · next non-live poll in {fmt(headline.coverage.nonLivePollLagRuns)} runs · kind split since {headline.coverage.kindSplitSinceMillis === 0 ? 'the start' : headline.coverage.kindSplitSinceMillis ? stamp(headline.coverage.kindSplitSinceMillis) : 'unset'}{headline.coverage.trimmed ? ' · evidence trimmed by the size guard' : ''} · snapshots {report.snapshotsAsOfMillis ? `as of ${stamp(report.snapshotsAsOfMillis)}` : 'none (backfilled)'}</Text>
      <Text style={[T.meta, { color: hue.meta }]}>cost: {headline.cost.readsOnDay === null ? 'reads on D unknown' : `${fmt(headline.cost.readsOnDay)} reads on D`} · {headline.cost.runsOnDay === null ? '' : `${fmt(headline.cost.runsOnDay)} runs · `}CA${fmt(headline.cost.cadOnDay, 4)} on D · CA${fmt(headline.cost.monthlyCadProjected, 4)}/month projected · document {fmt(report.bytes)} bytes · this report cost 0 reads to render</Text>
    </View>
  </Section>;
}

/** PRINT / SAVE AS PDF (a `Link` to the print route — a sibling of the
 *  pressables, never inside one) and the four fixed-column CSVs, built
 *  client-side from the cached body: 0 reads (§3.4 item 9, §4.2). */
export function ReportControls({ report, vs }: { report: BetaAlgorithmReport; vs?: BetaAlgorithmReport | null }) {
  const csv = (table: 'verdicts' | 'metrics' | 'days' | 'posts', build: () => string) => () => saveCsv(reportCsvFilename(report, table), build());
  return <View nativeID="report-controls" style={styles.controls}>
    <Link href={{ pathname: '/test-control-report', params: vs ? { day: report.day, vs: vs.day } : { day: report.day } }} target="_blank" style={[S.buttonPrimary, styles.control]}><Text style={[T.cell, styles.controlPrimaryText]}>PRINT / SAVE AS PDF</Text></Link>
    {vs
      ? <Pressable accessibilityRole="button" onPress={() => saveCsv(reportCompareFilename(report, vs), reportCompareCsv(report, vs))} style={[S.button, styles.control]}><Text style={T.cell}>COMPARE CSV</Text></Pressable>
      : <>
        <Pressable accessibilityRole="button" onPress={csv('verdicts', () => reportVerdictsCsv(report))} style={[S.button, styles.control]}><Text style={T.cell}>VERDICTS CSV</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={csv('metrics', () => reportMetricsCsv(report))} style={[S.button, styles.control]}><Text style={T.cell}>METRICS CSV</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={csv('days', () => reportDaysCsv(report))} style={[S.button, styles.control]}><Text style={T.cell}>DAYS CSV</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={csv('posts', () => reportPostsCsv(report))} style={[S.button, styles.control]}><Text style={T.cell}>POSTS CSV</Text></Pressable>
      </>}
  </View>;
}

// ── Compare two (§3.5) ──────────────────────────────────────────────────────

export function ReportCompare({ a, b, mode }: { a: BetaAlgorithmReport; b: BetaAlgorithmReport; mode: ReportMode }) {
  const hue = HUE[mode];
  const paper = mode === 'paper';
  const comparison = useMemo(() => compareReports(a, b), [a, b]);
  const header = (report: BetaAlgorithmReport) => <View style={styles.compareHead}>
    <Text style={[T.panelTitle, { color: hue.ink }]}>{dayLabel(report.day)} · {report.day}</Text>
    <Text style={[T.meta, { color: hue.meta }]}>rev {report.revision} · digest v{report.digestVersion} · epoch {report.productionEpoch} · source {report.sourcePolicyVersion} · knobs {report.knobsHash} · rules {report.ruleSetVersion} · trial {report.trialOnDay ? `×${report.trialMultiplierOnDay ?? '?'}` : 'off'}</Text>
    <ReportChips row={{ partial: report.partial, backfilled: report.backfilled, catchUp: report.catchUp, revision: report.revision, trialOn: report.trialOnDay, trialMultiplier: report.trialMultiplierOnDay }} hue={hue} />
  </View>;
  if (comparison.refusal) return <View nativeID={`report-compare-${a.day}-${b.day}`} style={[S.card, styles.stack]}>
    <View style={styles.compareHeads}>{header(a)}{header(b)}</View>
    <Text style={[T.body, { color: hue.ink }]}>Report schema {comparison.refusal.version ?? '?'} (digest schema {comparison.refusal.digestVersion ?? '?'}) differs between these two days — two schemas cannot be compared; nothing is rendered rather than a guess.</Text>
  </View>;
  return <View nativeID={`report-compare-${a.day}-${b.day}`} style={styles.memo}>
    <View style={[S.card, styles.stack]}>
      <Label>COMPARE · A → B</Label>
      <View style={styles.compareHeads}>{header(a)}{header(b)}</View>
      {comparison.policyChanged.length > 0 && <Strip text={`policy or rules changed between these reports (${comparison.policyChanged.join(', ')}) — a difference is a change of policy, not of behaviour; compare epochs, not days`} tone="warn" />}
      {!paper && <ReportControls report={a} vs={b} />}
    </View>
    <View style={[S.card, styles.stack]}>
      <Label>VERDICTS · A · B · change</Label>
      {comparison.verdicts.map(row => {
        const toA = row.a?.to ?? null, toB = row.b?.to ?? null;
        return <View key={row.knob} style={[S.row, styles.compareRow]}>
          <Text style={[T.name, styles.compareKnob, { color: hue.ink }]}>{row.knob} {row.name || KNOB_SHORT[row.knob]}</Text>
          <Fact label="A" value={row.a ? `${row.a.verdict}/${row.a.reason}${toA !== null ? ` → ${toValue(row.knob, toA)}` : ''}` : '—'} meta={row.a?.reasonText} />
          <Fact label="B" value={row.b ? `${row.b.verdict}/${row.b.reason}${toB !== null ? ` → ${toValue(row.knob, toB)}` : ''}` : '—'} meta={row.b?.reasonText} />
          <View style={styles.compareChange}>
            {row.changed ? <Text style={[T.cell, { color: hue.boost }]}>CHANGED</Text> : <Text style={[T.meta, { color: hue.away }]}>· same</Text>}
            {toA !== null && toB !== null && toA !== toB && <Change value={toB - toA} unit={KNOB_UNIT[row.knob] === 'm' ? 'm' : 'ratio'} colors={paperColors(hue)} />}
          </View>
        </View>;
      })}
    </View>
    <View style={[S.card, styles.stack]}>
      <Label>METRICS · {comparison.metrics.length} ids · delta = B − A (null when either side is null) · a gate flip is a chip, never a number</Label>
      {comparison.metrics.map(row => <View key={row.id} style={[S.row, styles.compareRow]}>
        <Text numberOfLines={1} style={[T.cell, styles.compareId, { color: hue.ink }]}>{row.id}</Text>
        <Text style={[T.cell, styles.compareVal, { color: hue.ink }]}>{row.a ? cellValue(row.a.value, row.a.unit) : '—'}{row.a?.gate ? <Text style={{ color: hue.meta }}> {fmt(row.a.gate.n)}/{fmt(row.a.gate.minN)}</Text> : null}</Text>
        <Text style={[T.cell, styles.compareVal, { color: hue.ink }]}>{row.b ? cellValue(row.b.value, row.b.unit) : '—'}{row.b?.gate ? <Text style={{ color: hue.meta }}> {fmt(row.b.gate.n)}/{fmt(row.b.gate.minN)}</Text> : null}</Text>
        <View style={styles.compareChange}>
          {row.gateFlip && <Text style={[T.meta, { color: row.gateFlip === 'gained' ? hue.pop : hue.decay }]}>{row.gateFlip === 'gained' ? 'INSUFFICIENT → SUFFICIENT' : 'SUFFICIENT → INSUFFICIENT'}</Text>}
          <Change value={row.delta} unit={changeUnit(row.unit)} colors={paperColors(hue)} />
        </View>
      </View>)}
    </View>
  </View>;
}

const styles = StyleSheet.create({
  memo: { gap: 16 },
  stack: { gap: 8 },
  card: { gap: 10 },
  identityRow: { gap: 6 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  applied: { fontWeight: '800' },
  struck: { textDecorationLine: 'line-through' },
  arithmetic: { fontFamily: FONT, fontSize: 12, fontWeight: '600', fontVariant: ['tabular-nums'], lineHeight: 18 },
  gateTile: { flexGrow: 1, flexBasis: 140, minWidth: 0, gap: 3, padding: 10, borderRadius: 14, borderWidth: 1, borderColor: C.hairlineSoft, borderStyle: 'dashed' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip: { paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  chipText: { fontFamily: FONT, fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  chipLabel: { color: C.ink2 },
  listRow: { gap: 12 },
  listDay: { width: 118, gap: 2 },
  listCell: { flex: 1, minWidth: 0, gap: 4 },
  cellNow: { color: C.now, fontWeight: '800' },
  cellBoost: { color: C.boost, fontWeight: '800' },
  listEpoch: { width: 72, textAlign: 'right' },
  back: { alignSelf: 'flex-start', marginBottom: 4 },
  showMore: { alignSelf: 'flex-start', marginTop: 8 },
  armedHint: { paddingVertical: 8 },
  slotState: { gap: 10 },
  rangeRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 10 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  storyRow: { flexDirection: 'row', gap: 2 },
  storyCol: { flex: 1, minWidth: 0, alignItems: 'center' },
  storyBars: { flexDirection: 'row', gap: 1, height: 56, alignItems: 'flex-end', width: '100%', borderColor: 'transparent', borderRadius: 3 },
  storyTrack: { flex: 1, height: '100%', position: 'relative', borderRadius: 2, overflow: 'hidden' },
  storyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  storyNum: { fontFamily: FONT, fontSize: 9, fontWeight: '700', marginTop: 2, fontVariant: ['tabular-nums'] },
  storyDay: { marginTop: 2, fontSize: 9 },
  windowRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  windowCol: { flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 8 },
  postRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  postMain: { flex: 1, minWidth: 0, gap: 2 },
  postDeltas: { alignItems: 'flex-end', gap: 2 },
  postDelta: { textAlign: 'right' },
  meters: { fontFamily: FONT, fontSize: 12, fontWeight: '800', fontVariant: ['tabular-nums'] },
  controls: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
  control: { paddingVertical: 7 },
  controlPrimaryText: { color: C.onSlab, fontWeight: '800' },
  compareHeads: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  compareHead: { flexGrow: 1, flexBasis: 260, minWidth: 0, gap: 4 },
  compareRow: { gap: 10, alignItems: 'flex-start' },
  compareKnob: { width: 110 },
  compareId: { flex: 1.6, minWidth: 0 },
  compareVal: { flex: 1, minWidth: 0 },
  compareChange: { width: 150, alignItems: 'flex-end', gap: 2 },
});
