import { Asset } from 'expo-asset';
import { useLocalSearchParams } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { Platform, ScrollView } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { NDA_PARTIES, NDA_SECTIONS, NDA_SUBTITLE, NDA_SUMMARY, NDA_TITLE, NDA_VERSION, ndaCanonicalText } from '@/nda/betaTesterNda';
import { useDocumentScroll } from '@/components/useDocumentScroll';
import './../nda/nda.css';

// /nda?t=… — the beta tester agreement, signed on the site. The invite email
// carries the link; the token in it is bound to one address and signed by the
// server (server/betaNda.server.ts). Signing here is what releases the
// TestFlight and Google Play links: the page shows them, and a signed copy
// and the links email follow (api/nda+api.ts). Web only, plain DOM, like the
// landing page.
const ICON = require('@/assets/images/landing/app-icon.png');
const WORDMARK = require('@/assets/images/landing/wordmark.png');

type Check = { ok: true; email: string; version: string; discord: { connect: boolean; username: string | null } } | { ok: false; error: string };
type Signed = { signedAt: string; links: { iosUrl: string; androidUrl: string }; reportUrl?: string; discord?: { tester: 'granted' | 'pending' | 'off' | 'failed'; as: string | null }; emailed: { receipt: boolean; links: boolean; record: boolean } };

export default function NdaScreen() {
  useDocumentScroll();
  const params = useLocalSearchParams<{ t?: string; discord?: string }>();
  const token = typeof params.t === 'string' ? params.t : '';
  const [check, setCheck] = useState<Check | 'loading'>('loading');
  const [name, setName] = useState('');
  const [discord, setDiscord] = useState('');
  const [referredBy, setReferredBy] = useState('');
  const [androidEmail, setAndroidEmail] = useState('');
  const [agree, setAgree] = useState(false);
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState<Signed | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/nda?t=${encodeURIComponent(token)}`)
      .then(async r => ({ status: r.status, body: (await r.json().catch(() => ({}))) as { ok?: boolean; email?: string; version?: string; error?: string; discord?: { connect?: boolean; username?: string | null } } }))
      .then(({ body }) => { if (live) setCheck(body.ok ? { ok: true, email: body.email ?? '', version: body.version ?? NDA_VERSION, discord: { connect: !!body.discord?.connect, username: body.discord?.username ?? null } } : { ok: false, error: body.error ?? 'That signing link did not check out.' }); })
      .catch(() => { if (live) setCheck({ ok: false, error: 'Could not reach Poplur to check your link. Try again in a moment.' }); });
    return () => { live = false; };
  }, [token]);

  if (Platform.OS !== 'web') {
    return <ScrollView contentContainerStyle={{ padding: 24 }}><ThemedText>{ndaCanonicalText()}</ThemedText></ScrollView>;
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setBusy(true);
    try {
      const r = await fetch('/api/nda', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ t: token, name, discord, referredBy, androidEmail, agree, adult }) });
      const body = (await r.json().catch(() => ({}))) as Partial<Signed> & { ok?: boolean; error?: string };
      if (!r.ok || !body.ok || !body.links || !body.signedAt) throw new Error(body.error || 'Could not record your signature. Try again.');
      setSigned({ signedAt: body.signedAt, links: body.links, reportUrl: body.reportUrl, discord: body.discord, emailed: body.emailed ?? { receipt: false, links: false, record: false } });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not record your signature. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const canSign = name.trim().length >= 2 && agree && adult && !busy;

  return (
    <div className="nda">
      <div className="nda-card">
        <div className="nda-brand">
          <a href="https://www.poplur.ca"><img className="icon" src={Asset.fromModule(ICON).uri} alt="" /><img className="wordmark" src={Asset.fromModule(WORDMARK).uri} alt="Poplur" /></a>
          <span className="nda-eyebrow">{signed ? 'Signed' : 'Private beta'}</span>
        </div>

        {check === 'loading' && <div className="nda-state">Checking your link…</div>}

        {check !== 'loading' && !check.ok && (
          <div className="nda-state">
            <p>{check.error}</p>
            <p style={{ marginTop: 12 }}><a href="https://www.poplur.ca/#beta">Ask for a new invite at poplur.ca</a></p>
          </div>
        )}

        {check !== 'loading' && check.ok && signed && (
          <>
            <h1 className="nda-title">Signed. Here are your links.</h1>
            <p className="nda-done">Thank you, {name.trim()}. Your signed copy{signed.emailed.links ? ' and these links are' : ' is'} on the way to {check.email}. Install Poplur once; every beta update after that arrives through TestFlight or Google&nbsp;Play.</p>
            <div className="nda-links">
              <a className="nda-link ios" href={signed.links.iosUrl}><img src="/emails/apple-white.png" alt="" />Get Poplur for iPhone</a>
              <a className="nda-link android" href={signed.links.androidUrl}><img src="/emails/android-white.png" alt="" />Get Poplur for Android</a>
            </div>
            {signed.discord?.tester === 'granted' && (
              <div className="nda-for" style={{ marginTop: 18 }}><b>Discord.</b> @{signed.discord.as} now has the Tester role: #focus-group, #bugs and the voice chats are open to you.</div>
            )}
            {signed.discord?.tester === 'pending' && (
              <div className="nda-for" style={{ marginTop: 18 }}><b>Discord.</b> We could not find @{discord.trim()} in the beta server yet. Join it from your invite email and the Tester role lands on its own within a few minutes.</div>
            )}
            {signed.reportUrl && (
              <div className="nda-for" style={{ marginTop: 18 }}>
                <b>Your test reports.</b> Three short reports over the beta, five minutes apiece, due Sat 17, 24 and 31 Oct. <a href={signed.reportUrl} style={{ color: 'inherit', fontWeight: 600 }}>Open your report page</a> — it is also in your links email.
              </div>
            )}
            <p className="nda-note">Signed {new Date(signed.signedAt).toLocaleString()} · agreement version {check.version}.</p>
          </>
        )}

        {check !== 'loading' && check.ok && !signed && (
          <>
            <h1 className="nda-title">{NDA_TITLE}</h1>
            <p className="nda-sub">{NDA_SUBTITLE}</p>
            <div className="nda-for">This link was issued to <b>{check.email}</b>. Signing below records your name against that address, and your beta links unlock the moment you do.</div>
            <p className="nda-lead">{NDA_PARTIES}</p>
            <div className="nda-summary"><b>Plain-language summary</b> (the sections below are what count): {NDA_SUMMARY}</div>

            <div className="nda-doc">
              {NDA_SECTIONS.map(section => (
                <section key={section.heading}>
                  <h3>{section.heading}</h3>
                  {section.blocks.map((block, i) => 'text' in block
                    ? <p key={i}>{block.text}</p>
                    : <ul key={i}>{block.bullets.map(b => <li key={b}>{b}</li>)}</ul>)}
                </section>
              ))}
              <p className="nda-version">Version {check.version}.</p>
            </div>

            <form className="nda-sign" onSubmit={submit}>
              <h2>Sign</h2>
              <p>Your typed full name is your signature. We record it with your email address, the time, and the version of the agreement, and email you a signed copy.</p>
              <label className="nda-field"><span>Full name</span><input type="text" autoComplete="name" value={name} onChange={e => setName(e.target.value)} disabled={busy} placeholder="First and last name" required /></label>
              {check.discord.connect && (
                <div className="nda-discord">
                  {check.discord.username
                    ? <p><b>Discord connected:</b> @{check.discord.username}. The Tester role is yours the moment you sign.</p>
                    : <p><a className="nda-connect" href={`/api/discord/connect?t=${encodeURIComponent(token)}`}>Connect Discord</a><span>so the Tester role lands the moment you sign — no username to type. {params.discord === 'denied' ? 'You cancelled on Discord; you can try again or type your username below.' : params.discord === 'failed' ? 'Discord did not answer; try again or type your username below.' : ''}</span></p>}
                </div>
              )}
              {!check.discord.username && (
                <label className="nda-field"><span>Discord username{check.discord.connect ? ' (if you did not connect)' : ' (optional)'}</span><input type="text" autoComplete="off" value={discord} onChange={e => setDiscord(e.target.value)} disabled={busy} placeholder="Your Discord username, so you get the Tester role" /></label>
              )}
              <label className="nda-field"><span>Referred by (optional)</span><input type="text" autoComplete="off" value={referredBy} onChange={e => setReferredBy(e.target.value)} disabled={busy} placeholder="The Discord username of whoever invited you" /></label>
              <label className="nda-field"><span>Google account email for Android (optional)</span><input type="email" autoComplete="off" inputMode="email" value={androidEmail} onChange={e => setAndroidEmail(e.target.value)} disabled={busy} placeholder="The Google account on your Android phone, so we can add you to the test" /></label>
              <label className="nda-field"><span>Email</span><input type="text" value={check.email} disabled readOnly /></label>
              <label className="nda-check"><input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} disabled={busy} /><span>I have read this agreement and I agree to it.</span></label>
              <label className="nda-check"><input type="checkbox" checked={adult} onChange={e => setAdult(e.target.checked)} disabled={busy} /><span>I am at least 18 years old.</span></label>
              <button type="submit" className="nda-cta" disabled={!canSign}>{busy ? 'Signing…' : 'Sign and unlock my links'}</button>
              {error && <p className="nda-note err">{error}</p>}
            </form>
          </>
        )}
      </div>
    </div>
  );
}
