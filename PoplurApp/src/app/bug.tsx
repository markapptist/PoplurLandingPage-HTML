import { Asset } from 'expo-asset';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Platform, ScrollView } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  BUG_AREAS, BUG_FREQUENCIES, BUG_IMPACTS, BUG_MAX_SHOTS, BUG_PLATFORM_LABEL,
  BUG_SHOT_MAX_EDGE, BUG_SHOT_QUALITY,
  type BugArea, type BugFrequency, type BugImpact, type BugPlatform, type BugShot,
} from '@/bugs/bugReport';
import { useDocumentScroll } from '@/components/useDocumentScroll';
import './../bugs/bug.css';

// /bug?t=… — one bug, with screenshots, from a tester's phone.
//
// It is here rather than in a Google Form because Google makes anyone
// attaching a file sign in to a Google account, and a tester on an iPhone has
// no reason to have one. The link in the beta email carries the same token the
// report page uses, so a report arrives bound to the address that signed the
// agreement; the pinned link has none and then we ask for that address.
//
// Screenshots are shrunk in the browser before they are sent: a phone shot is
// three or four megabytes, which no serverless request should carry, and a
// 1400px JPEG shows a broken screen just as clearly.
const ICON = require('@/assets/images/landing/app-icon.png');
const WORDMARK = require('@/assets/images/landing/wordmark.png');

type Identity = { name: string; email: string; discord: string; platform: BugPlatform | ''; device: string; osVersion: string; appVersion: string };
type Filed = { receivedAt: string; shots: number };

const IDENTITY_KEY = 'poplur-bug-identity-v1';
const emptyIdentity = (): Identity => ({ name: '', email: '', discord: '', platform: '', device: '', osVersion: '', appVersion: '' });

function readIdentity(): Identity {
  try {
    const raw = window.localStorage.getItem(IDENTITY_KEY);
    return raw ? { ...emptyIdentity(), ...(JSON.parse(raw) as Identity) } : emptyIdentity();
  } catch { return emptyIdentity(); }
}

/** A phone screenshot, shrunk to something an email can carry. */
async function shrink(file: File): Promise<BugShot> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('That file did not open as a picture.'));
      img.src = url;
    });
    const scale = Math.min(1, BUG_SHOT_MAX_EDGE / Math.max(image.width, image.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the screenshot.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', BUG_SHOT_QUALITY);
    const base = (file.name || 'screenshot').replace(/\.[^.]+$/, '');
    return { name: `${base}.jpg`, type: 'image/jpeg', dataUrl };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export default function BugScreen() {
  useDocumentScroll();
  const params = useLocalSearchParams<{ t?: string }>();
  const token = typeof params.t === 'string' ? params.t : '';
  const [identity, setIdentity] = useState<Identity>(emptyIdentity);
  const [area, setArea] = useState<BugArea | ''>('');
  const [doing, setDoing] = useState('');
  const [expected, setExpected] = useState('');
  const [happened, setHappened] = useState('');
  const [frequency, setFrequency] = useState<BugFrequency | ''>('');
  const [impact, setImpact] = useState<BugImpact | ''>('');
  const [extra, setExtra] = useState('');
  const [shots, setShots] = useState<BugShot[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filed, setFiled] = useState<Filed | null>(null);
  const picker = useRef<HTMLInputElement | null>(null);

  // Read on the first paint rather than in an effect body: the page is
  // prerendered on the server, where there is no storage, so it has to hydrate
  // to the same empty form and fill in from the device afterwards.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => setIdentity(readIdentity()));
    return () => window.cancelAnimationFrame(id);
  }, []);
  useEffect(() => {
    try { window.localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity)); } catch { /* private window */ }
  }, [identity]);

  if (Platform.OS !== 'web') {
    return <ScrollView contentContainerStyle={{ padding: 24 }}><ThemedText>Open poplur.ca/bug in a browser to report a bug.</ThemedText></ScrollView>;
  }

  const field = (k: keyof Identity) => (e: React.ChangeEvent<HTMLInputElement>) => setIdentity(i => ({ ...i, [k]: e.target.value }));

  const addFiles = async (files: FileList | null) => {
    if (!files || !files.length) return;
    setError(null);
    const room = BUG_MAX_SHOTS - shots.length;
    const chosen = Array.from(files).slice(0, Math.max(0, room));
    try {
      const next = await Promise.all(chosen.map(shrink));
      setShots(current => [...current, ...next].slice(0, BUG_MAX_SHOTS));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That screenshot could not be attached.');
    }
  };

  const identityDone = identity.name.trim().length >= 2
    && (token !== '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email.trim()))
    && !!identity.platform && identity.device.trim() !== '' && identity.osVersion.trim() !== '';
  const bugDone = !!area && !!frequency && !!impact && doing.trim() !== '' && expected.trim() !== '' && happened.trim() !== '';
  const canSend = identityDone && bugDone && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch('/api/bug', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          t: token || undefined,
          email: token ? undefined : identity.email,
          name: identity.name, discord: identity.discord,
          platform: identity.platform, device: identity.device, osVersion: identity.osVersion, appVersion: identity.appVersion,
          area, doing, expected, happened, frequency, impact, extra,
          shots,
        }),
      });
      const body = (await r.json().catch(() => ({}))) as { ok?: boolean; error?: string; receivedAt?: string; shots?: number };
      if (!r.ok || !body.ok || !body.receivedAt) throw new Error(body.error || 'Could not send your report. Try again.');
      setFiled({ receivedAt: body.receivedAt, shots: body.shots ?? shots.length });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send your report. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const another = () => {
    setFiled(null); setArea(''); setDoing(''); setExpected(''); setHappened('');
    setFrequency(''); setImpact(''); setExtra(''); setShots([]); setError(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="bg">
      <div className="bg-card">
        <div className="bg-brand">
          <a href="https://www.poplur.ca"><img className="icon" src={Asset.fromModule(ICON).uri} alt="" /><img className="wordmark" src={Asset.fromModule(WORDMARK).uri} alt="Poplur" /></a>
          <span className="bg-eyebrow">{filed ? 'Received' : 'Report a bug'}</span>
        </div>

        {filed ? (
          <>
            <h1 className="bg-title">Got it — thank you.</h1>
            <p className="bg-done">Your report{filed.shots ? ` and ${filed.shots} screenshot${filed.shots === 1 ? '' : 's'} are` : ' is'} with us, and a copy is on its way to your inbox. A confirmed bug is worth five points on the board, and the first person to report one gets them.</p>
            <p className="bg-done" style={{ marginTop: 14 }}>Found another? One report per bug is easier to fix than one long list.</p>
            <button type="button" className="bg-again" onClick={another}>Report another bug</button>
            <p className="bg-note">Received {new Date(filed.receivedAt).toLocaleString()}.</p>
          </>
        ) : (
          <form onSubmit={submit}>
            <h1 className="bg-title">Something broke?</h1>
            <p className="bg-sub">One bug per report, with a screenshot if you have one. A blunt sentence is worth more than a tidy paragraph, and duplicates are fine — we would rather hear it twice than not at all.</p>
            {token
              ? <div className="bg-for">This is your own link, so the report is filed against the address you signed with. Nothing else to prove.</div>
              : <div className="bg-for">No personal link? Use the <b>email you signed the tester agreement with</b> below, so the points reach you.</div>}

            <div className="bg-section">
              <h2>You and your phone</h2>
              <p>Saved on this device, so the next bug takes ten seconds.</p>
              <div className="bg-grid">
                <label className="bg-field"><span>Your name</span><input type="text" autoComplete="name" value={identity.name} onChange={field('name')} disabled={busy} placeholder="As on your tester agreement" required /></label>
                {!token && <label className="bg-field"><span>Email</span><input type="email" autoComplete="email" value={identity.email} onChange={field('email')} disabled={busy} placeholder="The one you signed with" required /></label>}
                <label className="bg-field"><span>Discord username</span><input type="text" value={identity.discord} onChange={field('discord')} disabled={busy} placeholder="So we can ask a follow-up" /></label>
                <label className="bg-field"><span>Phone</span>
                  <div className="bg-seg">
                    {(Object.keys(BUG_PLATFORM_LABEL) as BugPlatform[]).map(p => (
                      <button type="button" key={p} className={identity.platform === p ? 'on' : ''} onClick={() => setIdentity(i => ({ ...i, platform: p }))} disabled={busy}>{BUG_PLATFORM_LABEL[p]}</button>
                    ))}
                  </div>
                </label>
                <label className="bg-field"><span>Model</span><input type="text" value={identity.device} onChange={field('device')} disabled={busy} placeholder="iPhone 13, Pixel 7…" required /></label>
                <label className="bg-field"><span>OS version</span><input type="text" value={identity.osVersion} onChange={field('osVersion')} disabled={busy} placeholder="iOS 18.6 · Android 14" required /></label>
                <label className="bg-field"><span>App version</span><input type="text" value={identity.appVersion} onChange={field('appVersion')} disabled={busy} placeholder="Optional — TestFlight or Play shows it" /></label>
              </div>
            </div>

            <div className="bg-section">
              <h2>The bug</h2>
              <p>Write it the way you would tell a friend.</p>
              <label className="bg-q"><span>Where in the app?</span>
                <select value={area} onChange={e => setArea(e.target.value as BugArea)} disabled={busy} required style={{ marginTop: 8 }}>
                  <option value="">Choose one…</option>
                  {BUG_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </label>
              <label className="bg-q"><span>What were you doing?</span><em>The steps that got you there, as far as you remember.</em>
                <textarea value={doing} onChange={e => setDoing(e.target.value)} disabled={busy} maxLength={2000} required />
              </label>
              <label className="bg-q"><span>What did you expect to happen?</span>
                <textarea value={expected} onChange={e => setExpected(e.target.value)} disabled={busy} maxLength={2000} required />
              </label>
              <label className="bg-q"><span>What happened instead?</span><em>Include any message the app showed you, word for word if you can.</em>
                <textarea value={happened} onChange={e => setHappened(e.target.value)} disabled={busy} maxLength={2000} required />
              </label>
              <label className="bg-q"><span>How often does it happen?</span>
                <div className="bg-seg">
                  {BUG_FREQUENCIES.map(f => <button type="button" key={f} className={frequency === f ? 'on' : ''} onClick={() => setFrequency(f)} disabled={busy}>{f}</button>)}
                </div>
              </label>
              <label className="bg-q"><span>Could you carry on using the app?</span>
                <div className="bg-seg">
                  {BUG_IMPACTS.map(i => <button type="button" key={i} className={impact === i ? 'on' : ''} onClick={() => setImpact(i)} disabled={busy}>{i}</button>)}
                </div>
              </label>
            </div>

            <div className="bg-section">
              <h2>Screenshots</h2>
              <p>Up to {BUG_MAX_SHOTS}. They are shrunk here before they are sent, so a slow connection is fine. No sign-in, no account.</p>
              <div className="bg-shots">
                {shots.map((shot, i) => (
                  <div className="bg-shot" key={`${shot.name}-${i}`}>
                    <img src={shot.dataUrl} alt={`Screenshot ${i + 1}`} />
                    <button type="button" aria-label={`Remove screenshot ${i + 1}`} onClick={() => setShots(s => s.filter((_, index) => index !== i))} disabled={busy}>×</button>
                  </div>
                ))}
                {shots.length < BUG_MAX_SHOTS && (
                  <button type="button" className="bg-add" onClick={() => picker.current?.click()} disabled={busy}>
                    <span style={{ fontSize: 22 }}>+</span>
                    <span>Add a screenshot</span>
                  </button>
                )}
              </div>
              <input ref={picker} type="file" accept="image/*" multiple hidden onChange={e => { void addFiles(e.target.files); e.target.value = ''; }} />
              <label className="bg-q"><span>Anything else?</span><em>The time it happened, what you were connected to, whether anyone else saw it.</em>
                <textarea value={extra} onChange={e => setExtra(e.target.value)} disabled={busy} maxLength={2000} />
              </label>
            </div>

            <button type="submit" className="bg-cta" disabled={!canSend}>{busy ? 'Sending…' : 'Send this bug'}</button>
            {!canSend && !busy && <p className="bg-note">{!identityDone ? 'Fill in your name, phone, model and OS version first.' : 'Answer the three questions about the bug, and say where, how often and whether you could carry on.'}</p>}
            {error && <p className="bg-note err">{error}</p>}
          </form>
        )}
      </div>
    </div>
  );
}
