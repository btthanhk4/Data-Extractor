import { useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnType, DataColumn } from '@swde/shared';
import { safeHttpUrl } from '@swde/shared';
import { cx } from './ui';

const ROW_HEIGHT = 34;
const OVERSCAN = 12;
const INDEX_WIDTH = 56;

const TYPE_LABEL: Partial<Record<ColumnType, string>> = {
  number: '123',
  currency: '$',
  percent: '%',
  date: 'date',
  url: 'url',
  email: '@',
};

function columnWidth(name: string, rows: readonly string[][], index: number): number {
  let widest = name.length + 4;
  const sample = Math.min(rows.length, 200);
  for (let i = 0; i < sample; i++)
    widest = Math.max(widest, Math.min(60, (rows[i]?.[index] ?? '').length));
  return Math.round(Math.min(360, Math.max(110, widest * 7.2 + 28)));
}

function Cell({ value }: { value: string }) {
  // Page data is rendered as plain text only. Links are clickable only for http(s) URLs.
  const href = value.startsWith('http') ? safeHttpUrl(value) : null;
  if (href) {
    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer nofollow"
        className="truncate text-accent hover:underline"
        title={value}
      >
        {value}
      </a>
    );
  }
  return (
    <span className="truncate" title={value.length > 30 ? value : undefined}>
      {value}
    </span>
  );
}

export interface DataGridProps {
  columns: DataColumn[];
  rows: string[][];
  types?: ColumnType[];
  emptyMessage?: string;
}

/**
 * Windowed grid: only rows in view (plus overscan) are rendered, so 50k rows scroll smoothly.
 */
export function DataGrid({
  columns,
  rows,
  types,
  emptyMessage = 'No rows to show.',
}: DataGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(600);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setViewport(el.clientHeight));
    ro.observe(el);
    setViewport(el.clientHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // New data: jump back to the top.
    scrollRef.current?.scrollTo({ top: 0 });
    setScrollTop(0);
  }, [rows.length, columns.length]);

  const widths = useMemo(
    () => columns.map((c, i) => columnWidth(c.name, rows, i)),
    [columns, rows],
  );
  const template = `${INDEX_WIDTH}px ${widths.map((w) => `${w}px`).join(' ')}`;
  const totalWidth = INDEX_WIDTH + widths.reduce((a, b) => a + b, 0);

  const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const end = Math.min(rows.length, Math.ceil((scrollTop + viewport) / ROW_HEIGHT) + OVERSCAN);
  const visible = Array.from({ length: Math.max(0, end - start) }, (_, i) => start + i);

  return (
    <div
      ref={scrollRef}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
      className="scroll-thin relative h-full overflow-auto rounded-xl border border-border bg-surface"
      role="grid"
      aria-rowcount={rows.length + 1}
      aria-colcount={columns.length + 1}
      data-testid="data-grid"
    >
      <div style={{ width: Math.max(totalWidth, 0), minWidth: '100%' }}>
        <div
          role="row"
          className="sticky top-0 z-10 grid border-b border-border bg-sunken/95 text-xs font-semibold text-muted backdrop-blur"
          style={{ gridTemplateColumns: template, height: ROW_HEIGHT }}
        >
          <div role="columnheader" className="flex items-center px-3 text-subtle">
            #
          </div>
          {columns.map((c, i) => (
            <div
              role="columnheader"
              key={c.id}
              className="flex min-w-0 items-center gap-1.5 border-l border-border/70 px-3"
            >
              <span className="truncate" title={c.name}>
                {c.name}
              </span>
              {types?.[i] && TYPE_LABEL[types[i]!] && (
                <span className="rounded bg-surface px-1 text-[10px] font-medium text-subtle">
                  {TYPE_LABEL[types[i]!]}
                </span>
              )}
            </div>
          ))}
        </div>
        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center text-sm text-subtle">{emptyMessage}</div>
        ) : (
          <div className="relative" style={{ height: rows.length * ROW_HEIGHT }}>
            {visible.map((r) => (
              <div
                role="row"
                aria-rowindex={r + 2}
                key={r}
                className={cx(
                  'absolute left-0 right-0 grid items-center border-b border-border/60 text-[13px]',
                  r % 2 === 1 && 'bg-sunken/40',
                )}
                style={{ top: r * ROW_HEIGHT, height: ROW_HEIGHT, gridTemplateColumns: template }}
              >
                <div role="gridcell" className="tabular px-3 text-xs text-subtle">
                  {r + 1}
                </div>
                {columns.map((c, ci) => (
                  <div role="gridcell" key={c.id} className="flex min-w-0 px-3">
                    <Cell value={rows[r]?.[ci] ?? ''} />
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
