import { describe, expect, it, vi } from 'vitest';
import type { PageSnapshot, PaginationAdapter } from '@swde/extraction-core';
import {
  abortableSleep,
  backoffDelay,
  clickNextControl,
  findNextControl,
  runPagination,
} from '@swde/extraction-core';
import { htmlDocument, loadFixture } from '../helpers';

const instant = () => Promise.resolve();

/** Simulated site with `total` pages of 3 rows each. */
function fakeSite(
  total: number,
  opts: { failFirstExtracts?: number; staleAfterClick?: number; repeatPage?: boolean } = {},
) {
  let page = 1;
  let failures = opts.failFirstExtracts ?? 0;
  let stale = 0;
  const snapshot = (p: number): PageSnapshot => {
    const n = opts.repeatPage ? 1 : p;
    return {
      rows: [0, 1, 2].map((i) => [`p${n}-${i}`]),
      fingerprint: `fp${n}`,
    };
  };
  const adapter: PaginationAdapter & { clicks: number } = {
    clicks: 0,
    async extract() {
      if (failures > 0) {
        failures -= 1;
        throw new Error('page is navigating');
      }
      if (stale > 0) {
        stale -= 1;
        return snapshot(page - 1);
      }
      return snapshot(page);
    },
    async clickNext() {
      adapter.clicks += 1;
      if (page >= total) return false;
      page += 1;
      stale = opts.staleAfterClick ?? 0;
      return true;
    },
  };
  return adapter;
}

describe('runPagination', () => {
  it('collects every page until there is no next control', async () => {
    const result = await runPagination(fakeSite(3), {
      maxPages: 10,
      delayMs: 1000,
      sleep: instant,
    });
    expect(result.status).toBe('completed');
    expect(result.pages).toBe(3);
    expect(result.rows).toHaveLength(9);
    expect(result.reason).toMatch(/No further pages/);
  });

  it('stops at the configured page limit', async () => {
    const site = fakeSite(50);
    const result = await runPagination(site, { maxPages: 4, delayMs: 1000, sleep: instant });
    expect(result.status).toBe('completed');
    expect(result.pages).toBe(4);
    expect(site.clicks).toBe(3);
  });

  it('enforces the minimum polite delay between pages', async () => {
    const sleep = vi.fn(instant);
    await runPagination(fakeSite(2), { maxPages: 2, delayMs: 10, sleep });
    expect(sleep).toHaveBeenCalledWith(1000, undefined);
  });

  it('waits for new content after clicking (polling)', async () => {
    const result = await runPagination(fakeSite(2, { staleAfterClick: 3 }), {
      maxPages: 5,
      delayMs: 1000,
      sleep: instant,
    });
    expect(result.pages).toBe(2);
    expect(result.rows).toHaveLength(6);
  });

  it('retries transient failures with exponential backoff', async () => {
    const sleep = vi.fn(instant);
    const result = await runPagination(fakeSite(1, { failFirstExtracts: 2 }), {
      maxPages: 3,
      delayMs: 1000,
      sleep,
      random: () => 0.5,
    });
    expect(result.status).toBe('completed');
    expect(sleep).toHaveBeenNthCalledWith(1, 1000, undefined);
    expect(sleep).toHaveBeenNthCalledWith(2, 2000, undefined);
    expect(result.errors).toHaveLength(2);
  });

  it('fails cleanly when the first page cannot be read', async () => {
    const result = await runPagination(fakeSite(3, { failFirstExtracts: 10 }), {
      maxPages: 3,
      delayMs: 1000,
      maxRetries: 2,
      sleep: instant,
    });
    expect(result.status).toBe('failed');
    expect(result.rows).toHaveLength(0);
  });

  it('reports partial results when a page never loads', async () => {
    const result = await runPagination(fakeSite(3, { staleAfterClick: 1_000 }), {
      maxPages: 3,
      delayMs: 1000,
      pageTimeoutMs: 2_000,
      pollIntervalMs: 500,
      sleep: instant,
    });
    expect(result.status).toBe('partial');
    expect(result.pages).toBe(1);
    expect(result.rows).toHaveLength(3);
  });

  it('stops when a page only repeats earlier rows', async () => {
    const site = fakeSite(10, { repeatPage: true });
    // Same rows but a different fingerprint, e.g. a page that ignores the page parameter.
    let n = 0;
    const adapter: PaginationAdapter = {
      extract: async () => ({ ...(await site.extract()), fingerprint: `x${n++}` }),
      clickNext: () => site.clickNext(),
    };
    const result = await runPagination(adapter, { maxPages: 10, delayMs: 1000, sleep: instant });
    expect(result.status).toBe('completed');
    expect(result.reason).toMatch(/repeated/);
    expect(result.duplicatesRemoved).toBe(3);
    expect(result.rows).toHaveLength(3);
  });

  it('can be cancelled', async () => {
    const controller = new AbortController();
    const site = fakeSite(10);
    const result = await runPagination(site, {
      maxPages: 10,
      delayMs: 1000,
      signal: controller.signal,
      // The user presses Cancel while the runner waits between pages.
      sleep: (_ms, signal) => {
        controller.abort();
        return abortableSleep(0, signal);
      },
    });
    expect(result.status).toBe('cancelled');
    expect(result.pages).toBe(1);
  });

  it('respects the row limit', async () => {
    const result = await runPagination(fakeSite(10), {
      maxPages: 10,
      delayMs: 1000,
      maxRows: 5,
      sleep: instant,
    });
    expect(result.status).toBe('partial');
    expect(result.rows).toHaveLength(5);
  });

  it('computes bounded backoff', () => {
    expect(backoffDelay(0, 1000, () => 0.5)).toBe(1000);
    expect(backoffDelay(3, 1000, () => 0.5)).toBe(8000);
    expect(backoffDelay(10, 1000, () => 1)).toBe(30_000);
  });
});

describe('next-page control detection', () => {
  it('prefers rel=next links', () => {
    const next = findNextControl(loadFixture('pagination/page1.html'));
    expect(next).toMatchObject({ strategy: 'rel-next', label: 'Next' });
  });

  it('returns null on the last page (disabled control)', () => {
    expect(findNextControl(loadFixture('pagination/page3.html'))).toBeNull();
  });

  it('finds buttons by label and skips disabled ones', () => {
    const doc = htmlDocument(`
      <button disabled>Next</button>
      <div class="pager"><button class="btn">Previous</button><button class="btn">Next page</button></div>`);
    expect(findNextControl(doc)).toMatchObject({ strategy: 'text', label: 'Next page' });
  });

  it('falls back to numbered pagination', () => {
    const doc = htmlDocument(`
      <ul class="pagination"><li><a href="?p=1">1</a></li><li class="active"><a href="?p=2">2</a></li><li><a href="?p=3">3</a></li></ul>`);
    expect(findNextControl(doc)).toMatchObject({ strategy: 'numbered', label: '3' });
  });

  it('clicks the control like a user', () => {
    const doc = htmlDocument(`<button id="n" class="pager-next">More results</button>`);
    const onClick = vi.fn();
    doc.getElementById('n')!.addEventListener('click', onClick);
    const next = findNextControl(doc)!;
    expect(clickNextControl(doc, next)).toBe(true);
    expect(onClick).toHaveBeenCalledOnce();
    doc.getElementById('n')!.setAttribute('disabled', '');
    expect(clickNextControl(doc, next)).toBe(false);
  });
});
