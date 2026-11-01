import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DetectResponseSchema, ExtractResponseSchema } from '@swde/shared';
import {
  cleanData,
  defaultCleaningRules,
  detectDatasets,
  extractDataset,
  initialColumnState,
  toCsv,
} from '@swde/extraction-core';
import { installFakeChrome } from './fake-chrome';
import type { FakeChrome } from './fake-chrome';
import { loadFixture } from '../helpers';

describe('extraction -> cleaning -> CSV pipeline', () => {
  it('turns a product grid into a clean CSV', () => {
    const doc = loadFixture('products.html');
    const [products] = detectDatasets(doc);
    const { data } = extractDataset(doc, products!.descriptor);
    const cleaned = cleanData(
      data,
      initialColumnState(data),
      defaultCleaningRules({ dedupe: { enabled: true, columns: [] } }),
    );
    const csv = toCsv(
      cleaned.columns.map((c) => c.name),
      cleaned.rows,
    );
    const lines = csv.trimEnd().split('\r\n');
    expect(lines[0]).toBe('Link,Image,Title,Price,Rating,Tags');
    expect(lines).toHaveLength(7);
    expect(lines[3]).toContain('"Cobalt Pro ""Studio"""');
  });

  it('neutralizes formula payloads from page content', () => {
    const doc = loadFixture('unicode.html');
    const [table] = detectDatasets(doc);
    const { data } = extractDataset(doc, table!.descriptor);
    const csv = toCsv(
      data.columns.map((c) => c.name),
      data.rows,
    );
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example"",""click"")"`);
    expect(csv).toContain(`'@SUM(A1:A3)`);
    expect(csv).toContain('-12.50');
    expect(csv).toContain('東京 タワー');
  });
});

describe('extension extraction services against a tab', () => {
  let env: FakeChrome;

  beforeEach(() => {
    env = installFakeChrome();
    vi.resetModules();
  });

  it('injects the content script on demand, then talks to it', async () => {
    const doc = loadFixture('table.html');
    const { handleContentRequest } = await import('../../apps/extension/src/content/handler');
    let injected = false;
    env.chrome.tabs.sendMessage.mockImplementation(
      async (_tabId: number, req: { type: string }) => {
        if (!injected)
          throw new Error('Could not establish connection. Receiving end does not exist.');
        return handleContentRequest(req as never, doc, { start() {}, stop() {} });
      },
    );
    env.chrome.scripting.executeScript.mockImplementation(async () => {
      injected = true;
      return [];
    });
    const { detectInTab, extractInTab } = await import(
      '../../apps/extension/src/services/extraction'
    );
    const detected = await detectInTab(5, 'https://fixtures.test/table.html');
    expect(env.chrome.scripting.executeScript).toHaveBeenCalledWith({
      target: { tabId: 5 },
      files: ['content.js'],
    });
    expect(DetectResponseSchema.shape.datasets.parse(detected.datasets)).toHaveLength(2);
    const extracted = await extractInTab(5, detected.datasets[0]!.descriptor);
    expect(ExtractResponseSchema.shape.data.parse(extracted.data).rows).toHaveLength(5);
  });

  it('maps permission failures to a clear error', async () => {
    env.chrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist.'));
    env.chrome.scripting.executeScript.mockRejectedValue(
      new Error(
        'Cannot access contents of url "https://a.example/". Extension manifest must request permission to access this host.',
      ),
    );
    const { detectInTab } = await import('../../apps/extension/src/services/extraction');
    await expect(detectInTab(5, 'https://a.example/')).rejects.toMatchObject({
      code: 'permission',
    });
  });

  it('explains how to enable file URLs', async () => {
    env.chrome.tabs.sendMessage.mockRejectedValue(new Error('Receiving end does not exist.'));
    env.chrome.scripting.executeScript.mockRejectedValue(
      new Error('Cannot access contents of url "file:///C:/data.html".'),
    );
    const { detectInTab } = await import('../../apps/extension/src/services/extraction');
    await expect(detectInTab(5, 'file:///C:/data.html')).rejects.toThrow(
      /Allow access to file URLs/,
    );
  });

  it('rejects malformed responses from the page context', async () => {
    env.chrome.tabs.sendMessage.mockResolvedValue({ ok: true, version: '1' });
    const { sendToTab } = await import('../../apps/extension/src/services/tabs');
    await expect(sendToTab(5, { type: 'swde:detect' }, DetectResponseSchema)).rejects.toMatchObject(
      { code: 'content-error' },
    );
  });
});

describe('permissions and page support', () => {
  beforeEach(() => {
    installFakeChrome();
    vi.resetModules();
  });

  it('classifies pages extensions cannot read', async () => {
    const { checkUrlSupport } = await import('../../apps/extension/src/services/tabs');
    expect(checkUrlSupport('https://example.com/').supported).toBe(true);
    expect(checkUrlSupport('file:///tmp/x.html').supported).toBe(true);
    expect(checkUrlSupport('chrome://settings').supported).toBe(false);
    expect(checkUrlSupport('edge://extensions').supported).toBe(false);
    expect(checkUrlSupport('about:blank').supported).toBe(false);
    expect(checkUrlSupport('https://chromewebstore.google.com/detail/abc').supported).toBe(false);
    expect(checkUrlSupport(undefined).supported).toBe(false);
  });

  it('requests access only for the current origin', async () => {
    const env = installFakeChrome();
    vi.resetModules();
    const { requestOriginAccess } = await import('../../apps/extension/src/services/tabs');
    expect(await requestOriginAccess('https://shop.example.com/list?page=2')).toBe(true);
    expect(env.chrome.permissions.request).toHaveBeenCalledWith({
      origins: ['https://shop.example.com/*'],
    });
    expect(await requestOriginAccess('chrome://settings')).toBe(false);
    env.chrome.permissions.request.mockResolvedValueOnce(false);
    expect(await requestOriginAccess('https://other.example/')).toBe(false);
  });
});
