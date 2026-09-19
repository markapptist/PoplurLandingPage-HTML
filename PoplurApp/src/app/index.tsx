import { Platform } from 'react-native';

import HomeLegacy from '@/components/home-legacy';
import LandingPage from '@/landing/LandingPage';

// The web root is the product page (landing/LandingPage.tsx); the native app
// keeps the cube/teaser home it always had.
export default function Index() {
  return Platform.OS === 'web' ? <LandingPage /> : <HomeLegacy />;
}
