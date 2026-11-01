// @vitest-environment node
// fflate checks `instanceof Uint8Array`; jsdom swaps typed-array globals, so run in plain Node.
import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import { columnLetter, sanitizeSheetName, toXlsx, xmlEscape } from '@swde/extraction-core';

function open(bytes: Uint8Array): Record<string, string> {
  const files = unzipSync(bytes);
  return Object.fromEntries(Object.entries(files).map(([k, v]) => [k, strFromU8(v)]));
}

describe('XLSX writer', () => {
  it('produces a valid package structure', () => {
    const files = open(toXlsx([{ name: 'Data', header: ['A'], rows: [['1']] }]));
    expect(Object.keys(files).sort()).toEqual(
      [
        '[Content_Types].xml',
        '_rels/.rels',
        'docProps/core.xml',
        'xl/_rels/workbook.xml.rels',
        'xl/styles.xml',
        'xl/workbook.xml',
        'xl/worksheets/sheet1.xml',
      ].sort(),
    );
    expect(files['xl/workbook.xml']).toContain('<sheet name="Data" sheetId="1" r:id="rId1"/>');
  });

  it('writes formula-like text as inline strings, never as formulas', () => {
    const files = open(
      toXlsx([
        {
          name: 'S',
          header: ['Note'],
          rows: [['=HYPERLINK("http://evil.example","x")'], ['@SUM(A1)']],
        },
      ]),
    );
    const sheet = files['xl/worksheets/sheet1.xml']!;
    expect(sheet).not.toContain('<f>');
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain('=HYPERLINK(&quot;http://evil.example&quot;,&quot;x&quot;)');
  });

  it('types numbers, percentages and dates', () => {
    const files = open(
      toXlsx([
        {
          name: 'S',
          header: ['Qty', 'Rate', 'Day'],
          rows: [
            ['1,234', '50%', '2024-01-01'],
            ['7', '12.5%', '2024-02-29'],
          ],
        },
      ]),
    );
    const sheet = files['xl/worksheets/sheet1.xml']!;
    expect(sheet).toContain('<c r="A2"><v>1234</v></c>');
    expect(sheet).toContain('<c r="B2"><v>0.5</v></c>');
    expect(sheet).toContain('<c r="C2" s="2"><v>45292</v></c>');
  });

  it('keeps unicode and strips characters that are invalid in XML', () => {
    const bell = String.fromCharCode(7);
    const files = open(toXlsx([{ name: 'S', header: ['N'], rows: [[`東京${bell} 🚀 <tag>`]] }]));
    const sheet = files['xl/worksheets/sheet1.xml']!;
    expect(sheet).toContain('東京 🚀 &lt;tag&gt;');
    expect(sheet).not.toContain(bell);
  });

  it('supports multiple worksheets with unique, valid names', () => {
    const files = open(
      toXlsx([
        { name: 'Data/2024: [Q1]?', header: ['a'], rows: [] },
        { name: 'Data/2024: [Q1]?', header: ['a'], rows: [] },
      ]),
    );
    expect(files['xl/workbook.xml']).toContain('name="Data 2024   Q1"');
    expect(files['xl/workbook.xml']).toContain('name="Data 2024   Q1 (2)"');
    expect(files['xl/worksheets/sheet2.xml']).toBeDefined();
  });

  it('handles large sheets within reasonable time', () => {
    const rows = Array.from({ length: 20_000 }, (_, i) => [`SKU-${i}`, String(i), `Item ${i}`]);
    const started = performance.now();
    const bytes = toXlsx([{ name: 'Big', header: ['SKU', 'Qty', 'Name'], rows }]);
    expect(performance.now() - started).toBeLessThan(10_000);
    expect(bytes.byteLength).toBeGreaterThan(10_000);
  });
});

describe('helpers', () => {
  it('computes column letters', () => {
    expect([0, 25, 26, 51, 52, 701, 702].map(columnLetter)).toEqual([
      'A',
      'Z',
      'AA',
      'AZ',
      'BA',
      'ZZ',
      'AAA',
    ]);
  });

  it('escapes XML', () => {
    expect(xmlEscape(`a & b < c > "d"`)).toBe('a &amp; b &lt; c &gt; &quot;d&quot;');
  });

  it('sanitizes sheet names', () => {
    const used = new Set<string>();
    expect(sanitizeSheetName('', used)).toBe('Sheet');
    expect(sanitizeSheetName('x'.repeat(40), used)).toHaveLength(31);
  });
});
