import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import ts from 'typescript';

// The Beta tab renders through React's server renderer against the real
// `.tsx` sources, the way reports.test.mjs does: the load hook transpiles
// `src/**/*.ts(x)` with the project's TypeScript, `react-native` resolves to
// `react-native-web`, `expo-router` and the Firebase SDK are stubbed, and
// `@/` points at `src/`. The fixture is the proxy's own fold
// (scripts/beta-metrics-policy.mjs) run on an empty world and on a small one,
// so the wire shape the page normalises is the real one.
const here = dirname(fileURLToPath(import.meta.url));
const src = resolvePath(here, '..', '..');
const withExtension = (path) => {
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`, `${path}/index.tsx`]) if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
  return null;
};
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const STUBS = {
  'expo-router': `import React from '${reactUrl}';
export const Link = ({ href, children }) => React.createElement('a', { href: typeof href === 'string' ? href : href.pathname }, children);
export const useLocalSearchParams = () => ({});
export const useRouter = () => ({ setParams: () => {} });`,
  'expo-router/head': `export default ({ children }) => null;`,
};
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './firebase' && String(context.parentURL).endsWith('/services/testControl.ts')) {
      return { url: 'data:text/javascript,export const auth = { currentUser: null };', shortCircuit: true };
    }
    if (specifier in STUBS) return { url: `data:text/javascript,${encodeURIComponent(STUBS[specifier])}`, shortCircuit: true };
    if (specifier === 'react-native') return nextResolve('react-native-web', context);
    if (specifier.startsWith('@/')) {
      const target = withExtension(resolvePath(src, specifier.slice(2)));
      if (target) return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      const target = withExtension(resolvePath(dirname(fileURLToPath(context.parentURL)), specifier));
      if (target && /\.tsx?$/.test(target)) return { url: pathToFileURL(target).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
  load(url, context, nextLoad) {
    if (url.startsWith('file:') && /\.tsx?$/.test(url) && fileURLToPath(url).startsWith(src)) {
      const source = readFileSync(fileURLToPath(url), 'utf8');
      const { outputText } = ts.transpileModule(source, { fileName: fileURLToPath(url), compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022, isolatedModules: true } });
      return { format: 'module', source: outputText, shortCircuit: true };
    }
    return nextLoad(url, context);
  },
});

const React = (await import('react')).default;
const { renderToStaticMarkup } = await import('react-dom/server');
const { BetaTab, EMPTY_BETA_SLOT, betaStatus, pct } = await import('./beta.tsx');
const { BETA_POPS_CSV_COLUMNS, BETA_USERS_CSV_COLUMNS, betaCsvFilename, betaMetrics, betaPopsCsv, betaUsersCsv } = await import('../../services/testControl.ts');
const { DESK_OWNER_UIDS } = await import('../../../scripts/algorithm-digest-policy.mjs');
const { BETA_USERS_CSV_COLUMNS: PROXY_USERS_COLUMNS, BETA_POPS_CSV_COLUMNS: PROXY_POPS_COLUMNS, betaPopsCsv: proxyPopsCsv, betaUsersCsv: proxyUsersCsv, emptySightings, foldBetaMetrics, recordSighting } = await import('../../../scripts/beta-metrics-policy.mjs');

const NOW = Date.UTC(2026, 8, 15, 18);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const OWNER = DESK_OWNER_UIDS[1];
const render = (element) => renderToStaticMarkup(element);
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
const drill = { openPostId: null, origin: null, history: null, state: 'idle', open: () => {} };
const noop = () => {};
/** The proxy's wire shape: the fold, serialised, as `GET /api/beta` returns it. */
const wire = (input, extra = {}) => JSON.parse(JSON.stringify({ ...foldBetaMetrics(input), cached: false, cachedAtMs: NOW, ...extra }));

const emptyWorld = () => wire({ now: NOW, accounts: [{ uid: OWNER, email: 'mark@apptist.ca', createdAtMs: NOW - 300 * DAY, lastSignInAtMs: NOW - DAY, lastRefreshAtMs: NOW - HOUR }], profiles: [{ uid: OWNER, profile: { username: 'mark' } }], coverage: { reads: 61 } });

function smallWorld() {
  const alice = 'aliceUID000001';
  const sightings = emptySightings();
  recordSighting(sightings, alice, NOW - 6 * DAY, 'lease');
  return wire({
    now: NOW,
    accounts: [
      { uid: alice, email: 'alice@uni.ca', createdAtMs: NOW - 7 * DAY, lastSignInAtMs: NOW - 6 * DAY, lastRefreshAtMs: NOW - 6 * DAY },
      { uid: OWNER, email: 'mark@apptist.ca', createdAtMs: NOW - 300 * DAY, lastSignInAtMs: NOW - DAY, lastRefreshAtMs: NOW - HOUR },
      { uid: 'sim-food-001', email: 'sim-food-001@poplur.test', createdAtMs: NOW - 20 * DAY, lastSignInAtMs: NOW, lastRefreshAtMs: NOW },
    ],
    profiles: [{ uid: alice, profile: { username: 'alice' } }, { uid: OWNER, profile: { username: 'mark' } }],
    postsByUid: {
      [alice]: [{ id: 'post-alice-1', data: { userID: alice, createdAtMillis: NOW - 7 * DAY + 2 * HOUR, radiusMeters: 12_000, seedRadiusMeters: 5_000, latitude: 43.6487, longitude: -79.3811, channelId: 'live', mediaType: 'photo', viewCount: 9 } }],
      [OWNER]: [{ id: 'post-owner-1', data: { userID: OWNER, createdAtMillis: NOW - 2 * DAY, radiusMeters: 600_000, seedRadiusMeters: 5_000, latitude: 43.6487, longitude: -79.2321, channelId: 'news', mediaType: 'video', viewCount: 400 } }],
    },
    popDetails: {
      'post-alice-1': { startMeters: 5_000, startAtMs: NOW - 7 * DAY + 2 * HOUR, peakMeters: 15_000, peakAtMs: NOW - 5 * DAY, engagements: [{ actorUid: OWNER, kind: 'like', createdAtMs: NOW - 5 * DAY }], exact: null },
      'post-owner-1': { startMeters: 5_000, startAtMs: NOW - 2 * DAY, peakMeters: 600_000, peakAtMs: NOW - DAY, engagements: [{ actorUid: alice, kind: 'view', createdAtMs: NOW - DAY }], exact: null },
    },
    sightings,
    // The digest's per-post gains: alice's pop grew 8 km of which 6 km was the simulation; the owner's 595 km all simulation.
    digest: { posts: [
      { postId: 'post-alice-1', realGain: 0, ownerGain: 2_000, reviewGain: 0, syntheticGain: 6_000, unknownGain: 0 },
      { postId: 'post-owner-1', realGain: 0, ownerGain: 0, reviewGain: 0, syntheticGain: 595_000, unknownGain: 0 },
    ], contamination: { d7: { posts: [] } } },
    coverage: { reads: 222, engagementIndex: true, engagementDaysCounted: 4, digestAtMs: NOW - HOUR },
  });
}

test('the normaliser accepts the proxy fold, gates the schema version, and bounds what it keeps', () => {
  const metrics = betaMetrics(emptyWorld());
  assert.ok(metrics);
  assert.equal(metrics.accounts.human, 1);
  assert.equal(metrics.accounts.students, 0);
  assert.equal(metrics.views.students.headline.humanAccounts, 0);
  assert.equal(metrics.views.students.headline.largestReach, null);
  assert.equal(metrics.views.students.daily.length, 30);
  assert.equal(metrics.coverage.reads, 61);
  assert.equal(metrics.definitions.activity.length > 100, true);
  assert.equal(betaMetrics({ ...emptyWorld(), version: 2 }), null, 'another schema major is refused, never zero-filled');
  assert.equal(betaMetrics(null), null);
  const small = betaMetrics(smallWorld());
  assert.equal(small.users.length, 2);
  assert.equal(small.pops.length, 2);
  const alice = small.users.find(user => user.label === 'alice');
  assert.deepEqual(alice.retention, { d1: 'retained', d7: 'pending', d14: 'pending' });
  assert.equal(alice.firstPopWithin24h, true);
  assert.deepEqual(small.pops.find(pop => pop.postId === 'post-alice-1').humansInReachAtPeak, { real: 0, owner: 1 });
  const a1 = small.pops.find(pop => pop.postId === 'post-alice-1');
  assert.deepEqual([a1.grownMeters, a1.humanGrownMeters, a1.syntheticGrownMeters, a1.syntheticShare, a1.splitBasis], [10_000, 2_500, 7_500, 0.75, 'digest-posts']);
  assert.ok(Math.abs(small.coverage.cad - 0.000111) < 1e-9);
  assert.deepEqual({ ...small.coverage, cad: 0 }, { reads: 222, cad: 0, capped: false, cappedAt: null, sightingsSince: null, engagementIndex: true, engagementDaysCounted: 4, digestAtMs: NOW - HOUR });
  // Everyone: both pops reach one human; alice's 2.5 km human-grown beats the owner's 0 (all simulation).
  const largest = small.views.everyone.headline.largestReach;
  assert.deepEqual([largest.postId, largest.humanGrownMeters, largest.syntheticShare, largest.splitBasis], ['post-alice-1', 2_500, 0.75, 'digest-posts']);
  const ownerPop = small.pops.find(pop => pop.postId === 'post-owner-1');
  assert.deepEqual([ownerPop.humanGrownMeters, ownerPop.syntheticGrownMeters, ownerPop.syntheticShare], [0, 595_000, 1]);
  // Garbage in the rows is dropped or bounded, never thrown.
  const odd = betaMetrics({ ...emptyWorld(), users: [null, { uid: 'x'.repeat(200) }, { uid: 'ok', retention: { d1: 'nonsense' }, firstPopHours: 'abc' }], pops: [{ postId: 'p', peakMeters: 1e12, humansInReachAtPeak: 'no' }], views: { students: { daily: [{ day: 'not-a-day' }, { day: '2026-09-15', popsPerActiveUser: null }] } } });
  assert.equal(odd.users.length, 2);
  assert.equal(odd.users[1].retention.d1, 'pending');
  assert.equal(odd.users[1].firstPopHours, null);
  assert.equal(odd.pops[0].peakMeters, 6_371_000);
  assert.deepEqual(odd.pops[0].humansInReachAtPeak, { real: 0, owner: 0 });
  assert.deepEqual([odd.pops[0].humanGrownMeters, odd.pops[0].syntheticGrownMeters, odd.pops[0].syntheticShare, odd.pops[0].splitBasis], [null, null, null, 'unavailable'], 'an absent split stays null');
  const negative = betaMetrics({ ...emptyWorld(), pops: [{ postId: 'p', humanGrownMeters: -5, syntheticGrownMeters: 'x', syntheticShare: 4, splitBasis: 'digest-posts' }] });
  assert.deepEqual([negative.pops[0].humanGrownMeters, negative.pops[0].syntheticGrownMeters, negative.pops[0].syntheticShare, negative.pops[0].splitBasis], [0, 0, 1, 'digest-posts']);
  assert.equal(odd.views.students.daily.length, 1);
  assert.equal(odd.views.students.daily[0].popsPerActiveUser, null);
  assert.equal(odd.views.everyone.daily.length, 0);
});

test('the page CSVs are the proxy CSVs: same fixed columns, same cells', () => {
  assert.deepEqual([...BETA_USERS_CSV_COLUMNS], [...PROXY_USERS_COLUMNS]);
  assert.deepEqual([...BETA_POPS_CSV_COLUMNS], [...PROXY_POPS_COLUMNS]);
  const raw = smallWorld();
  const metrics = betaMetrics(raw);
  assert.equal(betaUsersCsv(metrics.users).trim(), proxyUsersCsv(raw.users).trim());
  assert.equal(betaPopsCsv(metrics.pops).trim(), proxyPopsCsv(raw.pops).trim());
  assert.equal(betaUsersCsv([]).trim(), BETA_USERS_CSV_COLUMNS.join(','));
  assert.equal(betaCsvFilename('pops', '2026-09-15'), 'poplur-beta-pops-20260915.csv');
});

test('the tab renders zeros on an empty world, an honest idle state, and the owner switch\'s empty state', () => {
  const idle = render(React.createElement(BetaTab, { slot: EMPTY_BETA_SLOT, includeOwner: false, onToggleOwner: noop, onRefresh: noop, drill }));
  assert.ok(decode(idle).includes('Not read yet.'));
  assert.ok(idle.includes('id="beta-headline"') && idle.includes('id="beta-daily"') && idle.includes('id="beta-users"') && idle.includes('id="beta-pops"') && idle.includes('id="beta-definitions"'));
  assert.equal(betaStatus(EMPTY_BETA_SLOT, false).caption, 'not read');
  assert.equal(betaStatus({ ...EMPTY_BETA_SLOT, state: 'loading' }, false).caption, 'reading…');
  assert.equal(betaStatus({ ...EMPTY_BETA_SLOT, state: 'error', error: 'boom' }, false).tone, 'warn');

  const slot = { state: 'ready', metrics: betaMetrics(emptyWorld()), error: null, reads: 61 };
  const students = decode(render(React.createElement(BetaTab, { slot, includeOwner: false, onToggleOwner: noop, onRefresh: noop, drill })));
  assert.ok(students.includes('OWNER EXCLUDED · 1'), 'the switch names the owner count');
  assert.ok(students.includes('No human accounts besides the owner'), 'the per-human empty state points at the switch');
  assert.ok(students.includes('No pops from students yet.'));
  assert.ok(students.includes('no human pops yet'), 'LARGEST REACH says so instead of a number');
  assert.ok(students.includes('+0 today · 0 in 7 days'));
  assert.ok(students.includes('0 of 0 due'));
  assert.ok(!/NaN|Infinity|undefined/.test(students), 'no NaN, Infinity or undefined anywhere in the markup');
  assert.equal(betaStatus(slot, false).caption, '0 human · 0 active today');
  assert.equal(betaStatus(slot, false).tone, 'live');
  assert.ok(betaStatus(slot, false).text.includes('61 reads'));
  assert.ok(betaStatus({ ...slot, metrics: { ...slot.metrics, coverage: { ...slot.metrics.coverage, capped: true, cappedAt: 'ledger:post-x' } } }, false).text.includes('READ CAP HIT'));

  const everyone = decode(render(React.createElement(BetaTab, { slot, includeOwner: true, onToggleOwner: noop, onRefresh: noop, drill })));
  assert.ok(everyone.includes('OWNER INCLUDED · 1'));
  assert.ok(everyone.includes('>OWNER<'), 'the owner row wears the tag');
  assert.ok(everyone.includes('mark'));
  assert.equal(betaStatus(slot, true).caption, '1 human · 1 active today', 'the owner\'s token refresh an hour ago is a sighting');
});

test('the tab renders a small world: tiles, per-day cells, retention marks, reach and the drill row', () => {
  const slot = { state: 'ready', metrics: betaMetrics(smallWorld()), error: null, reads: 222 };
  const html = render(React.createElement(BetaTab, { slot, includeOwner: false, onToggleOwner: noop, onRefresh: noop, drill: { ...drill, openPostId: 'post-alice-1', origin: 'beta', state: 'loading' } }));
  const page = decode(html);
  assert.ok(page.includes('1 of 1 accounts · 1 have popped at all'));
  assert.ok(page.includes('100%'), 'FIRST POP ≤ 24 H and RETAINED D1 read 100%');
  assert.ok(page.includes('0 human likes on 1 human pops'), 'the owner\'s like leaves with the owner');
  assert.ok(page.includes('7.5 km'), 'largest reach leads with the human-grown figure: 5 km start + 2.5 km human-grown');
  assert.ok(page.includes('75% synthetic of 15.0 km peak · 0 humans in reach · alice'), 'the synthetic share and the raw peak sit beside it');
  assert.ok(page.includes('>2.5 km<') && page.includes('>7.5 km<'), 'the pop row carries HUMAN and SYNTHETIC columns');
  assert.ok(page.includes('HUMAN-GROWN vs SYNTHETIC-GROWN'), 'the definition is printed');
  assert.ok(page.includes('counted on the collection group (4 this run)'));
  assert.ok(/aria-expanded="true"/.test(html), 'the open pop row is expanded and its ledger drill sits under it');
  assert.ok(page.includes('USERS CSV · 1') && page.includes('POPS CSV · 1'));
  assert.ok(!page.includes('>OWNER<'), 'no owner rows in the student view');
  assert.ok(!/NaN|Infinity|undefined/.test(page));
  assert.equal(pct(1, 3), '33%');
  assert.equal(pct(0, 0), '—');
  const withOwner = decode(render(React.createElement(BetaTab, { slot, includeOwner: true, onToggleOwner: noop, onRefresh: noop, drill })));
  assert.ok(withOwner.includes('1 human likes on 2 human pops'));
  assert.ok(withOwner.includes('75% synthetic of 15.0 km peak · 1 human in reach · alice'), 'with the owner counted, alice\'s pop reaches him and her 2.5 km human-grown outranks the owner\'s all-simulation 600 km');
  assert.ok(withOwner.includes('>600 km<') && withOwner.includes('>595 km<') && withOwner.includes('100% synthetic'), 'the owner\'s pop row: 600 km peak, 595 km synthetic-grown, 100% synthetic');
});
