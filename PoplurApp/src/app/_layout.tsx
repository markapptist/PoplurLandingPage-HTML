import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import Head from 'expo-router/head';
import { Slot } from 'expo-router';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { VisitBeacon } from '@/components/VisitBeacon';

export default function TabLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <Head>
        <title>Poplur</title>
        {/* Vercel Web Analytics (enabled 21 Sep 2026): page views by country,
            referrer and device, beside the beta funnel's own visitor count.
            The script only exists on Vercel; elsewhere it 404s quietly. */}
        <script defer src="/_vercel/insights/script.js" />
      </Head>
      <AnimatedSplashOverlay />
      <VisitBeacon />
      <Slot />
    </ThemeProvider>
  );
}
