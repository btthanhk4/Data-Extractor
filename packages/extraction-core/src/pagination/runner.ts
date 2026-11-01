import { LIMITS, PAGINATION_LIMITS, clamp, errorMessage } from '@swde/shared';
import { RowDeduper } from '../deduplication';

export interface PageSnapshot {
  rows: string[][];
  fingerprint: string;
}

/** Browser-specific operations, injected so the loop itself is testable without a browser. */
export interface PaginationAdapter {
  extract(): Promise<PageSnapshot>;
  /** Clicks the next control. Resolves false when there is no enabled next control. */
  clickNext(): Promise<boolean>;
}

export interface PaginationProgress {
  page: number;
  maxPages: number;
  rows: number;
  duplicatesRemoved: number;
  phase: 'extracting' | 'waiting' | 'navigating' | 'retrying';
  message: string;
}

export interface PaginationOptions {
  maxPages: number;
  delayMs: number;
  pageTimeoutMs?: number;
  pollIntervalMs?: number;
  maxRetries?: number;
  backoffBaseMs?: number;
  maxRows?: number;
  signal?: AbortSignal;
  onProgress?: (progress: PaginationProgress) => void;
  /** Injectable for tests. */
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export type PaginationStatus = 'completed' | 'partial' | 'cancelled' | 'failed';

export interface PaginationResult {
  status: PaginationStatus;
  reason: string;
  pages: number;
  rows: string[][];
  duplicatesRemoved: number;
  errors: string[];
}

export class AbortError extends Error {
  constructor() {
    super('Cancelled');
    this.name = 'AbortError';
  }
}

export function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new AbortError());
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new AbortError());
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function backoffDelay(
  attempt: number,
  baseMs: number,
  random: () => number = Math.random,
): number {
  // Exponential backoff with +/-20% jitter, capped at 30s.
  const raw = baseMs * 2 ** attempt;
  return Math.min(30_000, Math.round(raw * (0.8 + random() * 0.4)));
}

export async function runPagination(
  adapter: PaginationAdapter,
  options: PaginationOptions,
): Promise<PaginationResult> {
  const maxPages = clamp(Math.floor(options.maxPages), 1, PAGINATION_LIMITS.maxPages);
  // Never go below the minimum polite delay, regardless of caller input.
  const delayMs = clamp(
    options.delayMs,
    PAGINATION_LIMITS.minDelayMs,
    PAGINATION_LIMITS.maxDelayMs,
  );
  const timeoutMs = options.pageTimeoutMs ?? PAGINATION_LIMITS.pageTimeoutMs;
  const pollMs = options.pollIntervalMs ?? 500;
  const maxRetries = options.maxRetries ?? PAGINATION_LIMITS.maxRetries;
  const baseMs = options.backoffBaseMs ?? PAGINATION_LIMITS.backoffBaseMs;
  const maxRows = options.maxRows ?? LIMITS.maxRows;
  const sleep = options.sleep ?? abortableSleep;
  const random = options.random ?? Math.random;
  const { signal } = options;

  const deduper = new RowDeduper();
  const rows: string[][] = [];
  const errors: string[] = [];
  let pages = 0;
  let duplicatesRemoved = 0;

  const report = (phase: PaginationProgress['phase'], message: string) =>
    options.onProgress?.({
      page: pages,
      maxPages,
      rows: rows.length,
      duplicatesRemoved,
      phase,
      message,
    });

  const checkAbort = () => {
    if (signal?.aborted) throw new AbortError();
  };

  async function withRetry<T>(label: string, fn: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      checkAbort();
      try {
        return await fn();
      } catch (error) {
        if (error instanceof AbortError) throw error;
        if (attempt >= maxRetries) throw error;
        const wait = backoffDelay(attempt, baseMs, random);
        errors.push(
          `${label}: ${errorMessage(error)} (retrying in ${Math.round(wait / 100) / 10}s)`,
        );
        report('retrying', `${label} failed, retrying…`);
        await sleep(wait, signal);
      }
    }
  }

  const finish = (status: PaginationStatus, reason: string): PaginationResult => ({
    status,
    reason,
    pages,
    rows,
    duplicatesRemoved,
    errors,
  });

  const accept = (snapshot: PageSnapshot): number => {
    const fresh = deduper.addAll(snapshot.rows);
    duplicatesRemoved += snapshot.rows.length - fresh.length;
    const room = maxRows - rows.length;
    rows.push(...fresh.slice(0, Math.max(0, room)));
    pages += 1;
    return fresh.length;
  };

  try {
    report('extracting', 'Reading page 1…');
    const first = await withRetry('Page 1', () => adapter.extract());
    accept(first);
    let previous = first.fingerprint;
    report('extracting', `Page 1: ${rows.length} rows`);

    while (pages < maxPages) {
      if (rows.length >= maxRows)
        return finish('partial', `Stopped at the ${maxRows.toLocaleString('en-US')}-row limit.`);
      checkAbort();
      report('navigating', `Opening page ${pages + 1}…`);
      const clicked = await withRetry('Next page', () => adapter.clickNext());
      if (!clicked) return finish('completed', 'No further pages were found.');

      report(
        'waiting',
        `Waiting ${Math.round(delayMs / 100) / 10}s before reading page ${pages + 1}…`,
      );
      await sleep(delayMs, signal);

      // Poll count instead of wall clock keeps the loop deterministic under injected sleep.
      const maxPolls = Math.max(1, Math.ceil(timeoutMs / pollMs));
      let snapshot: PageSnapshot | null = null;
      let lastError = '';
      for (let poll = 0; poll < maxPolls; poll++) {
        checkAbort();
        try {
          const s = await adapter.extract();
          if (s.fingerprint !== previous && s.rows.length > 0) {
            snapshot = s;
            break;
          }
        } catch (error) {
          // Expected while the tab is navigating; keep polling until the deadline.
          lastError = errorMessage(error);
        }
        await sleep(pollMs, signal);
      }
      if (!snapshot) {
        const detail = lastError ? ` Last error: ${lastError}` : '';
        return finish('partial', `Page ${pages + 1} did not load new data in time.${detail}`);
      }
      previous = snapshot.fingerprint;
      const fresh = accept(snapshot);
      report('extracting', `Page ${pages}: +${fresh} rows`);
      if (fresh === 0)
        return finish('completed', `Page ${pages} only repeated earlier rows; stopping.`);
    }
    return finish('completed', `Reached the limit of ${maxPages} pages.`);
  } catch (error) {
    if (error instanceof AbortError || signal?.aborted)
      return finish('cancelled', 'Cancelled by user.');
    const message = errorMessage(error);
    errors.push(message);
    return finish(pages > 0 ? 'partial' : 'failed', message);
  }
}
