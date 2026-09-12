// HOW TO MOUNT (src/app/test-control.tsx, directly after the TESTER TABLE <Section>, spec §0 / §4.4):
//   import AlgorithmDesk from '@/components/AlgorithmDesk';
//   <AlgorithmDesk digest={dashboard.algorithm} refusal={dashboard.algorithmRefusal}
//     openPostId={openPostId} onOpenPost={openPost} postHistory={postHistory} postHistoryState={postHistoryState}
//     testers={dashboard.testers} />
// It draws its own Section card and the ledger drill-down beneath a tapped panel-K row, sharing the page's openPostId / postHistory state with the tester table.
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  digestDaysCsv,
  digestPostsCsv,
  estimateLedgerExport,
  readLedgerExport,
  saveCsv,
  LedgerExportRefused,
  type BetaAlgorithmActorGain,
  type BetaAlgorithmDay,
  type BetaAlgorithmDigest,
  type BetaAlgorithmGate,
  type BetaAlgorithmNetBucket,
  type BetaAlgorithmCurveLine,
  type BetaAlgorithmRefusal,
  type BetaTesterRow,
  type PostHistory,
} from '@/services/testControl';

export type AlgorithmDeskProps = {
  digest: BetaAlgorithmDigest | null;
  /** Why the digest is null when one was published (foreign schema, oversize). */
  refusal?: BetaAlgorithmRefusal | null;
  openPostId: string | null;
  onOpenPost: (postId: string) => void;
  postHistory: PostHistory | null;
  postHistoryState: 'idle' | 'loading' | 'error';
  testers?: BetaTesterRow[];
};

type DeskWindow = 'd7' | 'd30';
type ExportState = 'idle' | 'armed' | 'running' | 'error';

const COLOR = { growth: '#5af0a4', decay: '#ff8a6b', signups: '#8ec5ff', simulation: '#5a4a66', synthetic: '#c8a2ff', boost: '#ffd166', muted: '#806476' };
const CAUSE_COLOR: Record<string, string> = { create: COLOR.signups, engagement: COLOR.growth, decay: COLOR.decay, boost: COLOR.boost, synthetic: COLOR.synthetic, lab: COLOR.synthetic, backfill: COLOR.muted };
const STALE_MS = 2 * 3_600_000;
const KNOBS_UNVERIFIED_MS = 14 * 24 * 3_600_000;
/** §2.3 default `maxReadsPerRun`; a different cap in force is a config-doc override worth showing. */
const DEFAULT_MAX_READS_PER_RUN = 6_000;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const km = (meters: number) => meters >= 100_000 ? `${Math.round(meters / 1000)} km` : meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters)} m`;
const signed = (meters: number) => meters === 0 ? '0 m' : `${meters > 0 ? '+' : '−'}${km(Math.abs(meters))}`;
const count = (value: number) => Math.round(value).toLocaleString();
const pctOf = (fraction: number, digits = 1) => `${(fraction * 100).toFixed(digits)} %`;
const since = (time: number, now: number) => !time ? '—' : now - time < 60_000 ? 'now' : now - time < 3_600_000 ? `${Math.round((now - time) / 60_000)} min ago` : now - time < 48 * 3_600_000 ? `${Math.round((now - time) / 3_600_000)} h ago` : `${Math.round((now - time) / 86_400_000)} d ago`;
/** A clock that ticks once a minute, so "ago" copy and the stale strip move
 *  without calling Date.now() during render. */
const useNow = (): number => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
};
const stamp = (ms: number) => !ms ? '—' : new Date(ms).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
/** "8 Sep 00:07Z" — the trial doc's timestamps are quoted in UTC everywhere else. */
const utc = (ms: number | null) => {
  if (!ms) return '—';
  const at = new Date(ms);
  return `${at.getUTCDate()} ${MONTHS[at.getUTCMonth()]} ${String(at.getUTCHours()).padStart(2, '0')}:${String(at.getUTCMinutes()).padStart(2, '0')}Z`;
};
const dayLabel = (day: string) => day.slice(8).replace(/^0/, '');
const share = (part: number, whole: number): `${number}%` => `${Math.round(Math.max(0, Math.min(1, whole > 0 ? part / whole : 0)) * 100)}%`;
const days = (value: number | null) => value === null ? '—' : `≈ ${Math.round(value)} d`;
const maybe = (value: number | null, render: (value: number) => string) => value === null ? '—' : render(value);
const torontoDay = (ms: number, timeZone: string) => {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); } catch { return new Date(ms).toISOString().slice(0, 10); }
};

function Section({ title, kicker, children }: { title: string; kicker: string; children: React.ReactNode }) { return <View style={styles.card}><Text style={styles.kicker}>{kicker}</Text><Text style={styles.cardTitle}>{title}</Text>{children}</View>; }
function Empty({ text }: { text: string }) { return <Text style={styles.copy}>{text}</Text>; }
function Panel({ letter, title, basis, children }: { letter: string; title: string; basis: string; children: React.ReactNode }) {
  return <View style={styles.panel}>
    <View style={styles.panelHead}><Text style={styles.panelLetter}>{letter}</Text><Text style={styles.panelTitle}>{title}</Text></View>
    {children}
    <Text style={styles.basis}>basis · {basis}</Text>
  </View>;
}
function Fact({ label, value, tone }: { label: string; value: string; tone?: 'amber' | 'red' | 'green' }) {
  return <View style={[styles.fact, tone === 'amber' && styles.factAmber, tone === 'red' && styles.factRed, tone === 'green' && styles.factGreen]}><Text style={styles.factLabel}>{label}</Text><Text numberOfLines={3} style={styles.factValue}>{value}</Text></View>;
}
function Chip({ label, tone }: { label: string; tone: 'real' | 'owner' | 'review' | 'syn' | 'official' | 'lab' | 'clean' | 'state' }) {
  return <View style={[styles.chip, styles[`chip_${tone}`]]}><Text style={styles.chipText}>{label}</Text></View>;
}

/** A REAL figure renders only when the digest says it is sufficient. The page
 *  never divides: whatever appears inside came as numerator and denominator. */
function GatedValue({ gate, unit = 'events', reason, children }: { gate: BetaAlgorithmGate; unit?: string; reason?: string; children: React.ReactNode }) {
  if (gate.sufficient) return <>{children}</>;
  const why = reason ?? (gate.n === 0 ? 'no real person has engaged yet' : 'not enough real engagements yet');
  return <View style={styles.gateTile}><Text style={styles.gateText}>n = {count(gate.n)} · needs {count(gate.minN)} {unit} — {why}</Text>{!!gate.basis && <Text style={styles.gateBasis}>{gate.basis}</Text>}</View>;
}

function WindowToggle({ value, onChange }: { value: DeskWindow; onChange: (next: DeskWindow) => void }) {
  return <View style={styles.toggle}>{(['d7', 'd30'] as DeskWindow[]).map(option => <Pressable key={option} accessibilityRole="button" accessibilityState={{ selected: value === option }} onPress={() => onChange(option)} style={[styles.toggleButton, value === option && styles.toggleButtonActive]}><Text style={[styles.toggleText, value === option && styles.toggleTextActive]}>{option === 'd7' ? '7 DAYS' : '30 DAYS'}</Text></Pressable>)}</View>;
}

/** Thirty day columns: real gain up, the real share of decay loss down, owner
 *  and simulation drawn muted behind — plain views, percentage heights. */
function DayBars({ days: series, markers }: { days: BetaAlgorithmDay[]; markers: Set<string> }) {
  if (!series.length) return <Text style={styles.copy}>No day cells published yet.</Text>;
  const rows = series.map(day => {
    const realUp = Math.max(0, day.realPostGain.real.total);
    const otherUp = Math.max(0, day.realPostGain.owner.total) + Math.max(0, day.realPostGain.synthetic.total) + Math.max(0, day.realPostGain.review.total);
    const loss = day.realPostDecayLoss.byClass;
    const realDown = loss.real;
    const allDown = loss.real + loss.owner + loss.review + loss.synthetic + loss.unknown;
    return { day: day.day, realUp, allUp: realUp + otherUp, realDown, allDown };
  });
  const maxUp = Math.max(1, ...rows.map(row => row.allUp));
  const maxDown = Math.max(1, ...rows.map(row => row.allDown));
  return <View style={styles.dayRow}>{rows.map(row => <View key={row.day} style={styles.dayCol}>
    <View style={styles.dayUpTrack}><View style={[styles.dayBarUp, styles.dayBarBehind, { height: share(row.allUp, maxUp) }]} /><View style={[styles.dayBarUp, styles.dayBarReal, { height: share(row.realUp, maxUp) }]} /></View>
    <View style={styles.dayDownTrack}><View style={[styles.dayBarDown, styles.dayBarBehind, { height: share(row.allDown, maxDown) }]} /><View style={[styles.dayBarDown, styles.dayBarLoss, { height: share(row.realDown, maxDown) }]} /></View>
    <View style={[styles.dayMarker, markers.has(row.day) && styles.dayMarkerOn]} />
    <Text numberOfLines={1} style={styles.dayLabel}>{dayLabel(row.day)}</Text>
  </View>)}</View>;
}

/** View / like / comment / dislike as metres: real in front, synthetic
 *  overlay and owner behind, so the simulation's share is always visible. */
function KindBars({ real, synthetic, owner }: { real: BetaAlgorithmActorGain; synthetic: BetaAlgorithmActorGain; owner: BetaAlgorithmActorGain }) {
  const kinds = ['view', 'like', 'comment', 'dislike'] as const;
  const maximum = Math.max(1, ...kinds.flatMap(kind => [Math.abs(real[kind]), Math.abs(synthetic[kind]), Math.abs(owner[kind])]));
  return <View style={styles.kindRow}>{kinds.map(kind => <View key={kind} style={styles.kindCol}>
    <View style={styles.kindTrack}>
      <View style={[styles.kindBar, styles.kindBarOwner, { height: share(Math.abs(owner[kind]), maximum) }]} />
      <View style={[styles.kindBar, styles.kindBarSyn, { height: share(Math.abs(synthetic[kind]), maximum) }]} />
      <View style={[styles.kindBar, styles.kindBarReal, { height: share(Math.abs(real[kind]), maximum) }]} />
    </View>
    <Text style={styles.kindLabel}>{kind.toUpperCase()}</Text>
    <Text numberOfLines={1} style={styles.kindValue}>{signed(real[kind])}</Text>
    <Text numberOfLines={1} style={styles.kindSim}>sim {signed(synthetic[kind])}</Text>
  </View>)}</View>;
}

function Legend({ items }: { items: { color: string; label: string }[] }) {
  return <View style={styles.legend}>{items.map(item => <View key={item.label} style={styles.legendItem}><View style={[styles.legendSwatch, { backgroundColor: item.color }]} /><Text style={styles.legendText}>{item.label}</Text></View>)}</View>;
}

function NetLine({ label, bucket }: { label: string; bucket: BetaAlgorithmNetBucket }) {
  return <Text style={styles.copy}>{label}: {maybe(bucket.perPostDay, value => `${signed(value)} per post-day`)} · {bucket.netPositive} of {bucket.posts} net-positive · {signed(bucket.gainRealMeters)} gained, −{km(bucket.lossRealShareMeters)} decayed over {bucket.postDays.toFixed(1)} post-days</Text>;
}

function CurveLine({ label, line, floorMeters }: { label: string; line: BetaAlgorithmCurveLine; floorMeters: number }) {
  const points = line.points.map(point => `${km(point.startMeters)} in ${days(point.days)}`).join(', ');
  return <Text style={styles.copy}><Text style={styles.strong}>{label}{line.multiplier ? ` ×${line.multiplier}` : ''} (−{pctOf(line.ratePerDay, 1)}/day):</Text> {points || 'no points published'}{line.seedDaysToFloor !== null ? ` · the claim itself is gone in ${days(line.seedDaysToFloor)}` : ''}{line.linearTailDays !== null ? ` · linear tail ${days(line.linearTailDays)} (1 m/pass to the ${km(floorMeters)} floor)` : ''}{line.halfLifeDays !== null ? ` · t½ ${line.halfLifeDays.toFixed(1)} d far above the floor only` : ''}</Text>;
}

/** Radius over time, plain views: the page's PostDrilldown is not exported, so
 *  the desk carries its own compact copy fed by the same postHistory state. */
function Drilldown({ postId, history, state }: { postId: string; history: PostHistory | null; state: 'idle' | 'loading' | 'error' }) {
  if (state === 'loading' || (!history && state === 'idle')) return <View style={styles.drill}><ActivityIndicator color={COLOR.growth} /><Text style={styles.copy}>Loading the radius ledger for {postId}…</Text></View>;
  if (state === 'error' || !history) return <View style={styles.drill}><Text style={styles.copy}>That post’s ledger could not be read.</Text></View>;
  const peak = Math.max(1, ...history.history.map(entry => entry.radiusMeters));
  const first = history.history[0];
  const last = history.history[history.history.length - 1];
  return <View style={styles.drill}>
    <Text style={styles.drillTitle}>{history.caption || history.postId}</Text>
    <Text style={styles.meta}>Posted {stamp(history.createdAtMs)}{history.channelId ? ` · ${history.channelId}` : ''} · seed {km(history.seedRadiusMeters)} · organic {km(history.organicRadiusMeters)} · now {km(history.radiusMeters)}{first && last ? ` · ${signed(last.radiusMeters - first.radiusMeters)} over ${history.history.length} entries` : ''}</Text>
    {!history.history.length ? <Text style={styles.copy}>No radius changes recorded yet — the ledger starts with the post’s first engagement.</Text> : <>
      <View style={styles.bars}>{history.history.map(entry => <View key={entry.id} style={styles.barCol}><View style={[styles.bar, { height: share(entry.radiusMeters, peak), backgroundColor: CAUSE_COLOR[entry.cause] ?? COLOR.muted }]} /></View>)}</View>
      {history.history.slice().reverse().slice(0, 40).map(entry => <View key={entry.id} style={styles.ledgerRow}>
        <View style={[styles.causeDot, { backgroundColor: CAUSE_COLOR[entry.cause] ?? COLOR.muted }]} />
        <Text style={[styles.cell, styles.ledgerCause]}>{entry.cause}{entry.kind ? ` · ${entry.kind}` : ''}{entry.writer ? ` · ${entry.writer}` : ''}</Text>
        <Text style={[styles.cell, styles.ledgerWhen]}>{stamp(entry.atMs)}</Text>
        <Text style={[styles.cell, styles.ledgerRadius]}>{km(entry.radiusMeters)}</Text>
        <Text style={[styles.delta, entry.delta > 0 ? styles.deltaUp : entry.delta < 0 ? styles.deltaDown : styles.deltaFlat]}>{entry.delta > 0 ? '▲' : entry.delta < 0 ? '▼' : '·'} {km(Math.abs(entry.delta))}</Text>
      </View>)}
      {history.history.length > 40 && <Text style={styles.meta}>… {history.history.length - 40} older entries in the tester-table drill-down</Text>}
    </>}
  </View>;
}

export default function AlgorithmDesk({ digest, refusal = null, openPostId, onOpenPost, postHistory, postHistoryState, testers }: AlgorithmDeskProps) {
  const now = useNow();
  const [window, setWindow] = useState<DeskWindow>('d7');
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const humanTesters = useMemo(() => (testers ?? []).filter(row => !row.synthetic).length, [testers]);
  // Selected ids default to every published post: ≤ 50, one request (§4.4).
  const exportIds = useMemo(() => digest ? digest.posts.map(post => post.postId) : [], [digest]);
  const estimate = useMemo(() => estimateLedgerExport(digest, exportIds), [digest, exportIds]);
  const policyMarkers = useMemo(() => new Set(digest ? digest.observedPolicyVersions.filter(row => row.fromMillis > 0).map(row => torontoDay(row.fromMillis, digest.coverage.timeZone)) : []), [digest]);

  const runLedgerExport = async () => {
    if (!digest) return;
    if (exportState !== 'armed') { setExportState('armed'); setExportNotice(null); return; }
    setExportState('running');
    try {
      const saved = await readLedgerExport(exportIds);
      setExportNotice(`${saved.filename} · ${count(saved.bytes)} bytes`);
      setExportState('idle');
    } catch (error) {
      setExportNotice(error instanceof LedgerExportRefused ? `${error.message} (${count(error.remaining)} left)` : error instanceof Error ? error.message : 'The ledger export failed.');
      setExportState('error');
    }
  };
  const saveDays = () => { if (!digest) return; try { saveCsv('poplur-algorithm-days.csv', digestDaysCsv(digest)); setExportNotice('poplur-algorithm-days.csv · 0 reads'); } catch (error) { setExportNotice(error instanceof Error ? error.message : 'Download unavailable.'); } };
  const savePosts = () => { if (!digest) return; try { saveCsv('poplur-algorithm-posts.csv', digestPostsCsv(digest)); setExportNotice('poplur-algorithm-posts.csv · 0 reads'); } catch (error) { setExportNotice(error instanceof Error ? error.message : 'Download unavailable.'); } };

  if (!digest) {
    return <Section kicker="ALGORITHM DESK · REAL VS SYNTHETIC" title="Is the radius algorithm working on real people?">
      <Empty text={refusal?.reason === 'unsupported-version' ? `digest schema ${refusal.version ?? 'unknown'} unsupported — this desk reads schema 1 and renders nothing as zero.` : refusal?.reason === 'oversize' ? `digest v ${refusal.digestVersion ?? '?'} refused as oversize — the proxy's 512 KB guard could not trim it; nothing is rendered as zero.` : 'The algorithm digest has not run yet (hourly, with the nearby-pops digest).'} />
    </Section>;
  }

  const { headline, switches, cost, coverage, knobs, observed, seedRest, claims, contamination, intercept, curve, questions } = digest;
  const stats = digest.windows[window];
  const trialOn = switches.decayTrial?.enabled === true;
  const stale = now - digest.generatedAtMillis > STALE_MS;
  const registered = coverage.registeredPosts.real + coverage.registeredPosts.owner + coverage.registeredPosts.review + coverage.registeredPosts.official;
  const knobsUnverified = !knobs.syncedAtMillis || now - knobs.syncedAtMillis > KNOBS_UNVERIFIED_MS;
  const mixedPolicy = stats.observedPolicySpanned.length > 1;
  const sourceAhead = Boolean(knobs.sourcePolicyVersion && digest.observedPolicy.version && knobs.sourcePolicyVersion !== digest.observedPolicy.version);
  const trialSeedPerDay = trialOn && switches.decayTrial ? 1 - (1 - knobs.decayPerDay) ** switches.decayTrial.multiplier : null;
  const repeatLadder = Object.entries(observed.grants.view.byMeters)
    .map(([metersKey, n]) => [Number(metersKey), n] as const)
    .filter(([metersSeen]) => metersSeen > 0 && metersSeen < knobs.firstViewMeters)
    .sort((left, right) => right[0] - left[0]);
  const seenGrant = (kind: 'view' | 'like' | 'comment' | 'dislike') => {
    const grant = observed.grants[kind];
    return grant.n ? `seen ${signed(grant.modeMeters ?? 0)}, n=${count(grant.n)}` : 'not seen in 7 d';
  };
  const knobMismatch = (declared: number, kind: 'view' | 'like' | 'comment' | 'dislike') => observed.grants[kind].n > 0 && observed.grants[kind].modeMeters !== declared;
  const knobRows: { label: string; declared: string; seen: string; mismatch: boolean }[] = [
    { label: 'First view', declared: signed(knobs.firstViewMeters), seen: seenGrant('view'), mismatch: knobMismatch(knobs.firstViewMeters, 'view') },
    { label: 'Like', declared: signed(knobs.likeMeters), seen: seenGrant('like'), mismatch: knobMismatch(knobs.likeMeters, 'like') },
    { label: 'Comment', declared: signed(knobs.commentMeters), seen: seenGrant('comment'), mismatch: knobMismatch(knobs.commentMeters, 'comment') },
    { label: 'Dislike', declared: signed(knobs.dislikeMeters), seen: seenGrant('dislike'), mismatch: knobMismatch(knobs.dislikeMeters, 'dislike') },
    { label: 'Repeat view', declared: `${km(knobs.repeatViewBaseMeters)} → ${km(knobs.repeatViewBaseMeters / 2)} → ${km(knobs.repeatViewBaseMeters / 4)} … ≥ ${Math.round(knobs.repeatViewMinMs / 1000)} s apart, ${km(knobs.repeatViewLifetimeMeters)} lifetime`, seen: repeatLadder.length ? `seen ${repeatLadder.map(([metersSeen, n]) => `${km(metersSeen)}×${count(n)}`).join(', ')}` : 'no paid repeats in 7 d', mismatch: repeatLadder.length > 0 && repeatLadder[0][0] !== knobs.repeatViewBaseMeters },
    { label: 'Earned reach', declared: `−${pctOf(knobs.decayPerDay, 0)}/day (t½ ${knobs.decayHalfLifeDays.toFixed(1)} d far above the floor), dust < ${km(knobs.decayFloorMeters)} → 0`, seen: stats.realPostDecayLoss.trialMultiplierSeen ? `×${stats.realPostDecayLoss.trialMultiplierSeen} seen · trial ${km(stats.realPostDecayLoss.byMode.trial)} · normal ${km(stats.realPostDecayLoss.byMode.normal)} · stress ${km(stats.realPostDecayLoss.byMode.stress)} · undetermined ${km(stats.realPostDecayLoss.byMode.undetermined)}` : `normal ${km(stats.realPostDecayLoss.byMode.normal)} · trial ${km(stats.realPostDecayLoss.byMode.trial)} · undetermined ${km(stats.realPostDecayLoss.byMode.undetermined)}`, mismatch: false },
    { label: 'Seed', declared: `every drop born with a seed ≥ ${km(knobs.seedMeters)} that never decays outside a trial${trialSeedPerDay !== null && switches.decayTrial ? ` (trial ×${switches.decayTrial.multiplier} on: seed −${pctOf(trialSeedPerDay)}/day today)` : ''}`, seen: observed.seedSeen === null ? 'no tester create entries in 7 d' : `seen ${km(observed.seedSeen)}`, mismatch: observed.seedSeen !== null && observed.seedSeen !== knobs.seedMeters },
    { label: 'Ceiling', declared: km(knobs.maxRadiusMeters), seen: `${digest.anchors.everAtWorld} posts ever at world · ${headline.anchorsAtWorld} now`, mismatch: false },
    { label: 'Boost default', declared: `${km(knobs.boostDefaultMeters)} for ${knobs.boostDefaultHours} h`, seen: observed.boostSeen.n ? `seen ${maybe(observed.boostSeen.modeMeters, km)} · ${maybe(observed.boostSeen.modeHours, hours => `${hours} h`)}, n=${observed.boostSeen.n}` : 'no boosts in 7 d', mismatch: observed.boostSeen.n > 0 && observed.boostSeen.modeMeters !== null && observed.boostSeen.modeMeters !== knobs.boostDefaultMeters },
  ];
  const decayTotal = stats.realPostDecayLoss.byClass.real + stats.realPostDecayLoss.byClass.owner + stats.realPostDecayLoss.byClass.review + stats.realPostDecayLoss.byClass.synthetic + stats.realPostDecayLoss.byClass.unknown;
  const rankedChannels = digest.channels.slice().sort((left, right) => Number(right.sufficient) - Number(left.sufficient) || (right.gainPerPostDay ?? -Infinity) - (left.gainPerPostDay ?? -Infinity) || left.channelId.localeCompare(right.channelId));
  const surfaceSeen = stats.surfaces.feed + stats.surfaces.map + stats.surfaces.profile > 0;
  const gapById = new Map(digest.gaps.map(gap => [gap.id, gap]));
  const decayModeGap = gapById.get('decayMode');
  const ceilingGap = gapById.get('ceilingMeters');
  const windowLabel = window === 'd7' ? '7 days' : '30 days';

  return <Section kicker="ALGORITHM DESK · REAL VS SYNTHETIC" title="Is the radius algorithm working on real people?">
    {headline.trialOn && <View style={styles.trialBanner}>
      <Text style={styles.trialTitle}>DECAY TRIAL ×{headline.trialMultiplier ?? '?'} ON since {utc(headline.trialSinceMillis)}{headline.boostedSinceMillis ? ` (boost path since ${utc(headline.boostedSinceMillis)})` : ''} — every seed and every official anchor is decaying; the 5 km floor decision is not in force.</Text>
      <Text style={styles.trialLine}>Anchors {headline.anchorsAtWorld}/{headline.anchorsEver} at world{headline.worstAnchor ? ` · worst ${headline.worstAnchor.postId} ${km(headline.worstAnchor.radiusMeters)}, −${pctOf(headline.worstAnchor.ratePerPassSeen, 2)}/pass` : ''}</Text>
      <Text style={styles.trialFoot}>Owner question (spec §9): a decision, or an incident? The desk reports under it and never toggles testControl/radiusDecayTrial.</Text>
    </View>}
    {stale && <Text style={styles.amberStrip}>digest stale — last run {since(digest.generatedAtMillis, now)}; scheduler or the Cloud Run cap?</Text>}

    <Panel letter="A" title="Switches and cost" basis="switches sampled once per run · cost = the digest's own reads">
      <View style={styles.factRow}>
        <Fact label="SIM MODE" value={switches.simulationEnabled ? 'ON' : 'OFF'} tone={switches.simulationEnabled ? 'amber' : undefined} />
        <Fact label="RUNNER" value={switches.runnerEnabled ? 'ON' : 'OFF'} />
        <Fact label="DAILY SIM" value={switches.dailySimulationEnabled ? `ON${switches.simulationOwnerUid ? ` (targets …${switches.simulationOwnerUid.slice(-4)})` : ''}` : 'OFF'} tone={switches.dailySimulationEnabled ? 'amber' : undefined} />
        <Fact label="QUEUE DECAY" value={switches.dueDecayEnabled ? 'ON' : 'OFF'} />
        <Fact label="DECAY TRIAL" value={trialOn && switches.decayTrial ? `×${switches.decayTrial.multiplier} · ${switches.decayTrial.scope}` : 'OFF'} tone={trialOn ? 'red' : 'green'} />
        <Fact label="DIGEST" value={`${since(digest.generatedAtMillis, now)} · v ${digest.digestVersion} · ${count(digest.runMs)} ms`} tone={stale ? 'amber' : undefined} />
      </View>
      <Text style={styles.strip}>≈ {count(cost.reads)} reads last run · ≈ {count(cost.readsToday)} today ≈ CA${cost.monthlyCadProjected.toFixed(2)}/month ({count(cost.monthlyReadsProjected)} reads) · registered posts {registered} ({coverage.registeredPosts.official} official · {coverage.registeredPosts.owner} owner · {coverage.registeredPosts.review} review · {coverage.registeredPosts.real} real){coverage.capped || cost.budgetHit ? ' · CAPPED' : ''}{cost.capInForce && cost.capInForce !== DEFAULT_MAX_READS_PER_RUN ? ` · cap override ${count(cost.capInForce)} in force` : ''}{coverage.complete ? ' · coverage complete' : ` · coverage incomplete (${coverage.postsBehindHorizon} posts behind the horizon)`}{coverage.authPageFailedRuns ? ` · ${coverage.authPageFailedRuns} runs aborted on the Auth page` : ''}{coverage.trimmed ? ' · trimmed' : ''}</Text>
      <Text style={styles.meta}>{count(coverage.entriesFolded)} entries folded · {count(cost.entriesProcessed)} this run · {cost.postsPolled} posts polled · {cost.engagementJoins} engagement joins · {cost.sweepReads} sweep reads · {coverage.sweep.sweptPosts} swept · {coverage.createSkipped} create skipped · {coverage.undeterminedMode} undetermined decay entries · unknown causes {Object.entries(coverage.unknownCauses).map(([cause, n]) => `${cause} ${n}`).join(', ') || 'none'}</Text>
      <Text style={[styles.meta, (knobsUnverified || sourceAhead || mixedPolicy) && styles.amberText]}>{knobsUnverified ? `knobs unverified since ${stamp(knobs.syncedAtMillis)}` : `knobs synced ${since(knobs.syncedAtMillis, now)}`} · source {knobs.sourcePolicyVersion || '—'} · observed {digest.observedPolicy.version || '—'}{sourceAhead ? ' · source ahead of production' : ''}{mixedPolicy ? ` · mixed policy (${stats.observedPolicySpanned.join(' → ')}) — compare days, not windows` : ''}</Text>
    </Panel>

    <Panel letter="B" title="The knobs now — declared vs seen (7 d)" basis="declared = synced policy source · seen = last 7 days of production entries, backfill writer excluded (M16)">
      {knobRows.map(row => <View key={row.label} style={styles.knobRow}>
        <Text style={[styles.cell, styles.knobLabel]}>{row.label}</Text>
        <Text style={[styles.cell, styles.knobDeclared]}>{row.declared}</Text>
        <Text style={[styles.cell, styles.knobSeen, row.mismatch && styles.knobMismatch]}>{row.seen}</Text>
      </View>)}
      <Text style={styles.meta}>{count(observed.sampleEntries)} entries sampled · {count(observed.clamped)} clamped at the ceiling · resync {Object.entries(observed.resync).map(([kind, n]) => `${kind} ${n}`).join(', ') || 'none'} — a declared ≠ seen cell is knob drift between the repo and what production paid.</Text>
    </Panel>

    <View style={styles.windowRow}><Text style={styles.windowLabel}>WINDOW FOR C · D · G</Text><WindowToggle value={window} onChange={setWindow} /></View>

    <Panel letter="C" title="What a real person's attention is worth" basis={questions.c.basis || 'real posts × real actors · engagement entries · organicDelta'}>
      <GatedValue gate={questions.c}>
        <Text style={styles.copy}>In {windowLabel} <Text style={styles.strong}>real people</Text> (not the owner, not the simulation) made <Text style={styles.strong}>{count(stats.realPostGain.real.n)}</Text> engagements on real posts worth <Text style={styles.strong}>{signed(stats.realPostGain.real.total)}</Text>: views {signed(stats.realPostGain.real.view)}, likes {signed(stats.realPostGain.real.like)}, comments {signed(stats.realPostGain.real.comment)}, dislikes {signed(stats.realPostGain.real.dislike)}.</Text>
        <Text style={styles.copy}>Paid real views: <Text style={styles.strong}>{signed(stats.viewWorth.metersPaid)}</Text> across <Text style={styles.strong}>{count(stats.viewWorth.paidViews)}</Text> paid views ({count(stats.realPostGain.real.firstViews)} first views, {count(stats.realPostGain.real.repeatViews)} paid repeats worth {signed(stats.realPostGain.real.repeatMeters)}); on clean posts {stats.viewWorth.views === null ? 'the view count has no window baseline yet' : `${count(stats.viewWorth.views)} views counted`} over {stats.viewWorth.cleanPosts} clean posts ({stats.viewWorth.viewSampleDays} sample days).</Text>
        <Text style={styles.copy}><Text style={styles.strong}>{count(stats.distinctRealViewers)}</Text> distinct viewers, <Text style={styles.strong}>{count(stats.distinctRealLikers)}</Text> likers, <Text style={styles.strong}>{count(stats.distinctRealCommenters)}</Text> commenters; opportunity (proxy: last post location): <Text style={styles.strong}>{count(intercept.opportunity.pairs)}</Text> real-account / real-post pairs in range across {intercept.opportunity.postsWithAnyPair} posts and {intercept.opportunity.realAccountsWithLocation} located accounts · realised {intercept.realized.entries} on {intercept.realized.distinctPosts} posts by {intercept.realized.distinctActors} people.</Text>
      </GatedValue>
      {!questions.c.sufficient && <Text style={styles.meta}>{stats.realPostGain.real.n === 0 ? `No third-party human has engaged a real post in ${windowLabel}${humanTesters ? ` — ${humanTesters} human accounts are on the tester table` : ''}.` : `${count(stats.realPostGain.real.n)} real engagements so far.`}</Text>}
      <Text style={styles.meta}>Surface label on the wire (owner decision 11 Sep): feed {count(stats.surfaces.feed)} · map {count(stats.surfaces.map)} · profile {count(stats.surfaces.profile)} · unknown {count(stats.surfaces.unknown)} — counted per window, never on the ledger or the post.</Text>
      <KindBars real={stats.realPostGain.real} synthetic={stats.realPostGain.synthetic} owner={stats.realPostGain.owner} />
      <Legend items={[{ color: COLOR.growth, label: 'REAL' }, { color: COLOR.synthetic, label: 'SYNTHETIC (on real posts)' }, { color: COLOR.simulation, label: 'OWNER' }]} />
      <Text style={styles.meta}>SIM {signed(stats.realPostGain.synthetic.total)} over {count(stats.realPostGain.synthetic.n)} entries · OWNER {signed(stats.realPostGain.owner.total)} over {count(stats.realPostGain.owner.n)} · REVIEW {signed(stats.realPostGain.review.total)} over {count(stats.realPostGain.review.n)} · UNKNOWN {signed(stats.realPostGain.unknown.total)} over {count(stats.realPostGain.unknown.n)} · these columns prove the machinery and never satisfy a REAL threshold.</Text>
    </Panel>

    <Panel letter="D" title="Gain vs decay" basis={questions.d.basis || 'tester-owned posts · real gain vs the real share of decay loss (pool pro-rating)'}>
      <DayBars days={digest.days} markers={policyMarkers} />
      <Legend items={[{ color: COLOR.growth, label: 'REAL GAIN' }, { color: COLOR.decay, label: 'REAL SHARE OF DECAY' }, { color: COLOR.simulation, label: 'OWNER + SIM BEHIND' }, { color: COLOR.boost, label: 'OBSERVED POLICY CHANGED' }]} />
      <GatedValue gate={questions.d} unit="posts" reason={questions.d.n === 0 ? 'no tester post has a real engagement yet' : undefined}>
        <Text style={styles.copy}>Decay took <Text style={styles.strong}>{km(stats.realPostDecayLoss.byClass.real)}</Text> of real-earned reach from real posts in {windowLabel} against <Text style={styles.strong}>{signed(stats.realPostGain.real.total)}</Text> real people gave.</Text>
        <NetLine label="Posts < 7 d" bucket={stats.netReal.byAge.lt7d} />
        <NetLine label="Posts 7–30 d" bucket={stats.netReal.byAge.d7to30} />
        <NetLine label="Posts > 30 d" bucket={stats.netReal.byAge.gt30d} />
        <Text style={styles.copy}>Clean posts (no sim, no owner gain): <Text style={styles.strong}>{stats.viewWorth.cleanPosts}</Text>.</Text>
      </GatedValue>
      <Text style={styles.meta}>All registered real posts, {windowLabel}: decay {km(decayTotal)} total — real share {km(stats.realPostDecayLoss.byClass.real)} · owner {km(stats.realPostDecayLoss.byClass.owner)} · review {km(stats.realPostDecayLoss.byClass.review)} · simulation {km(stats.realPostDecayLoss.byClass.synthetic)} · unknown {km(stats.realPostDecayLoss.byClass.unknown)} · by mode normal {km(stats.realPostDecayLoss.byMode.normal)} / trial {km(stats.realPostDecayLoss.byMode.trial)} / stress {km(stats.realPostDecayLoss.byMode.stress)} / undetermined {km(stats.realPostDecayLoss.byMode.undetermined)}{stats.realPostDecayLoss.inferred ? ' (mode inferred per entry)' : ''} · seed loss {km(stats.realPostSeedLoss)} · boost loss {km(stats.realPostBoostLoss)} · boosts {stats.boosts.n} ({km(stats.boosts.meters)})</Text>
      <NetLine label="Owner column (owner-owned posts)" bucket={stats.netOwner.all} />
    </Panel>

    <Panel letter="E" title="The untouched-post curve" basis={`stepped through calculateRadiusDecay once per ${curve.passMinutes}-minute pass, never a closed form (M7)`}>
      <CurveLine label="Normal" line={curve.normal} floorMeters={knobs.decayFloorMeters} />
      <Text style={styles.meta}>At 65-minute passes: {curve.normal65.points.map(point => `${km(point.startMeters)} in ${days(point.days)}`).join(', ') || '—'} — the sharded queue runs each post every ≈ 60–65 min.</Text>
      <Text style={styles.copy}>Then the post rests at its claim (<Text style={styles.strong}>{km(knobs.seedMeters)} floor, or whatever it claimed</Text>) for as long as no trial runs. Below ≈ 468 m organic the integer floor makes every pass −1 m ≈ 24 m/day{curve.normal.daysToFloorAt468m !== null ? ` (${days(curve.normal.daysToFloorAt468m)} from 468 m)` : ''}.</Text>
      {curve.trial ? <CurveLine label={`Trial${trialOn ? ' (on today)' : ''}`} line={curve.trial} floorMeters={knobs.decayFloorMeters} /> : <Text style={styles.meta}>No trial line: the trial switch is off.</Text>}
      <Text style={styles.copy}><Text style={styles.strong}>Sim posts:</Text> {curve.stress.halfLifeHours} h half-life on organic and seed — suppressed while a trial runs.</Text>
    </Panel>

    <Panel letter="F" title="Resting at the claim" basis="live tester-owned posts · atClaim = organic 0, seed = birth seed · distributions over clean posts only">
      {trialOn || !seedRest.valid ? <Text style={styles.hidden}>hidden while the trial runs — under the trial the seed decays, so “at claim” is false for every post by construction and the panel would report the trial, not the policy.</Text> : <>
        <Text style={styles.copy}><Text style={styles.strong}>{seedRest.atClaim} of {seedRest.livePosts}</Text> live tester posts sit at exactly their claim; <Text style={styles.strong}>{seedRest.everAboveClaim}</Text> have ever risen above it; {seedRest.cleanPosts} clean.</Text>
        <GatedValue gate={questions.f} unit="posts" reason={seedRest.cleanPosts === 0 ? 'no clean posts yet' : undefined}>
          <Text style={styles.copy}>Median claim share {maybe(seedRest.claimShareMedian, pctOf)} · peak/claim p50 {maybe(seedRest.peakOverClaim.p50, value => value.toFixed(2))} (p90 {maybe(seedRest.peakOverClaim.p90, value => value.toFixed(2))}, n {seedRest.peakOverClaim.n}) · time to peak p50 {maybe(seedRest.timeToPeakHours.p50, value => `${value.toFixed(1)} h`)} (p90 {maybe(seedRest.timeToPeakHours.p90, value => `${value.toFixed(1)} h`)}).</Text>
        </GatedValue>
        <Text style={styles.meta}>Owner column: {seedRest.owner.atClaim} of {seedRest.owner.livePosts} at claim · {seedRest.owner.everAboveClaim} ever above · {seedRest.owner.cleanPosts} clean.</Text>
      </>}
    </Panel>

    <Panel letter="G" title="Contamination + owner (7 d)" basis="synthetic and owner actors on real posts · pool share = pool.syn / Σpool">
      <Text style={styles.copy}>Simulation accounts moved real posts by <Text style={styles.strong}>{signed(contamination.d7.syntheticMeters)}</Text> ({count(contamination.d7.syntheticEntries)} entries) this week; the owner’s own taps on other posts: <Text style={styles.strong}>{signed(contamination.d7.ownerMeters)}</Text> ({count(contamination.d7.ownerEntries)} entries, counted as neither real nor contamination); review taps {signed(contamination.d7.reviewMeters)} ({count(contamination.d7.reviewEntries)}).</Text>
      {!!contamination.d7.posts.length && <View style={styles.chipRow}>{contamination.d7.posts.map(row => <Pressable key={row.postId} accessibilityRole="button" onPress={() => onOpenPost(row.postId)} style={styles.contamRow}><Text style={styles.contamId} numberOfLines={1}>{row.postId}</Text><Text style={styles.contamMeta}>sim {signed(row.syntheticMeters)} · owner {signed(row.ownerMeters)} · {pctOf(row.share, 0)} of the pool</Text></Pressable>)}</View>}
      <Text style={styles.copy}>testControl/syntheticDailySimulation.ownerUid = <Text style={styles.strong}>{switches.simulationOwnerUid || '(unset)'}</Text>: each active sim actor gives that account’s posts view + like + comment ({km(knobs.firstViewMeters + knobs.likeMeters + knobs.commentMeters)}) in its first hour, then the repeat ladder. The desk separates it (panel D pro-rates decay by source). Clearing it is your phone-visibility switch, not a desk need: Firestore Console → testControl → syntheticDailySimulation → field ownerUid → clear. Consequence: the daily simulation stops targeting your posts, so they leave your Map and Feed unless real people engage them.</Text>
    </Panel>

    <Panel letter="H" title="Per channel" basis={questions.h.basis || 'tester-owned posts × real actors · post-days end at expiry or deletion'}>
      {!rankedChannels.length ? <Empty text="No tester-owned posts in any channel yet." /> : <>
        <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colName]}>CHANNEL</Text><Text style={[styles.th, styles.colNum]}>POSTS</Text><Text style={[styles.th, styles.colNum]}>REAL GAIN</Text><Text style={[styles.th, styles.colNum]}>POST-DAYS</Text><Text style={[styles.th, styles.colNum]}>PER POST-DAY</Text><Text style={[styles.th, styles.colNum]}>1ST REAL</Text></View>
        {rankedChannels.map(channel => <View key={channel.channelId} style={styles.tableRow}>
          <Text style={[styles.cell, styles.colName]}>{channel.channelId}{channel.sufficient ? '' : ' · unranked'}</Text>
          <Text style={[styles.cell, styles.colNum]}>{channel.realPosts}</Text>
          <Text style={[styles.cell, styles.colNum]}>{signed(channel.realGainMeters)}</Text>
          <Text style={[styles.cell, styles.colNum]}>{channel.postDays.toFixed(1)}</Text>
          <Text style={[styles.cell, styles.colNum, !channel.sufficient && styles.mutedCell]}>{channel.sufficient ? maybe(channel.gainPerPostDay, signed) : `n=${channel.n} · needs ${digest.gates.minChannelPosts} posts + ${digest.gates.minEvents}`}</Text>
          <Text style={[styles.cell, styles.colNum, !channel.sufficient && styles.mutedCell]}>{channel.sufficient ? maybe(channel.medianMinutesToFirstRealEngagement, value => `${Math.round(value)} min`) : '—'}</Text>
        </View>)}
        <Text style={styles.meta}>Feed weights change rank, never delivery.</Text>
      </>}
    </Panel>

    <Panel letter="I" title="Claims (30 d)" basis="create entries on tester-owned posts · the create entry carries the birth seed">
      {trialOn ? <Text style={styles.hidden}>hidden while the trial runs — “at the floor” is meaningless while a trial decays the seed; counts return when testControl/radiusDecayTrial.enabled is false.</Text> : <>
        <Text style={styles.copy}><Text style={styles.strong}>{claims.d30.count}</Text> tester drops in 30 days; <Text style={styles.strong}>{claims.d30.atFloor}</Text> claimed exactly the {km(knobs.seedMeters)} floor; median {maybe(claims.d30.medianMeters, km)}, largest {km(claims.d30.maxMeters)}; <Text style={styles.strong}>{claims.d30.aboveFloorThatEarned}</Text> of the above-floor claims ever earned a metre.</Text>
        <Text style={styles.meta}>Owner drops: {claims.d30.owner.count} · at floor {claims.d30.owner.atFloor} · median {maybe(claims.d30.owner.medianMeters, km)} · largest {km(claims.d30.owner.maxMeters)} · {claims.d30.owner.aboveFloorThatEarned} earned above the floor. No starves/floods verdict: the create entry does not carry the ceiling at creation (panel L).</Text>
      </>}
    </Panel>

    <Panel letter="K" title="Real, owner and official posts" basis="one row per registered post · tap a row for its ledger">
      {!digest.posts.length ? <Empty text="No registered posts yet." /> : <>
        <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colPost]}>POST</Text><Text style={[styles.th, styles.colOwner]}>OWNER</Text><Text style={[styles.th, styles.colRadius]}>SEED → NOW (PEAK)</Text><Text style={[styles.th, styles.colGain]}>GAIN REAL / OWNER / REVIEW / SIM / UNK</Text><Text style={[styles.th, styles.colLoss]}>DECAY REAL / TOTAL</Text><Text style={[styles.th, styles.colState]}>STATE</Text></View>
        {digest.posts.map(post => {
          const open = openPostId === post.postId;
          return <View key={post.postId}>
            <Pressable accessibilityRole="button" accessibilityState={{ selected: open }} onPress={() => onOpenPost(post.postId)} style={[styles.tableRow, open && styles.tableRowOpen]}>
              <View style={styles.colPost}><Text numberOfLines={1} style={styles.name}>{post.postId}</Text><Text numberOfLines={1} style={styles.meta}>{post.channelId || '—'} · {post.entries} entries · last {post.lastCause || '—'} {since(post.lastAtMillis, now)} · mode {post.decayModeSeen} · {post.viewCount} views</Text></View>
              <View style={styles.colOwner}><Chip label={post.ownerClass === 'real' ? 'REAL TESTER' : post.ownerClass === 'owner' ? 'OWNER' : post.ownerClass === 'review' ? 'REVIEW' : 'OFFICIAL'} tone={post.ownerClass === 'real' ? 'real' : post.ownerClass === 'owner' ? 'owner' : post.ownerClass === 'review' ? 'review' : 'official'} /></View>
              <Text style={[styles.cell, styles.colRadius]}>{km(post.seedMeters)} → {km(post.currentMeters)} ({km(post.peakMeters)}, {since(post.peakAtMillis, now)})</Text>
              <Text style={[styles.cell, styles.colGain]}>{signed(post.realGain)} / {signed(post.ownerGain)} / {signed(post.reviewGain)} / {signed(post.syntheticGain)} / {signed(post.unknownGain)}</Text>
              <Text style={[styles.cell, styles.colLoss]}>{km(post.decayLossRealShare)} / {km(post.decayLoss)}</Text>
              <View style={[styles.colState, styles.chipRow]}>{post.deletedAtMillis ? <Chip label="DELETED" tone="state" /> : post.expired ? <Chip label="EXPIRED" tone="state" /> : post.atClaim ? <Chip label="AT CLAIM" tone="state" /> : null}{post.clean && <Chip label="CLEAN" tone="clean" />}</View>
            </Pressable>
            {open && <Drilldown postId={post.postId} history={postHistory} state={postHistoryState} />}
          </View>;
        })}
        <Text style={styles.meta}>{digest.posts.length} of {registered} registered posts shown, newest change first · CLEAN = never pumped by simulation, owner or unknown actors · anchors: {digest.anchors.rows.map(row => `${row.postId} ${km(row.radiusMeters)} (${row.decayPathSeen}${row.atWorld ? ', at world' : row.belowSinceMillis ? `, below since ${utc(row.belowSinceMillis)}` : ''})`).join(' · ') || 'none'}</Text>
      </>}
    </Panel>

    <Panel letter="L" title="Not yet measurable" basis="each gap with the smallest change and its cost (§1.5)">
      <View style={styles.gapRow}><Text style={[styles.cell, styles.gapName]}>Claim ceiling at creation</Text><Text style={[styles.cell, styles.gapDetail]}>{ceilingGap?.measured ? `measured since ${stamp(ceilingGap.since ?? 0)}` : 'not measured'} — radiusHistoryOnPostCreated would stamp ceilingMeters from users/{'{uid}'}.totalPostRadiusMeters · +1 read per create · a functions deploy, deferred.</Text></View>
      <View style={styles.gapRow}><Text style={[styles.cell, styles.gapName]}>Actor class on entries</Text><Text style={[styles.cell, styles.gapDetail]}>answered by the engagements join on real and official posts (≈ CA$0.01/month) — never stamped on the world-readable ledger.</Text></View>
      <View style={styles.gapRow}><Text style={[styles.cell, styles.gapName]}>Decay mode</Text><Text style={[styles.cell, styles.gapDetail]}>{decayModeGap ? `inferred per entry (${count(decayModeGap.inferredEntries ?? 0)} inferred, ${count(decayModeGap.undeterminedEntries ?? 0)} undetermined)` : 'inferred per entry from seed/boost drops and the hourly rate'} — no stamp, no deploy.</Text></View>
      <View style={styles.gapRow}><Text style={[styles.cell, styles.gapName]}>Surface of a tap</Text><Text style={[styles.cell, styles.gapDetail]}>{surfaceSeen ? `measured — the surface label on the engagement wire is counted per window (feed ${count(stats.surfaces.feed)} · map ${count(stats.surfaces.map)} · profile ${count(stats.surfaces.profile)}).` : 'the surface label rides the engagement wire onto the private engagement document and is counted per window; nothing labelled has arrived yet (unknown ' + count(stats.surfaces.unknown) + ').'}</Text></View>
    </Panel>

    <Panel letter="M" title="Export" basis="days and posts CSVs are built here from the digest (0 reads) · the ledger CSV runs through the proxy, ≤ 50 posts per request">
      <View style={styles.exportRow}>
        <Pressable accessibilityRole="button" onPress={saveDays} style={styles.exportButton}><Text style={styles.exportText}>DAYS CSV · 0 reads</Text></Pressable>
        <Pressable accessibilityRole="button" onPress={savePosts} style={styles.exportButton}><Text style={styles.exportText}>POSTS CSV · 0 reads</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityState={{ disabled: exportState === 'running' || !exportIds.length }} disabled={exportState === 'running' || !exportIds.length} onPress={() => { void runLedgerExport(); }} style={[styles.exportButton, exportState === 'armed' && styles.exportButtonArmed, (exportState === 'running' || !exportIds.length) && styles.exportButtonDisabled]}>
          <Text style={styles.exportText}>{exportState === 'running' ? 'EXPORTING…' : `LEDGER CSV — ${estimate.posts} posts · ≈ ${count(estimate.reads)} reads · CA$${estimate.cad.toFixed(4)} · ${count(estimate.leftToday)} left today${exportState === 'armed' ? ' — EXPORT' : ''}`}</Text>
        </Pressable>
      </View>
      {exportState === 'armed' && <Text style={styles.meta}>Press LEDGER CSV again to run it; the proxy refuses (429) any request over the remaining day budget before it reads anything.</Text>}
      {!!exportNotice && <Text style={[styles.meta, exportState === 'error' && styles.amberText]}>{exportNotice}</Text>}
    </Panel>
  </Section>;
}

const styles = StyleSheet.create<Record<string, any>>({
  card: { flexGrow: 0, flexBasis: 'auto', gap: 12, padding: 18, borderWidth: 1, borderColor: '#6b2548', borderRadius: 20, backgroundColor: 'rgba(37,8,23,.94)', boxShadow: '0 12px 30px rgba(0,0,0,.24)' },
  kicker: { color: '#ff4aa3', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  cardTitle: { color: '#fff8fc', fontSize: 19, fontWeight: '800' },
  copy: { color: '#d5a7bf', fontSize: 13, lineHeight: 19 },
  strong: { color: '#fff8fc', fontWeight: '800' },
  meta: { color: '#d0a2b9', fontSize: 11, lineHeight: 15 },
  amberText: { color: COLOR.boost },
  name: { color: '#fff8fc', fontSize: 13, fontWeight: '800' },
  cell: { color: '#f4d7e6', fontSize: 12 },
  mutedCell: { color: '#8a7a96' },
  trialBanner: { gap: 4, padding: 14, borderRadius: 14, borderWidth: 2, borderColor: '#ff4d6d', backgroundColor: 'rgba(120,10,40,.55)' },
  trialTitle: { color: '#fff', fontSize: 15, fontWeight: '900', lineHeight: 21 },
  trialLine: { color: '#ffd5de', fontSize: 12, fontWeight: '800' },
  trialFoot: { color: '#ffb3c2', fontSize: 10 },
  amberStrip: { color: '#1b1200', backgroundColor: COLOR.boost, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, fontSize: 12, fontWeight: '800' },
  panel: { gap: 8, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: '#57203d', backgroundColor: 'rgba(255,255,255,0.025)' },
  panelHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  panelLetter: { width: 22, height: 22, lineHeight: 22, textAlign: 'center', borderRadius: 6, backgroundColor: '#ff2f91', color: '#fff', fontSize: 11, fontWeight: '900' },
  panelTitle: { color: '#fff', fontSize: 15, fontWeight: '800', flexShrink: 1 },
  basis: { color: '#8a7a96', fontSize: 9, letterSpacing: .4 },
  factRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  fact: { flexGrow: 1, flexBasis: 150, minHeight: 58, gap: 4, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#612542', backgroundColor: '#1d0814' },
  factAmber: { borderColor: COLOR.boost },
  factRed: { borderColor: '#ff4d6d', backgroundColor: 'rgba(120,10,40,.35)' },
  factGreen: { borderColor: COLOR.growth },
  factLabel: { color: '#bf829f', fontSize: 8, fontWeight: '900', letterSpacing: .9 },
  factValue: { color: '#fff', fontSize: 13, fontWeight: '800' },
  strip: { color: '#f4d7e6', fontSize: 12, fontWeight: '700', lineHeight: 17 },
  gateTile: { gap: 2, padding: 10, borderRadius: 10, backgroundColor: '#2a1f2a', borderWidth: 1, borderColor: '#4b3148' },
  gateText: { color: '#b7a3b8', fontSize: 12, fontWeight: '700' },
  gateBasis: { color: '#8a7a96', fontSize: 9 },
  windowRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  windowLabel: { color: '#b98aa6', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  toggle: { flexDirection: 'row', gap: 6 },
  toggleButton: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 11, borderWidth: 1, borderColor: '#79506c', backgroundColor: '#2a1725' },
  toggleButtonActive: { borderColor: '#8fddff', backgroundColor: '#174760' },
  toggleText: { color: '#d8b8c8', fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  toggleTextActive: { color: '#fff' },
  knobRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: '#3d2130' },
  knobLabel: { flex: 0.9, color: '#fff8fc', fontWeight: '800' },
  knobDeclared: { flex: 1.6 },
  knobSeen: { flex: 1.6, color: COLOR.growth },
  knobMismatch: { color: COLOR.decay, fontWeight: '800' },
  dayRow: { flexDirection: 'row', gap: 3 },
  dayCol: { flex: 1, minWidth: 0, alignItems: 'center' },
  dayUpTrack: { width: '100%', height: 48, position: 'relative', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  dayDownTrack: { width: '100%', height: 30, position: 'relative', marginTop: 2, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  dayBarUp: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  dayBarDown: { position: 'absolute', left: 0, right: 0, top: 0, borderBottomLeftRadius: 3, borderBottomRightRadius: 3 },
  dayBarBehind: { backgroundColor: COLOR.simulation },
  dayBarReal: { backgroundColor: COLOR.growth },
  dayBarLoss: { backgroundColor: COLOR.decay },
  dayMarker: { width: 6, height: 6, borderRadius: 3, marginTop: 3, backgroundColor: 'transparent' },
  dayMarkerOn: { backgroundColor: COLOR.boost },
  dayLabel: { color: '#8a7a96', fontSize: 8, marginTop: 1 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: '#a894b3', fontSize: 9, letterSpacing: 1, fontWeight: '700' },
  kindRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  kindCol: { flex: 1, minWidth: 0, alignItems: 'center' },
  kindTrack: { width: '100%', height: 64, position: 'relative', borderRadius: 4, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  kindBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 4, borderTopRightRadius: 4 },
  kindBarOwner: { backgroundColor: COLOR.simulation },
  kindBarSyn: { backgroundColor: COLOR.synthetic, opacity: .8 },
  kindBarReal: { backgroundColor: COLOR.growth },
  kindLabel: { color: '#b98aa6', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 4 },
  kindValue: { color: COLOR.growth, fontSize: 11, fontWeight: '700' },
  kindSim: { color: COLOR.synthetic, fontSize: 9 },
  hidden: { color: '#b7a3b8', fontSize: 12, fontStyle: 'italic', lineHeight: 17, padding: 10, borderRadius: 10, backgroundColor: '#2a1f2a' },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderTopWidth: 1, borderTopColor: '#57203d' },
  tableHead: { borderTopWidth: 0, paddingVertical: 4 },
  tableRowOpen: { backgroundColor: 'rgba(90, 240, 164, 0.06)' },
  th: { color: '#b98aa6', fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  colName: { flex: 1.6, minWidth: 0 },
  colNum: { flex: 1, minWidth: 0, textAlign: 'right' },
  colPost: { flex: 2.4, minWidth: 0 },
  colOwner: { flex: 1, minWidth: 0 },
  colRadius: { flex: 1.8, minWidth: 0 },
  colGain: { flex: 2.2, minWidth: 0 },
  colLoss: { flex: 1.2, minWidth: 0 },
  colState: { flex: 1.2, minWidth: 0 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  chip: { paddingHorizontal: 6, paddingVertical: 3, borderRadius: 6 },
  chipText: { color: '#fff', fontSize: 8, fontWeight: '900', letterSpacing: .6 },
  chip_real: { backgroundColor: '#1c774f' },
  chip_owner: { backgroundColor: COLOR.simulation },
  chip_review: { backgroundColor: '#174760' },
  chip_syn: { backgroundColor: '#6a4b8e' },
  chip_official: { backgroundColor: '#b0134f' },
  chip_lab: { backgroundColor: '#6a4b8e' },
  chip_clean: { backgroundColor: '#0d5c46' },
  chip_state: { backgroundColor: '#493547' },
  contamRow: { gap: 1, paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: '#44263b', backgroundColor: '#1d111b', maxWidth: 320 },
  contamId: { color: '#fff', fontSize: 10, fontWeight: '800' },
  contamMeta: { color: '#b98ca4', fontSize: 9 },
  gapRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#3d2130' },
  gapName: { flex: 0.8, color: '#fff8fc', fontWeight: '800' },
  gapDetail: { flex: 2.6, color: '#d0a2b9', fontSize: 11, lineHeight: 15 },
  exportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  exportButton: { paddingHorizontal: 12, paddingVertical: 9, borderRadius: 11, borderWidth: 1, borderColor: '#79506c', backgroundColor: '#2a1725' },
  exportButtonArmed: { borderColor: '#ff8ac5', backgroundColor: '#b0134f' },
  exportButtonDisabled: { opacity: .38 },
  exportText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  drill: { marginTop: 6, marginBottom: 6, padding: 12, borderRadius: 12, backgroundColor: '#2a1120', gap: 6 },
  drillTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 76, marginVertical: 6 },
  barCol: { flex: 1, minWidth: 3, maxWidth: 14, height: '100%', justifyContent: 'flex-end' },
  bar: { width: '100%', minHeight: 3, borderRadius: 2 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#3d2130' },
  causeDot: { width: 8, height: 8, borderRadius: 4 },
  ledgerCause: { flex: 1.8 },
  ledgerWhen: { flex: 1.4 },
  ledgerRadius: { flex: 1, textAlign: 'right' },
  delta: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  deltaUp: { color: COLOR.growth },
  deltaDown: { color: COLOR.decay },
  deltaFlat: { color: COLOR.muted },
});
