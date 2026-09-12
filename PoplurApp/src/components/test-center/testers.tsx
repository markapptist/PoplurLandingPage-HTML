import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { BetaDailySeries, BetaTesterPost, BetaTesterRow, PostHistory } from '@/services/testControl';
import { SessionFact } from './simulation';   // the drill facts reuse the monitor's fact tile until C8 swaps in `Fact`
import { CAUSE_COLOR, PRESENCE_LABEL, ago, dayLabel, km, share, stamp } from './theme';

/** One column per calendar day: how many people joined and how many pops were
 *  dropped. Real counts draw solid; the simulation's share sits behind them in
 *  the muted tone so a busy cohort day never reads as a busy beta day. */
export function DailyStrip({ series }: { series: BetaDailySeries }) {
  if (!series.days.length) return null;
  const maxSignups = Math.max(1, ...series.days.map(day => day.signups));
  const maxPosts = Math.max(1, ...series.days.map(day => day.posts));
  const realSignups = series.days.reduce((sum, day) => sum + day.signups - day.syntheticSignups, 0);
  const realPosts = series.days.reduce((sum, day) => sum + day.posts - day.syntheticPosts, 0);
  return <View style={styles.daily}>
    <View style={styles.dailyHead}>
      <Text style={styles.dailyTitle}>Joining and dropping, per day</Text>
      <Text style={styles.meta}>Last {series.days.length} days · {realSignups} new testers · {realPosts} pops dropped · days roll at midnight {series.timeZone.replace('_', ' ')}{series.postsComplete ? '' : ' · earliest days under-count pops (ledger slice capped)'}</Text>
    </View>
    <View style={styles.dailyLegend}>
      <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.dailyBarSignups]} /><Text style={styles.legendText}>NEW TESTERS</Text></View>
      <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.dailyBarPosts]} /><Text style={styles.legendText}>POPS DROPPED</Text></View>
      <View style={styles.legendItem}><View style={[styles.legendSwatch, styles.dailyBarSim]} /><Text style={styles.legendText}>SIMULATION (+N)</Text></View>
    </View>
    <View style={styles.dailyRow}>
      {series.days.map(day => {
        const people = day.signups - day.syntheticSignups;
        const pops = day.posts - day.syntheticPosts;
        return <View key={day.day} style={styles.dailyCol}>
          <View style={styles.dailyBars}>
            <View style={styles.dailyTrack}>
              <View style={[styles.dailyBar, styles.dailyBarSim, { height: share(day.signups, maxSignups) }]} />
              <View style={[styles.dailyBar, styles.dailyBarSignups, { height: share(people, maxSignups) }]} />
            </View>
            <View style={styles.dailyTrack}>
              <View style={[styles.dailyBar, styles.dailyBarSim, { height: share(day.posts, maxPosts) }]} />
              <View style={[styles.dailyBar, styles.dailyBarPosts, { height: share(pops, maxPosts) }]} />
            </View>
          </View>
          <Text style={[styles.dailyNum, styles.dailyNumSignups]} numberOfLines={1}>{people}{day.syntheticSignups ? <Text style={styles.dailySim}>+{day.syntheticSignups}</Text> : null}</Text>
          <Text style={[styles.dailyNum, styles.dailyNumPosts]} numberOfLines={1}>{pops}{day.syntheticPosts ? <Text style={styles.dailySim}>+{day.syntheticPosts}</Text> : null}</Text>
          <Text style={styles.dailyDay} numberOfLines={1}>{dayLabel(day.day)}</Text>
        </View>;
      })}
    </View>
  </View>;
}

export function TesterTable({ rows, daily, expandedUid, expandedPosts, onToggle, openPostId, onOpenPost }: { rows: BetaTesterRow[]; daily: BetaDailySeries; expandedUid: string | null; expandedPosts: BetaTesterPost[] | null; onToggle: (uid: string) => void; openPostId: string | null; onOpenPost: (postId: string) => void }) {
  const online = rows.filter(row => row.presence === 'online').length;
  const people = rows.filter(row => !row.synthetic);
  const peoplePosts = people.reduce((sum, row) => sum + row.postCount, 0);
  const allPosts = rows.reduce((sum, row) => sum + row.postCount, 0);
  return <View>
    <DailyStrip series={daily} />
    <Text style={styles.tableSummary}>{online} online · {people.length} testers ({rows.length - people.length} simulation accounts) · {peoplePosts} pops by testers ({allPosts - peoplePosts} by the simulation)</Text>
    <View style={[styles.tableRow, styles.tableHead]}><Text style={[styles.th, styles.colName]}>TESTER</Text><Text style={[styles.th, styles.colStatus]}>STATUS</Text><Text style={[styles.th, styles.colWhen]}>SIGNED UP</Text><Text style={[styles.th, styles.colNum]}>POSTS</Text><Text style={[styles.th, styles.colWhen]}>LAST POST</Text></View>
    {rows.map(row => {
      const expanded = expandedUid === row.uid;
      return <View key={row.uid}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} onPress={() => onToggle(row.uid)} style={[styles.tableRow, expanded && styles.tableRowOpen]}>
          <View style={styles.colName}><Text style={styles.name} numberOfLines={1}>{row.label}</Text><Text style={styles.meta} numberOfLines={1}>{row.username ? `@${row.username}` : row.uid.slice(0, 8)}{row.accountType !== 'user' ? ` · ${row.accountType}` : ''}{row.platform ? ` · ${row.platform}` : ''}</Text></View>
          <View style={[styles.colStatus, styles.row]}><View style={[styles.statusDot, row.presence === 'online' ? styles.statusLive : row.presence === 'away' ? styles.statusAway : styles.statusNone]} /><Text style={styles.cell}>{row.presence === 'online' ? (row.screen ? row.screen.replace(/-/g, ' ') : row.presenceSource === 'lease' ? 'IN APP' : 'LIVE') : row.presence === 'away' ? ago(row.lastActivityAtMs) : PRESENCE_LABEL.unknown}</Text></View>
          <Text style={[styles.cell, styles.colWhen]}>{stamp(row.signedUpAtMs)}</Text>
          <Text style={[styles.cell, styles.colNum]}>{row.postCount}</Text>
          <Text style={[styles.cell, styles.colWhen]}>{row.lastPostedAtMs ? ago(row.lastPostedAtMs) : '—'}</Text>
        </Pressable>
        {expanded && (() => {
          const posts = expandedPosts ?? (row.posts.length ? row.posts : null);
          if (posts === null) return <Text style={[styles.copy, styles.postList]}>{row.postCount ? 'Loading posts…' : 'No posts yet.'}</Text>;
          if (!posts.length) return <Text style={[styles.copy, styles.postList]}>No posts yet.</Text>;
          return <View style={styles.postList}>{posts.map(post => <PostRow key={post.id} post={post} open={openPostId === post.id} onPress={() => onOpenPost(post.id)} />)}</View>;
        })()}
      </View>;
    })}
  </View>;
}

export function PostRow({ post, open, onPress }: { post: BetaTesterPost; open: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: open }} onPress={onPress} style={[styles.postRow, open && styles.postRowOpen]}>
    <Text style={styles.postKind}>{post.mediaType === 'video' ? 'VIDEO' : post.mediaCount > 1 ? `CAROUSEL ×${post.mediaCount}` : 'PHOTO'}</Text>
    <View style={styles.flex}><Text style={styles.cell} numberOfLines={1}>{post.caption || post.id}</Text><Text style={styles.meta}>{stamp(post.createdAtMs)}{post.channelId ? ` · ${post.channelId}` : ''}{post.coarse ? ` · ${post.coarse.latitude.toFixed(3)}, ${post.coarse.longitude.toFixed(3)}` : ''}</Text></View>
    <Text style={styles.postRadius}>{km(post.radiusMeters)}</Text>
  </Pressable>;
}

/** Radius over time, drawn with plain views: no chart dependency in this app. */
export function RadiusBars({ history }: { history: PostHistory['history'] }) {
  const peak = Math.max(1, ...history.map(entry => entry.radiusMeters));
  return <View style={styles.bars}>{history.map(entry => <View key={entry.id} style={styles.barCol}><View style={[styles.bar, { height: Math.max(3, Math.round((entry.radiusMeters / peak) * 72)), backgroundColor: CAUSE_COLOR[entry.cause] ?? '#806476' }]} /></View>)}</View>;
}

export function PostDrilldown({ postId, history, state }: { postId: string; history: PostHistory | null; state: 'idle' | 'loading' | 'error' }) {
  if (state === 'loading' || (!history && state === 'idle')) return <View style={styles.drill}><ActivityIndicator color="#5af0a4" /><Text style={styles.copy}>Loading the radius ledger for {postId}…</Text></View>;
  if (state === 'error' || !history) return <View style={styles.drill}><Text style={styles.copy}>That post&apos;s ledger could not be read.</Text></View>;
  const first = history.history[0];
  const last = history.history[history.history.length - 1];
  const peak = history.history.reduce((best, entry) => entry.radiusMeters > best.radiusMeters ? entry : best, first ?? { radiusMeters: 0, atMs: 0 });
  const where = history.exact ?? history.coarse;
  return <View style={styles.drill}>
    <Text style={styles.drillTitle}>{history.caption || history.postId}</Text>
    <Text style={styles.meta}>Posted {stamp(history.createdAtMs)}{history.channelId ? ` · ${history.channelId}` : ''} · {history.mediaType === 'video' ? 'video' : history.mediaCount > 1 ? `carousel ×${history.mediaCount}` : 'photo'}</Text>
    <Text style={styles.meta}>{where ? `${history.exact ? 'Dropped at' : 'Near'} ${where.latitude.toFixed(5)}, ${where.longitude.toFixed(5)}` : 'Location hidden'}{history.locationVisibility ? ` · ${history.locationVisibility}` : ''}</Text>
    <View style={styles.drillFacts}>
      <SessionFact label="STARTED" value={first ? km(first.radiusMeters) : km(history.seedRadiusMeters)} />
      <SessionFact label="NOW" value={km(history.radiusMeters)} />
      <SessionFact label="PEAK" value={peak.radiusMeters ? `${km(peak.radiusMeters)} · ${ago(peak.atMs)}` : '—'} />
      <SessionFact label="GROWTH" value={first && last ? `${last.radiusMeters >= first.radiusMeters ? '+' : '−'}${km(Math.abs(last.radiusMeters - first.radiusMeters))}` : '—'} />
    </View>
    {!history.history.length ? <Text style={styles.copy}>No radius changes recorded yet — the ledger starts with the post&apos;s first engagement.</Text> : <>
      <RadiusBars history={history.history} />
      {history.history.slice().reverse().map(entry => <View key={entry.id} style={styles.ledgerRow}>
        <View style={[styles.causeChip, { backgroundColor: CAUSE_COLOR[entry.cause] ?? '#806476' }]} />
        <Text style={[styles.cell, styles.ledgerCause]}>{entry.cause}{entry.kind ? ` · ${entry.kind}` : ''}</Text>
        <Text style={[styles.cell, styles.ledgerWhen]}>{stamp(entry.atMs)}</Text>
        <Text style={[styles.cell, styles.ledgerRadius]}>{km(entry.radiusMeters)}</Text>
        <Text style={[styles.delta, entry.delta > 0 ? styles.deltaUp : entry.delta < 0 ? styles.deltaDown : styles.deltaFlat]}>{entry.delta > 0 ? '▲' : entry.delta < 0 ? '▼' : '·'} {km(Math.abs(entry.delta))}</Text>
      </View>)}
    </>}
  </View>;
}

const styles = StyleSheet.create({
  tableSummary: { color: '#f4d7e6', fontSize: 13, fontWeight: '700', marginBottom: 8 },
  tableRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9, borderTopWidth: 1, borderTopColor: '#57203d' },
  tableHead: { borderTopWidth: 0, paddingVertical: 4 },
  tableRowOpen: { backgroundColor: 'rgba(90, 240, 164, 0.06)' },
  th: { color: '#b98aa6', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  cell: { color: '#f4d7e6', fontSize: 12 },
  colName: { flex: 2.2, minWidth: 0 },
  colStatus: { flex: 1.4, minWidth: 0, gap: 6 },
  colWhen: { flex: 1.2, minWidth: 0 },
  colNum: { flex: 0.6, textAlign: 'right' },
  statusNone: { backgroundColor: '#3d2130', borderWidth: 1, borderColor: '#806476' },
  postList: { paddingLeft: 12, paddingBottom: 6 },
  postRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, borderTopWidth: 1, borderTopColor: '#3d2130' },
  postRowOpen: { backgroundColor: 'rgba(142, 197, 255, 0.08)' },
  postKind: { color: '#b98aa6', fontSize: 10, fontWeight: '800', letterSpacing: 1, width: 92 },
  postRadius: { color: '#5af0a4', fontSize: 12, fontWeight: '700' },
  drill: { marginTop: 10, padding: 12, borderRadius: 12, backgroundColor: '#2a1120', gap: 6 },
  drillTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
  drillFacts: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginVertical: 6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 2, height: 76, marginVertical: 6 },
  barCol: { flex: 1, minWidth: 3, maxWidth: 14, justifyContent: 'flex-end' },
  bar: { width: '100%', borderRadius: 2 },
  ledgerRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 5, borderTopWidth: 1, borderTopColor: '#3d2130' },
  causeChip: { width: 8, height: 8, borderRadius: 4 },
  ledgerCause: { flex: 1.6 },
  ledgerWhen: { flex: 1.4 },
  ledgerRadius: { flex: 1, textAlign: 'right' },
  delta: { flex: 1, textAlign: 'right', fontSize: 12, fontWeight: '800' },
  deltaUp: { color: '#5af0a4' },
  deltaDown: { color: '#ff8a6b' },
  deltaFlat: { color: '#806476' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  copy: { color: '#d5a7bf', fontSize: 13, lineHeight: 19 },
  flex: { flex: 1, gap: 2 },
  name: { color: '#fff8fc', fontSize: 13, fontWeight: '800' },
  meta: { color: '#d0a2b9', fontSize: 11 },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusLive: { backgroundColor: '#5af0a4' },
  statusAway: { backgroundColor: '#806476' },
  daily: { marginBottom: 14, padding: 12, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.03)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.07)' },
  dailyHead: { marginBottom: 8 },
  dailyTitle: { color: '#fff', fontSize: 15, fontWeight: '700', marginBottom: 2 },
  dailyLegend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendSwatch: { width: 10, height: 10, borderRadius: 2 },
  legendText: { color: '#a894b3', fontSize: 10, letterSpacing: 1, fontWeight: '700' },
  dailyRow: { flexDirection: 'row', gap: 4 },
  dailyCol: { flex: 1, minWidth: 0, alignItems: 'center' },
  dailyBars: { flexDirection: 'row', gap: 2, height: 56, alignItems: 'flex-end', width: '100%' },
  dailyTrack: { flex: 1, height: '100%', position: 'relative', borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.04)', overflow: 'hidden' },
  dailyBar: { position: 'absolute', left: 0, right: 0, bottom: 0, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  dailyBarSignups: { backgroundColor: '#8ec5ff' },
  dailyBarPosts: { backgroundColor: '#5af0a4' },
  dailyBarSim: { backgroundColor: '#5a4a66' },
  dailyNum: { fontSize: 11, fontWeight: '700', marginTop: 4, fontVariant: ['tabular-nums'] },
  dailyNumSignups: { color: '#8ec5ff' },
  dailyNumPosts: { color: '#5af0a4', marginTop: 1 },
  dailySim: { color: '#8a7a96', fontWeight: '600' },
  dailyDay: { color: '#8a7a96', fontSize: 9, marginTop: 3 },
});
