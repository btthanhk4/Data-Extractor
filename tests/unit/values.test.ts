import { describe, expect, it } from 'vitest';
import {
  detectColumnType,
  detectValueType,
  isPriceLike,
  normalizeUrl,
  parseDate,
  parseNumber,
  toSpreadsheetSerial,
} from '@swde/extraction-core';

describe('parseNumber', () => {
  it.each([
    ['1,234.56', 1234.56],
    ['1.234,56', 1234.56],
    ['1 234', 1234],
    ['$12.50', 12.5],
    ['12,5 €', 12.5],
    ['-3', -3],
    ['+42', 42],
    ['1,234', 1234],
    ['1.234.567', 1234567],
    ['0,99', 0.99],
    ['50%', 50],
  ])('%s -> %s', (raw, expected) => {
    expect(parseNumber(raw)).toBe(expected);
  });

  it.each(['', 'abc', '12 apples', '1-2', '--5'])('rejects %s', (raw) => {
    expect(parseNumber(raw)).toBeNull();
  });
});

describe('parseDate', () => {
  it('parses ISO dates and datetimes', () => {
    expect(parseDate('2026-10-05')?.toISOString()).toBe('2026-10-05T00:00:00.000Z');
    expect(parseDate('2026-10-30T08:15:00Z')?.toISOString()).toBe('2026-10-30T08:15:00.000Z');
  });

  it('parses month-name dates', () => {
    expect(parseDate('Oct 1, 2026')?.getUTCDate()).toBe(1);
    expect(parseDate('5 January 2024')?.getUTCMonth()).toBe(0);
  });

  it('accepts unambiguous day-first numeric dates only', () => {
    expect(parseDate('25/12/2024')?.toISOString()).toBe('2024-12-25T00:00:00.000Z');
    expect(parseDate('03/04/2024')).toBeNull();
    expect(parseDate('31/02/2024')).toBeNull();
  });

  it('converts to spreadsheet serial numbers', () => {
    expect(toSpreadsheetSerial(new Date(Date.UTC(1900, 0, 1)))).toBe(2);
    expect(toSpreadsheetSerial(new Date(Date.UTC(2024, 0, 1)))).toBe(45292);
  });
});

describe('type detection', () => {
  it('classifies values', () => {
    expect(detectValueType('https://a.example/x')).toBe('url');
    expect(detectValueType('ada@example.com')).toBe('email');
    expect(detectValueType('12.5%')).toBe('percent');
    expect(detectValueType('37,400,068')).toBe('number');
    expect(detectValueType('$129.99')).toBe('currency');
    expect(detectValueType('2026-01-01')).toBe('date');
    expect(detectValueType('Tokyo')).toBe('text');
    expect(detectValueType('  ')).toBe('empty');
  });

  it('requires 80% agreement for a column type', () => {
    expect(detectColumnType(['1', '2', '3', '4', 'n/a'])).toBe('number');
    expect(detectColumnType(['1', '2', 'x', 'y'])).toBe('text');
    expect(detectColumnType(['$1.00', '2', '3.50'])).toBe('currency');
    expect(detectColumnType(['', ''])).toBe('empty');
  });

  it('recognises prices', () => {
    expect(isPriceLike('€249,00')).toBe(true);
    expect(isPriceLike('USD 10')).toBe(true);
    expect(isPriceLike('10 apples')).toBe(false);
  });
});

describe('normalizeUrl', () => {
  it('removes fragments and tracking parameters', () => {
    expect(
      normalizeUrl('HTTPS://Shop.Example.com:443/p/1?utm_source=x&id=7&fbclid=abc#reviews', {
        removeTracking: true,
      }),
    ).toBe('https://shop.example.com/p/1?id=7');
  });

  it('keeps tracking params unless asked and ignores non-URLs', () => {
    expect(normalizeUrl('https://a.example/?utm_source=x', { removeTracking: false })).toBe(
      'https://a.example/?utm_source=x',
    );
    expect(normalizeUrl('not a url', { removeTracking: true })).toBe('not a url');
  });
});
