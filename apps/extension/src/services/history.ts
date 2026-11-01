import type { HistoryEntry } from '@swde/shared';
import { HistoryEntrySchema, LIMITS, STORAGE_KEYS, createId } from '@swde/shared';
import { loadSettings } from './settings';
import { localStore } from './storage';

export async function listHistory(): Promise<HistoryEntry[]> {
  const raw = await localStore.get(STORAGE_KEYS.history);
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((e) => {
    const parsed = HistoryEntrySchema.safeParse(e);
    return parsed.success ? [parsed.data] : [];
  });
}

/**
 * Records export metadata only (site, page path, title, counts). Extracted cell values and
 * query strings are never stored. Disabled entirely when the user turns history off.
 */
export async function recordExport(
  entry: Omit<HistoryEntry, 'id' | 'at' | 'origin' | 'path'> & { url: string },
): Promise<void> {
  const settings = await loadSettings();
  if (!settings.historyEnabled) return;
  let origin = '';
  let path = '';
  try {
    const url = new URL(entry.url);
    origin = url.origin;
    path = url.pathname;
  } catch {
    // keep empty
  }
  const record = HistoryEntrySchema.parse({
    id: createId('h'),
    at: Date.now(),
    origin,
    path,
    title: entry.title.slice(0, 300),
    dataset: entry.dataset.slice(0, 200),
    rows: entry.rows,
    columns: entry.columns,
    pages: entry.pages,
    format: entry.format,
  });
  const all = await listHistory();
  await localStore.set(STORAGE_KEYS.history, [record, ...all].slice(0, LIMITS.maxHistoryEntries));
}

export async function clearHistory(): Promise<void> {
  await localStore.remove(STORAGE_KEYS.history);
}
