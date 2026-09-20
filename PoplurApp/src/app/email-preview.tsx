import { Asset } from 'expo-asset';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import {
  betaInviteFrom,
  betaInvitePreview,
  betaInviteSubject,
  createBetaInviteHtml,
  createBetaInviteText,
} from '@/emails/betaInviteEmail';

// /email-preview shows the beta invite exactly as the sender builds it: the
// same createBetaInviteHtml, with the bundled images in place of the inline
// parts. It used to be a hand-made lookalike, which drifted from the real
// mail the moment the template changed.
const ICON = require('@/assets/images/landing/app-icon.png');
const MAILBOX = require('@/assets/emails/mailbox.png');
const ENVELOPE = require('@/assets/emails/envelope.png');

export default function EmailPreviewScreen() {
  if (Platform.OS !== 'web') {
    return (
      <ScrollView contentContainerStyle={styles.native}>
        <ThemedText type="smallBold">{betaInviteSubject}</ThemedText>
        <ThemedText>{createBetaInviteText()}</ThemedText>
      </ScrollView>
    );
  }
  const html = createBetaInviteHtml({
    images: {
      icon: Asset.fromModule(ICON).uri,
      mailbox: Asset.fromModule(MAILBOX).uri,
      envelope: Asset.fromModule(ENVELOPE).uri,
    },
  });
  return (
    <View style={styles.page}>
      <View style={styles.meta}>
        <ThemedText style={styles.metaLine}><ThemedText type="smallBold">From</ThemedText> {betaInviteFrom}</ThemedText>
        <ThemedText style={styles.metaLine}><ThemedText type="smallBold">Subject</ThemedText> {betaInviteSubject}</ThemedText>
        <ThemedText style={styles.metaLine}><ThemedText type="smallBold">Preview</ThemedText> {betaInvitePreview}</ThemedText>
      </View>
      <iframe title="Beta invite email" srcDoc={html} style={{ width: '100%', maxWidth: 720, height: 1320, border: 0, borderRadius: 14, background: '#ff2d96', display: 'block', margin: '0 auto' }} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, minHeight: '100%', backgroundColor: '#f6f6f8', padding: 24 },
  meta: { maxWidth: 720, width: '100%', alignSelf: 'center', marginBottom: 14, gap: 4 },
  metaLine: { fontSize: 13, color: '#5c5c66' },
  native: { padding: 24, gap: 12 },
});
