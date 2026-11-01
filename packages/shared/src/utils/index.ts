const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * JSON.parse that drops prototype-pollution keys at every depth. Used for any user-supplied
 * JSON (imported preset files) before schema validation.
 */
export function safeJsonParse(text: string): unknown {
  return JSON.parse(text, (key, value: unknown) => (FORBIDDEN_KEYS.has(key) ? undefined : value));
}

export function createId(prefix = ''): string {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return prefix ? `${prefix}_${out}` : out;
}

/** Collapses runs of whitespace (including NBSP) and trims. */
export function normalizeText(value: string): string {
  return value.replace(/[\s\u00a0\u200b]+/g, ' ').trim();
}

/** Returns the URL only if it is an absolute http(s) URL, otherwise null. */
export function safeHttpUrl(raw: string, base?: string): string | null {
  try {
    const url = base ? new URL(raw, base) : new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function toOrigin(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.origin : null;
  } catch {
    return null;
  }
}

/** FNV-1a 32-bit hash, hex encoded. Not cryptographic; used for fingerprints. */
export function hashString(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

const RESERVED_WINDOWS_NAMES = /^(con|prn|aux|nul|com\d|lpt\d)$/i;

/** Produces a filename that is safe on Windows, macOS and Linux. */
export function sanitizeFilename(name: string, fallback = 'data'): string {
  const cleaned = name
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s-]+|[.\s-]+$/g, '')
    .slice(0, 120);
  if (!cleaned || RESERVED_WINDOWS_NAMES.test(cleaned)) return fallback;
  return cleaned;
}

export interface FilenameContext {
  url: string;
  dataset: string;
  date?: Date;
}

/** Expands `{site}`, `{dataset}`, `{date}` and `{time}` tokens in a filename pattern. */
export function formatFilename(pattern: string, ctx: FilenameContext): string {
  const date = ctx.date ?? new Date();
  let site = 'page';
  try {
    site = new URL(ctx.url).hostname.replace(/^www\./, '') || 'page';
  } catch {
    // keep default
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  const iso = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
  const expanded = pattern
    .replace(/\{site\}/g, site)
    .replace(/\{dataset\}/g, ctx.dataset.toLowerCase().replace(/\s+/g, '-'))
    .replace(/\{date\}/g, iso)
    .replace(/\{time\}/g, time);
  return sanitizeFilename(expanded);
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  return 'Unknown error';
}
