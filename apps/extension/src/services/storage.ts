import type { KeyValueStore } from '@swde/licensing';

function areaStore(area: chrome.storage.StorageArea): KeyValueStore {
  return {
    async get(key) {
      const result = await area.get(key);
      return result[key];
    },
    async set(key, value) {
      await area.set({ [key]: value });
    },
    async remove(key) {
      await area.remove(key);
    },
  };
}

/** Persistent, local-only storage (survives browser restarts). */
export const localStore: KeyValueStore = areaStore(chrome.storage.local);

/**
 * In-memory storage cleared when the browser closes. Only extension pages can read it
 * (TRUSTED_CONTEXTS is the default access level), never content scripts or websites.
 */
export const sessionStore: KeyValueStore = areaStore(chrome.storage.session);

export function onStorageKeyChange(
  area: 'local' | 'session',
  keys: string[],
  listener: () => void,
): () => void {
  const handler = (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => {
    if (areaName === area && keys.some((k) => k in changes)) listener();
  };
  chrome.storage.onChanged.addListener(handler);
  return () => chrome.storage.onChanged.removeListener(handler);
}
