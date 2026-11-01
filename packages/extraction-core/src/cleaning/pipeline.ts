import type { CleaningRules, ColumnState, DataColumn, ExtractedData } from '@swde/shared';
import { CleaningRulesSchema, normalizeText } from '@swde/shared';
import { dedupeRows } from '../deduplication';
import { normalizeUrl } from '../normalization/urls';
import { applyTransform } from './transforms';

export interface CleanStats {
  inputRows: number;
  outputRows: number;
  removedEmpty: number;
  removedDuplicates: number;
  removedByFilter: number;
}

export interface CleanResult {
  columns: DataColumn[];
  rows: string[][];
  stats: CleanStats;
}

export function defaultCleaningRules(overrides: Partial<CleaningRules> = {}): CleaningRules {
  return CleaningRulesSchema.parse(overrides);
}

/** Column state for freshly extracted data: everything visible, original names and order. */
export function initialColumnState(data: ExtractedData): ColumnState[] {
  return data.columns.map((c) => ({ id: c.id, name: c.name, visible: true }));
}

/**
 * Applies column state (order, visibility, renames) and cleaning rules. Pure: never mutates the
 * input, so the preview can re-run it on every change.
 */
export function cleanData(
  data: ExtractedData,
  columnState: readonly ColumnState[],
  rules: CleaningRules,
): CleanResult {
  const indexById = new Map(data.columns.map((c, i) => [c.id, i] as const));
  const known = columnState.filter((c) => indexById.has(c.id));
  // Columns missing from state (e.g. new data under an old preset) are appended visible.
  for (const col of data.columns) {
    if (!known.some((k) => k.id === col.id))
      known.push({ id: col.id, name: col.name, visible: true });
  }
  const visible = known.filter((c) => c.visible);
  const sourceIndexes = visible.map((c) => indexById.get(c.id)!);

  const transformsByColumn = new Map<number, CleaningRules['transforms'][number]['op'][]>();
  for (const t of rules.transforms) {
    const idx = indexById.get(t.columnId);
    if (idx === undefined) continue;
    const list = transformsByColumn.get(idx) ?? [];
    list.push(t.op);
    transformsByColumn.set(idx, list);
  }

  const mapCell = (value: string, sourceIndex: number): string => {
    let v = value;
    if (rules.trimWhitespace) v = normalizeText(v);
    const ops = transformsByColumn.get(sourceIndex);
    if (ops) for (const op of ops) v = applyTransform(v, op);
    if (rules.normalizeUrls || rules.removeTrackingParams) {
      v = normalizeUrl(v, { removeTracking: rules.removeTrackingParams });
    }
    return v;
  };

  let rows = data.rows.map((row) => sourceIndexes.map((src) => mapCell(row[src] ?? '', src)));
  const inputRows = rows.length;

  let removedEmpty = 0;
  if (rules.removeEmptyRows) {
    const before = rows.length;
    rows = rows.filter((r) => r.some((v) => v.trim() !== ''));
    removedEmpty = before - rows.length;
  }

  let removedByFilter = 0;
  const required = rules.requireColumns
    .map((id) => visible.findIndex((c) => c.id === id))
    .filter((i) => i >= 0);
  if (required.length > 0) {
    const before = rows.length;
    rows = rows.filter((r) => required.every((i) => (r[i] ?? '').trim() !== ''));
    removedByFilter = before - rows.length;
  }

  let removedDuplicates = 0;
  if (rules.dedupe.enabled) {
    const keyIndexes = rules.dedupe.columns
      .map((id) => visible.findIndex((c) => c.id === id))
      .filter((i) => i >= 0);
    const result = dedupeRows(rows, keyIndexes.length > 0 ? keyIndexes : null);
    rows = result.rows;
    removedDuplicates = result.removed;
  }

  return {
    columns: visible.map((c) => ({ id: c.id, name: c.name.trim() || 'Column' })),
    rows,
    stats: {
      inputRows,
      outputRows: rows.length,
      removedEmpty,
      removedDuplicates,
      removedByFilter,
    },
  };
}
