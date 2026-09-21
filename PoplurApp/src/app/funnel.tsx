// The beta funnel, for Poplur: who visited, entered an email, opened and
// clicked the invite, signed, went to a store, opened the weekly form, filed
// a report. Web only, read only, behind FUNNEL_KEY (api/funnel+api.ts); the
// key is kept on this device so the page reopens without asking.

import React, { useEffect, useMemo, useState } from 'react';
import { Platform, ScrollView } from 'react-native';

import { ThemedText } from '@/components/themed-text';

import './../report/funnel.css';

type Stage = string;
type Event = { stage: Stage; at: string; detail?: Record<string, string | number | boolean | null> };
type Tester = { id: string; email: string; firstSeenAt: string; lastSeenAt: string; furthestStage: Stage; furthestIndex: number; stageAt: Record<string, string>; eventCount: number; events: Event[] };
type Visitor = { id: string; firstSeenAt: string; lastSeenAt: string; visits: number; paths: string[]; referrer: string | null; device: string; userAgent: string | null; city: string | null; region: string | null; country: string | null; testerId: string | null; email: string | null };
type Summary = { configured: boolean; generatedAt: string; visitors: number; visitorRows?: Visitor[]; testers: Tester[]; reached: Record<Stage, number>; order: Stage[]; labels: Record<Stage, string> };

const KEY = 'poplur.funnel.key';
const COLUMNS: Stage[] = ['email_entered', 'invite_delivered', 'invite_opened', 'invite_clicked', 'nda_signed', 'links_opened', 'store_ios', 'store_android', 'form_opened', 'form_filed', 'report_filed'];

const when = (iso: string | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('en-CA', { timeZone: 'America/Toronto', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
};

export default function FunnelPage() {
  const [key, setKey] = useState('');
  const [typed, setTyped] = useState('');
  const [data, setData] = useState<Summary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    try { const k = window.localStorage.getItem(KEY); if (k) setKey(k); } catch { /* no storage */ }
  }, []);

  const load = async (k: string) => {
    if (!k) return;
    setBusy(true); setError(null);
    try {
      const r = await fetch(`/api/funnel?k=${encodeURIComponent(k)}`, { cache: 'no-store' });
      const body = (await r.json().catch(() => ({}))) as Summary & { error?: string };
      if (!r.ok) { setError(body.error ?? 'Could not load the funnel.'); if (r.status === 401) { setKey(''); try { window.localStorage.removeItem(KEY); } catch { /* */ } } return; }
      setData(body);
      try { window.localStorage.setItem(KEY, k); } catch { /* */ }
    } catch { setError('Could not reach Poplur.'); }
    finally { setBusy(false); }
  };

  useEffect(() => { if (key) void load(key); }, [key]);

  const rows = useMemo(() => {
    if (!data) return [];
    const q = filter.trim().toLowerCase();
    return q ? data.testers.filter(t => t.email.includes(q)) : data.testers;
  }, [data, filter]);
  const visitorRows = useMemo(() => {
    const all = data?.visitorRows ?? [];
    const q = filter.trim().toLowerCase();
    return q ? all.filter(v => (v.email ?? '').includes(q) || (v.city ?? '').toLowerCase().includes(q) || v.device.toLowerCase().includes(q)) : all;
  }, [data, filter]);
  const where = (v: Visitor) => [v.city, v.region, v.country].filter(Boolean).join(', ') || '—';
  const from = (v: Visitor) => v.referrer ? v.referrer.replace(/^https?:\/\//, '') : 'direct';

  if (Platform.OS !== 'web') {
    return <ScrollView contentContainerStyle={{ padding: 24 }}><ThemedText>Open poplur.ca/funnel in a browser.</ThemedText></ScrollView>;
  }

  if (!key) {
    return <main className="fn">
      <form className="fn-gate" onSubmit={e => { e.preventDefault(); setKey(typed.trim()); }}>
        <p className="fn-eyebrow">Poplur · beta</p>
        <h1 className="fn-title">The funnel.</h1>
        <label className="fn-label" htmlFor="k">Key</label>
        <input id="k" className="fn-input" type="password" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} />
        <button className="fn-btn" type="submit" disabled={!typed.trim()}>Open</button>
        {error && <p className="fn-error">{error}</p>}
      </form>
    </main>;
  }

  return <main className="fn">
    <header className="fn-head">
      <div>
        <p className="fn-eyebrow">Poplur · beta</p>
        <h1 className="fn-title">The funnel.</h1>
      </div>
      <div className="fn-tools">
        <input className="fn-input fn-filter" placeholder="Find an email" value={filter} onChange={e => setFilter(e.target.value)} />
        <button className="fn-btn" type="button" onClick={() => load(key)} disabled={busy}>{busy ? 'Loading…' : 'Refresh'}</button>
      </div>
    </header>
    {error && <p className="fn-error">{error}</p>}
    {data && !data.configured && <p className="fn-error">The store is not configured: set FIREBASE_SERVICE_ACCOUNT on Vercel. Nothing is being recorded.</p>}
    {data && <>
      <section className="fn-totals">
        <div className="fn-total"><span className="fn-num">{data.visitors}</span><span className="fn-cap">Visitors</span></div>
        {COLUMNS.map(s => <div key={s} className="fn-total"><span className="fn-num">{data.reached[s] ?? 0}</span><span className="fn-cap">{data.labels[s] ?? s}</span></div>)}
      </section>
      <h2 className="fn-sub">Visitors</h2>
      <p className="fn-meta">Every browser the site has seen since 21 Sep, newest first. A visitor gets a name once they enter an email. Location is the connection's rough city, from Vercel; opens through a mail app's preview show as a bot.</p>
      <div className="fn-tablewrap">
        <table className="fn-table fn-vis">
          <thead><tr>
            <th className="fn-th-email">Visitor</th><th className="fn-th-left">Where</th><th className="fn-th-left">Device</th><th className="fn-th-left">From</th><th className="fn-th-left">Pages</th><th>Visits</th><th>First seen</th><th>Last seen</th>
          </tr></thead>
          <tbody>
            {visitorRows.length === 0 && <tr><td className="fn-empty" colSpan={8}>{filter ? 'No visitor matches.' : 'No visits recorded yet.'}</td></tr>}
            {visitorRows.map(v => <tr key={v.id} className="fn-row is-static" title={v.userAgent ?? ''}>
              <td className="fn-email">{v.email ? <span>{v.email}</span> : <span className="fn-anon">anonymous · {v.id.slice(0, 6)}</span>}</td>
              <td className="fn-left">{where(v)}</td>
              <td className="fn-left">{v.device}</td>
              <td className="fn-left">{from(v)}</td>
              <td className="fn-left fn-paths">{v.paths.join(' → ') || '—'}</td>
              <td>{v.visits}</td>
              <td className="fn-last" title={when(v.firstSeenAt)}>{ago(v.firstSeenAt)}</td>
              <td className="fn-last" title={when(v.lastSeenAt)}>{ago(v.lastSeenAt)}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <h2 className="fn-sub">Testers</h2>
      <p className="fn-meta">{data.testers.length} tester{data.testers.length === 1 ? '' : 's'} · as of {when(data.generatedAt)} Toronto</p>
      <div className="fn-tablewrap">
        <table className="fn-table">
          <thead><tr>
            <th className="fn-th-email">Tester</th>
            {COLUMNS.map(s => <th key={s} className="fn-th"><span>{data.labels[s] ?? s}</span></th>)}
            <th className="fn-th">Last seen</th>
          </tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td className="fn-empty" colSpan={COLUMNS.length + 2}>{filter ? 'No tester matches.' : 'No emails yet. The first entry on the landing page starts a row.'}</td></tr>}
            {rows.map(t => {
              const bad = t.stageAt.email_bounced || t.stageAt.email_complained;
              return <React.Fragment key={t.id}>
                <tr className={`fn-row${open === t.id ? ' is-open' : ''}${bad ? ' is-bad' : ''}`} onClick={() => setOpen(open === t.id ? null : t.id)}>
                  <td className="fn-email"><span>{t.email}</span>{bad && <em className="fn-flag">{t.stageAt.email_bounced ? 'bounced' : 'complained'}</em>}</td>
                  {COLUMNS.map(s => <td key={s} className={`fn-cell${t.stageAt[s] ? ' is-on' : ''}`} title={t.stageAt[s] ? when(t.stageAt[s]) : ''}>{t.stageAt[s] ? '●' : '·'}</td>)}
                  <td className="fn-last" title={when(t.lastSeenAt)}>{ago(t.lastSeenAt)}</td>
                </tr>
                {open === t.id && <tr className="fn-detail"><td colSpan={COLUMNS.length + 2}>
                  <ol className="fn-timeline">
                    {[...t.events].reverse().map((e, i) => <li key={i}>
                      <span className="fn-tl-when">{when(e.at)}</span>
                      <span className="fn-tl-stage">{data.labels[e.stage] ?? e.stage}</span>
                      {e.detail && <span className="fn-tl-detail">{Object.entries(e.detail).filter(([, v]) => v !== null && v !== '' && v !== false).map(([k, v]) => `${k}: ${String(v)}`).join(' · ')}</span>}
                    </li>)}
                  </ol>
                </td></tr>}
              </React.Fragment>;
            })}
          </tbody>
        </table>
      </div>
    </>}
  </main>;
}
