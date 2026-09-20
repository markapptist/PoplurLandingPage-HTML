import { Asset } from 'expo-asset';
import { Link, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  BETA_INVITE_VARIANTS,
  betaInviteFrom,
  betaInvitePreview,
  betaInviteSubject,
  createBetaInviteHtml,
  createBetaInviteText,
  isBetaInviteVariant,
  pickBetaInviteVariant,
  type BetaInviteVariant,
} from '@/emails/betaInviteEmail';

// /email-preview shows the beta invite exactly as the sender builds it: the
// same createBetaInviteHtml, with the bundled images in place of the inline
// parts. It rolls one of the four designs per load the way the sender rolls
// one per email; ?variant=pink|paper|night|postcard pins one. It used to be a
// hand-made lookalike, which drifted from the real mail the moment the
// template changed.
const ICON = require('@/assets/images/landing/app-icon.png');
const MAILBOX = require('@/assets/emails/mailbox.png');
const ENVELOPE = require('@/assets/emails/envelope.png');
const APPLE_WHITE = require('@/assets/emails/apple-white.png');
const APPLE_INK = require('@/assets/emails/apple-ink.png');
const ANDROID_WHITE = require('@/assets/emails/android-white.png');
const ANDROID_INK = require('@/assets/emails/android-ink.png');

export default function EmailPreviewScreen() {
  const params = useLocalSearchParams<{ variant?: string }>();
  const variant: BetaInviteVariant = useMemo(
    () => (isBetaInviteVariant(params.variant) ? params.variant : pickBetaInviteVariant()),
    [params.variant],
  );
  if (Platform.OS !== 'web') {
    return (
      <ScrollView contentContainerStyle={styles.native}>
        <ThemedText type="smallBold">{betaInviteSubject}</ThemedText>
        <ThemedText>{createBetaInviteText()}</ThemedText>
      </ScrollView>
    );
  }
  const html = createBetaInviteHtml({
    variant,
    images: {
      icon: Asset.fromModule(ICON).uri,
      mailbox: Asset.fromModule(MAILBOX).uri,
      envelope: Asset.fromModule(ENVELOPE).uri,
      appleWhite: Asset.fromModule(APPLE_WHITE).uri,
      appleInk: Asset.fromModule(APPLE_INK).uri,
      androidWhite: Asset.fromModule(ANDROID_WHITE).uri,
      androidInk: Asset.fromModule(ANDROID_INK).uri,
    },
  });
  return (
    <View style={styles.page}>
      <View style={styles.meta}>
        <ThemedText style={styles.metaLine}><ThemedText type="smallBold">From</ThemedText> {betaInviteFrom}</ThemedText>
        <ThemedText style={styles.metaLine}><ThemedText type="smallBold">Subject</ThemedText> {betaInviteSubject}</ThemedText>
        <ThemedText style={styles.metaLine}><ThemedText type="smallBold">Preview</ThemedText> {betaInvitePreview}</ThemedText>
        <View style={styles.variants}>
          <ThemedText style={styles.metaLine}><ThemedText type="smallBold">Design</ThemedText> {variant} · </ThemedText>
          {BETA_INVITE_VARIANTS.map(id => (
            <Link key={id} href={{ pathname: '/email-preview', params: { variant: id } }} style={[styles.variantLink, id === variant && styles.variantCurrent]}>{id}</Link>
          ))}
        </View>
      </View>
      <iframe title="Beta invite email" srcDoc={html} style={{ width: '100%', maxWidth: 720, height: 1320, border: 0, borderRadius: 14, background: '#f6f6f8', display: 'block', margin: '0 auto' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: '100%', backgroundColor: '#f6f6f8', padding: 24 },
  meta: { maxWidth: 720, width: '100%', alignSelf: 'center', marginBottom: 14, gap: 4 },
  metaLine: { fontSize: 13, color: '#5c5c66' },
  variants: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  variantLink: { fontSize: 13, color: '#5c5c66', textDecorationLine: 'underline' },
  variantCurrent: { color: '#ff2d96', fontWeight: '700' },
  native: { padding: 24, gap: 12 },
});
