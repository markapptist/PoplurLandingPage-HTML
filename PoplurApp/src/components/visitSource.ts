// The outreach tag on a landing link: www.poplur.ca/?src=<tag> (QR posters,
// café cards, club links), or ?utm_source=<tag> when a link already carries
// one. Kept to a short slug so a tag can never smuggle anything else into the
// funnel store or the /funnel page.

const MAX = 40;

/** A clean tag, or null: lowercase letters, digits, '-', '_' and '.', at most 40 characters. */
export function cleanSource(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim().toLowerCase().replace(/[^a-z0-9._-]/g, '').slice(0, MAX);
  return tag ? tag : null;
}

/** The tag in a URL's query string (`src` first, then `utm_source`), or null. */
export function sourceFromSearch(search: string): string | null {
  const params = new URLSearchParams(search);
  return cleanSource(params.get('src')) ?? cleanSource(params.get('utm_source'));
}
