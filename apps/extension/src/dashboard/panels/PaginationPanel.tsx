import { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  CircleSlash,
  Layers,
  Play,
  Plus,
  Search,
  Square,
} from 'lucide-react';
import type { NextControl } from '@swde/shared';
import { PAGINATION_LIMITS, clamp, errorMessage } from '@swde/shared';
import type { PaginationProgress, PaginationResult } from '@swde/extraction-core';
import { RowDeduper, runPagination } from '@swde/extraction-core';
import { useLicense } from '../../hooks/useLicense';
import { createTabPaginationAdapter, extractInTab, findNextInTab } from '../../services/extraction';
import { requestOriginAccess } from '../../services/tabs';
import { usePreview } from '../store';
import {
  Button,
  Field,
  Input,
  Notice,
  ProBadge,
  ProgressBar,
  SectionTitle,
} from '../../components/ui';

const STATUS_COPY: Record<
  PaginationResult['status'],
  { title: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  completed: { title: 'Extraction completed', tone: 'success' },
  partial: { title: 'Extraction partially completed', tone: 'warning' },
  cancelled: { title: 'Extraction cancelled', tone: 'neutral' },
  failed: { title: 'Extraction failed', tone: 'danger' },
};

export function PaginationPanel({ onUpgrade }: { onUpgrade: () => void }) {
  const allowed = useLicense((s) => s.entitlements.has('multi-page'));
  const session = usePreview((s) => s.session);
  const data = usePreview((s) => s.data);
  const pages = usePreview((s) => s.pages);
  const pagination = usePreview((s) => s.pagination);
  const setPagination = usePreview((s) => s.setPagination);
  const setRows = usePreview((s) => s.setRows);
  const [finding, setFinding] = useState(false);
  const [findError, setFindError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<PaginationProgress | null>(null);
  const [result, setResult] = useState<PaginationResult | null>(null);
  const [capturing, setCapturing] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  if (!allowed) {
    return (
      <div>
        <SectionTitle action={<ProBadge />}>Multiple pages</SectionTitle>
        <p className="text-xs text-muted">
          Follow “Next” buttons and numbered pagination to collect rows from several pages, with
          rate limiting, a page limit and a cancel button.
        </p>
        <Button className="mt-2" size="sm" onClick={onUpgrade}>
          See Pro features
        </Button>
      </div>
    );
  }

  const next: NextControl | null = pagination.next;

  const find = async () => {
    if (!session) return;
    setFinding(true);
    setFindError(null);
    try {
      const found = await findNextInTab(session.tabId);
      setPagination({ next: found });
      if (!found)
        setFindError(
          'No “Next” control was found. You can still navigate yourself and use “Capture current page”.',
        );
    } catch (error) {
      setFindError(errorMessage(error));
    } finally {
      setFinding(false);
    }
  };

  const start = async () => {
    if (!session || !next) return;
    // Ask for this site's permission first, while we still have the click's user gesture.
    // Without it, reading stops after the first full page load (activeTab ends on navigation).
    const granted = await requestOriginAccess(session.page.url);
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setResult(null);
    setProgress(null);
    const outcome = await runPagination(
      createTabPaginationAdapter(session.tabId, session.descriptor, next),
      {
        maxPages: pagination.maxPages,
        delayMs: pagination.delayMs,
        signal: controller.signal,
        onProgress: setProgress,
      },
    );
    if (!granted && outcome.status !== 'completed') {
      outcome.errors.push(
        'Site access was not granted, so pages that fully reload cannot be read.',
      );
    }
    if (outcome.rows.length > 0) setRows(outcome.rows, outcome.pages);
    setResult(outcome);
    setRunning(false);
    abortRef.current = null;
  };

  const capture = async () => {
    if (!session || !data) return;
    setCapturing(true);
    setFindError(null);
    try {
      const page = await extractInTab(session.tabId, session.descriptor);
      const deduper = new RowDeduper();
      deduper.addAll(data.rows);
      const fresh = deduper.addAll(page.data.rows);
      setRows([...data.rows, ...fresh], pages + 1);
      setResult({
        status: 'completed',
        reason: `Captured ${fresh.length} new rows (${page.data.rows.length - fresh.length} duplicates skipped).`,
        pages: pages + 1,
        rows: [],
        duplicatesRemoved: page.data.rows.length - fresh.length,
        errors: [],
      });
    } catch (error) {
      setFindError(errorMessage(error));
    } finally {
      setCapturing(false);
    }
  };

  const percent = progress ? (progress.page / Math.max(1, progress.maxPages)) * 100 : null;
  const copy = result ? STATUS_COPY[result.status] : null;

  return (
    <div>
      <SectionTitle
        action={
          <span className="text-[11px] text-subtle">
            {pages} page{pages === 1 ? '' : 's'} so far
          </span>
        }
      >
        Multiple pages
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Max pages">
          <Input
            type="number"
            min={PAGINATION_LIMITS.minPages}
            max={PAGINATION_LIMITS.maxPages}
            value={pagination.maxPages}
            disabled={running}
            onChange={(e) =>
              setPagination({
                maxPages: clamp(
                  Number(e.target.value) || PAGINATION_LIMITS.minPages,
                  PAGINATION_LIMITS.minPages,
                  PAGINATION_LIMITS.maxPages,
                ),
              })
            }
            data-testid="max-pages"
          />
        </Field>
        <Field label="Delay (seconds)">
          <Input
            type="number"
            min={PAGINATION_LIMITS.minDelayMs / 1000}
            max={PAGINATION_LIMITS.maxDelayMs / 1000}
            step={0.5}
            value={pagination.delayMs / 1000}
            disabled={running}
            onChange={(e) =>
              setPagination({
                delayMs: clamp(
                  Math.round((Number(e.target.value) || 1) * 1000),
                  PAGINATION_LIMITS.minDelayMs,
                  PAGINATION_LIMITS.maxDelayMs,
                ),
              })
            }
            data-testid="delay-seconds"
          />
        </Field>
      </div>

      <div className="mt-2.5 rounded-lg border border-border bg-sunken/60 px-3 py-2 text-xs">
        {next ? (
          <span className="flex items-center gap-1.5">
            <Layers className="h-3.5 w-3.5 text-accent" aria-hidden />
            Next control:{' '}
            <strong className="truncate font-medium" data-testid="next-label">
              “{next.label}”
            </strong>
          </span>
        ) : (
          <span className="text-subtle">No next-page control selected yet.</span>
        )}
      </div>
      {findError && <p className="mt-1.5 text-[11px] text-warning">{findError}</p>}

      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          onClick={() => void find()}
          loading={finding}
          disabled={running || !session}
          icon={<Search className="h-3.5 w-3.5" />}
        >
          Find “Next” button
        </Button>
        {running ? (
          <Button
            size="sm"
            variant="danger"
            onClick={() => abortRef.current?.abort()}
            icon={<Square className="h-3.5 w-3.5" />}
            data-testid="cancel-pagination"
          >
            Cancel
          </Button>
        ) : (
          <Button
            size="sm"
            variant="primary"
            onClick={() => void start()}
            disabled={!next || !session}
            icon={<Play className="h-3.5 w-3.5" />}
            data-testid="start-pagination"
          >
            Start
          </Button>
        )}
        <Button
          size="sm"
          variant="ghost"
          onClick={() => void capture()}
          loading={capturing}
          disabled={running || !data}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Capture current page
        </Button>
      </div>

      {running && progress && (
        <div className="mt-3 flex flex-col gap-1.5" aria-live="polite">
          <ProgressBar value={percent} />
          <p className="tabular text-[11px] text-muted" data-testid="pagination-progress">
            {progress.message} · {progress.rows.toLocaleString('en-US')} rows
            {progress.duplicatesRemoved > 0 &&
              ` · ${progress.duplicatesRemoved} duplicates skipped`}
          </p>
        </div>
      )}

      {result && copy && !running && (
        <div className="mt-3">
          <Notice
            tone={copy.tone}
            icon={
              result.status === 'completed' ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : result.status === 'cancelled' ? (
                <CircleSlash className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )
            }
            title={copy.title}
          >
            <span data-testid="pagination-result">
              {result.reason}{' '}
              {result.pages > 0 && `${result.pages} page${result.pages === 1 ? '' : 's'} read.`}
            </span>
            {result.errors.length > 0 && (
              <details className="mt-1">
                <summary className="cursor-pointer">Details ({result.errors.length})</summary>
                <ul className="mt-1 list-disc pl-4">
                  {result.errors.slice(-8).map((e, i) => (
                    <li key={i}>{e}</li>
                  ))}
                </ul>
              </details>
            )}
          </Notice>
        </div>
      )}
      <p className="mt-2 text-[11px] text-subtle">
        Runs only while this tab is open, in the visible source tab. It never bypasses logins,
        CAPTCHAs or paywalls.
      </p>
    </div>
  );
}
