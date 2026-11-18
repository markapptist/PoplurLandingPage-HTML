// One beacon per page view to /api/visit, so the funnel counts the visit
// before anyone types an email. Web only; silent on failure; skipped for
// automated browsers and for the funnel page itself. Carries the outreach
// tag (?src= or ?utm_source=) when the link had one, so /funnel can count
// which poster, café card or club link brought each visitor.

import { usePathname } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { sourceFromSearch } from './visitSource';

export function VisitBeacon() {
  const pathname = usePathname();
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (pathname.startsWith('/funnel') || pathname.startsWith('/api')) return;
    if ((navigator as Navigator & { webdriver?: boolean }).webdriver) return;
    const src = sourceFromSearch(window.location.search);
    const body = JSON.stringify({ path: pathname, referrer: document.referrer || null, ...(src ? { src } : {}) });
    fetch('/api/visit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, credentials: 'same-origin', keepalive: true }).catch(() => {});
  }, [pathname]);
  return null;
}
