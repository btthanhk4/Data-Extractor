import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink, Info, RefreshCw, Rows3 } from 'lucide-react';
import type { ColumnType, Settings } from '@swde/shared';
import { enforceCleaningRules } from '@swde/licensing';
import { cleanData, detectColumnType } from '@swde/extraction-core';
import { DataGrid } from '../../components/DataGrid';
import { Badge, Button, Card, Notice, Spinner } from '../../components/ui';
import { useLicense } from '../../hooks/useLicense';
import { usePreview } from '../store';
import { CleaningPanel } from '../panels/CleaningPanel';
import { ColumnsPanel } from '../panels/ColumnsPanel';
import { ExportPanel } from '../panels/ExportPanel';
import { PaginationPanel } from '../panels/PaginationPanel';
import { SavePresetPanel } from '../panels/SavePresetPanel';

type Tab = 'columns' | 'cleaning' | 'pages';

export function PreviewView({
  sessionId,
  settings,
  settingsLoaded,
  updateSettings,
  navigate,
}: {
  sessionId: string | null;
  settings: Settings;
  settingsLoaded: boolean;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
  navigate: (route: string) => void;
}) {
  const {
    status,
    error,
    sourceGone,
    data,
    columns,
    rules,
    session,
    notice,
    pages,
    presetName,
    load,
    reextract,
  } = usePreview();
  const entitlements = useLicense((s) => s.entitlements);
  const [tab, setTab] = useState<Tab>('columns');

  useEffect(() => {
    if (sessionId && settingsLoaded) void load(sessionId, settings);
    // Settings changes must not re-extract; only a new session id or first settings load does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, settingsLoaded, load]);

  // The entitlement service strips Pro-only rules here, so no stale state can bypass gating.
  const effectiveRules = useMemo(
    () => enforceCleaningRules(rules, entitlements),
    [rules, entitlements],
  );
  const cleaned = useMemo(
    () => (data ? cleanData(data, columns, effectiveRules) : null),
    [data, columns, effectiveRules],
  );

  const typeById = useMemo(() => {
    const map = new Map<string, ColumnType>();
    if (!data) return map;
    data.columns.forEach((c, i) =>
      map.set(c.id, detectColumnType(data.rows.map((r) => r[i] ?? ''))),
    );
    return map;
  }, [data]);

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-lg py-16 text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Rows3 className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-semibold">No data selected</h2>
        <p className="mt-1 text-sm text-muted">
          Open a webpage, click the extension icon, choose <strong>Detect data</strong> and then{' '}
          <strong>Preview data</strong>.
        </p>
      </div>
    );
  }

  if (status === 'loading' || status === 'idle') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2" aria-live="polite">
        <Spinner className="h-6 w-6" />
        <p className="text-sm font-medium">Extracting data…</p>
        <p className="text-xs text-subtle">
          Reading the page in its tab. Nothing leaves your device.
        </p>
      </div>
    );
  }

  if (status === 'error' || !data || !cleaned || !session) {
    return (
      <div className="mx-auto max-w-lg py-12">
        <Notice
          tone="danger"
          icon={<AlertTriangle className="h-4 w-4" />}
          title="Extraction failed"
          action={
            session && (
              <Button
                size="sm"
                onClick={() => void reextract()}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Try again
              </Button>
            )
          }
        >
          {error ?? 'Unknown error.'}
          {sourceGone && ' Go back to the page, open the extension and detect the data again.'}
        </Notice>
      </div>
    );
  }

  const types = cleaned.columns.map((c) => typeById.get(c.id) ?? 'text');
  const tabs: { id: Tab; label: string }[] = [
    { id: 'columns', label: 'Columns' },
    { id: 'cleaning', label: 'Cleaning' },
    { id: 'pages', label: 'Pages' },
  ];

  return (
    <div className="flex h-full min-h-0 gap-4">
      <section className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-lg font-semibold" data-testid="preview-title">
                {presetName ?? session.label}
              </h2>
              <Badge tone="accent">
                {session.descriptor.kind === 'table'
                  ? 'Table'
                  : session.descriptor.kind === 'list'
                    ? 'List'
                    : 'Custom'}
              </Badge>
            </div>
            <a
              href={/^https?:/.test(session.page.url) ? session.page.url : undefined}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-0.5 flex max-w-xl items-center gap-1 truncate text-xs text-subtle hover:text-fg"
            >
              {session.page.title || session.page.url}
              <ExternalLink className="h-3 w-3 shrink-0" aria-hidden />
            </a>
          </div>
          <div className="tabular flex items-center gap-3 text-xs text-muted">
            <span>
              <strong className="text-fg" data-testid="row-count">
                {cleaned.rows.length.toLocaleString('en-US')}
              </strong>{' '}
              rows
            </span>
            <span>
              <strong className="text-fg">{cleaned.columns.length}</strong> columns
            </span>
            {pages > 1 && (
              <span>
                <strong className="text-fg">{pages}</strong> pages
              </span>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void reextract()}
              icon={<RefreshCw className="h-3.5 w-3.5" />}
            >
              Re-extract
            </Button>
          </div>
        </div>
        {notice && (
          <Notice tone="warning" icon={<Info className="h-4 w-4" />} title="Heads up">
            {notice}
          </Notice>
        )}
        <div className="min-h-0 flex-1">
          <DataGrid
            columns={cleaned.columns}
            rows={cleaned.rows}
            types={types}
            emptyMessage={
              cleaned.columns.length === 0
                ? 'All columns are hidden.'
                : 'No rows left after cleaning.'
            }
          />
        </div>
      </section>

      <aside className="scroll-thin flex w-[340px] shrink-0 flex-col gap-3 overflow-y-auto pb-4">
        <Card className="p-4">
          <ExportPanel
            columns={cleaned.columns}
            rows={cleaned.rows}
            settings={settings}
            updateSettings={updateSettings}
          />
        </Card>
        <Card className="p-0">
          <div
            role="tablist"
            aria-label="Data options"
            className="flex border-b border-border px-2"
          >
            {tabs.map((t) => (
              <button
                key={t.id}
                role="tab"
                type="button"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-medium transition-colors ${
                  tab === t.id
                    ? 'border-accent text-fg'
                    : 'border-transparent text-subtle hover:text-fg'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="p-4">
            {tab === 'columns' && <ColumnsPanel types={typeById} />}
            {tab === 'cleaning' && <CleaningPanel stats={cleaned.stats} />}
            {tab === 'pages' && (
              <PaginationPanel onUpgrade={() => navigate('/license?feature=multi-page')} />
            )}
          </div>
        </Card>
        <Card className="p-4">
          <SavePresetPanel />
        </Card>
      </aside>
    </div>
  );
}
