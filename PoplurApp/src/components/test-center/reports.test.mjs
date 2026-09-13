import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire, registerHooks } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve as resolvePath } from 'node:path';
import ts from 'typescript';

// The Reports tab renders through React's server renderer against the real
// `.tsx` sources (reports §6, "render the memo from a fixture through the
// normaliser"). Node strips plain TypeScript itself but not JSX, so a load
// hook transpiles every `src/**/*.ts(x)` module with the project's own
// TypeScript; `react-native` resolves to `react-native-web` (the app's web
// alias), `expo-router` and the Firebase SDK are stubbed at resolve time,
// and the `@/` alias points at `src/`. Nothing here touches a browser or the
// proxy: the fixture documents were rendered by the digest's own generator
// (functions-digest `renderReport`) and trimmed, so the wire shape is real.
const here = dirname(fileURLToPath(import.meta.url));
const src = resolvePath(here, '..', '..');
const withExtension = (path) => {
  for (const candidate of [path, `${path}.ts`, `${path}.tsx`, `${path}/index.ts`, `${path}/index.tsx`]) if (existsSync(candidate) && !candidate.endsWith('/')) return candidate;
  return null;
};
// A data: module cannot import a bare specifier, so the stub reaches React by file URL.
const reactUrl = pathToFileURL(createRequire(import.meta.url).resolve('react')).href;
const STUBS = {
  'expo-router': `import React from '${reactUrl}';
export const Link = ({ href, children, style, target }) => React.createElement('a', { href: typeof href === 'string' ? href : href.pathname + '?' + new URLSearchParams(href.params ?? {}).toString(), target, 'data-style': style ? 'set' : 'unset' }, children);
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
const { ReportCompare, ReportMemo, ReportsTab, isReportDay, knobValue, reportSlotState, suggestionCell } = await import('./reports.tsx');
const { Strip } = await import('./primitives.tsx');
const { algorithmReport, reportIndex, reportsStatus } = await import('../../services/testControl.ts');
const { nextUrl, parseUrlState } = await import('./hooks.ts');

const fixture = JSON.parse(readFileSync(resolvePath(here, 'reports.fixture.json'), 'utf8'));
const render = (element) => renderToStaticMarkup(element);
const decode = (html) => html.replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
/** The first non-empty text node inside the element with `id` (a probe's `firstChild` walk, on markup). */
const firstTextInside = (html, id) => {
  const at = html.indexOf(`id="${id}"`);
  assert.ok(at >= 0, `#${id} is in the markup`);
  const rest = html.slice(at);
  const match = />([^<]+)</.exec(rest);
  return match ? decode(match[1]) : '';
};
/** The opening tag of the first child element inside `#id`: react-native-web
 *  emits `numberOfLines` as an inline `-webkit-line-clamp`, so a clamp the
 *  text node cannot show is visible here (the review's finding: a ≈ 260-char
 *  first line wraps to three lines and a two-line clamp cut the anchors). */
const firstTagInside = (html, id) => {
  const at = html.indexOf(`id="${id}"`);
  assert.ok(at >= 0, `#${id} is in the markup`);
  const open = html.indexOf('<', html.indexOf('>', at));
  return html.slice(open, html.indexOf('>', open) + 1);
};
const drill = { openPostId: null, origin: null, history: null, state: 'idle', open: () => {} };
const noop = () => {};

test('the normaliser accepts the generator documents and the memo renders them in the §3.4 order', () => {
  const report = algorithmReport(fixture.suggest);
  assert.ok(report, 'the suggest fixture normalises');
  assert.equal(report.day, '2026-09-11');
  assert.equal(report.decision.kind, 'suggest');
  assert.equal(report.decision.appliedByReport, false);
  const html = render(React.createElement(ReportMemo, { report, mode: 'desk', drill, onOpenPost: noop }));
  // The first text node inside #report-<day> is the first line, verbatim — and never clamped (it wraps to three lines on the desk).
  assert.equal(firstTextInside(html, `report-${report.day}`), report.firstLine);
  assert.ok(!/line-clamp/.test(firstTagInside(html, `report-${report.day}`)), `the first line is not clamped on the desk: ${firstTagInside(html, `report-${report.day}`)}`);
  // The SUGGESTION card carries the fixed line.
  const card = html.slice(html.indexOf(`id="report-card-${report.day}"`));
  assert.ok(decode(card).includes('nothing is applied by this report'), 'the applied line is on the card');
  assert.ok(decode(card).includes('SUGGESTION') && !decode(card).slice(0, 400).includes('DECISION'), 'titled SUGGESTION, never DECISION');
  // Order: strip → card → verdicts → checks → story → windows → since yesterday → posts → footer.
  const marks = [`id="report-card-${report.day}"`, 'id="verdict-K2"', '>CHECKS<', 'id="report-story"', 'WINDOWS · real unmarked', 'SINCE YESTERDAY', 'POSTS ON THIS DAY', `id="report-footer-${report.day}"`];
  let last = -1;
  for (const mark of marks) { const at = html.indexOf(mark); assert.ok(at > last, `${mark} follows the previous block (${at} > ${last})`); last = at; }
  // The primary suggestion's Fold opens by default with its chip; another knob's Fold is closed on the desk.
  assert.ok(/id="verdict-K2"[\s\S]*?aria-expanded="true"/.test(html), 'K2 opens by default');
  assert.ok(html.includes('>PRIMARY<'), 'the PRIMARY chip');
  assert.ok(/id="verdict-K1"[\s\S]*?aria-expanded="false"/.test(html), 'K1 is closed on the desk');
  // The fixed-by-decision rows share one Fold; K13 keeps its own.
  assert.ok(html.includes('id="verdict-fixed"') && html.includes('id="verdict-K13"') && !html.includes('id="verdict-K9"'));
  // Controls: the print Link and the four CSV buttons.
  assert.ok(html.includes('id="report-controls"') && html.includes('/test-control-report?day=2026-09-11') && html.includes('VERDICTS CSV') && html.includes('POSTS CSV'));
  // No identity ever reaches the page.
  assert.ok(!/RealActor|eoP2Z0El|sim-food/.test(html), 'no uid in the markup');
});

test('paper mode forces every Fold open and prints the same document', () => {
  const report = algorithmReport(fixture.suggest);
  const html = render(React.createElement(ReportMemo, { report, mode: 'paper' }));
  const expanded = html.match(/aria-expanded="[a-z]+"/g) ?? [];
  assert.equal(expanded.length, 11, `ten own Folds plus the shared fixed one (${expanded.length})`);
  assert.ok(expanded.every(attribute => attribute === 'aria-expanded="true"'), 'every Fold is open on paper');
  assert.equal(firstTextInside(html, `report-${report.day}`), report.firstLine);
  assert.ok(!/line-clamp/.test(firstTagInside(html, `report-${report.day}`)), 'the first line is not clamped on paper');
  assert.ok(decode(html).includes('nothing is applied by this report'));
  assert.ok(!html.includes('id="report-controls"'), 'no controls on paper');
});

test('a suggestion under an insufficient gate never renders as a number of its own kind', () => {
  const raw = JSON.parse(JSON.stringify(fixture.suggest));
  const k2 = raw.verdicts.find(row => row.knob === 'K2');
  k2.gates[0].sufficient = false;
  const report = algorithmReport(raw);
  const row = report.verdicts.find(item => item.knob === 'K2');
  assert.equal(row.verdict, 'insufficient');
  assert.equal(row.reason, 'gate');
  assert.equal(row.suggestion, null);
  // Paper mode so the Fold body (the gate tiles) is in the markup; the demoted row now sorts with the insufficient group.
  const html = decode(render(React.createElement(ReportMemo, { report, mode: 'paper' })));
  const start = html.indexOf('id="verdict-K2"');
  const next = html.indexOf('id="verdict-', start + 1);
  const fold = html.slice(start, next > 0 ? next : undefined);
  assert.ok(fold.includes('INSUFFICIENT') && fold.includes('insufficient evidence — n ='), 'the grey tile grammar');
  // The tile prints the gate's whole label (§2.5 is the rule text): the element holding it carries no line clamp.
  const labelAt = fold.indexOf('>Gc · real events');
  assert.ok(labelAt > 0, 'the Gc label is on the tile');
  const labelTag = fold.slice(fold.lastIndexOf('<', labelAt), labelAt + 1);
  assert.ok(!/line-clamp/.test(labelTag), `the gate label is not clamped: ${labelTag}`);
  assert.ok(!fold.includes('SUGGEST →') && !fold.includes('→ 1,250 m'), 'no 1,250 on the K2 row');
  assert.equal(report.decision.kind, 'none', 'the service reconciles the card with the demoted row');
  assert.ok(html.slice(html.indexOf('id="report-card-')).slice(0, 1200).includes('NO SUGGESTION TODAY'), 'the card says so');
});

test('the chips cannot be missed on the document, and the trial day opens with the trial line', () => {
  const partial = algorithmReport(fixture.partial);
  assert.ok(partial && partial.revision === 2 && partial.partial && partial.catchUp);
  const html = render(React.createElement(ReportMemo, { report: partial, mode: 'desk', drill, onOpenPost: noop }));
  for (const chip of ['REV 2', 'CATCH-UP', 'PARTIAL', 'TRIAL ×5']) assert.ok(html.includes(`>${chip}<`), `${chip} chip in the document`);
  assert.ok(partial.firstLine.startsWith('DECAY TRIAL ×5 ON since'));
  assert.equal(firstTextInside(html, `report-${partial.day}`), partial.firstLine);
  assert.ok(partial.firstLine.length > 200 && !/line-clamp/.test(firstTagInside(html, `report-${partial.day}`)), 'the ≈ 260-char trial line is not clamped');
  for (const row of partial.verdicts.filter(item => item.tunable)) assert.equal(row.suggestion, null, `${row.knob} suggests nothing on a partial day`);
  const backfilled = algorithmReport(fixture.backfilled);
  const back = render(React.createElement(ReportMemo, { report: backfilled, mode: 'desk', drill, onOpenPost: noop }));
  assert.ok(back.includes('>BACKFILL<'));
  assert.equal(backfilled.evidence.snapshots, null, 'a backfilled day carries no snapshot');
  assert.ok(decode(back).includes('no snapshot on this day'));
});

test('Strip clamps a caption to two lines and unclamps on lines={0}', () => {
  // The primitive the memo relies on: the tab caption keeps its two-line
  // clamp; `lines={0}` (React Native's "no limit") emits no clamp at all.
  const caption = render(React.createElement(Strip, { text: 'Sep 12 · no suggestion', tone: 'off' }));
  assert.ok(/-webkit-line-clamp:2/.test(caption), `a caption strip is clamped to two lines: ${caption}`);
  const whole = render(React.createElement(Strip, { text: 'x'.repeat(300), tone: 'warn', lines: 0 }));
  assert.ok(!/line-clamp/.test(whole), `lines={0} is unclamped: ${whole}`);
});

test('the list, its empty states and the open slot states', () => {
  const index = reportIndex(fixture.index);
  assert.ok(index && index.days.length === 4);
  const list = decode(render(React.createElement(ReportsTab, { index, open: null, vs: null, bodies: {}, onOpen: noop, onCompare: noop, onClose: noop, onRetry: noop, drill, onOpenPost: noop })));
  assert.ok(list.includes('id="reports"') && !list.includes('id="report-2026'), 'the list, no report body');
  assert.ok(list.includes('SUGGESTS K2 like → 1,250 m') && list.includes('no suggestion · 7 insufficient · 10 fixed'), 'the suggestion cells');
  for (const chip of ['REV 2', 'CATCH-UP', 'PARTIAL', 'BACKFILL', 'TRIAL ×5']) assert.ok(list.includes(`>${chip}<`), `${chip} chip in the list`);
  assert.ok(list.includes('EXPORT RANGE · metrics · 4 reports · ≈ 4 reads'));
  const none = decode(render(React.createElement(ReportsTab, { index: null, open: null, vs: null, bodies: {}, onOpen: noop, onCompare: noop, onClose: noop, onRetry: noop, drill, onOpenPost: noop })));
  assert.ok(none.includes('No report index yet'));
  const empty = decode(render(React.createElement(ReportsTab, { index: { ...index, days: [] }, open: null, vs: null, bodies: {}, onOpen: noop, onCompare: noop, onClose: noop, onRetry: noop, drill, onOpenPost: noop })));
  assert.ok(empty.includes('No daily report yet'));
  const loading = decode(render(React.createElement(ReportsTab, { index, open: '2026-09-12', vs: null, bodies: {}, onOpen: noop, onCompare: noop, onClose: noop, onRetry: noop, drill, onOpenPost: noop })));
  assert.ok(loading.includes('← all reports') && loading.includes('Reading the report for Sep 12'));
  const absent = decode(render(React.createElement(ReportsTab, { index, open: '2026-09-12', vs: null, bodies: { '2026-09-12': { state: 'absent', report: null, refusal: null, revision: 1, error: null } }, onOpen: noop, onCompare: noop, onClose: noop, onRetry: noop, drill, onOpenPost: noop })));
  assert.ok(absent.includes('No report for Sep 12'));
  const ready = decode(render(React.createElement(ReportsTab, { index, open: '2026-09-11', vs: null, bodies: { '2026-09-11': { state: 'ready', report: algorithmReport(fixture.suggest), refusal: null, revision: 1, error: null } }, onOpen: noop, onCompare: noop, onClose: noop, onRetry: noop, drill, onOpenPost: noop })));
  assert.ok(ready.includes('id="report-2026-09-11"') && ready.includes('>COMPARE<'));
  // A day older than the listed 120 is still opened by id.
  const unlisted = decode(render(React.createElement(ReportsTab, { index, open: '2026-05-01', vs: null, bodies: {}, onOpen: noop, onCompare: noop, onClose: noop, onRetry: noop, drill, onOpenPost: noop })));
  assert.ok(unlisted.includes('not in the listed 120 days') && unlisted.includes('Reading the report for May 1'));
  // A slot fetched for an older revision than the index lists is loading again.
  assert.equal(reportSlotState(undefined, 1), 'loading');
  assert.equal(reportSlotState({ state: 'ready', report: null, refusal: null, revision: 1, error: null }, 2), 'loading');
  assert.equal(reportSlotState({ state: 'error', report: null, refusal: null, revision: 2, error: 'x' }, 2), 'error');
  assert.deepEqual(suggestionCell(index.days.find(row => row.decision === 'suggest')), { text: 'SUGGESTS K2 like → 1,250 m', tone: 'now' });
  assert.equal(knobValue('K4', -1000, 'm'), '−1,000 m');
  assert.equal(knobValue('K7', 0.05, '/day'), '0.05 /day');
  assert.equal(knobValue('K6', 30000, 'ms'), '30 s');
});

test('compare two renders the header, the policy strip and gate flips as chips', () => {
  const a = algorithmReport(fixture.none), b = algorithmReport(fixture.suggest);
  const html = decode(render(React.createElement(ReportCompare, { a, b, mode: 'desk' })));
  assert.ok(html.includes(`id="report-compare-${a.day}-${b.day}"`) && html.includes('COMPARE · A → B'));
  assert.ok(html.includes('policy or rules changed between these reports'), 'the epochs differ → the amber strip');
  assert.ok(html.includes('INSUFFICIENT → SUFFICIENT'), 'a gate that flipped renders as its chip');
  assert.ok(html.includes('COMPARE CSV') && html.includes('/test-control-report?day=2026-09-12&vs=2026-09-11'));
  const paper = render(React.createElement(ReportCompare, { a, b, mode: 'paper' }));
  assert.ok(!paper.includes('id="report-controls"'));
});

test('reportsStatus captions never read as applied and flag a stale list', () => {
  const index = reportIndex(fixture.index);
  const fresh = reportsStatus(index, Date.UTC(2026, 8, 13, 5, 30));   // 01:30 Toronto on the 13th: yesterday's report is not yet due
  assert.ok(fresh.caption.startsWith('Sep 12') && !/\bapplied\b/.test(fresh.text) && !/^apply|^raise|^lower/i.test(fresh.caption));
  const late = reportsStatus(index, Date.UTC(2026, 8, 15, 12, 0));    // the 15th at 08:00 Toronto: the 14th is missing
  assert.equal(late.caption, 'stale — expected 00:45');
  assert.equal(late.tone, 'warn');
  assert.equal(reportsStatus(null).caption, 'none yet');
});

test('the URL helpers are pure and validate every key', () => {
  const keys = ['tab', 'day', 'vs'];
  const validators = { tab: raw => ['today', 'reports'].includes(raw), day: isReportDay, vs: isReportDay };
  assert.deepEqual(parseUrlState('http://127.0.0.1:8084/test-control?tab=reports&day=2026-09-12&vs=nope', keys, validators, { tab: 'today' }), { tab: 'reports', day: '2026-09-12', vs: null });
  assert.deepEqual(parseUrlState('http://127.0.0.1:8084/test-control?tab=bogus', keys, validators, { tab: 'today' }), { tab: 'today', day: null, vs: null });
  assert.deepEqual(parseUrlState(new URL('http://127.0.0.1:8084/test-control'), keys, validators, {}), { tab: null, day: null, vs: null });
  const next = nextUrl('http://127.0.0.1:8084/test-control?tab=reports&day=2026-09-12&vs=2026-09-11', { vs: null, day: '2026-09-10' });
  assert.equal(next.search, '?tab=reports&day=2026-09-10');
  assert.equal(nextUrl(next, { day: null }).search, '?tab=reports');
  assert.equal(nextUrl('http://127.0.0.1:8084/test-control', { tab: 'reports', day: undefined }).search, '?tab=reports');
});
