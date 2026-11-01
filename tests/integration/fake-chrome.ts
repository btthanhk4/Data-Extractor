import { vi } from 'vitest';

type Listener = (...args: never[]) => unknown;

function storageArea(name: 'local' | 'session', changed: Set<Listener>, quotaBytes = Infinity) {
  const data = new Map<string, unknown>();
  return {
    data,
    async get(key: string | string[] | null) {
      const keys = key === null ? Array.from(data.keys()) : Array.isArray(key) ? key : [key];
      const out: Record<string, unknown> = {};
      for (const k of keys) if (data.has(k)) out[k] = structuredClone(data.get(k));
      return out;
    },
    async set(items: Record<string, unknown>) {
      const size = JSON.stringify(
        Object.fromEntries([...data.entries(), ...Object.entries(items)]),
      ).length;
      if (size > quotaBytes) throw new Error('QUOTA_BYTES quota exceeded');
      const changes: Record<string, { oldValue?: unknown; newValue?: unknown }> = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: data.get(k), newValue: v };
        data.set(k, structuredClone(v));
      }
      for (const l of changed) (l as (c: unknown, a: string) => void)(changes, name);
    },
    async remove(key: string | string[]) {
      for (const k of Array.isArray(key) ? key : [key]) data.delete(k);
    },
    async clear() {
      data.clear();
    },
  };
}

/** In-memory subset of the chrome.* API used by the extension, installed on globalThis. */
export function installFakeChrome(options: { sessionQuotaBytes?: number } = {}) {
  const changed = new Set<Listener>();
  const messageListeners = new Set<Listener>();
  const fake = {
    runtime: {
      id: 'test-extension-id',
      getURL: (p: string) => `chrome-extension://test-extension-id/${p}`,
      onMessage: {
        addListener: (l: Listener) => messageListeners.add(l),
        removeListener: (l: Listener) => messageListeners.delete(l),
      },
      sendMessage: vi.fn(async () => ({ ok: true })),
    },
    storage: {
      local: storageArea('local', changed),
      session: storageArea('session', changed, options.sessionQuotaBytes),
      onChanged: {
        addListener: (l: Listener) => changed.add(l),
        removeListener: (l: Listener) => changed.delete(l),
      },
    },
    tabs: {
      query: vi.fn(async () => []),
      get: vi.fn(),
      create: vi.fn(async () => ({})),
      sendMessage: vi.fn(),
    },
    scripting: { executeScript: vi.fn(async () => []) },
    permissions: { request: vi.fn(async () => true) },
  };
  (globalThis as unknown as { chrome: unknown }).chrome = fake;
  return { chrome: fake, messageListeners };
}

export type FakeChrome = ReturnType<typeof installFakeChrome>;
