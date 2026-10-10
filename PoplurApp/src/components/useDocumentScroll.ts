import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * Let the window scroll on a plain document page.
 *
 * Expo's web shell pins `html, body, #root` to 100% height and hides the body's
 * overflow (its own screens scroll inside RN ScrollViews). A page written as
 * ordinary HTML — the tester agreement, the report and bug forms, the funnel —
 * is taller than the window and was being clipped: on a desktop browser the
 * wheel did nothing and the only way down was to zoom out (Z, 10 Oct 2026).
 * The landing page does the same unlock inline with its theme; this is the
 * bare version. Everything goes back when the page unmounts.
 */
export function useDocumentScroll() {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    const root = document.getElementById('root');
    const targets = [document.documentElement, document.body, root].filter((el): el is HTMLElement => !!el);
    const previous = targets.map(el => ({ height: el.style.height, overflow: el.style.overflow, display: el.style.display }));
    targets.forEach(el => { el.style.height = 'auto'; el.style.overflow = 'visible'; });
    document.body.style.overflow = 'auto';
    if (root) root.style.display = 'block';
    return () => {
      targets.forEach((el, i) => { el.style.height = previous[i].height; el.style.overflow = previous[i].overflow; el.style.display = previous[i].display; });
    };
  }, []);
}
