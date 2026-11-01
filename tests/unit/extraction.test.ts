import { describe, expect, it } from 'vitest';
import type { DatasetDescriptor } from '@swde/shared';
import {
  ExtractionError,
  detectDatasets,
  extractDataset,
  fingerprintRows,
} from '@swde/extraction-core';
import { htmlDocument, loadFixture } from '../helpers';

describe('extractDataset', () => {
  it('re-extracts all rows using a detected descriptor', () => {
    const doc = loadFixture('pagination/page1.html');
    const [jobs] = detectDatasets(doc);
    const result = extractDataset(doc, jobs!.descriptor);
    expect(result.resolvedByFallback).toBe(false);
    expect(result.data.columns.map((c) => c.name)).toEqual([
      'Title',
      'Link',
      'Company',
      'Salary',
      'Date',
    ]);
    expect(result.data.rows).toHaveLength(4);
    expect(result.data.truncated).toBe(false);
  });

  it('finds the dataset structurally when the stored selector no longer matches', () => {
    const page1 = loadFixture('pagination/page1.html');
    const [jobs] = detectDatasets(page1);
    const broken: DatasetDescriptor = { ...jobs!.descriptor, containerSelector: '#does-not-exist' };
    const page2 = loadFixture('pagination/page2.html');
    const result = extractDataset(page2, broken);
    expect(result.resolvedByFallback).toBe(true);
    expect(result.data.rows[0]?.[0]).toBe('Ember Engineer');
  });

  it('throws a typed error when the dataset is absent', () => {
    const [jobs] = detectDatasets(loadFixture('pagination/page1.html'));
    expect(() =>
      extractDataset(loadFixture('empty.html'), {
        ...jobs!.descriptor,
        containerSelector: '#nope',
      }),
    ).toThrow(ExtractionError);
  });

  it('marks results as truncated when the row limit is hit', () => {
    const rows = Array.from({ length: 30 }, (_, i) => `<tr><td>${i}</td><td>v${i}</td></tr>`).join(
      '',
    );
    const doc = htmlDocument(
      `<table><thead><tr><th>a</th><th>b</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
    const [table] = detectDatasets(doc);
    const result = extractDataset(doc, table!.descriptor, 10);
    expect(result.data.rows).toHaveLength(10);
    expect(result.data.truncated).toBe(true);
  });

  it('falls back to structural matching instead of crashing on an invalid selector', () => {
    const doc = loadFixture('table.html');
    const [cities] = detectDatasets(doc);
    const weird: DatasetDescriptor = { ...cities!.descriptor, containerSelector: 'div[[[' };
    expect(extractDataset(doc, weird).data.rows).toHaveLength(5);
  });
});

describe('fingerprintRows', () => {
  it('changes when page content changes', () => {
    const a = fingerprintRows([
      ['1', 'a'],
      ['2', 'b'],
    ]);
    const b = fingerprintRows([
      ['3', 'c'],
      ['4', 'd'],
    ]);
    expect(a).not.toBe(b);
    expect(
      fingerprintRows([
        ['1', 'a'],
        ['2', 'b'],
      ]),
    ).toBe(a);
  });
});
