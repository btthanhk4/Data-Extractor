const TRACKING_PARAMS = new Set([
  'fbclid',
  'gclid',
  'dclid',
  'gbraid',
  'wbraid',
  'msclkid',
  'mc_cid',
  'mc_eid',
  'igshid',
  'yclid',
  '_hsenc',
  '_hsmi',
  'ref_src',
]);

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

export interface UrlNormalizeOptions {
  removeTracking: boolean;
}

/**
 * Normalizes http(s) URLs: lowercases scheme/host, drops default ports and fragments, and
 * optionally strips well-known tracking parameters. Non-URL values are returned unchanged.
 */
export function normalizeUrl(value: string, options: UrlNormalizeOptions): string {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return value;
  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return value;
  }
  url.hash = '';
  if (options.removeTracking) {
    for (const key of Array.from(url.searchParams.keys())) {
      if (isTrackingParam(key)) url.searchParams.delete(key);
    }
  }
  // URL already lowercases the host and removes default ports.
  let href = url.href;
  if (url.search === '' && href.endsWith('?')) href = href.slice(0, -1);
  return href;
}
