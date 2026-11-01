import type { ColumnDef, DatasetDescriptor, DetectedDataset } from '@swde/shared';
import { LIMITS, normalizeText } from '@swde/shared';
import {
  isHidden,
  isInsideNavigation,
  safeQueryAll,
  tagName,
  uniqueSelector,
} from '../parsing/dom';
import { buildTableGrid, isLikelyLayoutTable } from '../parsing/table';
import { inferListColumns, inferTableColumns } from './columns';
import { findListGroups } from './lists';
import { extractRows } from '../parsing/rows';

const MAX_TABLES = 200;
const MAX_LIST_GROUPS_TO_INFER = 40;

export interface Candidate {
  kind: 'table' | 'list';
  container: Element;
  /** List items, or the table's data rows' first cells (used for overlap checks). */
  items: Element[];
  descriptor: DatasetDescriptor;
  rowCount: number;
  score: number;
  label: string;
}

function headingBefore(el: Element): string {
  let node: Element | null = el;
  for (let depth = 0; node && depth < 4; depth++) {
    let sib = node.previousElementSibling;
    for (let n = 0; sib && n < 6; n++) {
      if (/^H[1-6]$/.test(sib.tagName)) return normalizeText(sib.textContent ?? '');
      // Only small heading wrappers (<header><h2/></header>), not whole sections.
      if (sib.childElementCount <= 2 && /^(HEADER|HGROUP|DIV)$/.test(sib.tagName)) {
        const inner = sib.querySelector(
          ':scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6',
        );
        if (inner) return normalizeText(inner.textContent ?? '');
      }
      sib = sib.previousElementSibling;
    }
    node = node.parentElement;
  }
  return '';
}

function labelFor(kind: 'table' | 'list', container: Element, fallback: string): string {
  const explicit =
    (kind === 'table' ? container.querySelector('caption')?.textContent : null) ??
    container.getAttribute('aria-label') ??
    (container.getAttribute('aria-labelledby')
      ? container.ownerDocument.getElementById(container.getAttribute('aria-labelledby')!)
          ?.textContent
      : null);
  const text = normalizeText(explicit ?? '') || headingBefore(container);
  return (text || fallback).slice(0, 120);
}

function tableCandidates(doc: Document): Candidate[] {
  const out: Candidate[] = [];
  const tables = safeQueryAll(doc, 'table, [role="table"], [role="grid"], [role="treegrid"]').slice(
    0,
    MAX_TABLES,
  );
  for (const table of tables) {
    if (isLikelyLayoutTable(table) || isHidden(table)) continue;
    const grid = buildTableGrid(table);
    if (grid.rows.length < 2 || grid.width < 1) continue;
    if (grid.width === 1 && !grid.hasHeader) continue;
    const columns = inferTableColumns(grid);
    if (columns.length === 0) continue;
    const descriptor: DatasetDescriptor = {
      kind: 'table',
      containerSelector: uniqueSelector(table),
      itemSelector: tagName(table) === 'table' ? 'tr' : '[role="row"]',
      skipLeadingItems: 0,
      itemSignature: `table|${grid.header.join('|')}`.slice(0, 500),
      columns,
    };
    let score = Math.pow(grid.rows.length, 0.75) * Math.min(grid.width, 12) * 1.4;
    if (grid.hasHeader) score *= 1.5;
    if (isInsideNavigation(table)) score *= 0.3;
    out.push({
      kind: 'table',
      container: table,
      items: grid.rows.map((r) => r.find((c) => c !== null) ?? table),
      descriptor,
      rowCount: grid.rows.length,
      score,
      label: labelFor('table', table, 'Table'),
    });
  }
  return out;
}

function listCandidates(doc: Document): Candidate[] {
  if (!doc.body) return [];
  const groups = findListGroups(doc.body)
    .sort((a, b) => b.preScore - a.preScore)
    .slice(0, MAX_LIST_GROUPS_TO_INFER);
  const out: Candidate[] = [];
  for (const group of groups) {
    if (isHidden(group.container)) continue;
    const columns: ColumnDef[] = inferListColumns(group.items);
    if (columns.length === 0) continue;
    const descriptor: DatasetDescriptor = {
      kind: 'list',
      containerSelector: uniqueSelector(group.container),
      itemSelector: group.itemSelector,
      skipLeadingItems: 0,
      itemSignature: group.signature,
      columns,
    };
    const rowCount = safeQueryAll(group.container, group.itemSelector).length;
    out.push({
      kind: 'list',
      container: group.container,
      items: group.items,
      descriptor,
      rowCount,
      score:
        group.preScore *
        Math.sqrt(Math.min(columns.length, 8)) *
        wrapperPenalty(group.items, columns),
      label: labelFor('list', group.container, 'List'),
    });
  }
  return out;
}

/**
 * A "list of lists" (sections that each hold a long list) produces multi-value columns with many
 * values per row. Those wrappers are rarely what users want, so the inner lists should win.
 */
function wrapperPenalty(items: Element[], columns: ColumnDef[]): number {
  const probe = items.slice(0, 10);
  for (const col of columns) {
    if (col.source.type !== 'path' || !col.source.multi || probe.length === 0) continue;
    const path = col.source.path;
    const avg =
      probe.reduce((sum, item) => sum + safeQueryAll(item, path).length, 0) / probe.length;
    if (avg >= 5) return 0.2;
  }
  return 1;
}

function containedInAnyItem(el: Element, items: Element[]): boolean {
  for (const item of items) if (item !== el && item.contains(el)) return true;
  return false;
}

/** Removes nested/wrapper duplicates so each real dataset appears once. */
function dedupe(candidates: Candidate[]): Candidate[] {
  const accepted: Candidate[] = [];
  for (const c of candidates.sort((a, b) => b.score - a.score)) {
    const redundant = accepted.some((a) => {
      if (a.container === c.container) return true;
      // c lives inside one item of an accepted dataset (e.g. tag list inside each card).
      if (containedInAnyItem(c.container, a.items)) return true;
      // c is a wrapper whose items contain an accepted dataset.
      if (containedInAnyItem(a.container, c.items)) return true;
      // Lists found inside an accepted table duplicate the table rows.
      if (a.kind === 'table' && a.container.contains(c.container)) return true;
      return false;
    });
    if (!redundant) accepted.push(c);
    if (accepted.length >= LIMITS.maxDetectedDatasets) break;
  }
  return accepted;
}

export function detectCandidates(doc: Document): Candidate[] {
  const all = dedupe([...tableCandidates(doc), ...listCandidates(doc)]);
  // Menus and footer link lists are noise once a real dataset exists; the visual picker can
  // still select them explicitly.
  const content = all.filter((c) => !isInsideNavigation(c.container));
  return content.length > 0 ? content : all;
}

export function detectDatasets(doc: Document): DetectedDataset[] {
  const candidates = detectCandidates(doc);
  const labelCounts = new Map<string, number>();
  return candidates.map((c, i) => {
    const kindName = c.kind === 'table' ? 'Table' : 'List';
    let label = c.label === 'Table' || c.label === 'List' ? kindName : c.label;
    const n = (labelCounts.get(label) ?? 0) + 1;
    labelCounts.set(label, n);
    if (n > 1) label = `${label} ${n}`;
    const preview = extractRows(c.container, c.descriptor, LIMITS.previewRows);
    return {
      id: `d${i}`,
      label,
      descriptor: c.descriptor,
      rowCount: c.rowCount,
      columnCount: c.descriptor.columns.length,
      score: Math.round(c.score * 100) / 100,
      preview,
    };
  });
}
