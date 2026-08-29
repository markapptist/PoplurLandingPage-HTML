export type BetaMapPoint = readonly [number, number];

/** Deliberately coarse, public beta regions. Unknown/private labels are not plotted. */
export function betaMapPoint(place: string): BetaMapPoint | null {
  const key = place.trim().toLowerCase();
  if (!key || key.includes('private')) return null;
  if (key.includes('vancouver')) return [.16, .35];
  if (key.includes('calgary')) return [.23, .34];
  if (key.includes('toronto')) return [.31, .37];
  if (key.includes('ottawa') || key.includes('montr')) return [.35, .36];
  if (key.includes('new york') || key.includes('northeast')) return [.37, .41];
  if (key.includes('london')) return [.51, .30];
  if (key.includes('paris')) return [.54, .34];
  if (key.includes('canada')) return [.27, .30];
  if (key.includes('world beta')) return [.62, .47];
  return null;
}
