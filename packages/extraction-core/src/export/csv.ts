export interface CsvOptions {
  delimiter?: ',' | ';' | '\t';
  /** Prepend a UTF-8 byte order mark so Excel detects the encoding. */
  bom?: boolean;
  /** Neutralize values that spreadsheet apps would evaluate as formulas. */
  formulaProtection?: boolean;
  lineEnding?: '\r\n' | '\n';
}

// Includes full-width variants, which some spreadsheet apps also treat as formula triggers.
const FORMULA_START = /^[=+\-@\t\r\uFF1D\uFF0B\uFF0D\uFF20]/;
const PLAIN_NUMBER = /^[-+]?(\d+([.,]\d+)*|\.\d+)(e[-+]?\d+)?%?$/i;

/**
 * OWASP-recommended CSV injection defence: prefix a single quote to values that start with a
 * formula trigger. Plain signed numbers ("-12.5") are left alone so numeric data stays numeric.
 */
export function protectFormula(value: string): string {
  if (!FORMULA_START.test(value)) return value;
  if (PLAIN_NUMBER.test(value)) return value;
  return `'${value}`;
}

export function escapeCsvField(
  value: string,
  delimiter: string,
  formulaProtection: boolean,
): string {
  const v = formulaProtection ? protectFormula(value) : value;
  const needsQuotes =
    v.includes(delimiter) ||
    v.includes('"') ||
    v.includes('\n') ||
    v.includes('\r') ||
    /^\s|\s$/.test(v);
  return needsQuotes ? `"${v.replace(/"/g, '""')}"` : v;
}

/** RFC 4180 CSV. Rows shorter than the header are padded with empty fields. */
export function toCsv(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  options: CsvOptions = {},
): string {
  const delimiter = options.delimiter ?? ',';
  const eol = options.lineEnding ?? '\r\n';
  const protect = options.formulaProtection ?? true;
  const width = header.length;
  const lines: string[] = [
    header.map((h) => escapeCsvField(h, delimiter, protect)).join(delimiter),
  ];
  for (const row of rows) {
    const cells: string[] = [];
    for (let i = 0; i < width; i++) cells.push(escapeCsvField(row[i] ?? '', delimiter, protect));
    lines.push(cells.join(delimiter));
  }
  const body = lines.join(eol) + eol;
  return options.bom ? `\uFEFF${body}` : body;
}
