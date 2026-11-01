import { hashString } from '@swde/shared';

function rowKey(row: readonly string[], indexes: readonly number[] | null): string {
  const values = indexes ? indexes.map((i) => row[i] ?? '') : row;
  // Case- and whitespace-insensitive comparison so "Foo " and "foo" count as duplicates.
  return values.map((v) => v.trim().toLowerCase()).join('\u0001');
}

/** Removes duplicate rows, keeping the first occurrence. `indexes` null = compare all cells. */
export function dedupeRows(
  rows: readonly string[][],
  indexes: readonly number[] | null = null,
): { rows: string[][]; removed: number } {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const row of rows) {
    const key = rowKey(row, indexes);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return { rows: out, removed: rows.length - out.length };
}

/**
 * Incremental de-duplicator for multi-page runs: stores hashed keys only, so memory stays
 * proportional to unique rows rather than their full text.
 */
export class RowDeduper {
  private readonly seen = new Set<string>();

  /** Returns the rows not seen before and remembers them. */
  addAll(rows: readonly string[][]): string[][] {
    const fresh: string[][] = [];
    for (const row of rows) {
      const key = rowKey(row, null);
      const hashed = `${key.length}:${hashString(key)}:${hashString(key.split('').reverse().join(''))}`;
      if (this.seen.has(hashed)) continue;
      this.seen.add(hashed);
      fresh.push(row);
    }
    return fresh;
  }

  get size(): number {
    return this.seen.size;
  }
}
