import { strToU8, zipSync } from 'fflate';
import type { ColumnType } from '@swde/shared';
import {
  detectColumnType,
  parseDate,
  parseNumber,
  toSpreadsheetSerial,
} from '../normalization/values';

/**
 * Minimal SpreadsheetML (Office Open XML) writer.
 *
 * Why not SheetJS: the npm-published build is outdated and newer builds are distributed outside
 * the npm registry; we only need writing, which is ~150 lines on top of fflate (MIT).
 * Safety: text is always written as an inline string (t="inlineStr"), never as <f>, so values
 * like "=HYPERLINK(...)" are displayed literally and are never evaluated.
 */

export interface XlsxSheet {
  name: string;
  header: string[];
  rows: string[][];
  /** Optional per-column types; detected from values when omitted. */
  types?: ColumnType[];
}

const STYLE_HEADER = 1;
const STYLE_DATE = 2;
const STYLE_DATETIME = 3;

const INVALID_XML =
  // eslint-disable-next-line no-control-regex
  /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g;

export function xmlEscape(value: string): string {
  return value
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function columnLetter(index: number): string {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

/** Excel sheet names: max 31 chars, no []:*?/\ and unique within the workbook. */
export function sanitizeSheetName(name: string, used: Set<string>): string {
  const base =
    name
      .replace(/[[\]:*?/\\]/g, ' ')
      .replace(/^'+|'+$/g, '')
      .trim()
      .slice(0, 31) || 'Sheet';
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i++})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

function inlineString(ref: string, value: string, style = 0): string {
  const s = style ? ` s="${style}"` : '';
  return `<c r="${ref}" t="inlineStr"${s}><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
}

function cellXml(ref: string, value: string, type: ColumnType): string {
  if (value === '') return '';
  if (type === 'number' || type === 'currency') {
    const n = parseNumber(value);
    if (n !== null) return `<c r="${ref}"><v>${n}</v></c>`;
  } else if (type === 'percent') {
    const n = parseNumber(value);
    if (n !== null) return `<c r="${ref}"><v>${n / 100}</v></c>`;
  } else if (type === 'date') {
    const d = parseDate(value);
    if (d) {
      const serial = toSpreadsheetSerial(d);
      const style = Number.isInteger(serial) ? STYLE_DATE : STYLE_DATETIME;
      return `<c r="${ref}" s="${style}"><v>${serial}</v></c>`;
    }
  }
  return inlineString(ref, value);
}

function sheetXml(sheet: XlsxSheet): string {
  const width = sheet.header.length;
  const types =
    sheet.types ?? sheet.header.map((_h, c) => detectColumnType(sheet.rows.map((r) => r[c] ?? '')));
  const parts: string[] = [];
  parts.push(
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<sheetFormatPr defaultRowHeight="15"/>',
  );
  if (width > 0) {
    parts.push('<cols>');
    for (let c = 0; c < width; c++) {
      const sample = sheet.rows.slice(0, 200).map((r) => (r[c] ?? '').length);
      const widest = Math.max((sheet.header[c] ?? '').length, ...sample);
      const w = Math.min(60, Math.max(8, widest + 2));
      parts.push(`<col min="${c + 1}" max="${c + 1}" width="${w}" customWidth="1"/>`);
    }
    parts.push('</cols>');
  }
  parts.push('<sheetData>');
  parts.push(
    `<row r="1">${sheet.header.map((h, c) => inlineString(`${columnLetter(c)}1`, h, STYLE_HEADER)).join('')}</row>`,
  );
  const letters = sheet.header.map((_h, c) => columnLetter(c));
  sheet.rows.forEach((row, r) => {
    const rowNum = r + 2;
    let cells = '';
    for (let c = 0; c < width; c++) {
      cells += cellXml(`${letters[c]}${rowNum}`, row[c] ?? '', types[c] ?? 'text');
    }
    parts.push(`<row r="${rowNum}">${cells}</row>`);
  });
  parts.push('</sheetData>');
  if (width > 0) {
    parts.push(`<autoFilter ref="A1:${columnLetter(width - 1)}${sheet.rows.length + 1}"/>`);
  }
  parts.push('</worksheet>');
  return parts.join('');
}

const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="2"><numFmt numFmtId="164" formatCode="yyyy-mm-dd"/><numFmt numFmtId="165" formatCode="yyyy-mm-dd hh:mm"/></numFmts>' +
  '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
  '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
  '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="4">' +
  '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
  '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
  '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
  '</cellXfs>' +
  '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
  '</styleSheet>';

export function toXlsx(sheets: XlsxSheet[]): Uint8Array {
  if (sheets.length === 0) throw new Error('At least one sheet is required');
  const used = new Set<string>();
  const names = sheets.map((s) => sanitizeSheetName(s.name, used));

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
        '<Default Extension="xml" ContentType="application/xml"/>' +
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' +
        names
          .map(
            (_n, i) =>
              `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
          )
          .join('') +
        '</Types>',
    ),
    '_rels/.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>' +
        '</Relationships>',
    ),
    'docProps/core.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">' +
        '<dc:creator>Smart Web Data Extractor</dc:creator>' +
        `<dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</dcterms:created>` +
        '</cp:coreProperties>',
    ),
    'xl/workbook.xml': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
        '<sheets>' +
        names
          .map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
          .join('') +
        '</sheets>' +
        '</workbook>',
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
        names
          .map(
            (_n, i) =>
              `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
          )
          .join('') +
        `<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
        '</Relationships>',
    ),
    'xl/styles.xml': strToU8(STYLES_XML),
  };
  sheets.forEach((sheet, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(sheetXml(sheet));
  });
  return zipSync(files, { level: 6 });
}

export const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
