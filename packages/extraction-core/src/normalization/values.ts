import type { ColumnType } from '@swde/shared';

const CURRENCY_SYMBOLS = '$€£¥₹₩₫₽₺₴₦฿₱₪';
const CURRENCY_CODES =
  'USD|EUR|GBP|JPY|VND|INR|AUD|CAD|CHF|CNY|SGD|KRW|BRL|MXN|PLN|SEK|NOK|DKK|THB';

const PRICE_RE = new RegExp(
  `^(?:(?:[${CURRENCY_SYMBOLS}]|${CURRENCY_CODES})\\s?[-+]?\\d[\\d.,\\s]*|[-+]?\\d[\\d.,\\s]*\\s?(?:[${CURRENCY_SYMBOLS}]|${CURRENCY_CODES}|đ|₫))$`,
  'i',
);
const NUMBER_RE = /^[-+]?(?:\d{1,3}(?:[,.\s]\d{3})+|\d+)(?:[.,]\d+)?$/;
const PERCENT_RE = /^[-+]?\d+(?:[.,]\d+)?\s?%$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^https?:\/\/\S+$/i;
const ISO_DATE_RE =
  /^\d{4}-\d{2}-\d{2}(?:[T\s]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
const MONTH_NAME_RE = /\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\b/i;
const DMY_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/;

export function isPriceLike(value: string): boolean {
  return value.length <= 40 && PRICE_RE.test(value.trim());
}

/**
 * Parses localized numbers: "1,234.56", "1.234,56", "1 234", "$12.50", "12,5 €".
 * Returns null when the value is not a plain number.
 */
export function parseNumber(raw: string): number | null {
  let s = raw.trim();
  if (!s || s.length > 40) return null;
  s = s
    .replace(new RegExp(`[${CURRENCY_SYMBOLS}]|\\b(?:${CURRENCY_CODES})\\b|đ`, 'gi'), '')
    .replace(/%$/, '')
    .replace(/[\s\u00a0\u202f]/g, '')
    .trim();
  if (!/^[-+]?[\d.,]+$/.test(s) || !/\d/.test(s)) return null;

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Whichever separator comes last is the decimal separator.
    normalized = lastComma > lastDot ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (lastComma >= 0) {
    const decimals = s.length - lastComma - 1;
    const commas = (s.match(/,/g) ?? []).length;
    // "1,234" and "1,234,567" are thousands; "12,5" and "0,99" are decimals.
    normalized = commas === 1 && decimals !== 3 ? s.replace(',', '.') : s.replace(/,/g, '');
  } else if (lastDot >= 0) {
    // "1.234.567" is grouped thousands; a single dot ("1.234", "12.5") is read as a decimal.
    const dots = (s.match(/\./g) ?? []).length;
    normalized = dots > 1 ? s.replace(/\./g, '') : s;
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

/** Days between 1899-12-30 and the date, as used by spreadsheet serial dates. */
export function toSpreadsheetSerial(date: Date): number {
  const epoch = Date.UTC(1899, 11, 30);
  const utc = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  );
  return (utc - epoch) / 86_400_000;
}

/**
 * Parses unambiguous date formats only: ISO 8601, month-name dates ("Jan 5, 2024",
 * "5 January 2024") and day-first numeric dates whose day is > 12. Ambiguous values such as
 * 03/04/2024 are left as text rather than guessed.
 */
export function parseDate(raw: string): Date | null {
  const s = raw.trim();
  if (!s || s.length > 40) return null;
  if (ISO_DATE_RE.test(s)) {
    const hasTime = /[T\s]\d{2}:/.test(s);
    const hasZone = /(Z|[+-]\d{2}:?\d{2})$/.test(s);
    // Date-only ISO strings are UTC by spec; keep floating local times as UTC wall-clock.
    const d = new Date(hasTime && !hasZone ? `${s.replace(' ', 'T')}Z` : s);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const dmy = DMY_RE.exec(s);
  if (dmy) {
    const a = Number(dmy[1]);
    const b = Number(dmy[2]);
    const year = Number(dmy[3]);
    let day: number;
    let month: number;
    if (a > 12 && b <= 12) [day, month] = [a, b];
    else if (b > 12 && a <= 12) [day, month] = [b, a];
    else return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCMonth() === month - 1 ? d : null;
  }
  if (MONTH_NAME_RE.test(s) && /\d{4}/.test(s)) {
    const parsed = Date.parse(`${s} UTC`);
    if (!Number.isNaN(parsed)) return new Date(parsed);
    const fallback = Date.parse(s);
    if (!Number.isNaN(fallback)) {
      const local = new Date(fallback);
      return new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));
    }
  }
  return null;
}

export function detectValueType(value: string): ColumnType {
  const s = value.trim();
  if (!s) return 'empty';
  if (URL_RE.test(s)) return 'url';
  if (EMAIL_RE.test(s)) return 'email';
  if (PERCENT_RE.test(s)) return 'percent';
  if (NUMBER_RE.test(s.replace(/[\u00a0\u202f]/g, ' '))) return 'number';
  if (isPriceLike(s) && parseNumber(s) !== null) return 'currency';
  if (parseDate(s)) return 'date';
  return 'text';
}

/** A column gets a type when >= 80% of its non-empty values agree. */
export function detectColumnType(values: readonly string[], sampleSize = 500): ColumnType {
  const counts = new Map<ColumnType, number>();
  let nonEmpty = 0;
  const step = Math.max(1, Math.floor(values.length / sampleSize));
  for (let i = 0; i < values.length; i += step) {
    const t = detectValueType(values[i] ?? '');
    if (t === 'empty') continue;
    nonEmpty += 1;
    counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  if (nonEmpty === 0) return 'empty';
  // Numbers and currencies are compatible for typing purposes.
  const numeric = (counts.get('number') ?? 0) + (counts.get('currency') ?? 0);
  let best: ColumnType = 'text';
  let bestCount = 0;
  for (const [type, count] of counts) {
    if (count > bestCount) {
      best = type;
      bestCount = count;
    }
  }
  if ((best === 'number' || best === 'currency') && numeric / nonEmpty >= 0.8) {
    return (counts.get('currency') ?? 0) > 0 ? 'currency' : 'number';
  }
  return bestCount / nonEmpty >= 0.8 ? best : 'text';
}
