import type { ExtractedData, SessionRecord } from '@swde/shared';
import { STORAGE_KEYS, SessionRecordSchema, createId } from '@swde/shared';
import { sessionStore } from './storage';

/**
 * Hand-off between the popup/background and the dashboard. Lives in chrome.storage.session, so
 * extracted data is kept in memory only and disappears when the browser closes.
 */
export async function createSession(
  record: Omit<SessionRecord, 'id' | 'createdAt'>,
): Promise<string> {
  const id = createId('s');
  const full = SessionRecordSchema.parse({ ...record, id, createdAt: Date.now() });
  await sessionStore.set(STORAGE_KEYS.sessionPrefix + id, full);
  return id;
}

export async function getSession(id: string): Promise<SessionRecord | null> {
  if (!/^s_[a-f0-9]{24}$/.test(id)) return null;
  const parsed = SessionRecordSchema.safeParse(
    await sessionStore.get(STORAGE_KEYS.sessionPrefix + id),
  );
  return parsed.success ? parsed.data : null;
}

/**
 * Caches extracted data in the session so reloading the dashboard does not need the source tab.
 * Large datasets can exceed the session quota; that is not an error, the cache is just skipped.
 */
export async function cacheSessionData(
  id: string,
  data: ExtractedData,
  pages: number,
): Promise<boolean> {
  const session = await getSession(id);
  if (!session) return false;
  try {
    await sessionStore.set(STORAGE_KEYS.sessionPrefix + id, { ...session, data, pages });
    return true;
  } catch {
    return false;
  }
}

export function dashboardUrl(route: string): string {
  return chrome.runtime.getURL(`dashboard.html#${route}`);
}

export async function openDashboard(route: string): Promise<void> {
  await chrome.tabs.create({ url: dashboardUrl(route) });
}
