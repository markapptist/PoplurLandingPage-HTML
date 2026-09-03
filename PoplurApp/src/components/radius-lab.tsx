import { createElement, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import {
  coverageKm2,
  coverageShare,
  dropRadiusLabPin,
  formatKm,
  formatKm2,
  RADIUS_LAB_MAX_METERS,
  RADIUS_LAB_VIEWER,
  readRadiusLabState,
  removeRadiusLabPin,
  setRadiusLabRadius,
  subscribeRadiusLab,
  type RadiusLabLink,
  type RadiusLabState,
} from '@/services/radiusLab';

/**
 * Radius Lab — drop one synthetic pin (a real public post) on the production
 * map and grow or shrink its radius by hand. The Poplur map paints a post's
 * radius as clay territory, so every change here wraps more terrain or lets
 * it go, live, on 127.0.0.1:5173 and on every device that has the map open.
 */

const SLIDER_MIN_METERS = 100;
const SLIDER_STEPS = 1_000;
const WRITE_DEBOUNCE_MS = 180;
const KM = 1_000;

const STEP_ROWS: { label: string; steps: number[] }[] = [
  { label: 'SHRINK', steps: [-1_000 * KM, -100 * KM, -25 * KM, -5 * KM, -1 * KM, -0.5 * KM] },
  { label: 'GROW', steps: [0.5 * KM, 1 * KM, 5 * KM, 25 * KM, 100 * KM, 1_000 * KM] },
];

const PRESETS: { label: string; meters: number }[] = [
  { label: '500 m', meters: 500 },
  { label: '1 km', meters: 1 * KM },
  { label: '5 km', meters: 5 * KM },
  { label: '25 km', meters: 25 * KM },
  { label: '100 km', meters: 100 * KM },
  { label: '1,000 km', meters: 1_000 * KM },
  { label: '5,000 km', meters: 5_000 * KM },
  { label: 'PLANET', meters: RADIUS_LAB_MAX_METERS },
];

/** How far a radius has conquered, in the map's own terms. */
const CONQUEST_LADDER: { label: string; meters: number; note: string }[] = [
  { label: 'Block', meters: 500, note: 'a few streets of clay' },
  { label: 'Neighbourhood', meters: 5 * KM, note: 'the ground you can walk' },
  { label: 'City', meters: 25 * KM, note: 'the biggest claim a post can earn' },
  { label: 'Region', meters: 250 * KM, note: 'held ground reads from the sky' },
  { label: 'Country', meters: 1_500 * KM, note: 'a coloured patch on the globe' },
  { label: 'Continent', meters: 4_000 * KM, note: 'continents merge into one takeover' },
  { label: 'Planet', meters: RADIUS_LAB_MAX_METERS, note: 'the whole world in one colour' },
];

const PLACES: { label: string; latitude: number; longitude: number }[] = [
  { label: 'Map viewer · Toronto', latitude: RADIUS_LAB_VIEWER.latitude, longitude: RADIUS_LAB_VIEWER.longitude },
  { label: '5 km north', latitude: RADIUS_LAB_VIEWER.latitude + 5_000 / 111_320, longitude: RADIUS_LAB_VIEWER.longitude },
  { label: '25 km east', latitude: RADIUS_LAB_VIEWER.latitude, longitude: RADIUS_LAB_VIEWER.longitude + 25_000 / (111_320 * Math.cos((RADIUS_LAB_VIEWER.latitude * Math.PI) / 180)) },
];

const sliderToMeters = (value: number): number => {
  const ratio = Math.max(0, Math.min(1, value / SLIDER_STEPS));
  return Math.round(SLIDER_MIN_METERS * (RADIUS_LAB_MAX_METERS / SLIDER_MIN_METERS) ** ratio);
};

const metersToSlider = (meters: number): number => {
  if (meters <= SLIDER_MIN_METERS) return 0;
  const ratio = Math.log(meters / SLIDER_MIN_METERS) / Math.log(RADIUS_LAB_MAX_METERS / SLIDER_MIN_METERS);
  return Math.round(Math.max(0, Math.min(1, ratio)) * SLIDER_STEPS);
};

const clampMeters = (meters: number): number => Math.round(Math.max(0, Math.min(RADIUS_LAB_MAX_METERS, meters)));

const ago = (time: number) => !time ? '—' : Date.now() - time < 8_000 ? 'just now' : Date.now() - time < 3_600_000 ? `${Math.round((Date.now() - time) / 60_000)}m ago` : `${Math.round((Date.now() - time) / 3_600_000)}h ago`;

const fixed = (value: number, digits = 5) => value.toFixed(digits).replace(/\.?0+$/, '');

/** A native range input. The desk is a web page; on any other platform the
 *  step buttons and presets carry the whole job. */
function WebRange({ value, onInput, onCommit, disabled }: { value: number; onInput: (value: number) => void; onCommit: () => void; disabled: boolean }) {
  if (Platform.OS !== 'web') return null;
  return createElement('input', {
    type: 'range',
    min: 0,
    max: SLIDER_STEPS,
    step: 1,
    value,
    disabled,
    'aria-label': 'Pin radius',
    onChange: (event: { target: { value: string } }) => onInput(Number(event.target.value)),
    onMouseUp: onCommit,
    onTouchEnd: onCommit,
    onKeyUp: onCommit,
    style: { width: '100%', height: 28, accentColor: '#ff2f91', cursor: disabled ? 'not-allowed' : 'pointer' },
  });
}

function Chip({ label, onPress, active = false, disabled = false, tone = 'plain' }: { label: string; onPress: () => void; active?: boolean; disabled?: boolean; tone?: 'plain' | 'grow' | 'shrink' | 'danger' }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ selected: active, disabled }} disabled={disabled} onPress={onPress} style={[styles.chip, tone === 'grow' && styles.chipGrow, tone === 'shrink' && styles.chipShrink, tone === 'danger' && styles.chipDanger, active && styles.chipActive, disabled && styles.chipDisabled]}><Text style={[styles.chipText, tone === 'grow' && styles.chipTextGrow, tone === 'shrink' && styles.chipTextShrink, active && styles.chipTextActive]}>{label}</Text></Pressable>;
}

export default function RadiusLab() {
  const [state, setState] = useState<RadiusLabState | null>(null);
  const [link, setLink] = useState<RadiusLabLink>('connecting');
  const [busy, setBusy] = useState<'drop' | 'radius' | 'remove' | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [latitudeText, setLatitudeText] = useState(fixed(RADIUS_LAB_VIEWER.latitude));
  const [longitudeText, setLongitudeText] = useState(fixed(RADIUS_LAB_VIEWER.longitude));
  const [exactKmText, setExactKmText] = useState('');
  const [pendingMeters, setPendingMeters] = useState<number | null>(null);
  const [, setClock] = useState(0);
  const writeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const writeGeneration = useRef(0);
  /** The radius the desk has asked for but Firestore has not confirmed yet.
   *  Mirrored into `pendingMeters` for rendering; the ref is only touched in
   *  handlers and callbacks. */
  const pendingRef = useRef<number | null>(null);
  const seenPinRef = useRef<string | null>(null);

  const pin = state?.pin ?? null;
  const liveMeters = pin?.radiusMeters ?? 0;
  const shownMeters = pendingMeters ?? liveMeters;
  const sliderValue = metersToSlider(shownMeters);
  const area = useMemo(() => coverageKm2(shownMeters), [shownMeters]);
  const share = useMemo(() => coverageShare(shownMeters), [shownMeters]);

  /** Take a lab state from the server. A pin the desk has not seen yet (a drop
   *  from another desk tab, or the page opening onto a standing pin) also
   *  fills the location fields so "move" starts from where the pin is. */
  const absorb = useCallback((next: RadiusLabState) => {
    setState(next);
    setNotice(null);
    const id = next.pin?.postId ?? null;
    if (next.pin && id !== seenPinRef.current) {
      setLatitudeText(fixed(next.pin.latitude));
      setLongitudeText(fixed(next.pin.longitude));
    }
    seenPinRef.current = id;
  }, []);

  const setPending = useCallback((meters: number | null) => {
    pendingRef.current = meters;
    setPendingMeters(meters);
  }, []);

  useEffect(() => {
    let cancelled = false;
    readRadiusLabState().then(next => { if (!cancelled) absorb(next); }).catch(error => { if (!cancelled) setNotice(error instanceof Error ? error.message : 'The radius lab is unavailable.'); });
    const stop = subscribeRadiusLab(next => { if (!cancelled) absorb(next); }, setLink);
    const tick = setInterval(() => setClock(value => value + 1), 5_000);
    return () => { cancelled = true; stop(); clearInterval(tick); clearTimeout(writeTimer.current); };
  }, [absorb]);

  const commitRadius = useCallback(async (meters: number) => {
    const generation = ++writeGeneration.current;
    setBusy('radius');
    try {
      const next = await setRadiusLabRadius(meters);
      if (generation !== writeGeneration.current) return;
      absorb(next);
      if (pendingRef.current === meters) setPending(null);
    } catch (error) {
      if (generation === writeGeneration.current) {
        setNotice(error instanceof Error ? error.message : 'The radius write failed.');
        setPending(null);
      }
    } finally {
      if (generation === writeGeneration.current) setBusy(null);
    }
  }, [absorb, setPending]);

  const queueRadius = useCallback((meters: number) => {
    const next = clampMeters(meters);
    setPending(next);
    clearTimeout(writeTimer.current);
    writeTimer.current = setTimeout(() => { void commitRadius(next); }, WRITE_DEBOUNCE_MS);
  }, [commitRadius, setPending]);

  const flushRadius = useCallback(() => {
    if (pendingRef.current == null) return;
    clearTimeout(writeTimer.current);
    void commitRadius(pendingRef.current);
  }, [commitRadius]);

  const drop = useCallback(async () => {
    const latitude = Number(latitudeText);
    const longitude = Number(longitudeText);
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90 || !Number.isFinite(longitude) || Math.abs(longitude) > 180) {
      setNotice('Latitude must be within ±90 and longitude within ±180.');
      return;
    }
    setBusy('drop');
    try {
      const next = await dropRadiusLabPin({ latitude, longitude, radiusMeters: pin ? liveMeters : 1 * KM });
      setPending(null);
      absorb(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The pin could not be dropped.');
    } finally {
      setBusy(null);
    }
  }, [absorb, latitudeText, longitudeText, liveMeters, pin, setPending]);

  const remove = useCallback(async () => {
    setBusy('remove');
    try {
      const next = await removeRadiusLabPin();
      setPending(null);
      absorb(next);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The pin could not be removed.');
    } finally {
      setBusy(null);
    }
  }, [absorb, setPending]);

  const applyExact = useCallback(() => {
    const km = Number(exactKmText.replace(/,/g, ''));
    if (!Number.isFinite(km) || km < 0) { setNotice('Enter the radius in kilometres.'); return; }
    queueRadius(km * KM);
    setExactKmText('');
  }, [exactKmText, queueRadius]);

  const controlsLocked = !pin || busy === 'drop' || busy === 'remove';
  const fillWidth: `${number}%` = `${Math.max(1, (sliderValue / SLIDER_STEPS) * 100)}%`;
  const linkLabel = link === 'live' ? 'LAB LINK LIVE' : link === 'connecting' ? 'LAB LINK CONNECTING' : 'LAB OFFLINE · node scripts/radius-lab-server.mjs';
  const conquered = CONQUEST_LADDER.filter(rung => shownMeters >= rung.meters).length;

  return <View style={styles.card}>
    <View style={styles.heading}><View style={styles.flex}><Text style={styles.kicker}>RADIUS LAB · LIVE ON THE POPLUR MAP</Text><Text style={styles.title}>How the radius conquers the map</Text><Text style={styles.copy}>Drop one synthetic pin as a real public post, then grow or shrink its radius. The map at 127.0.0.1:5173 and every device repaint the clay territory from the same Firestore document within a second: a larger radius wraps more terrain, a smaller one releases it.</Text></View><View style={[styles.linkBadge, link === 'live' ? styles.linkLive : link === 'connecting' ? styles.linkConnecting : styles.linkOffline]}><Text style={styles.linkText}>{linkLabel}</Text></View></View>

    {!!notice && <Text style={styles.notice}>{notice}</Text>}

    <View style={styles.columns}>
      <View style={styles.panel}>
        <Text style={styles.panelKicker}>1 · THE PIN</Text>
        <Text style={styles.panelTitle}>{pin ? `Standing at ${fixed(pin.latitude, 4)}, ${fixed(pin.longitude, 4)}` : 'No lab pin on the map'}</Text>
        <Text style={styles.panelCopy}>{pin ? `posts/${pin.postId} · @${pin.username} · dropped ${ago(pin.createdAtMs)} · ${pin.viewCount} views · ${pin.likeCount} likes` : 'The browser map reads from a fixed Toronto viewer, so a pin dropped on the viewer is in reach even at 0 m.'}</Text>
        {!!pin && !pin.hasMedia && <Text style={styles.invalid}>NOT A VALID POP · this pin carries no media. A post needs media and something to say. Remove it and drop again.</Text>}
        {!!pin && pin.hasMedia && <Text style={styles.valid}>VALID POP · {pin.mediaType || 'media'} attached{pin.caption ? ' · captioned' : ' · NO CAPTION'}</Text>}
        <View style={styles.chips}>{PLACES.map(place => <Chip key={place.label} label={place.label} active={latitudeText === fixed(place.latitude) && longitudeText === fixed(place.longitude)} onPress={() => { setLatitudeText(fixed(place.latitude)); setLongitudeText(fixed(place.longitude)); }} />)}</View>
        <View style={styles.fields}>
          <View style={styles.field}><Text style={styles.fieldLabel}>LATITUDE</Text><TextInput accessibilityLabel="Pin latitude" value={latitudeText} onChangeText={setLatitudeText} keyboardType="decimal-pad" inputMode="decimal" style={styles.input} /></View>
          <View style={styles.field}><Text style={styles.fieldLabel}>LONGITUDE</Text><TextInput accessibilityLabel="Pin longitude" value={longitudeText} onChangeText={setLongitudeText} keyboardType="decimal-pad" inputMode="decimal" style={styles.input} /></View>
        </View>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" disabled={busy != null} onPress={() => { void drop(); }} style={[styles.primary, busy != null && styles.chipDisabled]}><Text style={styles.primaryText}>{busy === 'drop' ? (pin ? 'MOVING…' : 'DROPPING…') : pin ? 'MOVE PIN HERE' : 'DROP PIN (POST)'}</Text></Pressable>
          {!!pin && <Chip label={busy === 'remove' ? 'REMOVING…' : 'REMOVE PIN'} tone="danger" disabled={busy != null} onPress={() => { void remove(); }} />}
        </View>
      </View>

      <View style={[styles.panel, styles.radiusPanel]}>
        <Text style={styles.panelKicker}>2 · THE RADIUS</Text>
        <View style={styles.readout}>
          <View style={styles.flex}><Text style={styles.readoutValue}>{formatKm(shownMeters)}</Text><Text style={styles.readoutMeta}>{pendingMeters != null && pendingMeters !== liveMeters ? `writing… map still holds ${formatKm(liveMeters)}` : pin ? `Firestore radiusMeters ${Math.round(liveMeters).toLocaleString()} · updated ${ago(pin.updatedAtMs)}` : 'drop a pin to start'}</Text></View>
          <View style={styles.coverage}><Text style={styles.coverageValue}>{formatKm2(area)}</Text><Text style={styles.coverageMeta}>{share >= 0.0001 ? `${(share * 100).toFixed(share >= 0.1 ? 1 : 3)}% of the planet` : 'of terrain wrapped'}</Text></View>
        </View>
        <View style={styles.track}><View style={[styles.fill, { width: fillWidth }]} /></View>
        <WebRange value={sliderValue} disabled={controlsLocked} onInput={value => queueRadius(sliderToMeters(value))} onCommit={flushRadius} />
        {STEP_ROWS.map(row => <View key={row.label} style={styles.stepRow}><Text style={[styles.stepLabel, row.label === 'GROW' ? styles.chipTextGrow : styles.chipTextShrink]}>{row.label}</Text><View style={styles.chips}>{row.steps.map(step => <Chip key={step} tone={step > 0 ? 'grow' : 'shrink'} disabled={controlsLocked || (step < 0 && shownMeters <= 0) || (step > 0 && shownMeters >= RADIUS_LAB_MAX_METERS)} label={`${step > 0 ? '+' : '−'}${formatKm(Math.abs(step))}`} onPress={() => queueRadius(shownMeters + step)} />)}</View></View>)}
        <View style={styles.stepRow}><Text style={styles.stepLabel}>JUMP</Text><View style={styles.chips}>{PRESETS.map(preset => <Chip key={preset.label} label={preset.label} active={Math.abs(shownMeters - preset.meters) < 1} disabled={controlsLocked} onPress={() => queueRadius(preset.meters)} />)}</View></View>
        <View style={styles.exactRow}><Text style={styles.stepLabel}>EXACT</Text><TextInput accessibilityLabel="Exact radius in kilometres" value={exactKmText} onChangeText={setExactKmText} onSubmitEditing={applyExact} placeholder="km" placeholderTextColor="#8f6a80" keyboardType="decimal-pad" inputMode="decimal" editable={!controlsLocked} style={[styles.input, styles.exactInput]} /><Chip label="SET" disabled={controlsLocked || !exactKmText.trim()} onPress={applyExact} /></View>
      </View>
    </View>

    <View style={styles.ladder}>
      <Text style={styles.panelKicker}>CONQUEST · {conquered} OF {CONQUEST_LADDER.length}</Text>
      <View style={styles.rungs}>{CONQUEST_LADDER.map((rung, index) => { const held = shownMeters >= rung.meters; const next = !held && (index === 0 || shownMeters >= CONQUEST_LADDER[index - 1].meters); return <View key={rung.label} style={[styles.rung, held && styles.rungHeld, next && styles.rungNext]}><Text style={[styles.rungLabel, held && styles.rungLabelHeld]}>{held ? '● ' : '○ '}{rung.label.toUpperCase()}</Text><Text style={styles.rungMeta}>{formatKm(rung.meters)} · {rung.note}</Text></View>; })}</View>
    </View>
  </View>;
}

const styles = StyleSheet.create({
  card: { gap: 14, padding: 18, borderWidth: 2, borderColor: '#ff4aa3', borderRadius: 24, backgroundColor: 'rgba(18,4,13,.97)', boxShadow: '0 18px 48px rgba(255,19,126,.18)' },
  heading: { flexDirection: 'row', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start', justifyContent: 'space-between' },
  flex: { flex: 1, minWidth: 240, gap: 4 },
  kicker: { color: '#ff4aa3', fontSize: 10, fontWeight: '900', letterSpacing: 1.6 },
  title: { color: '#fff8fc', fontSize: 25, fontWeight: '900' },
  copy: { color: '#d5a7bf', fontSize: 12, lineHeight: 18, maxWidth: 720 },
  linkBadge: { minWidth: 140, paddingHorizontal: 12, paddingVertical: 8, alignItems: 'center', borderRadius: 999, borderWidth: 1 },
  linkLive: { backgroundColor: 'rgba(28,119,79,.35)', borderColor: '#62f1aa' },
  linkConnecting: { backgroundColor: 'rgba(39,102,135,.38)', borderColor: '#8fddff' },
  linkOffline: { backgroundColor: 'rgba(99,72,91,.38)', borderColor: '#aa8097' },
  linkText: { color: '#fff', fontSize: 9, fontWeight: '900', letterSpacing: 1, textAlign: 'center' },
  notice: { color: '#ffe8f3', backgroundColor: '#59132f', borderRadius: 12, padding: 12, fontSize: 12 },
  columns: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'stretch' },
  panel: { flexGrow: 1, flexShrink: 1, flexBasis: 340, minWidth: 0, gap: 10, padding: 14, borderRadius: 18, backgroundColor: '#210a19', borderWidth: 1, borderColor: '#652944' },
  radiusPanel: { flexBasis: 460, borderColor: '#8a2f5c' },
  panelKicker: { color: '#ff62aa', fontSize: 8, fontWeight: '900', letterSpacing: .9 },
  panelTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
  panelCopy: { color: '#b98ca4', fontSize: 10, lineHeight: 15 },
  invalid: { color: '#ffd7e5', fontSize: 10, fontWeight: '900', lineHeight: 15, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 9, borderLeftWidth: 3, borderLeftColor: '#ff5c95', backgroundColor: 'rgba(120,14,50,.6)' },
  valid: { color: '#9df3cd', fontSize: 9, fontWeight: '900', letterSpacing: .7 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, flexShrink: 1 },
  chip: { minWidth: 58, alignItems: 'center', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 11, borderWidth: 1, borderColor: '#79506c', backgroundColor: '#2a1725' },
  chipGrow: { borderColor: '#2f7f5a', backgroundColor: '#0f3427' },
  chipShrink: { borderColor: '#8a3552', backgroundColor: '#3a1224' },
  chipDanger: { borderColor: '#ff6f9d', backgroundColor: '#5a0f2c' },
  chipActive: { borderColor: '#8fddff', backgroundColor: '#174760' },
  chipDisabled: { opacity: .38 },
  chipText: { color: '#d8b8c8', fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  chipTextGrow: { color: '#6ff5b0' },
  chipTextShrink: { color: '#ff9ebf' },
  chipTextActive: { color: '#dff7ff' },
  fields: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  field: { flexGrow: 1, flexBasis: 140, gap: 4 },
  fieldLabel: { color: '#bf829f', fontSize: 8, fontWeight: '900', letterSpacing: .9 },
  input: { color: '#fff', fontSize: 13, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: '#612542', backgroundColor: '#1d0814' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  primary: { minWidth: 170, alignItems: 'center', paddingHorizontal: 16, paddingVertical: 11, borderRadius: 13, borderWidth: 2, borderColor: '#ff8ac5', backgroundColor: '#ff2f91' },
  primaryText: { color: '#fff', fontSize: 10, fontWeight: '900', letterSpacing: 1 },
  readout: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end', justifyContent: 'space-between' },
  readoutValue: { color: '#fff9fc', fontSize: 38, fontWeight: '900', letterSpacing: -1 },
  readoutMeta: { color: '#b7859f', fontSize: 10 },
  coverage: { alignItems: 'flex-end', gap: 2, borderLeftWidth: 3, borderLeftColor: '#ff2f91', paddingLeft: 10 },
  coverageValue: { color: '#8fddff', fontSize: 20, fontWeight: '900' },
  coverageMeta: { color: '#c890ac', fontSize: 9, fontWeight: '900', letterSpacing: .6 },
  track: { height: 8, overflow: 'hidden', borderRadius: 6, backgroundColor: '#30202b' },
  fill: { height: '100%', borderRadius: 6, backgroundColor: '#f12784' },
  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  stepLabel: { width: 48, color: '#bf829f', fontSize: 8, fontWeight: '900', letterSpacing: .9 },
  exactRow: { flexDirection: 'row', gap: 10, alignItems: 'center' },
  exactInput: { width: 120 },
  ladder: { gap: 8, padding: 14, borderRadius: 18, borderWidth: 1, borderColor: '#4b3148', backgroundColor: '#140b15' },
  rungs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  rung: { flexGrow: 1, flexBasis: 150, gap: 3, padding: 10, borderRadius: 12, borderWidth: 1, borderColor: '#3a2334', backgroundColor: '#1d111b' },
  rungHeld: { borderColor: '#62f1aa', backgroundColor: 'rgba(28,119,79,.22)' },
  rungNext: { borderColor: '#ff65ab' },
  rungLabel: { color: '#cba2b7', fontSize: 9, fontWeight: '900', letterSpacing: .8 },
  rungLabelHeld: { color: '#6ff5b0' },
  rungMeta: { color: '#8f7181', fontSize: 8, lineHeight: 12 },
});
