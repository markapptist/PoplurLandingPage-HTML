import { Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { BetaDailyCount, BetaDailySeries, BetaTesterRow, RealtimePublicPost } from '@/services/testControl';
import { Delta, Empty, Fact, Section, Tile } from './primitives';
import { PopRow, PostDrilldown, type DrillState } from './testers';
import { C, PUBLIC_POPS_WINDOW, S, T, ago, dayLabel, km } from './theme';

/** The Today preview of Latest pops: a glance, not the list. */
const PREVIEW_ROWS = 5;

/** "Today" is the greatest `day` string, never `days[last]`: the series keeps
 *  server order and promises nothing about it (spec decision 9). The length
 *  guard is load-bearing — `reduce` with no seed throws on `[]`, and the
 *  route has no error boundary above it. */
const latestDayOf = (days: BetaDailyCount[]): BetaDailyCount | null => days.length ? days.reduce((best, day) => day.day > best.day ? day : best) : null;

/** The four daily answers before any scroll: real number big, simulation
 *  `+N` beside it. Everything is `—` until the desk is connected. */
export function TodayStrip({ testers, daily, posts, statusLine }: {
  testers: BetaTesterRow[] | null;
  daily: BetaDailySeries | null;
  posts: RealtimePublicPost[] | null;
  statusLine: string;
}) {
  const connected = !!testers && !!daily && !!posts;
  const realTesters = testers?.filter(row => !row.synthetic).length ?? 0;
  const onlineReal = testers?.filter(row => row.presence === 'online' && !row.synthetic).length ?? 0;
  const onlineSim = testers?.filter(row => row.presence === 'online' && row.synthetic).length ?? 0;
  const latestDay = daily ? latestDayOf(daily.days) : null;
  const last7 = daily ? [...daily.days].sort((a, b) => b.day.localeCompare(a.day)).slice(0, 7) : [];
  const signups7 = last7.reduce((sum, day) => sum + day.signups - day.syntheticSignups, 0);
  const pops7 = last7.reduce((sum, day) => sum + day.posts - day.syntheticPosts, 0);
  const seriesMeta = connected ? 'no daily series' : 'connecting';
  const realNetKm = posts?.filter(post => !post.synthetic).reduce((sum, post) => sum + post.radiusDeltaKm, 0) ?? 0;
  const simNetKm = posts?.filter(post => post.synthetic).reduce((sum, post) => sum + post.radiusDeltaKm, 0) ?? 0;
  return <View style={styles.strip}>
    <View style={styles.tiles}>
      <Tile label="ONLINE NOW" value={connected ? onlineReal : '—'} sim={connected ? onlineSim : undefined} meta={connected ? `of ${realTesters} testers · in the app now` : 'connecting'} />
      <Tile label="NEW TESTERS" value={latestDay ? latestDay.signups - latestDay.syntheticSignups : '—'} sim={latestDay?.syntheticSignups} meta={latestDay ? `${dayLabel(latestDay.day)} · ${signups7} in 7 days` : seriesMeta} />
      <Tile label="POPS DROPPED" value={latestDay ? latestDay.posts - latestDay.syntheticPosts : '—'} sim={latestDay?.syntheticPosts} meta={latestDay ? `${dayLabel(latestDay.day)} · ${pops7} in 7 days${daily?.postsComplete ? '' : ' · earliest days under-count'}` : seriesMeta} />
      <Tile label="RADIUS MOVED" value={connected ? <Delta meters={realNetKm * 1000} size="metric" /> : '—'} sim={connected ? <Delta meters={simNetKm * 1000} tone="sim" /> : undefined} meta={`newest ${PUBLIC_POPS_WINDOW} public pops · net`} />
    </View>
    <Text numberOfLines={2} style={T.meta}>{statusLine}</Text>
  </View>;
}

/** The one line under the tiles: the latest real pop, and whether the
 *  simulation is running so the owner knows the "now" numbers include it.
 *  No cloud-gate, pin or cohort wording reaches the first screenful. */
export function todayStatusLine({ latestReal, simulationCount = 0, simulationLive }: { latestReal: RealtimePublicPost | null; simulationCount?: number; simulationLive: boolean }): string {
  // "No pops yet" is only true when the window is empty; when every pop in it
  // is the simulation's, say that instead of hiding 160 pops behind a "yet".
  const latest = latestReal
    ? `${latestReal.label} dropped a pop in ${latestReal.place}, ${ago(latestReal.updatedAtMs || latestReal.postedAtMs)}`
    : simulationCount ? `no pops from testers yet · ${simulationCount} from the simulation` : 'no pops yet';
  return `Latest: ${latest}${simulationLive ? ' · simulation live' : ''}`;
}

/** Latest pops on the Today tab: the newest five, real first, no group row —
 *  the full list is one tab away. Simulation rows join only when the SIM
 *  ROWS switch is on; their count never hides (spec decision 6, §0). Each row
 *  is the §4.9 row and opens its ledger directly beneath itself. */
export function LatestPopsPreview({ posts, showSim, drill, onSeeAll }: { posts: RealtimePublicPost[]; showSim: boolean; drill: DrillState; onSeeAll: () => void }) {
  const real = posts.filter(post => !post.synthetic);
  const sim = posts.filter(post => post.synthetic);
  const visible = (showSim ? [...real, ...sim] : real).slice(0, PREVIEW_ROWS);
  return <Section
    id="pops-preview"
    title="Latest pops"
    meta={<>the newest {PREVIEW_ROWS} · {real.length}{sim.length ? <Text style={T.simText}> +{sim.length}</Text> : null} in the {PUBLIC_POPS_WINDOW}-pop window</>}
    right={<Pressable accessibilityRole="link" onPress={onSeeAll} style={styles.seeAll}><Text style={styles.seeAllText}>See all pops →</Text></Pressable>}
  >
    {!visible.length ? <Empty text={sim.length ? `No pops from testers yet — ${sim.length} from the simulation are behind the SIM ROWS switch.` : 'No pops yet.'} /> : visible.map(post => {
      const open = drill.openPostId === post.id && drill.origin === 'pops';
      return <Fragment key={post.id}>
        <PopRow post={post} open={open} onPress={() => drill.open(post.id, 'pops')} />
        {open && <PostDrilldown key={post.id} postId={post.id} history={drill.history} state={drill.state} />}
      </Fragment>;
    })}
  </Section>;
}

export type RadiusHalf = { up: number; down: number; net: number; topPace: number; growing: number; decaying: number };
/** Radius movement over the public-pops window, real and simulation apart —
 *  aggregates never sum the two (spec §3.5). Kilometres, as the posts carry them. */
export type RadiusSplit = { real: RadiusHalf; sim: RadiusHalf };

const EMPTY_HALF: RadiusHalf = { up: 0, down: 0, net: 0, topPace: 0, growing: 0, decaying: 0 };
const half = (posts: RealtimePublicPost[]): RadiusHalf => posts.reduce((acc, post) => ({
  up: acc.up + Math.max(0, post.radiusDeltaKm),
  down: acc.down + Math.max(0, -post.radiusDeltaKm),
  net: acc.net + post.radiusDeltaKm,
  topPace: Math.max(acc.topPace, post.viralPerHour),
  growing: acc.growing + (post.radiusDeltaKm > 0 ? 1 : 0),
  decaying: acc.decaying + (post.radiusDeltaKm < 0 ? 1 : 0),
}), EMPTY_HALF);
export const splitRadius = (posts: RealtimePublicPost[]): RadiusSplit => ({ real: half(posts.filter(post => !post.synthetic)), sim: half(posts.filter(post => post.synthetic)) });

/** The Algorithm tab's facts row: honest interim numbers over the public-pops
 *  window above the peer's instrument, which draws its own card and title —
 *  the tab label is the only heading this shell adds (spec §0), so it draws
 *  no card and no title of its own. Signed quantities never take the `+N`
 *  count form: the movement is written `▲ up · ▼ down`, the net through
 *  `Delta`, and the simulation half on its own line with the `sim` prefix in
 *  the sim tone. `TOP PACE` is a rate, so its simulation half keeps `+n/h`. */
export function AlgorithmSection({ split, children }: { split: RadiusSplit; children?: ReactNode }) {
  return <View nativeID="radius" style={styles.algorithm}>
    <View style={[S.panel, styles.facts]}>
      <Fact
        label="NET MOVED"
        value={<><Text style={styles.up}>▲ {km(split.real.up * 1000)}</Text> · <Text style={styles.down}>▼ {km(split.real.down * 1000)}</Text></>}
        sim={`sim ▲ ${km(split.sim.up * 1000)} · ▼ ${km(split.sim.down * 1000)}`}
        meta={<>net <Delta meters={split.real.net * 1000} /> · {split.real.growing} growing · {split.real.decaying} decaying</>}
      />
      <Fact label="TOP PACE" value={`${split.real.topPace.toFixed(1)}/h`} sim={split.sim.topPace > 0 ? `+${split.sim.topPace.toFixed(1)}/h` : undefined} meta="fastest pop in the window" />
      <Text style={[T.meta, styles.factsMeta]}>newest {PUBLIC_POPS_WINDOW} public pops · real is the number, the simulation apart</Text>
    </View>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  strip: { gap: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  algorithm: { gap: 12 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  factsMeta: { flexBasis: '100%' },
  up: { color: C.pop },
  down: { color: C.decay },
  seeAll: { paddingVertical: 4 },
  seeAllText: { color: C.people, fontSize: 12, fontWeight: '700' },
});
