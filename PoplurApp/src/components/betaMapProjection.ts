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
  if (key.includes('north america')) return [.18, .27];
  if (key.includes('central and south america')) return [.22, .59];
  if (key.includes('europe')) return [.48, .25];
  if (key.includes('africa')) return [.47, .48];
  if (key.includes('south asia')) return [.68, .43];
  if (key.includes('west and central asia')) return [.64, .30];
  if (key.includes('east asia')) return [.80, .31];
  if (key.includes('oceania')) return [.83, .70];
  if (key === 'world region') return [.62, .47];
  if (key.includes('world beta')) return [.62, .47];
  return null;
}
