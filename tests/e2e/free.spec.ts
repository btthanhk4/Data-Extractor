import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { Download } from '@playwright/test';
import { expect, openFixture, openPopup, previewFromPopup, test } from './fixtures';

async function readDownload(download: Download): Promise<string> {
  return readFileSync((await download.path())!, 'utf8');
}

test.describe('extension package', () => {
  test('installs with a Manifest V3 service worker', async ({ worker, extensionId }) => {
    expect(extensionId).toMatch(/^[a-p]{32}$/);
    const manifest = await worker.evaluate(() => chrome.runtime.getManifest());
    expect(manifest.manifest_version).toBe(3);
  });

  test('production manifest requests only minimal permissions', () => {
    const manifest = JSON.parse(
      readFileSync(resolve('apps/extension/dist/chrome/manifest.json'), 'utf8'),
    );
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.permissions.sort()).toEqual(['activeTab', 'scripting', 'storage']);
    expect(manifest.host_permissions).toBeUndefined();
    expect(manifest.content_scripts).toBeUndefined();
    expect(manifest.externally_connectable).toBeUndefined();
    expect(manifest.content_security_policy.extension_pages).toContain("script-src 'self'");
  });
});

test.describe('free features', () => {
  test('detects tables and exports a valid CSV from the popup', async ({
    context,
    worker,
    extensionId,
  }) => {
    const { tabId } = await openFixture(context, worker, 'table.html');
    const popup = await openPopup(context, extensionId, tabId);
    await expect(popup.getByText('Fixture: Standard tables')).toBeVisible();
    await popup.getByRole('button', { name: 'Detect data' }).click();
    await expect(popup.getByTestId('dataset-count')).toHaveText('2');
    await expect(popup.getByText('Largest cities')).toBeVisible();

    const [download] = await Promise.all([
      popup.waitForEvent('download'),
      popup.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    expect(download.suggestedFilename()).toMatch(
      /^127\.0\.0\.1-largest-cities-\d{4}-\d{2}-\d{2}\.csv$/,
    );
    const csv = await readDownload(download);
    expect(csv.charCodeAt(0)).toBe(0xfeff); // Excel BOM on by default
    const lines = csv.slice(1).trimEnd().split('\r\n');
    expect(lines[0]).toBe('Rank,City,City link,Country,Population,Founded');
    expect(lines).toHaveLength(6);
    expect(lines[5]).toContain('Thành phố Hồ Chí Minh');
    await expect(popup.getByTestId('popup-toast')).toContainText('5 rows');
  });

  test('previews product cards in the dashboard and exports edited columns', async ({
    context,
    worker,
    extensionId,
  }) => {
    const { tabId } = await openFixture(context, worker, 'products.html');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    await expect(popup.getByTestId('dataset-count')).toHaveText('1');
    const dashboard = await previewFromPopup(context, popup);

    await expect(dashboard.getByTestId('row-count')).toHaveText('6');
    const grid = dashboard.getByTestId('data-grid');
    await expect(grid.getByText('Aurora X1 Wireless')).toBeVisible();
    await expect(grid.getByText('Bluetooth, ANC, USB-C')).toBeVisible();

    // Hide the image column and rename Title.
    await dashboard.getByRole('button', { name: 'Hide Image' }).click();
    await dashboard.getByLabel('Name of column 3').fill('Product');
    await expect(grid.getByRole('columnheader', { name: 'Product' })).toBeVisible();

    await dashboard.getByTestId('export-filename').fill('my products');
    const [download] = await Promise.all([
      dashboard.waitForEvent('download'),
      dashboard.getByTestId('export-button').click(),
    ]);
    expect(download.suggestedFilename()).toBe('my products.csv');
    const csv = await readDownload(download);
    expect(csv.slice(1).split('\r\n')[0]).toBe('Link,Product,Price,Rating,Tags');
    await expect(dashboard.getByTestId('export-result')).toContainText('6 rows');
  });

  test('removes duplicate rows', async ({ context, worker, extensionId }) => {
    const page = await context.newPage();
    await page.goto('http://127.0.0.1:4173/table.html');
    // Inject duplicates the way a page might render them.
    await page.evaluate(() => {
      const body = document.querySelector<HTMLTableSectionElement>('#cities tbody')!;
      body.append(body.rows[0]!.cloneNode(true), body.rows[1]!.cloneNode(true));
    });
    const tabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ url: 'http://127.0.0.1:4173/table.html' }))[0]!.id!,
    );
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    const dashboard = await previewFromPopup(context, popup);
    await expect(dashboard.getByTestId('row-count')).toHaveText('7');
    await dashboard.getByRole('tab', { name: 'Cleaning' }).click();
    await dashboard.getByRole('switch', { name: 'Remove duplicate rows' }).click();
    await expect(dashboard.getByTestId('row-count')).toHaveText('5');
  });

  test('finds content that was inserted after page load', async ({
    context,
    worker,
    extensionId,
  }) => {
    const { page, tabId } = await openFixture(context, worker, 'dynamic.html');
    await expect(page.locator('#status')).toHaveText('Loaded');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    await expect(popup.getByTestId('dataset-count')).toHaveText('1');
    await expect(popup.getByText('4 rows')).toBeVisible();
  });

  test('handles 2,500 rows with a virtualized preview', async ({
    context,
    worker,
    extensionId,
  }) => {
    const { tabId } = await openFixture(context, worker, 'large.html');
    const popup = await openPopup(context, extensionId, tabId);
    const started = Date.now();
    await popup.getByRole('button', { name: 'Detect data' }).click();
    await expect(popup.getByTestId('dataset-count')).toHaveText('1');
    expect(Date.now() - started).toBeLessThan(8_000);
    const dashboard = await previewFromPopup(context, popup);
    await expect(dashboard.getByTestId('row-count')).toHaveText('2,500');
    const grid = dashboard.getByTestId('data-grid');
    // Only a window of rows is in the DOM.
    expect(await grid.locator('[role="row"]').count()).toBeLessThan(120);
    await grid.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
    await expect(grid.getByText('SKU-02500')).toBeVisible();
  });

  test('shows a clear empty state when nothing is detectable', async ({
    context,
    worker,
    extensionId,
  }) => {
    const { tabId } = await openFixture(context, worker, 'empty.html');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    await expect(popup.getByText('No tables or lists found')).toBeVisible();
  });

  test('explains unsupported browser pages', async ({ context, worker, extensionId }) => {
    const page = await context.newPage();
    await page.goto('about:blank');
    const tabId = await worker.evaluate(
      async () => (await chrome.tabs.query({ url: 'about:blank' }))[0]?.id ?? -1,
    );
    const popup = await openPopup(context, extensionId, tabId);
    await expect(popup.getByText("This page can't be read")).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Detect data' })).toHaveCount(0);
  });

  test('keeps malformed and hostile content inert', async ({ context, worker, extensionId }) => {
    const { tabId } = await openFixture(context, worker, 'malformed.html');
    const popup = await openPopup(context, extensionId, tabId);
    const dialogs: string[] = [];
    popup.on('dialog', (d) => {
      dialogs.push(d.message());
      void d.dismiss();
    });
    await popup.getByRole('button', { name: 'Detect data' }).click();
    await expect(popup.getByTestId('dataset-count')).toHaveText('2');
    const [download] = await Promise.all([
      popup.waitForEvent('download'),
      popup.getByRole('button', { name: 'Export CSV' }).click(),
    ]);
    const csv = await readDownload(download);
    expect(csv).not.toContain('javascript:');
    expect(csv).toContain('Epsilon <b>not html</b>');
    expect(dialogs).toEqual([]);
  });

  test('gates Pro features in Free mode without blocking free use', async ({
    context,
    worker,
    extensionId,
  }) => {
    const { tabId } = await openFixture(context, worker, 'table.html');
    const popup = await openPopup(context, extensionId, tabId);
    await expect(popup.getByText('Free', { exact: true })).toBeVisible();
    await popup.getByRole('button', { name: 'Detect data' }).click();
    const dashboard = await previewFromPopup(context, popup);
    await expect(dashboard.getByTestId('format-xlsx')).toHaveAttribute('aria-disabled', 'true');
    await dashboard.getByRole('tab', { name: 'Pages' }).click();
    await expect(dashboard.getByRole('button', { name: 'See Pro features' })).toBeVisible();
    await expect(dashboard.getByRole('button', { name: 'Start' })).toHaveCount(0);
  });
});
