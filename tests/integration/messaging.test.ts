import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ClickNextResponseSchema,
  ContentRequestSchema,
  DetectResponseSchema,
  ExtractResponseSchema,
  FindNextResponseSchema,
  PingResponseSchema,
} from '@swde/shared';
import { handleContentRequest } from '../../apps/extension/src/content/handler';
import { installFakeChrome } from './fake-chrome';
import type { FakeChrome } from './fake-chrome';
import { loadFixture } from '../helpers';

const picker = { start: vi.fn(), stop: vi.fn() };

describe('content script request handler', () => {
  it('answers ping', () => {
    expect(
      PingResponseSchema.safeParse(
        handleContentRequest({ type: 'swde:ping' }, loadFixture('table.html'), picker),
      ).success,
    ).toBe(true);
  });

  it('returns detect responses that pass the extension-side schema', () => {
    for (const fixture of [
      'table.html',
      'products.html',
      'nested.html',
      'unicode.html',
      'malformed.html',
      'pagination/page1.html',
    ]) {
      const res = handleContentRequest({ type: 'swde:detect' }, loadFixture(fixture), picker);
      const parsed = DetectResponseSchema.safeParse(res);
      expect(
        parsed.success,
        `${fixture}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues[0])}`,
      ).toBe(true);
    }
  });

  it('extracts with a descriptor returned by detect', () => {
    const doc = loadFixture('products.html');
    const detect = DetectResponseSchema.parse(
      handleContentRequest({ type: 'swde:detect' }, doc, picker),
    );
    const res = ExtractResponseSchema.parse(
      handleContentRequest(
        { type: 'swde:extract', descriptor: detect.datasets[0]!.descriptor },
        doc,
        picker,
      ),
    );
    expect(res.data.rows).toHaveLength(6);
    expect(res.page.title).toBe('Fixture: Product cards');
  });

  it('turns extraction errors into error responses', () => {
    const doc = loadFixture('products.html');
    const detect = DetectResponseSchema.parse(
      handleContentRequest({ type: 'swde:detect' }, doc, picker),
    );
    const res = handleContentRequest(
      { type: 'swde:extract', descriptor: detect.datasets[0]!.descriptor },
      loadFixture('empty.html'),
      picker,
    );
    expect(res).toEqual({
      ok: false,
      error: 'The selected dataset could not be found on this page.',
    });
  });

  it('finds and clicks next controls', () => {
    const doc = loadFixture('pagination/page1.html');
    const found = FindNextResponseSchema.parse(
      handleContentRequest({ type: 'swde:findNext' }, doc, picker),
    );
    expect(found.next?.strategy).toBe('rel-next');
    const clicked = ClickNextResponseSchema.parse(
      handleContentRequest({ type: 'swde:clickNext', next: found.next! }, doc, picker),
    );
    expect(clicked.clicked).toBe(true);
  });

  it('starts and stops the picker', () => {
    const doc = loadFixture('table.html');
    handleContentRequest({ type: 'swde:pickerStart' }, doc, picker);
    handleContentRequest({ type: 'swde:pickerStop' }, doc, picker);
    expect(picker.start).toHaveBeenCalledOnce();
    expect(picker.stop).toHaveBeenCalledOnce();
  });
});

describe('content script entry (sender and schema validation)', () => {
  let env: FakeChrome;

  beforeEach(async () => {
    env = installFakeChrome();
    vi.resetModules();
    (window as unknown as { __swdeContentLoaded?: boolean }).__swdeContentLoaded = undefined;
    await import('../../apps/extension/src/content/index');
  });

  function send(message: unknown, sender: { id?: string }) {
    const listener = Array.from(env.messageListeners)[0] as (
      m: unknown,
      s: unknown,
      r: (x: unknown) => void,
    ) => boolean;
    const respond = vi.fn();
    listener(message, sender, respond);
    return respond;
  }

  it('registers exactly one listener even if injected twice', async () => {
    vi.resetModules();
    await import('../../apps/extension/src/content/index');
    expect(env.messageListeners.size).toBe(1);
  });

  it('ignores messages from other extensions', () => {
    const respond = send({ type: 'swde:ping' }, { id: 'some-other-extension' });
    expect(respond).not.toHaveBeenCalled();
  });

  it('rejects unknown message shapes', () => {
    const respond = send({ type: 'swde:eval', code: 'alert(1)' }, { id: 'test-extension-id' });
    expect(respond).toHaveBeenCalledWith({ ok: false, error: 'Invalid request' });
  });

  it('handles valid requests from the extension', () => {
    const respond = send({ type: 'swde:ping' }, { id: 'test-extension-id' });
    expect(respond).toHaveBeenCalledWith({ ok: true, version: 'test' });
  });

  it('only accepts schema-valid content requests', () => {
    expect(
      ContentRequestSchema.safeParse({
        type: 'swde:clickNext',
        next: { strategy: 'text', selector: '', label: 'x' },
      }).success,
    ).toBe(false);
  });
});

describe('background message validation', () => {
  let env: FakeChrome;

  beforeEach(async () => {
    env = installFakeChrome();
    (env.chrome.runtime as unknown as { onInstalled: unknown }).onInstalled = {
      addListener: vi.fn(),
    };
    vi.resetModules();
    await import('../../apps/extension/src/background/index');
  });

  function send(message: unknown, sender: unknown) {
    const listener = Array.from(env.messageListeners)[0] as (
      m: unknown,
      s: unknown,
      r: (x: unknown) => void,
    ) => boolean;
    const respond = vi.fn();
    const async = listener(message, sender, respond);
    return { respond, async };
  }

  it('ignores messages that do not come from a tab of this extension', () => {
    const { respond } = send({ type: 'swde:pickerCancelled' }, { id: 'test-extension-id' });
    expect(respond).not.toHaveBeenCalled();
    const other = send({ type: 'swde:pickerCancelled' }, { id: 'evil', tab: { id: 3 } });
    expect(other.respond).not.toHaveBeenCalled();
  });

  it('opens the dashboard for a valid picker result', async () => {
    const descriptor = {
      kind: 'custom',
      containerSelector: 'body > ul',
      itemSelector: ':scope > li',
      skipLeadingItems: 0,
      itemSignature: 'li|A',
      columns: [
        { id: 'c0', name: 'Field', source: { type: 'path', path: ':scope > a', attr: 'text' } },
      ],
    };
    const { respond, async } = send(
      {
        type: 'swde:pickerResult',
        descriptor,
        page: { url: 'https://forged.example', title: 'Forged' },
      },
      { id: 'test-extension-id', tab: { id: 9, url: 'https://real.example/list', title: 'Real' } },
    );
    expect(async).toBe(true);
    await vi.waitFor(() => expect(respond).toHaveBeenCalledWith({ ok: true }));
    const url = (env.chrome.tabs.create.mock.calls[0] as unknown as [{ url: string }])[0].url;
    expect(url).toMatch(/^chrome-extension:\/\/test-extension-id\/dashboard\.html#\/preview\?s=s_/);
    const stored = Array.from(env.chrome.storage.session.data.values())[0] as {
      page: { url: string };
      tabId: number;
    };
    expect(stored.tabId).toBe(9);
    expect(stored.page.url).toBe('https://real.example/list'); // browser's tab URL wins over page claims
  });

  it('rejects invalid picker payloads', () => {
    const { respond } = send(
      { type: 'swde:pickerResult', descriptor: { kind: 'evil' } },
      { id: 'test-extension-id', tab: { id: 9 } },
    );
    expect(respond).toHaveBeenCalledWith({ ok: false, error: 'Invalid request' });
  });
});
