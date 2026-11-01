import { ArrowDown, ArrowUp, Eye, EyeOff } from 'lucide-react';
import type { ColumnState, ColumnType } from '@swde/shared';
import { useLicense } from '../../hooks/useLicense';
import { usePreview } from '../store';
import { Button, Input, ProBadge, SectionTitle, cx } from '../../components/ui';

const TYPE_NAMES: Record<ColumnType, string> = {
  empty: 'Empty',
  text: 'Text',
  number: 'Number',
  currency: 'Currency',
  percent: 'Percent',
  date: 'Date',
  url: 'URL',
  email: 'Email',
};

export function ColumnsPanel({ types }: { types: Map<string, ColumnType> }) {
  const columns = usePreview((s) => s.columns);
  const setColumns = usePreview((s) => s.setColumns);
  const canReorder = useLicense((s) => s.entitlements.has('advanced-cleaning'));

  const update = (id: string, patch: Partial<ColumnState>) =>
    setColumns(columns.map((c) => (c.id === id ? { ...c, ...patch } : c)));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= columns.length) return;
    const next = columns.slice();
    [next[index], next[target]] = [next[target]!, next[index]!];
    setColumns(next);
  };

  const visibleCount = columns.filter((c) => c.visible).length;

  return (
    <div>
      <SectionTitle
        action={
          <span className="text-[11px] text-subtle">
            {visibleCount}/{columns.length} shown
          </span>
        }
      >
        Columns
      </SectionTitle>
      <ul className="flex flex-col gap-1" aria-label="Columns">
        {columns.map((col, i) => (
          <li
            key={col.id}
            className={cx('flex items-center gap-1.5 rounded-lg', !col.visible && 'opacity-60')}
          >
            <Button
              variant="ghost"
              size="sm"
              className="!px-1.5"
              aria-label={col.visible ? `Hide ${col.name}` : `Show ${col.name}`}
              title={col.visible ? 'Hide column' : 'Show column'}
              onClick={() => update(col.id, { visible: !col.visible })}
              icon={
                col.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />
              }
            />
            <Input
              aria-label={`Name of column ${i + 1}`}
              value={col.name}
              maxLength={200}
              onChange={(e) => update(col.id, { name: e.target.value })}
              onBlur={(e) => !e.target.value.trim() && update(col.id, { name: `Column ${i + 1}` })}
              className="h-7 flex-1 text-xs"
            />
            <span
              className="w-14 shrink-0 truncate text-right text-[10px] text-subtle"
              title="Detected type"
            >
              {TYPE_NAMES[types.get(col.id) ?? 'text']}
            </span>
            {canReorder && (
              <span className="flex">
                <Button
                  variant="ghost"
                  size="sm"
                  className="!px-1"
                  aria-label={`Move ${col.name} up`}
                  disabled={i === 0}
                  onClick={() => move(i, -1)}
                  icon={<ArrowUp className="h-3 w-3" />}
                />
                <Button
                  variant="ghost"
                  size="sm"
                  className="!px-1"
                  aria-label={`Move ${col.name} down`}
                  disabled={i === columns.length - 1}
                  onClick={() => move(i, 1)}
                  icon={<ArrowDown className="h-3 w-3" />}
                />
              </span>
            )}
          </li>
        ))}
      </ul>
      {!canReorder && (
        <p className="mt-2 flex items-center gap-1.5 text-[11px] text-subtle">
          Column ordering <ProBadge />
        </p>
      )}
    </div>
  );
}
