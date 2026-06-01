import { Image, Platform, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import {
  betaInvitePreview,
  betaInviteFrom,
  betaInviteSubject,
  getBetaInviteLinks,
} from '@/emails/betaInviteEmail';

const LOGO_SOURCE = require('@/assets/images/logo1.png');

export default function EmailPreviewScreen() {
  const { androidUrl, iosUrl } = getBetaInviteLinks();

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.mailShell}>
          <View style={styles.mailChrome}>
            <View style={styles.windowDots}>
              <View style={[styles.windowDot, styles.dotRed]} />
              <View style={[styles.windowDot, styles.dotYellow]} />
              <View style={[styles.windowDot, styles.dotGreen]} />
            </View>
            <ThemedText type="smallBold" style={styles.chromeTitle}>
              Beta invite email
            </ThemedText>
          </View>

          <View style={styles.headerBar}>
            <ThemedText type="smallBold" style={styles.label}>
              From
            </ThemedText>
            <ThemedText style={styles.metaText}>{betaInviteFrom}</ThemedText>
            <ThemedText type="smallBold" style={styles.label}>
              Subject
            </ThemedText>
            <ThemedText type="subtitle" style={styles.subject}>
              {betaInviteSubject}
            </ThemedText>
            <ThemedText style={styles.preview}>{betaInvitePreview}</ThemedText>
          </View>

          <View style={styles.emailBody}>
            <View style={styles.hero}>
              <Image source={LOGO_SOURCE} style={styles.logo} resizeMode="contain" />
              <ThemedText type="smallBold" style={styles.kicker}>
                Poplur beta access
              </ThemedText>
              <ThemedText type="title" style={styles.heroTitle}>
                Your beta links are ready.
              </ThemedText>
              <ThemedText style={styles.heroCopy}>
                Thanks for joining early. Use the links below to install Poplur and start
                exploring what is happening around real places.
              </ThemedText>
            </View>

            <View style={styles.innerBody}>
              <ThemedText style={styles.bodyText}>Pick your platform:</ThemedText>
              <EmailButton href={iosUrl} label="Get Poplur for iOS" tone="dark" />
              <EmailButton href={androidUrl} label="Get Poplur for Android" tone="green" />

              <View style={styles.tipBox}>
                <ThemedText style={styles.tipText}>
                  <ThemedText type="smallBold" style={styles.tipStrong}>
                    What to try first:
                  </ThemedText>{' '}
                  open Poplur near a favorite place, check what people are sharing there,
                  and post something useful for the next person who arrives.
                </ThemedText>
              </View>

              <ThemedText style={styles.bodyTextMuted}>
                Have feedback? Reply to this email. We are building Poplur with early users
                and every note helps.
              </ThemedText>
            </View>

            <View style={styles.footer}>
              <ThemedText style={styles.footerText}>
                You received this because you requested Poplur beta access from the website.
              </ThemedText>
              <ThemedText style={styles.footerText}>Poplur</ThemedText>
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function EmailButton({
  href,
  label,
  tone,
}: {
  href: string;
  label: string;
  tone: 'dark' | 'green';
}) {
  const webProps =
    Platform.OS === 'web'
      ? ({ href, hrefAttrs: { target: '_blank', rel: 'noreferrer' } } as any)
      : undefined;

  return (
    <Pressable
      accessibilityRole="link"
      style={[styles.emailButton, tone === 'green' ? styles.emailButtonGreen : styles.emailButtonDark]}
      {...webProps}
    >
      <ThemedText type="smallBold" style={tone === 'green' ? styles.greenButtonText : styles.darkButtonText}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#eef1f5' },
  content: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 28,
  },
  mailShell: {
    width: '100%',
    maxWidth: 760,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#dfe4ec',
  },
  mailChrome: {
    minHeight: 44,
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f8f9fb',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e9f0',
  },
  windowDots: {
    position: 'absolute',
    left: 16,
    flexDirection: 'row',
    gap: 7,
  },
  windowDot: { width: 10, height: 10, borderRadius: 999 },
  dotRed: { backgroundColor: '#ff5f57' },
  dotYellow: { backgroundColor: '#ffbd2e' },
  dotGreen: { backgroundColor: '#28c840' },
  chromeTitle: { color: '#505767', textAlign: 'center' },
  headerBar: {
    padding: 22,
    gap: 7,
    backgroundColor: '#ffffff',
    borderBottomWidth: 1,
    borderBottomColor: '#e8ebf1',
  },
  label: { color: '#777f90', textTransform: 'uppercase', fontSize: 12 },
  metaText: { color: '#2b303b', marginBottom: 8 },
  subject: { color: '#15151f' },
  preview: { color: '#6a7280', lineHeight: 22 },
  emailBody: {
    backgroundColor: '#f3f5f8',
    padding: 18,
  },
  hero: {
    backgroundColor: '#15151f',
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    padding: 30,
  },
  logo: { width: 92, height: 92, marginBottom: 10 },
  kicker: {
    color: '#9ee8d5',
    textTransform: 'uppercase',
    fontSize: 13,
    marginBottom: 12,
  },
  heroTitle: { color: '#ffffff', maxWidth: 520 },
  heroCopy: {
    color: '#e6e8ef',
    lineHeight: 26,
    marginTop: 14,
    maxWidth: 540,
  },
  innerBody: {
    backgroundColor: '#ffffff',
    padding: 30,
    gap: 13,
  },
  bodyText: { color: '#2c303a', lineHeight: 24 },
  bodyTextMuted: { color: '#596071', lineHeight: 24, marginTop: 6 },
  emailButton: {
    minHeight: 54,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  emailButtonDark: { backgroundColor: '#15151f' },
  emailButtonGreen: { backgroundColor: '#24d7a4' },
  darkButtonText: { color: '#ffffff', textAlign: 'center' },
  greenButtonText: { color: '#08120f', textAlign: 'center' },
  tipBox: {
    marginTop: 8,
    padding: 18,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e8ebf1',
    backgroundColor: '#fafbfc',
  },
  tipText: { color: '#3c414d', lineHeight: 24 },
  tipStrong: { color: '#15151f' },
  footer: {
    gap: 9,
    backgroundColor: '#f8f9fb',
    borderTopWidth: 1,
    borderTopColor: '#e8ebf1',
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    padding: 22,
  },
  footerText: { color: '#777f90', fontSize: 13, lineHeight: 20 },
});
