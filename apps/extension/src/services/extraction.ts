import type {
  DatasetDescriptor,
  DetectedDataset,
  ExtractedData,
  NextControl,
  PageInfo,
} from '@swde/shared';
import {
  ClickNextResponseSchema,
  DetectResponseSchema,
  ExtractResponseSchema,
  FindNextResponseSchema,
} from '@swde/shared';
import type { PaginationAdapter } from '@swde/extraction-core';
import { ensureContentScript, sendToTab } from './tabs';

export async function detectInTab(
  tabId: number,
  url?: string,
): Promise<{ page: PageInfo; datasets: DetectedDataset[] }> {
  await ensureContentScript(tabId, url);
  const res = await sendToTab(tabId, { type: 'swde:detect' }, DetectResponseSchema);
  return { page: res.page, datasets: res.datasets };
}

export interface TabExtraction {
  page: PageInfo;
  data: ExtractedData;
  fingerprint: string;
  resolvedByFallback: boolean;
}

export async function extractInTab(
  tabId: number,
  descriptor: DatasetDescriptor,
  url?: string,
): Promise<TabExtraction> {
  await ensureContentScript(tabId, url);
  const res = await sendToTab(tabId, { type: 'swde:extract', descriptor }, ExtractResponseSchema);
  return {
    page: res.page,
    data: res.data,
    fingerprint: res.fingerprint,
    resolvedByFallback: res.resolvedByFallback,
  };
}

export async function findNextInTab(tabId: number): Promise<NextControl | null> {
  await ensureContentScript(tabId);
  return (await sendToTab(tabId, { type: 'swde:findNext' }, FindNextResponseSchema)).next;
}

/** Adapter connecting the browser-agnostic pagination runner to a real tab. */
export function createTabPaginationAdapter(
  tabId: number,
  descriptor: DatasetDescriptor,
  next: NextControl,
): PaginationAdapter {
  return {
    async extract() {
      // Re-inject on every read: a full page navigation discards the previous content script.
      const result = await extractInTab(tabId, descriptor);
      return { rows: result.data.rows, fingerprint: result.fingerprint };
    },
    async clickNext() {
      await ensureContentScript(tabId);
      const res = await sendToTab(tabId, { type: 'swde:clickNext', next }, ClickNextResponseSchema);
      return res.clicked;
    },
  };
}
