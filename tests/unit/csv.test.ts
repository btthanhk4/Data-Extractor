import { describe, expect, it } from 'vitest';
import { escapeCsvField, protectFormula, toCsv } from '@swde/extraction-core';

const BOM = String.fromCharCode(0xfeff);

/** Minimal RFC 4180 parser used to prove the output round-trips. */
function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\r' && text[i + 1] === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      i++;
    } else field += ch;
  }
  return rows;
}

describe('CSV escaping', () => {
  it('quotes delimiters, quotes and newlines', () => {
    expect(escapeCsvField('plain', ',', true)).toBe('plain');
    expect(escapeCsvField('a,b', ',', true)).toBe('"a,b"');
    expect(escapeCsvField('say "hi"', ',', true)).toBe('"say ""hi"""');
    expect(escapeCsvField('line1\nline2', ',', true)).toBe('"line1\nline2"');
    expect(escapeCsvField('a;b', ';', true)).toBe('"a;b"');
    expect(escapeCsvField(' padded ', ',', true)).toBe('" padded "');
  });

  it('round-trips arbitrary values including unicode', () => {
    const header = ['Name', 'Note', 'Amount'];
    const rows = [
      ['東京 タワー', 'Line one, with comma', '-12.50'],
      ['مرحبا', 'He said "hello"', '1.234,56 €'],
      ['Emoji 🚀', 'multi\nline', ''],
      ['Tiếng Việt', '', '42'],
    ];
    const csv = toCsv(header, rows, { formulaProtection: false });
    expect(parseCsv(csv)).toEqual([header, ...rows]);
  });

  it('adds a UTF-8 BOM only when requested and uses CRLF line endings', () => {
    expect(toCsv(['a'], [['1']], { bom: true }).startsWith(BOM)).toBe(true);
    expect(toCsv(['a'], [['1']]).startsWith(BOM)).toBe(false);
    expect(toCsv(['a'], [['1']])).toBe('a\r\n1\r\n');
  });

  it('pads short rows to the header width', () => {
    expect(toCsv(['a', 'b', 'c'], [['1']])).toBe('a,b,c\r\n1,,\r\n');
  });

  it('supports semicolon and tab delimiters', () => {
    expect(toCsv(['a', 'b'], [['1,5', '2']], { delimiter: ';' })).toBe('a;b\r\n1,5;2\r\n');
    expect(toCsv(['a', 'b'], [['x', 'y']], { delimiter: '\t' })).toBe('a\tb\r\nx\ty\r\n');
  });
});

describe('CSV formula injection protection', () => {
  it.each([
    ['=HYPERLINK("http://evil.example","x")', `'=HYPERLINK("http://evil.example","x")`],
    ['+cmd|calc', `'+cmd|calc`],
    ['-2+3+cmd|calc', `'-2+3+cmd|calc`],
    ['@SUM(A1:A3)', `'@SUM(A1:A3)`],
    ['\t=1+1', `'\t=1+1`],
    [String.fromCharCode(0xff1d) + '1+1', `'${String.fromCharCode(0xff1d)}1+1`],
  ])('neutralizes %j', (input, expected) => {
    expect(protectFormula(input)).toBe(expected);
  });

  it.each(['-12.50', '+42', '-1,234.5', '1e5', '-3%'])('leaves plain number %j alone', (value) => {
    expect(protectFormula(value)).toBe(value);
  });

  it('protects inside a full CSV but can be disabled', () => {
    const csv = toCsv(['x'], [['=1+1']]);
    expect(csv).toBe(`x\r\n'=1+1\r\n`);
    expect(toCsv(['x'], [['=1+1']], { formulaProtection: false })).toBe('x\r\n=1+1\r\n');
  });

  it('protects header cells too', () => {
    expect(toCsv(['=bad'], [])).toBe(`'=bad\r\n`);
  });
});
