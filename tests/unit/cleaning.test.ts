import { describe, expect, it } from 'vitest';
import type { ExtractedData } from '@swde/shared';
import {
  RowDeduper,
  applyTransform,
  cleanData,
  dedupeRows,
  defaultCleaningRules,
  initialColumnState,
} from '@swde/extraction-core';

const data: ExtractedData = {
  columns: [
    { id: 'c0', name: 'Name' },
    { id: 'c1', name: 'Price' },
    { id: 'c2', name: 'Link' },
  ],
  rows: [
    ['  Alpha ', '$10', 'https://shop.example/a?utm_source=x#top'],
    ['Beta', '$20', 'https://shop.example/b'],
    ['alpha', '$10', 'https://shop.example/a'],
    ['', '', ''],
    ['Gamma', '', 'https://shop.example/c?fbclid=1'],
    ['Beta', '$20', 'https://shop.example/b'],
  ],
  truncated: false,
};

describe('cleanData', () => {
  it('trims whitespace and removes empty rows by default', () => {
    const result = cleanData(data, initialColumnState(data), defaultCleaningRules());
    expect(result.rows[0]).toEqual(['Alpha', '$10', 'https://shop.example/a?utm_source=x#top']);
    expect(result.stats.removedEmpty).toBe(1);
    expect(result.rows).toHaveLength(5);
  });

  it('removes duplicate rows across all visible columns (case-insensitive)', () => {
    const result = cleanData(
      data,
      initialColumnState(data),
      defaultCleaningRules({ dedupe: { enabled: true, columns: [] } }),
    );
    expect(result.stats.removedDuplicates).toBe(1); // second Beta row
    expect(result.rows.map((r) => r[0])).toEqual(['Alpha', 'Beta', 'alpha', 'Gamma']);
  });

  it('dedupes by selected columns', () => {
    const result = cleanData(
      data,
      initialColumnState(data),
      defaultCleaningRules({ dedupe: { enabled: true, columns: ['c0'] } }),
    );
    expect(result.rows.map((r) => r[0])).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('applies rename, hide and order from column state', () => {
    const state = [
      { id: 'c2', name: 'URL', visible: true },
      { id: 'c0', name: 'Product', visible: true },
      { id: 'c1', name: 'Price', visible: false },
    ];
    const result = cleanData(data, state, defaultCleaningRules());
    expect(result.columns).toEqual([
      { id: 'c2', name: 'URL' },
      { id: 'c0', name: 'Product' },
    ]);
    expect(result.rows[1]).toEqual(['https://shop.example/b', 'Beta']);
  });

  it('appends columns missing from saved state', () => {
    const result = cleanData(
      data,
      [{ id: 'c0', name: 'Name', visible: true }],
      defaultCleaningRules(),
    );
    expect(result.columns.map((c) => c.id)).toEqual(['c0', 'c1', 'c2']);
  });

  it('normalizes URLs and strips tracking params', () => {
    const result = cleanData(
      data,
      initialColumnState(data),
      defaultCleaningRules({ normalizeUrls: true, removeTrackingParams: true }),
    );
    expect(result.rows.map((r) => r[2])).toContain('https://shop.example/a');
    expect(result.rows.map((r) => r[2])).toContain('https://shop.example/c');
  });

  it('filters rows missing required values', () => {
    const result = cleanData(
      data,
      initialColumnState(data),
      defaultCleaningRules({ requireColumns: ['c1'] }),
    );
    expect(result.stats.removedByFilter).toBe(1);
    expect(result.rows.every((r) => r[1] !== '')).toBe(true);
  });

  it('applies per-column transforms', () => {
    const result = cleanData(
      data,
      initialColumnState(data),
      defaultCleaningRules({
        transforms: [
          { columnId: 'c0', op: 'uppercase' },
          { columnId: 'c1', op: 'stripCurrency' },
        ],
      }),
    );
    expect(result.rows[0]?.slice(0, 2)).toEqual(['ALPHA', '10']);
  });

  it('does not mutate its input', () => {
    const copy = JSON.parse(JSON.stringify(data));
    cleanData(
      data,
      initialColumnState(data),
      defaultCleaningRules({ dedupe: { enabled: true, columns: [] } }),
    );
    expect(data).toEqual(copy);
  });
});

describe('transforms', () => {
  it.each([
    ['hello world', 'titlecase', 'Hello World'],
    ['Đà nẵng city', 'titlecase', 'Đà Nẵng City'],
    ['Price: 1,299.00 USD', 'numbersOnly', '1,299.00'],
    ['  a   b ', 'collapseWhitespace', 'a b'],
    ['€ 12,50', 'stripCurrency', '12,50'],
  ] as const)('%s -> %s', (input, op, expected) => {
    expect(applyTransform(input, op)).toBe(expected);
  });
});

describe('deduplication helpers', () => {
  it('dedupeRows keeps first occurrences', () => {
    expect(dedupeRows([['a'], ['A '], ['b']]).rows).toEqual([['a'], ['b']]);
  });

  it('RowDeduper tracks rows across pages', () => {
    const d = new RowDeduper();
    expect(d.addAll([['1'], ['2']])).toHaveLength(2);
    expect(d.addAll([['2'], ['3']])).toEqual([['3']]);
    expect(d.size).toBe(3);
  });
});
