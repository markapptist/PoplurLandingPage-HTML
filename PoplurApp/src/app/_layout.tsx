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
      </Head>
      <AnimatedSplashOverlay />
      <VisitBeacon />
      <Slot />
    </ThemeProvider>
  );
}
