// One beacon per page view to /api/visit, so the funnel counts the visit
// before anyone types an email. Web only; silent on failure; skipped for
// automated browsers and for the funnel page itself.

import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (pathname.startsWith('/funnel') || pathname.startsWith('/api')) return;
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return;
    const body = JSON.stringify({ path: pathname, referrer: document.referrer || null });
    fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'same-origin', keepalive: true }).catch(() => {});
  }, [pathname]);
  return null;
}
