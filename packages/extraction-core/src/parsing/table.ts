import { normalizeText } from '@swde/shared';
import { tagName } from './dom';

const MAX_SPAN = 50;
const MAX_ROWSPAN = 1_000;

export interface TableGrid {
  /** Column header labels (may contain '' for unnamed columns). */
  header: string[];
  /** Data rows as logical cells after expanding colspan/rowspan. */
  rows: (Element | null)[][];
  width: number;
  hasHeader: boolean;
}

const ARIA_CELL = '[role="cell"],[role="gridcell"],[role="columnheader"],[role="rowheader"]';

export function isAriaTable(el: Element): boolean {
  const role = el.getAttribute('role');
  return role === 'table' || role === 'grid' || role === 'treegrid';
}

function rowsOf(table: Element): { el: Element; section: 'head' | 'body' | 'foot' }[] {
  if (tagName(table) === 'table') {
    const out: { el: Element; section: 'head' | 'body' | 'foot' }[] = [];
    for (const row of Array.from((table as HTMLTableElement).rows)) {
      const parentTag = row.parentElement ? tagName(row.parentElement) : '';
      out.push({
        el: row,
        section: parentTag === 'thead' ? 'head' : parentTag === 'tfoot' ? 'foot' : 'body',
      });
    }
    return out;
  }
  return Array.from(table.querySelectorAll('[role="row"]'))
    .filter(
      (r) => r.parentElement?.closest('[role="table"],[role="grid"],[role="treegrid"]') === table,
    )
    .map((el) => ({
      el,
      section:
        el.querySelector('[role="columnheader"]') &&
        !el.querySelector('[role="cell"],[role="gridcell"]')
          ? ('head' as const)
          : ('body' as const),
    }));
}

function cellsOf(row: Element): Element[] {
  if (tagName(row) === 'tr') return Array.from((row as HTMLTableRowElement).cells);
  return Array.from(row.querySelectorAll(ARIA_CELL)).filter(
    (c) => c.closest('[role="row"]') === row,
  );
}

function isHeaderCell(cell: Element): boolean {
  const role = cell.getAttribute('role');
  return tagName(cell) === 'th' || role === 'columnheader';
}

function spanAttr(cell: Element, name: string, max: number): number {
  const n = Number.parseInt(cell.getAttribute(name) ?? '1', 10);
  return Number.isFinite(n) && n > 0 ? Math.min(n, max) : 1;
}

/** Expands a list of rows into a rectangular grid honoring colspan and rowspan. */
function expand(rows: Element[]): (Element | null)[][] {
  const grid: (Element | null)[][] = [];
  const carry = new Map<number, { el: Element; remaining: number }>();
  for (const row of rows) {
    const out: (Element | null)[] = [];
    let col = 0;
    const takeCarry = () => {
      let pending = carry.get(col);
      while (pending) {
        out[col] = pending.el;
        pending.remaining -= 1;
        if (pending.remaining <= 0) carry.delete(col);
        col += 1;
        pending = carry.get(col);
      }
    };
    for (const cell of cellsOf(row)) {
      takeCarry();
      const colspan = spanAttr(cell, 'colspan', MAX_SPAN);
      const rowspan = spanAttr(cell, 'rowspan', MAX_ROWSPAN);
      for (let k = 0; k < colspan; k++) {
        out[col + k] = cell;
        if (rowspan > 1) carry.set(col + k, { el: cell, remaining: rowspan - 1 });
      }
      col += colspan;
    }
    takeCarry();
    // Carried cells to the right of the last real cell.
    for (const [c, pending] of Array.from(carry.entries())) {
      if (c >= col && out[c] === undefined) {
        out[c] = pending.el;
        pending.remaining -= 1;
        if (pending.remaining <= 0) carry.delete(c);
      }
    }
    grid.push(Array.from(out, (c) => c ?? null));
  }
  return grid;
}

function cellText(cell: Element | null): string {
  return cell ? normalizeText(cell.textContent ?? '') : '';
}

export function buildTableGrid(table: Element): TableGrid {
  const rows = rowsOf(table);
  let headRows = rows.filter((r) => r.section === 'head').map((r) => r.el);
  let bodyRows = rows.filter((r) => r.section === 'body').map((r) => r.el);

  if (headRows.length === 0 && bodyRows.length > 0) {
    const first = bodyRows[0]!;
    const cells = cellsOf(first);
    if (cells.length > 0 && cells.every(isHeaderCell)) {
      headRows = [first];
      bodyRows = bodyRows.slice(1);
    }
  }

  const headerGrid = expand(headRows);
  const bodyGrid = expand(bodyRows);
  const width = Math.max(0, ...headerGrid.map((r) => r.length), ...bodyGrid.map((r) => r.length));

  const header: string[] = [];
  for (let c = 0; c < width; c++) {
    // Multi-row headers become "Group / Sub" labels, skipping repeats from colspan.
    const parts: string[] = [];
    for (const hr of headerGrid) {
      const t = cellText(hr[c] ?? null);
      if (t && parts[parts.length - 1] !== t) parts.push(t);
    }
    header.push(parts.join(' / '));
  }

  const headerKey = header.join('\u0001');
  const dataRows = bodyGrid
    .map((r) => {
      const padded = r.slice();
      while (padded.length < width) padded.push(null);
      return padded;
    })
    // Drop repeated header rows inside tbody (common in long tables).
    .filter((r) => !(headerKey && r.map(cellText).join('\u0001') === headerKey));

  return { header, rows: dataRows, width, hasHeader: headRows.length > 0 };
}

/** Layout tables (used for page structure, not data) are skipped by detection. */
export function isLikelyLayoutTable(table: Element): boolean {
  const role = table.getAttribute('role');
  if (role === 'presentation' || role === 'none') return true;
  if (tagName(table) !== 'table') return false;
  if (table.querySelector(':scope > tbody > tr > td > table, :scope > tr > td > table'))
    return true;
  return false;
}
