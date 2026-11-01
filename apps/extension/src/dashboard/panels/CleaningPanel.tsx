import type { TransformOp } from '@swde/shared';
import type { CleanStats } from '@swde/extraction-core';
import { useLicense } from '../../hooks/useLicense';
import { usePreview } from '../store';
import { ProBadge, SectionTitle, Select, Switch, cx } from '../../components/ui';

const TRANSFORMS: { op: TransformOp; label: string }[] = [
  { op: 'collapseWhitespace', label: 'Collapse whitespace' },
  { op: 'uppercase', label: 'UPPERCASE' },
  { op: 'lowercase', label: 'lowercase' },
  { op: 'titlecase', label: 'Title Case' },
  { op: 'numbersOnly', label: 'Numbers only' },
  { op: 'stripCurrency', label: 'Remove currency symbols' },
];

function Checklist({
  label,
  selected,
  onToggle,
  disabled,
}: {
  label: string;
  selected: string[];
  onToggle: (id: string) => void;
  disabled: boolean;
}) {
  const columns = usePreview((s) => s.columns).filter((c) => c.visible);
  return (
    <fieldset
      className={cx('mt-1 rounded-lg border border-border p-2', disabled && 'opacity-60')}
      disabled={disabled}
    >
      <legend className="px-1 text-[11px] text-subtle">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {columns.map((c) => {
          const on = selected.includes(c.id);
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => onToggle(c.id)}
              className={cx(
                'rounded-md border px-2 py-0.5 text-[11px] transition-colors',
                on
                  ? 'border-accent/40 bg-accent-soft text-accent'
                  : 'border-border text-muted hover:bg-sunken',
              )}
            >
              {c.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function CleaningPanel({ stats }: { stats: CleanStats | null }) {
  const rules = usePreview((s) => s.rules);
  const setRules = usePreview((s) => s.setRules);
  const columns = usePreview((s) => s.columns).filter((c) => c.visible);
  const advanced = useLicense((s) => s.entitlements.has('advanced-cleaning'));

  const toggle = (list: string[], id: string) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
  const transformFor = (id: string) => rules.transforms.find((t) => t.columnId === id)?.op ?? '';

  return (
    <div>
      <SectionTitle>Cleaning</SectionTitle>
      <Switch
        label="Trim whitespace"
        checked={rules.trimWhitespace}
        onChange={(v) => setRules({ trimWhitespace: v })}
      />
      <Switch
        label="Remove empty rows"
        description={stats?.removedEmpty ? `${stats.removedEmpty} removed` : undefined}
        checked={rules.removeEmptyRows}
        onChange={(v) => setRules({ removeEmptyRows: v })}
      />
      <Switch
        label="Remove duplicate rows"
        description={
          stats?.removedDuplicates
            ? `${stats.removedDuplicates} duplicates removed`
            : 'Compares whole rows'
        }
        checked={rules.dedupe.enabled}
        onChange={(v) => setRules({ dedupe: { ...rules.dedupe, enabled: v } })}
      />
      {rules.dedupe.enabled && (
        <Checklist
          label={
            advanced ? 'Compare only these columns (optional)' : 'Compare by specific columns — Pro'
          }
          selected={rules.dedupe.columns}
          disabled={!advanced}
          onToggle={(id) =>
            setRules({ dedupe: { ...rules.dedupe, columns: toggle(rules.dedupe.columns, id) } })
          }
        />
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-border pt-3">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-subtle">
          Advanced
        </span>
        {!advanced && <ProBadge />}
      </div>
      <Switch
        label="Normalize URLs"
        description="Remove #fragments and default ports"
        disabled={!advanced}
        checked={advanced && rules.normalizeUrls}
        onChange={(v) => setRules({ normalizeUrls: v })}
      />
      <Switch
        label="Strip tracking parameters"
        description="utm_*, fbclid, gclid and similar"
        disabled={!advanced}
        checked={advanced && rules.removeTrackingParams}
        onChange={(v) => setRules({ removeTrackingParams: v })}
      />
      <Checklist
        label={
          stats?.removedByFilter
            ? `Require values in (${stats.removedByFilter} rows filtered)`
            : 'Require values in'
        }
        selected={advanced ? rules.requireColumns : []}
        disabled={!advanced}
        onToggle={(id) => setRules({ requireColumns: toggle(rules.requireColumns, id) })}
      />
      <div className={cx('mt-2 flex flex-col gap-1.5', !advanced && 'opacity-60')}>
        <span className="text-[11px] text-subtle">Text transformations</span>
        {columns.map((c) => (
          <label key={c.id} className="flex items-center gap-2 text-xs">
            <span className="w-24 shrink-0 truncate text-muted" title={c.name}>
              {c.name}
            </span>
            <Select
              className="h-7 flex-1 text-xs"
              disabled={!advanced}
              value={advanced ? transformFor(c.id) : ''}
              aria-label={`Transformation for ${c.name}`}
              onChange={(e) => {
                const op = e.target.value as TransformOp | '';
                const rest = rules.transforms.filter((t) => t.columnId !== c.id);
                setRules({ transforms: op ? [...rest, { columnId: c.id, op }] : rest });
              }}
            >
              <option value="">None</option>
              {TRANSFORMS.map((t) => (
                <option key={t.op} value={t.op}>
                  {t.label}
                </option>
              ))}
            </Select>
          </label>
        ))}
      </div>
    </div>
  );
}
