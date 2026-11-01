import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preset } from '@swde/shared';
import { PresetSchema, STORAGE_KEYS } from '@swde/shared';
import { installFakeChrome } from './fake-chrome';
import type { FakeChrome } from './fake-chrome';
import { validPreset } from '../helpers';

let env: FakeChrome;

async function services() {
  // Services bind chrome.storage at import time, so import after installing the fake.
  vi.resetModules();
  return {
    presets: await import('../../apps/extension/src/services/presets'),
    history: await import('../../apps/extension/src/services/history'),
    settings: await import('../../apps/extension/src/services/settings'),
    sessions: await import('../../apps/extension/src/services/sessions'),
  };
}

beforeEach(() => {
  env = installFakeChrome({ sessionQuotaBytes: 50_000 });
});

describe('presets storage', () => {
  it('persists, updates, filters by origin and deletes presets', async () => {
    const { presets } = await services();
    const preset = PresetSchema.parse(validPreset) as Preset;
    await presets.savePreset(preset);
    await presets.savePreset({ ...preset, id: 'preset_2', origin: 'https://other.example' });
    await presets.savePreset({ ...preset, name: 'Renamed' });
    const all = await presets.listPresets();
    expect(all.map((p) => p.name).sort()).toEqual(['Jobs', 'Renamed']);
    expect(await presets.presetsForOrigin('https://jobs.example.com')).toHaveLength(1);
    await presets.deletePreset(preset.id);
    expect(await presets.listPresets()).toHaveLength(1);
  });

  it('drops corrupted entries when reading', async () => {
    const { presets } = await services();
    await env.chrome.storage.local.set({
      [STORAGE_KEYS.presets]: [validPreset, { id: 'junk' }, 'nope'],
    });
    expect(await presets.listPresets()).toHaveLength(1);
  });

  it('exports and re-imports presets with fresh ids', async () => {
    const { presets } = await services();
    const preset = PresetSchema.parse(validPreset) as Preset;
    await presets.savePreset(preset);
    const file = presets.serializePresets(await presets.listPresets());
    const result = await presets.importPresets(file);
    expect(result).toEqual({ imported: 1, error: null });
    const all = await presets.listPresets();
    expect(all).toHaveLength(2);
    expect(new Set(all.map((p) => p.id)).size).toBe(2);
  });

  it('rejects malicious or malformed imports without side effects', async () => {
    const { presets } = await services();
    const polluted = `{"format":"swde-presets","version":1,"exportedAt":0,"__proto__":{"isAdmin":true},"presets":[]}`;
    expect((await presets.importPresets(polluted)).error).toBeNull();
    expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
    expect((await presets.importPresets('{nope')).error).toMatch(/Not valid JSON/);
    expect((await presets.importPresets('{"format":"x"}')).error).toMatch(
      /Not a valid preset file/,
    );
    expect((await presets.importPresets('x'.repeat(1_000_001))).error).toMatch(/too large/);
    const scripted = JSON.stringify({
      format: 'swde-presets',
      version: 1,
      exportedAt: 0,
      presets: [
        {
          ...validPreset,
          descriptor: {
            ...validPreset.descriptor,
            containerSelector: '<img src=x onerror=alert(1)>',
          },
        },
      ],
    });
    expect((await presets.importPresets(scripted)).error).toMatch(/Not a valid preset file/);
    expect(await presets.listPresets()).toHaveLength(0);
  });
});

describe('history', () => {
  it('records only metadata (no query string, no cell values)', async () => {
    const { history } = await services();
    await history.recordExport({
      url: 'https://shop.example.com/search?q=secret&token=abc',
      title: 'Results',
      dataset: 'Products',
      rows: 10,
      columns: 3,
      pages: 1,
      format: 'csv',
    });
    const [entry] = await history.listHistory();
    expect(entry).toMatchObject({ origin: 'https://shop.example.com', path: '/search', rows: 10 });
    expect(JSON.stringify(entry)).not.toContain('secret');
  });

  it('does not record when history is disabled', async () => {
    const { history, settings } = await services();
    await settings.saveSettings({ historyEnabled: false });
    await history.recordExport({
      url: 'https://a.example/',
      title: '',
      dataset: 'x',
      rows: 1,
      columns: 1,
      pages: 1,
      format: 'csv',
    });
    expect(await history.listHistory()).toEqual([]);
  });

  it('clears history', async () => {
    const { history } = await services();
    await history.recordExport({
      url: 'https://a.example/',
      title: '',
      dataset: 'x',
      rows: 1,
      columns: 1,
      pages: 1,
      format: 'csv',
    });
    await history.clearHistory();
    expect(await history.listHistory()).toEqual([]);
  });
});

describe('settings', () => {
  it('falls back to defaults on invalid stored data', async () => {
    const { settings } = await services();
    await env.chrome.storage.local.set({
      [STORAGE_KEYS.settings]: { theme: 'neon', csvBom: 'yes' },
    });
    expect((await settings.loadSettings()).theme).toBe('system');
    const saved = await settings.saveSettings({ theme: 'dark' });
    expect(saved.theme).toBe('dark');
  });
});

describe('sessions (dashboard hand-off)', () => {
  const descriptor = PresetSchema.parse(validPreset).descriptor;

  it('creates, reads and caches session data in session storage', async () => {
    const { sessions } = await services();
    const id = await sessions.createSession({
      tabId: 7,
      page: { url: 'https://a.example/', title: 'A' },
      label: 'Jobs',
      descriptor,
      presetId: null,
      data: null,
      pages: 1,
    });
    expect(id).toMatch(/^s_[a-f0-9]{24}$/);
    expect(env.chrome.storage.local.data.size).toBe(0); // never persisted to disk
    const data = { columns: [{ id: 'c0', name: 'Title' }], rows: [['x']], truncated: false };
    expect(await sessions.cacheSessionData(id, data, 1)).toBe(true);
    expect((await sessions.getSession(id))?.data?.rows).toEqual([['x']]);
  });

  it('skips caching when the dataset exceeds the session quota', async () => {
    const { sessions } = await services();
    const id = await sessions.createSession({
      tabId: 7,
      page: { url: 'https://a.example/', title: 'A' },
      label: 'Big',
      descriptor,
      presetId: null,
      data: null,
      pages: 1,
    });
    const rows = Array.from({ length: 5_000 }, (_, i) => [`row ${i} with some text`]);
    expect(
      await sessions.cacheSessionData(
        id,
        { columns: [{ id: 'c0', name: 'x' }], rows, truncated: false },
        1,
      ),
    ).toBe(false);
    expect((await sessions.getSession(id))?.data).toBeNull();
  });

  it('rejects malformed session ids', async () => {
    const { sessions } = await services();
    expect(await sessions.getSession('../../etc')).toBeNull();
  });
});
