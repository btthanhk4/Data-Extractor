import { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Download,
  Globe,
  KeyRound,
  LayoutList,
  MousePointerSquareDashed,
  Play,
  RefreshCw,
  ScanSearch,
  Settings as SettingsIcon,
  Sparkles,
  Table2,
  Eye,
  WifiOff,
} from 'lucide-react';
import type { DetectedDataset, PageInfo, Preset } from '@swde/shared';
import { AckResponseSchema, errorMessage, toOrigin } from '@swde/shared';
import { cleanData, defaultCleaningRules, initialColumnState } from '@swde/extraction-core';
import { Badge, Button, Notice, ProBadge, Spinner, cx } from '../components/ui';
import { Logo } from '../components/Logo';
import { initLicense, useLicense } from '../hooks/useLicense';
import { useOnline, useSettings } from '../hooks/useSettings';
import { detectInTab, extractInTab } from '../services/extraction';
import { defaultFilename, exportData } from '../services/export';
import { presetsForOrigin } from '../services/presets';
import { createSession, openDashboard } from '../services/sessions';
import {
  TabError,
  checkUrlSupport,
  ensureContentScript,
  getTargetTab,
  sendToTab,
} from '../services/tabs';

type Phase =
  | { kind: 'loading' }
  | { kind: 'unsupported'; reason: string }
  | { kind: 'idle' }
  | { kind: 'detecting' }
  | { kind: 'results' }
  | { kind: 'empty' }
  | { kind: 'permission'; message: string }
  | { kind: 'error'; message: string };

type Busy = 'preview' | 'export' | 'picker' | null;

function hostname(url: string | undefined): string {
  try {
    return url ? new URL(url).hostname || url : '';
  } catch {
    return '';
  }
}

export function Popup() {
  const { settings } = useSettings();
  const entitlements = useLicense((s) => s.entitlements);
  const online = useOnline();
  const [tab, setTab] = useState<chrome.tabs.Tab | null>(null);
  const [phase, setPhase] = useState<Phase>({ kind: 'loading' });
  const [datasets, setDatasets] = useState<DetectedDataset[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [page, setPage] = useState<PageInfo | null>(null);
  const [busy, setBusy] = useState<Busy>(null);
  const [toast, setToast] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const [presets, setPresets] = useState<Preset[]>([]);

  useEffect(() => {
    initLicense();
    void getTargetTab().then(async (t) => {
      setTab(t);
      const support = checkUrlSupport(t?.url);
      setPhase(
        support.supported ? { kind: 'idle' } : { kind: 'unsupported', reason: support.reason },
      );
      const origin = t?.url ? toOrigin(t.url) : null;
      if (origin) setPresets(await presetsForOrigin(origin));
    });
  }, []);

  const handleError = useCallback((error: unknown) => {
    if (error instanceof TabError && error.code === 'permission')
      setPhase({ kind: 'permission', message: error.message });
    else if (error instanceof TabError && error.code === 'unsupported')
      setPhase({ kind: 'unsupported', reason: error.message });
    else setPhase({ kind: 'error', message: errorMessage(error) });
  }, []);

  const detect = useCallback(async () => {
    if (!tab?.id) return;
    setPhase({ kind: 'detecting' });
    setToast(null);
    try {
      const result = await detectInTab(tab.id, tab.url);
      setPage(result.page);
      setDatasets(result.datasets);
      setSelectedId(result.datasets[0]?.id ?? null);
      setPhase({ kind: result.datasets.length > 0 ? 'results' : 'empty' });
    } catch (error) {
      handleError(error);
    }
  }, [tab, handleError]);

  const selected = datasets.find((d) => d.id === selectedId) ?? null;

  const preview = async () => {
    if (!tab?.id || !selected || !page) return;
    setBusy('preview');
    try {
      const id = await createSession({
        tabId: tab.id,
        page,
        label: selected.label,
        descriptor: selected.descriptor,
        presetId: null,
        data: null,
        pages: 1,
      });
      await openDashboard(`/preview?s=${id}`);
      window.close();
    } catch (error) {
      setBusy(null);
      setToast({ tone: 'danger', text: errorMessage(error) });
    }
  };

  const exportCsv = async () => {
    if (!tab?.id || !selected) return;
    setBusy('export');
    setToast(null);
    try {
      const result = await extractInTab(tab.id, selected.descriptor, tab.url);
      const cleaned = cleanData(
        result.data,
        initialColumnState(result.data),
        defaultCleaningRules({
          trimWhitespace: settings.defaultTrimWhitespace,
          removeEmptyRows: settings.defaultRemoveEmptyRows,
        }),
      );
      const filename = await exportData({
        format: 'csv',
        header: cleaned.columns.map((c) => c.name),
        rows: cleaned.rows,
        filename: defaultFilename(settings, result.page, selected.label),
        settings,
        entitlements,
        page: result.page,
        dataset: selected.label,
        pages: 1,
      });
      setToast({
        tone: 'success',
        text: `Saved ${filename} · ${cleaned.rows.length.toLocaleString('en-US')} rows`,
      });
    } catch (error) {
      if (error instanceof TabError) handleError(error);
      else setToast({ tone: 'danger', text: errorMessage(error) });
    } finally {
      setBusy(null);
    }
  };

  const startPicker = async () => {
    if (!entitlements.has('visual-select')) {
      await openDashboard('/license?feature=visual-select');
      window.close();
      return;
    }
    if (!tab?.id) return;
    setBusy('picker');
    try {
      await ensureContentScript(tab.id, tab.url);
      await sendToTab(tab.id, { type: 'swde:pickerStart' }, AckResponseSchema);
      window.close();
    } catch (error) {
      setBusy(null);
      handleError(error);
    }
  };

  const runPreset = async (preset: Preset) => {
    if (!tab?.id || !tab.url) return;
    try {
      const id = await createSession({
        tabId: tab.id,
        page: { url: tab.url, title: tab.title ?? '' },
        label: preset.name,
        descriptor: preset.descriptor,
        presetId: preset.id,
        data: null,
        pages: 1,
      });
      await openDashboard(`/preview?s=${id}`);
      window.close();
    } catch (error) {
      setToast({ tone: 'danger', text: errorMessage(error) });
    }
  };

  const canScan = phase.kind !== 'unsupported' && phase.kind !== 'loading' && !!tab?.id;
  const isPro = entitlements.plan === 'pro';

  return (
    <div className="flex min-h-[480px] flex-col">
      <header className="flex items-center gap-2.5 border-b border-border bg-surface px-4 py-3">
        <Logo size={26} />
        <div className="min-w-0 flex-1">
          <h1 className="text-[13px] font-semibold leading-tight">Smart Web Data Extractor</h1>
          <p className="text-[11px] text-subtle">Tables & lists → CSV, locally</p>
        </div>
        {isPro ? <Badge tone="pro">Pro</Badge> : <Badge>Free</Badge>}
        <Button
          variant="ghost"
          size="sm"
          className="!px-1.5"
          aria-label="Settings"
          title="Settings"
          onClick={() => void openDashboard('/settings').then(() => window.close())}
          icon={<SettingsIcon className="h-4 w-4" />}
        />
      </header>

      <main className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex items-center gap-2.5 rounded-xl border border-border bg-surface px-3 py-2.5">
          <div
            className={cx(
              'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg',
              phase.kind === 'unsupported' ? 'bg-sunken text-subtle' : 'bg-accent-soft text-accent',
            )}
          >
            {phase.kind === 'unsupported' ? (
              <Ban className="h-3.5 w-3.5" />
            ) : (
              <Globe className="h-3.5 w-3.5" />
            )}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium" title={tab?.title}>
              {tab?.title || (phase.kind === 'loading' ? 'Loading…' : 'Untitled page')}
            </p>
            <p className="truncate text-[11px] text-subtle">{hostname(tab?.url) || '—'}</p>
          </div>
          {!online && (
            <Badge tone="warning">
              <WifiOff className="h-3 w-3" aria-hidden /> Offline
            </Badge>
          )}
        </div>

        {phase.kind === 'unsupported' && (
          <Notice tone="neutral" icon={<Ban className="h-4 w-4" />} title="This page can't be read">
            {phase.reason} Open a regular website and try again.
          </Notice>
        )}

        {phase.kind === 'idle' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
              <ScanSearch className="h-6 w-6" />
            </div>
            <div>
              <p className="text-sm font-medium">Find data on this page</p>
              <p className="mt-0.5 text-xs text-subtle">
                Detects tables, product grids, search results and other lists.
              </p>
            </div>
            <Button
              variant="primary"
              size="lg"
              onClick={() => void detect()}
              icon={<ScanSearch className="h-4 w-4" />}
            >
              Detect data
            </Button>
          </div>
        )}

        {phase.kind === 'detecting' && (
          <div
            className="flex flex-1 flex-col items-center justify-center gap-2 py-8 text-center"
            aria-live="polite"
          >
            <Spinner className="h-6 w-6" />
            <p className="text-sm font-medium">Scanning page…</p>
            <p className="text-xs text-subtle">Everything is processed on your device.</p>
          </div>
        )}

        {phase.kind === 'empty' && (
          <Notice
            icon={<LayoutList className="h-4 w-4" />}
            title="No tables or lists found"
            action={
              <Button
                size="sm"
                onClick={() => void detect()}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Scan again
              </Button>
            }
          >
            If the page is still loading content, wait a moment and scan again — or select the
            elements manually.
          </Notice>
        )}

        {phase.kind === 'permission' && (
          <Notice
            tone="warning"
            icon={<KeyRound className="h-4 w-4" />}
            title="Access needed"
            action={
              <Button
                size="sm"
                onClick={() => void detect()}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Try again
              </Button>
            }
          >
            {phase.message}
          </Notice>
        )}

        {phase.kind === 'error' && (
          <Notice
            tone="danger"
            icon={<AlertTriangle className="h-4 w-4" />}
            title="Extraction failed"
            action={
              <Button
                size="sm"
                onClick={() => void detect()}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Try again
              </Button>
            }
          >
            {phase.message}
          </Notice>
        )}

        {phase.kind === 'results' && (
          <section
            className="flex min-h-0 flex-1 flex-col animate-fade-in"
            aria-labelledby="ds-heading"
          >
            <div className="mb-2 flex items-center justify-between">
              <h2 id="ds-heading" className="text-[13px] font-semibold">
                <span data-testid="dataset-count">{datasets.length}</span> dataset
                {datasets.length === 1 ? '' : 's'} found
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void detect()}
                icon={<RefreshCw className="h-3.5 w-3.5" />}
              >
                Rescan
              </Button>
            </div>
            <div
              role="radiogroup"
              aria-label="Detected datasets"
              className="scroll-thin -mx-1 flex max-h-[220px] flex-col gap-1.5 overflow-y-auto px-1 pb-1"
            >
              {datasets.map((d) => {
                const active = d.id === selectedId;
                const KindIcon = d.descriptor.kind === 'table' ? Table2 : LayoutList;
                return (
                  <label
                    key={d.id}
                    className={cx(
                      'flex cursor-pointer gap-2.5 rounded-xl border px-3 py-2 transition-colors',
                      active
                        ? 'border-accent/50 bg-accent-soft/50'
                        : 'border-border bg-surface hover:bg-sunken',
                    )}
                  >
                    <input
                      type="radio"
                      name="dataset"
                      className="sr-only"
                      checked={active}
                      onChange={() => setSelectedId(d.id)}
                    />
                    <KindIcon
                      className={cx(
                        'mt-0.5 h-4 w-4 shrink-0',
                        active ? 'text-accent' : 'text-subtle',
                      )}
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13px] font-medium">{d.label}</span>
                      </span>
                      <span className="tabular block text-[11px] text-subtle">
                        {d.descriptor.kind === 'table' ? 'Table' : 'List'} ·{' '}
                        {d.rowCount.toLocaleString('en-US')} rows · {d.columnCount} columns
                      </span>
                      {d.preview[0] && (
                        <span className="mt-0.5 block truncate text-[11px] text-muted">
                          {d.preview[0].filter(Boolean).slice(0, 4).join(' · ')}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                onClick={() => void preview()}
                loading={busy === 'preview'}
                disabled={!selected || busy !== null}
                icon={<Eye className="h-4 w-4" />}
              >
                Preview data
              </Button>
              <Button
                variant="primary"
                onClick={() => void exportCsv()}
                loading={busy === 'export'}
                disabled={!selected || busy !== null}
                icon={<Download className="h-4 w-4" />}
              >
                Export CSV
              </Button>
            </div>
          </section>
        )}

        {toast && (
          <Notice
            tone={toast.tone}
            icon={
              toast.tone === 'success' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )
            }
            title={toast.tone === 'success' ? 'Export complete' : 'Something went wrong'}
          >
            <span data-testid="popup-toast">{toast.text}</span>
          </Notice>
        )}

        {canScan && (
          <div className="mt-auto flex flex-col gap-2 border-t border-border pt-3">
            <button
              type="button"
              onClick={() => void startPicker()}
              disabled={busy !== null}
              className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-sunken disabled:opacity-50"
            >
              <MousePointerSquareDashed className="h-4 w-4 text-muted" aria-hidden />
              <span className="flex-1">
                <span className="block text-[13px] font-medium">Select elements on page</span>
                <span className="block text-[11px] text-subtle">
                  Point and click the list or columns you want
                </span>
              </span>
              {entitlements.has('visual-select') ? null : <ProBadge />}
            </button>
            {entitlements.has('presets') && presets.length > 0 && (
              <div>
                <p className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-wider text-subtle">
                  Presets for this site
                </p>
                {presets.slice(0, 4).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => void runPreset(p)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-sunken"
                  >
                    <Play className="h-3.5 w-3.5 text-accent" aria-hidden />
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      <footer className="flex items-center justify-between border-t border-border bg-surface px-4 py-2.5">
        {isPro ? (
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Sparkles className="h-3.5 w-3.5 text-pro" aria-hidden /> Pro features active
          </span>
        ) : (
          <button
            type="button"
            className="flex items-center gap-1.5 text-xs font-medium text-pro hover:underline"
            onClick={() => void openDashboard('/license').then(() => window.close())}
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden /> Upgrade to Pro
          </button>
        )}
        <button
          type="button"
          className="text-xs text-subtle hover:text-fg"
          onClick={() => void openDashboard('/presets').then(() => window.close())}
        >
          Open dashboard
        </button>
      </footer>
    </div>
  );
}
