import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { BetaDailyCount, BetaDailySeries, BetaTesterRow, RealtimePublicPost } from '@/services/testControl';
import { Delta, Fact, Section, Tile } from './primitives';
import { C, T, ago, dayLabel, km } from './theme';

/** The dashboard ships the newest 160 public pops (`publicPosts`); every
 *  radius sum on this page is that window, never a day, and says so. */
const PUBLIC_POPS_WINDOW = 160;

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
export function todayStatusLine({ latestReal, simulationLive }: { latestReal: RealtimePublicPost | null; simulationLive: boolean }): string {
  const latest = latestReal ? `${latestReal.label} dropped a pop in ${latestReal.place}, ${ago(latestReal.updatedAtMs || latestReal.postedAtMs)}` : 'no pops yet';
  return `Latest: ${latest}${simulationLive ? ' · simulation live' : ''}`;
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

/** The section the owner calls the Algorithm desk: honest interim numbers
 *  above, the peer's instrument (its own card) as the child below — so this
 *  shell draws no card of its own. Signed quantities never take the `+N`
 *  count form: direction is the glyph, the simulation half is written out
 *  with a `sim` prefix in the sim tone. */
export function AlgorithmSection<Id extends string = string>({ id, split, innerRef, onLayout, children }: {
  id: Id;
  split: RadiusSplit;
  innerRef?: (id: Id, node: View | null) => void;
  onLayout?: (id: Id, y: number) => void;
  children?: ReactNode;
}) {
  return <Section id={id} title="Algorithm desk" meta={`newest ${PUBLIC_POPS_WINDOW} public pops`} frame="none" innerRef={innerRef} onLayout={onLayout}>
    <View style={styles.facts}>
      <Fact
        label="NET MOVED"
        value={<><Text style={styles.up}>▲ {km(split.real.up * 1000)}</Text> · <Text style={styles.down}>▼ {km(split.real.down * 1000)}</Text></>}
        sim={`sim ▲ ${km(split.sim.up * 1000)} · ▼ ${km(split.sim.down * 1000)}`}
        meta={`${split.real.growing} growing · ${split.real.decaying} decaying`}
      />
      <Fact label="TOP PACE" value={`${split.real.topPace.toFixed(1)}/h`} sim={split.sim.topPace > 0 ? `+${split.sim.topPace.toFixed(1)}/h` : undefined} meta="fastest pop in the window" />
    </View>
    {children}
  </Section>;
}

const styles = StyleSheet.create({
  strip: { gap: 10 },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, padding: 12, borderRadius: 10, backgroundColor: C.panel },
  up: { color: C.pop },
  down: { color: C.decay },
});
