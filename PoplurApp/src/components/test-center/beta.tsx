import { Fragment, useEffect, useState } from 'react';
import { normalizeScorecard, type Scorecard as PublishedScorecard } from '@/landing/useBetaScorecard';
import { fetchBetaScorecard } from '@/services/testControl';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BETA_RETENTION_KEYS,
  betaCsvFilename,
  betaPopsCsv,
  betaUsersCsv,
  saveCsv,
  type BetaMetrics,
  type BetaMetricsDaily,
  type BetaMetricsPop,
  type BetaMetricsUser,
  type BetaRetentionKey,
  type BetaRetentionStatus,
} from '@/services/testControl';
import { Empty, Label, Section, Strip, Tile } from './primitives';
import { PostDrilldown, type DrillState } from './testers';
import { C, FONT, S, T, clock, dayLabel, km, stamp } from './theme';

/** The route's slot for the Beta result: fetched when the tab first opens,
 *  again on REFRESH (which bypasses the proxy's ten-minute run cache). */
export type BetaSlot = { state: 'idle' | 'loading' | 'ready' | 'error'; metrics: BetaMetrics | null; error: string | null; reads: number };
export const EMPTY_BETA_SLOT: BetaSlot = { state: 'idle', metrics: null, error: null, reads: 0 };

const DAILY_DEFAULT_ROWS = 14;
const RETENTION_LABEL: Record<BetaRetentionKey, string> = { d1: 'D1', d7: 'D7', d14: 'D14' };
const STATUS_GLYPH: Record<BetaRetentionStatus, string> = { retained: '●', lost: '○', pending: '…' };
const STATUS_COLOR: Record<BetaRetentionStatus, string> = { retained: C.pop, lost: C.decay, pending: C.away };

/** n of N as a percentage; `—` when nothing is due yet. Never divides by zero. */
export const pct = (n: number, of: number): string => (of > 0 ? `${Math.round((n / of) * 100)}%` : '—');
const ratio = (value: number | null, places = 2): string => (value === null ? '—' : value.toFixed(places));
const shareText = (value: number | null): string => (value === null ? 'share —' : `${Math.round(value * 100)}% synthetic`);
const kmOrDash = (value: number | null): string => (value === null ? '—' : km(value));
const hours = (value: number | null): string => (value === null ? '—' : value < 1 ? `${Math.round(value * 60)} min` : value < 48 ? `${Math.round(value * 10) / 10} h` : `${Math.round(value / 24)} d`);

export type BetaStatus = { text: string; caption: string; tone: 'live' | 'warn' | 'off' };

/** The strip at the top of the panel and the caption under the tab label. */
export function betaStatus(slot: BetaSlot, includeOwner: boolean): BetaStatus {
  const metrics = slot.metrics;
  if (slot.state === 'error') return { text: slot.error ?? 'The Beta metrics could not be read.', caption: 'read failed', tone: 'warn' };
  if (!metrics) return { text: slot.state === 'loading' ? 'Reading human accounts, pops and sightings from Poplur…' : 'Not read yet.', caption: slot.state === 'loading' ? 'reading…' : 'not read', tone: 'off' };
  const view = metrics.views[includeOwner ? 'everyone' : 'students'];
  const scope = includeOwner ? `owner included (${metrics.accounts.owner})` : `owner excluded (${metrics.accounts.owner})`;
  const cost = `${metrics.coverage.reads.toLocaleString()} reads · CA$${metrics.coverage.cad.toFixed(4)}${metrics.cached ? ` · served from the run cache of ${clock(metrics.cachedAtMs)}` : ''}`;
  const capped = metrics.coverage.capped ? ` · READ CAP HIT at ${metrics.coverage.cappedAt ?? '?'} — the tables below are incomplete` : '';
  return {
    text: `Human accounts only · ${scope} · ${metrics.accounts.excluded.synthetic} simulation, ${metrics.accounts.excluded.review} review, ${metrics.accounts.excluded.unknown} unknown excluded · computed locally at ${clock(metrics.generatedAtMs)} from Firestore reads (nothing deployed) · ${cost}${capped}`,
    caption: `${view.headline.humanAccounts} human · ${view.headline.activeToday} active today`,
    tone: metrics.coverage.capped ? 'warn' : 'live',
  };
}

/** The Beta tab: headline tiles, the per-day table, per-human and per-pop
 *  tables (both exportable as fixed-column CSVs, built client-side: 0 reads),
 *  and the definitions the numbers rest on. OWNER is the one switch: off, the
 *  two owner accounts and their pops leave every number (the student view);
 *  on, they are counted and tagged. */
export function BetaTab({ slot, includeOwner, onToggleOwner, onRefresh, drill }: {
  slot: BetaSlot;
  includeOwner: boolean;
  onToggleOwner: () => void;
  onRefresh: () => void;
  drill: DrillState;
}) {
  const metrics = slot.metrics;
  const status = betaStatus(slot, includeOwner);
  const view = metrics?.views[includeOwner ? 'everyone' : 'students'] ?? null;
  const users = metrics ? metrics.users.filter(user => includeOwner || !user.owner) : [];
  const pops = metrics ? metrics.pops.filter(pop => includeOwner || !pop.owner) : [];
  const busy = slot.state === 'loading';
  return <View style={styles.stack}>
    <Strip text={status.text} tone={status.tone} lines={3} />
    <View nativeID="beta-controls" style={styles.controls}>
      <Pressable accessibilityRole="switch" aria-checked={includeOwner} onPress={onToggleOwner} style={[S.chip, styles.control, includeOwner && S.clay]}>
        <Text style={[T.cell, includeOwner && styles.onClay]}>OWNER {includeOwner ? 'INCLUDED' : 'EXCLUDED'}{metrics ? ` · ${metrics.accounts.owner}` : ''}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" disabled={busy} onPress={onRefresh} style={[S.button, styles.control, busy && S.disabled]}><Text style={T.cell}>{busy ? 'READING…' : 'REFRESH · recompute'}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!metrics} onPress={() => metrics && saveCsv(betaCsvFilename('users', metrics.today), betaUsersCsv(users))} style={[S.button, styles.control, !metrics && S.disabled]}><Text style={T.cell}>USERS CSV · {users.length}</Text></Pressable>
      <Pressable accessibilityRole="button" disabled={!metrics} onPress={() => metrics && saveCsv(betaCsvFilename('pops', metrics.today), betaPopsCsv(pops))} style={[S.button, styles.control, !metrics && S.disabled]}><Text style={T.cell}>POPS CSV · {pops.length}</Text></Pressable>
    </View>
    <BetaHeadline metrics={metrics} view={view} includeOwner={includeOwner} />
    <BetaScorecardCard />
    <BetaDailyTable metrics={metrics} rows={view?.daily ?? []} />
    <BetaUsersTable metrics={metrics} users={users} includeOwner={includeOwner} />
    <BetaPopsTable metrics={metrics} pops={pops} includeOwner={includeOwner} drill={drill} />
    <BetaDefinitions metrics={metrics} />
  </View>;
}

function BetaHeadline({ metrics, view, includeOwner }: { metrics: BetaMetrics | null; view: BetaMetrics['views']['students'] | null; includeOwner: boolean }) {
  const head = view?.headline ?? null;
  const dash = '—';
  const scope = includeOwner ? 'owner included' : 'owner excluded';
  const largest = head?.largestReach ?? null;
  return <Section id="beta-headline" title="Beta headline" meta={metrics ? `${scope} · as of ${clock(metrics.generatedAtMs)} · days roll at midnight ${metrics.timeZone.replace('_', ' ')}` : 'not read yet'}>
    <View style={styles.tiles}>
      <Tile label="HUMAN ACCOUNTS" value={head ? head.humanAccounts : dash} meta={head ? `+${head.signupsToday} today · ${head.signups7d} in 7 days` : 'connecting'} />
      <Tile label="FIRST POP ≤ 24 H" value={head ? pct(head.firstPop24h.n, head.firstPop24h.of) : dash} meta={head ? `${head.firstPop24h.n} of ${head.firstPop24h.of} accounts · ${head.firstPop24h.withPop} have popped at all` : 'connecting'} />
      {BETA_RETENTION_KEYS.map(key => <Tile key={key} label={`RETAINED ${RETENTION_LABEL[key]}`} value={head ? pct(head.retention[key].n, head.retention[key].of) : dash} meta={head ? `${head.retention[key].n} of ${head.retention[key].of} due` : 'connecting'} />)}
      <Tile label="POPS / ACTIVE TODAY" value={head ? ratio(head.popsPerActiveUserToday) : dash} meta={head ? `${head.popsToday} pops · ${head.activeToday} active today` : 'connecting'} />
      <Tile label="LIKES / POP" value={head ? ratio(head.likesPerPop.pops > 0 ? head.likesPerPop.likes / head.likesPerPop.pops : null) : dash} meta={head ? `${head.likesPerPop.likes} human likes on ${head.likesPerPop.pops} human pops` : 'connecting'} />
      {/* The human-grown figure leads; the synthetic share and the raw peak sit beside it. */}
      <Tile label="LARGEST REACH · HUMAN-GROWN" value={largest ? (largest.humanGrownMeters === null ? `${km(largest.peakMeters)} peak` : km(largest.startMeters + largest.humanGrownMeters)) : dash} meta={largest ? `${largest.humanGrownMeters === null ? 'split unavailable (no digest row)' : `${shareText(largest.syntheticShare)} of ${km(largest.peakMeters)} peak`} · ${largest.humansInReach} ${largest.humansInReach === 1 ? 'human' : 'humans'} in reach · ${largest.ownerLabel}${largest.owner ? ' (owner)' : ''} · ${stamp(largest.peakAtMs)}${largest.hasCoordinates ? '' : ' · no coordinates'}` : head ? 'no human pops yet' : 'connecting'} />
    </View>
  </Section>;
}

function BetaDailyTable({ metrics, rows }: { metrics: BetaMetrics | null; rows: BetaMetricsDaily[] }) {
  const [showAll, setShowAll] = useState(false);
  const newest = [...rows].sort((a, b) => b.day.localeCompare(a.day));
  const visible = showAll ? newest : newest.slice(0, DAILY_DEFAULT_ROWS);
  const cell = (key: BetaRetentionKey, row: BetaMetricsDaily) => {
    const { retained, due, cohort } = row.retention[key];
    return cohort === 0 ? '—' : due === 0 ? `…/${cohort}` : `${retained}/${due}`;
  };
  return <Section id="beta-daily" title="Per day" meta={metrics ? `${rows.length} Toronto days · retention cells are retained/due for the cohort that signed up that day (… = not due yet)` : 'not read yet'} right={rows.length > DAILY_DEFAULT_ROWS ? <Pressable accessibilityRole="button" aria-expanded={showAll} onPress={() => setShowAll(current => !current)} style={S.button}><Text style={T.cell}>{showAll ? `Show ${DAILY_DEFAULT_ROWS} newest` : `Show all ${rows.length}`}</Text></Pressable> : undefined}>
    {!metrics ? <Empty text="Connecting…" /> : !rows.length ? <Empty text="No days." /> : <View>
      <View style={[S.row, styles.tableHead]}>
        <Label style={styles.colDay}>DAY</Label><Label style={styles.colNum}>NEW</Label><Label style={styles.colNum}>TOTAL</Label><Label style={styles.colNum}>POP ≤24H</Label><Label style={styles.colNum}>ACTIVE</Label><Label style={styles.colNum}>POPS</Label><Label style={styles.colNum}>POPS/ACT</Label><Label style={styles.colNum}>LIKES</Label><Label style={styles.colNum}>LIKES/POP</Label>
        {BETA_RETENTION_KEYS.map(key => <Label key={key} style={styles.colNum}>{RETENTION_LABEL[key]}</Label>)}
      </View>
      {visible.map(row => <View key={row.day} style={S.row}>
        <Text style={[T.cell, styles.colDay]}>{dayLabel(row.day)}{row.day === metrics.today ? ' · today' : ''}</Text>
        <Text style={[T.cell, styles.colNum, row.signups > 0 && styles.people]}>{row.signups}</Text>
        <Text style={[T.cell, styles.colNum]}>{row.cumulativeAccounts}</Text>
        <Text style={[T.cell, styles.colNum]}>{row.firstPop24h.of ? `${row.firstPop24h.n}/${row.firstPop24h.of}` : '—'}</Text>
        <Text style={[T.cell, styles.colNum]}>{row.activeUsers}</Text>
        <Text style={[T.cell, styles.colNum, row.pops > 0 && styles.pop]}>{row.pops}</Text>
        <Text style={[T.cell, styles.colNum]}>{ratio(row.popsPerActiveUser)}</Text>
        <Text style={[T.cell, styles.colNum]}>{row.likes}</Text>
        <Text style={[T.cell, styles.colNum]}>{ratio(row.likesPerPop)}</Text>
        {BETA_RETENTION_KEYS.map(key => <Text key={key} style={[T.cell, styles.colNum]}>{cell(key, row)}</Text>)}
      </View>)}
    </View>}
  </Section>;
}

function RetentionMark({ status }: { status: BetaRetentionStatus }) {
  return <Text style={[T.cell, styles.colMark, { color: STATUS_COLOR[status] }]} accessibilityLabel={status}>{STATUS_GLYPH[status]}</Text>;
}

function OwnerTag() { return <View style={styles.ownerTag}><Text style={styles.ownerTagText}>OWNER</Text></View>; }

function BetaUsersTable({ metrics, users, includeOwner }: { metrics: BetaMetrics | null; users: BetaMetricsUser[]; includeOwner: boolean }) {
  const [openUid, setOpenUid] = useState<string | null>(null);
  const empty = !includeOwner && metrics && metrics.accounts.owner > 0
    ? `No human accounts besides the owner's ${metrics.accounts.owner} — flip OWNER INCLUDED to see the owner's own numbers.`
    : 'No human accounts yet.';
  return <Section id="beta-users" title="Per human" meta={metrics ? <>{users.length} accounts · ● retained · ○ lost · … pending · press a row for its active days</> : 'not read yet'}>
    {!metrics ? <Empty text="Connecting…" /> : !users.length ? <Empty text={empty} /> : <View>
      <View style={[S.row, styles.tableHead]}>
        <Label style={styles.colName}>TESTER</Label><Label style={styles.colWhen}>SIGNED UP</Label><Label style={styles.colNum}>POPS</Label><Label style={styles.colWhen}>FIRST POP</Label><Label style={styles.colNum}>LIKES ↑</Label><Label style={styles.colNum}>LIKES ↓</Label><Label style={styles.colNum}>ACTIVE D</Label>
        {BETA_RETENTION_KEYS.map(key => <Label key={key} style={styles.colMark}>{RETENTION_LABEL[key]}</Label>)}
      </View>
      {users.map(user => {
        const open = openUid === user.uid;
        return <Fragment key={user.uid}>
          <Pressable accessibilityRole="button" aria-expanded={open} onPress={() => setOpenUid(open ? null : user.uid)} style={[S.row, open && S.open]}>
            <View style={styles.colName}>
              <View style={styles.nameLine}>{user.owner && <OwnerTag />}<Text style={T.name} numberOfLines={1}>{user.label}</Text></View>
              <Text style={T.meta} numberOfLines={1}>{user.uid.slice(0, 8)} · last sign-in {user.lastSignInAtMs ? stamp(user.lastSignInAtMs) : '—'}</Text>
            </View>
            <Text style={[T.cell, styles.colWhen]}>{user.signedUpAtMs ? stamp(user.signedUpAtMs) : 'no Auth row'}</Text>
            <Text style={[T.cell, styles.colNum, user.pops > 0 && styles.pop]}>{user.pops}</Text>
            <Text style={[T.cell, styles.colWhen]}>{user.firstPopWithin24h === null ? '—' : `${hours(user.firstPopHours)} ${user.firstPopWithin24h ? '✓' : '✗ >24 h'}`}</Text>
            <Text style={[T.cell, styles.colNum]}>{user.likesGiven}</Text>
            <Text style={[T.cell, styles.colNum]}>{user.likesReceived}</Text>
            <Text style={[T.cell, styles.colNum]}>{user.activeDays}</Text>
            {BETA_RETENTION_KEYS.map(key => <RetentionMark key={key} status={user.retention[key]} />)}
          </Pressable>
          {open && <View style={[S.panel, styles.tray]}>
            <Text style={T.meta}>Active days ({user.activeDays}){user.anchorBasis ? ` · anchor: ${user.anchorBasis}` : ' · no anchor (no pop with a location)'} · sign-up day {user.signedUpDay || '—'}</Text>
            {!user.activeDayList.length ? <Text style={T.body}>No activity signal recorded yet.</Text> : user.activeDayList.slice().reverse().map(day => <View key={day} style={[S.row, styles.trayRow]}>
              <Text style={[T.cell, styles.colWhen]}>{dayLabel(day)}</Text>
              <Text style={[T.cell, styles.flex]}>{(user.activeKinds[day] ?? []).join(' · ')}</Text>
            </View>)}
          </View>}
        </Fragment>;
      })}
    </View>}
  </Section>;
}

function BetaPopsTable({ metrics, pops, includeOwner, drill }: { metrics: BetaMetrics | null; pops: BetaMetricsPop[]; includeOwner: boolean; drill: DrillState }) {
  const reach = (counts: BetaMetricsPop['humansInReachAtPeak']) => counts.real + (includeOwner ? counts.owner : 0);
  return <Section id="beta-pops" title="Per pop" meta={metrics ? `${pops.length} human pops · start → now · peak split human / synthetic (from the digest${metrics.coverage.digestAtMs ? ` of ${clock(metrics.coverage.digestAtMs)}` : ', not read'}) · humans in reach at peak and now · press a row for its radius ledger` : 'not read yet'}>
    {!metrics ? <Empty text="Connecting…" /> : !pops.length ? <Empty text={includeOwner ? 'No human pops yet.' : 'No pops from students yet.'} /> : <View>
      <View style={[S.row, styles.tableHead]}>
        <Label style={styles.colName}>POP</Label><Label style={styles.colNum}>START</Label><Label style={styles.colNum}>NOW</Label><Label style={styles.colNum}>PEAK</Label><Label style={styles.colNum}>HUMAN</Label><Label style={styles.colNum}>SYNTHETIC</Label><Label style={styles.colNum}>LIKES</Label><Label style={styles.colNum}>VIEWS</Label><Label style={styles.colNum}>REACH · PEAK</Label><Label style={styles.colNum}>REACH · NOW</Label>
      </View>
      {pops.map(pop => {
        const open = drill.openPostId === pop.postId && drill.origin === 'beta';
        return <Fragment key={pop.postId}>
          <Pressable accessibilityRole="button" aria-expanded={open} onPress={() => drill.open(pop.postId, 'beta')} style={[S.row, open && S.open]}>
            <View style={styles.colName}>
              <View style={styles.nameLine}>{pop.owner && <OwnerTag />}<Text style={T.name} numberOfLines={1}>{pop.ownerLabel} · {pop.channelId || 'no channel'}</Text></View>
              <Text style={T.meta} numberOfLines={1}>{pop.mediaType} · {stamp(pop.createdAtMs)}{pop.deleted ? ' · deleted' : ''}{pop.hasCoordinates ? '' : ' · no coordinates'} · peak {stamp(pop.peakAtMs)} · {pop.splitBasis === 'unavailable' ? 'split unavailable' : shareText(pop.syntheticShare)}{pop.unknownGrownMeters ? ` · ${km(pop.unknownGrownMeters)} unknown` : ''}</Text>
            </View>
            <Text style={[T.cell, styles.colNum]}>{km(pop.startMeters)}</Text>
            <Text style={[T.cell, styles.colNum]}>{km(pop.currentMeters)}</Text>
            <Text style={[T.cell, styles.colNum, styles.pop]}>{km(pop.peakMeters)}</Text>
            <Text style={[T.cell, styles.colNum, pop.humanGrownMeters ? styles.people : undefined]}>{kmOrDash(pop.humanGrownMeters)}</Text>
            <Text style={[T.cell, styles.colNum, pop.syntheticGrownMeters ? styles.sim : undefined]}>{kmOrDash(pop.syntheticGrownMeters)}</Text>
            <Text style={[T.cell, styles.colNum]}>{pop.likesReal + (includeOwner ? pop.likesOwner : 0)}</Text>
            <Text style={[T.cell, styles.colNum]}>{pop.views}</Text>
            <Text style={[T.cell, styles.colNum]}>{reach(pop.humansInReachAtPeak)}</Text>
            <Text style={[T.cell, styles.colNum]}>{reach(pop.humansInReachNow)}</Text>
          </Pressable>
          {open && <PostDrilldown key={pop.postId} postId={pop.postId} history={drill.history} state={drill.state} />}
        </Fragment>;
      })}
    </View>}
  </Section>;
}

const DEFINITION_TITLES: Record<string, string> = {
  human: 'HUMAN', signup: 'SIGN-UP', firstPop: 'FIRST POP ≤ 24 H', activity: 'ACTIVITY', retention: 'RETENTION', popsPerActive: 'POPS PER ACTIVE', likesPerPop: 'LIKES PER POP', reach: 'REACH', contamination: 'HUMAN-GROWN vs SYNTHETIC-GROWN',
};

function BetaDefinitions({ metrics }: { metrics: BetaMetrics | null }) {
  const entries = Object.entries(metrics?.definitions ?? {});
  return <Section id="beta-definitions" title="Definitions" meta={metrics ? `what every number above means · sightings recorded since ${metrics.coverage.sightingsSince ?? 'this run'} · engagement days ${metrics.coverage.engagementIndex ? `counted on the collection group (${metrics.coverage.engagementDaysCounted} this run)` : 'NOT counted — the engagements collection-group index refused the query'} · digest ${metrics.coverage.digestAtMs ? `of ${clock(metrics.coverage.digestAtMs)}` : 'absent (no peak split)'}` : 'not read yet'}>
    {!entries.length ? <Empty text="Definitions arrive with the first read." /> : entries.map(([key, value]) => <View key={key} style={styles.definition}>
      <Label>{DEFINITION_TITLES[key] ?? key.toUpperCase()}</Label>
      <Text style={T.body}>{value}</Text>
    </View>)}
  </Section>;
}

const styles = StyleSheet.create({
  stack: { gap: 20 },
  controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  control: { paddingHorizontal: 12, paddingVertical: 8 },
  onClay: { color: C.onSlab, fontWeight: '800' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tableHead: { borderTopWidth: 0, paddingTop: 2, paddingBottom: 6 },
  colDay: { flex: 1.4, minWidth: 0 },
  colName: { flex: 2.2, minWidth: 0 },
  colWhen: { flex: 1.2, minWidth: 0 },
  colNum: { flex: 0.8, minWidth: 0, textAlign: 'right' },
  colMark: { width: 28, textAlign: 'center' },
  people: { color: C.people, fontWeight: '700' },
  pop: { color: C.pop, fontWeight: '700' },
  sim: { color: C.sim, fontWeight: '700' },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6, minWidth: 0 },
  ownerTag: { paddingHorizontal: 5, paddingVertical: 1, borderRadius: 999, backgroundColor: C.slabFill },
  ownerTagText: { fontFamily: FONT, color: C.onSlab, fontSize: 9, fontWeight: '900', letterSpacing: 1 },
  tray: { gap: 0, marginTop: 8, marginBottom: 6 },
  trayRow: { paddingVertical: 5 },
  flex: { flex: 1 },
  definition: { gap: 4 },
});

/** The YC scorecard, exactly as the landing page publishes it — read from the
 *  same document (public/betaScorecard) through the proxy, so the desk and
 *  the public page can never disagree. People only; the harness is excluded
 *  upstream. Refreshes when the tab mounts and on demand. */
function BetaScorecardCard() {
  const [card, setCard] = useState<PublishedScorecard | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const load = () => {
    setState('loading'); setError(null);
    fetchBetaScorecard().then(raw => { const next = normalizeScorecard(raw); setCard(next); setState(next ? 'ready' : 'missing'); })
      .catch(err => { setState('error'); setError(err instanceof Error ? err.message : String(err)); });
  };
  useEffect(load, []);
  const pct = (share: number | null) => (share === null ? '—' : `${Math.round(share * 100)}%`);
  const when = (ms: number) => (ms > 0 ? new Date(ms).toLocaleString() : '—');
  return <View style={[S.card, scorecardStyles.card]} nativeID="beta-scorecard">
    <View style={scorecardStyles.head}>
      <View style={scorecardStyles.flex}>
        <Text style={T.name}>YC SCORECARD · what the landing page shows</Text>
        <Text style={T.meta}>{card ? `updated ${when(card.updatedAtMillis)} · window from ${when(card.window.startMillis).split(',')[0]} · ${card.installs} people · ${card.activity.activeLast7d} active last 7 d` : state === 'loading' ? 'loading…' : state === 'missing' ? 'not published yet — the function runs every 15 minutes' : error ?? 'unavailable'}</Text>
      </View>
      <Pressable accessibilityRole="button" disabled={state === 'loading'} onPress={load} style={[S.button, state === 'loading' && S.disabled]}><Text style={T.cell}>REFRESH</Text></Pressable>
    </View>
    {card && <View style={scorecardStyles.table}>
      {card.signals.map(sig => <View key={sig.key} style={scorecardStyles.row}>
        <View style={scorecardStyles.flex}><Text style={T.cell}>{sig.label}</Text><Text style={T.meta}>{sig.note}</Text></View>
        <Text style={[T.cell, scorecardStyles.num]}>{sig.count} / {sig.of}</Text>
        <Text style={[T.cell, scorecardStyles.num]}>{pct(sig.share)}</Text>
        <Text style={[T.cell, scorecardStyles.verdict, sig.verdict === 'good' && scorecardStyles.good, sig.verdict === 'weak' && scorecardStyles.weak, sig.verdict === 'pending' && scorecardStyles.pending]}>{sig.verdict.toUpperCase()}</Text>
      </View>)}
      <Text style={T.meta}>Loop: {card.loop.grewPops}/{card.loop.engagedPops} engaged pops grew · re-post within 72 h {card.loop.repostRateGrew === null ? '—' : pct(card.loop.repostRateGrew)} (grew) vs {card.loop.repostRateNotGrew === null ? '—' : pct(card.loop.repostRateNotGrew)} (did not) · discovery {card.discovery.interception} by radius / {card.discovery.profile} by profile · referrals {card.organic.referralInstalls} · integrity: {card.integrity.overClaimedPops} over-claimed, {card.integrity.ladderPops} ladder, {card.integrity.replacedPops} replaced</Text>
    </View>}
  </View>;
}

const scorecardStyles = StyleSheet.create({
  card: { gap: 10 },
  flex: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  table: { gap: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 6, borderTopWidth: 1, borderTopColor: C.hairline },
  num: { minWidth: 64, textAlign: 'right' },
  verdict: { minWidth: 72, textAlign: 'right', color: C.sim },
  good: { color: C.pop },
  weak: { color: '#ff6b9d' },
  pending: { color: C.sim },
});
