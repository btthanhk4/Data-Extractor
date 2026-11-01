import { readFileSync } from 'node:fs';
import { strFromU8, unzipSync } from 'fflate';
import {
  activatePro,
  expect,
  launch,
  openFixture,
  openPopup,
  previewFromPopup,
  serviceWorker,
  test,
} from './fixtures';

test.describe('licensing (development mock provider)', () => {
  test('rejects invalid keys and activates a valid one', async ({ context, extensionId }) => {
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html#/license`);
    await expect(page.getByText('Development licensing (mock)')).toBeVisible();
    await page.getByLabel('License key').fill('SWDE-DEV-REVOKED');
    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByTestId('license-error')).toContainText('revoked');
    await expect(page.getByTestId('license-status')).toHaveText('Free plan');
    await page.getByLabel('License key').fill('SWDE-DEV-PRO');
    await page.getByRole('button', { name: 'Activate' }).click();
    await expect(page.getByTestId('license-status')).toHaveText('Pro — active');
    await page.getByRole('button', { name: 'Deactivate on this device' }).click();
    await expect(page.getByTestId('license-status')).toHaveText('Free plan');
  });

  test('a forged local flag does not unlock Pro', async ({ context, worker, extensionId }) => {
    await worker.evaluate(() =>
      chrome.storage.local.set({ 'swde.license.token': 'forged.token', isPro: true }),
    );
    const page = await context.newPage();
    await page.goto(`chrome-extension://${extensionId}/dashboard.html#/license`);
    await expect(page.getByTestId('license-status')).toHaveText('Free plan');
  });
});

test.describe('pro features', () => {
  test('exports XLSX once Pro is active', async ({ context, worker, extensionId }) => {
    await activatePro(context, extensionId);
    const { tabId } = await openFixture(context, worker, 'unicode.html');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    const dashboard = await previewFromPopup(context, popup);
    await dashboard.getByTestId('format-xlsx').click();
    const [download] = await Promise.all([
      dashboard.waitForEvent('download'),
      dashboard.getByTestId('export-button').click(),
    ]);
    expect(download.suggestedFilename()).toMatch(/\.xlsx$/);
    const files = unzipSync(new Uint8Array(readFileSync((await download.path())!)));
    const sheet = strFromU8(files['xl/worksheets/sheet1.xml']!);
    expect(sheet).toContain('東京 タワー');
    expect(sheet).not.toContain('<f>');
    expect(strFromU8(files['xl/workbook.xml']!)).toContain('name="Source"');
  });

  test('follows link pagination across full page loads', async ({
    context,
    worker,
    extensionId,
  }) => {
    await activatePro(context, extensionId);
    const { tabId } = await openFixture(context, worker, 'pagination/page1.html');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    const dashboard = await previewFromPopup(context, popup);
    await expect(dashboard.getByTestId('row-count')).toHaveText('4');
    await dashboard.getByRole('tab', { name: 'Pages' }).click();
    await dashboard.getByRole('button', { name: 'Find “Next” button' }).click();
    await expect(dashboard.getByTestId('next-label')).toHaveText('“Next”');
    await dashboard.getByTestId('max-pages').fill('5');
    await dashboard.getByTestId('delay-seconds').fill('1');
    await dashboard.getByTestId('start-pagination').click();
    await expect(dashboard.getByTestId('pagination-result')).toContainText('3 pages read', {
      timeout: 45_000,
    });
    await expect(dashboard.getByText('Extraction completed')).toBeVisible();
    await expect(dashboard.getByTestId('row-count')).toHaveText('12');
  });

  test('follows client-side pagination and can be cancelled', async ({
    context,
    worker,
    extensionId,
  }) => {
    await activatePro(context, extensionId);
    const { page, tabId } = await openFixture(context, worker, 'spa-pagination.html');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    const dashboard = await previewFromPopup(context, popup);
    await expect(dashboard.getByTestId('row-count')).toHaveText('5');
    await dashboard.getByRole('tab', { name: 'Pages' }).click();
    await dashboard.getByRole('button', { name: 'Find “Next” button' }).click();
    await expect(dashboard.getByTestId('next-label')).toHaveText('“Next page”');
    await dashboard.getByTestId('delay-seconds').fill('1');
    await dashboard.getByTestId('start-pagination').click();
    await expect(dashboard.getByTestId('pagination-result')).toContainText('3 pages read', {
      timeout: 45_000,
    });
    await expect(dashboard.getByTestId('row-count')).toHaveText('15');

    // Back to page 1, then cancel a slow second run while it waits between pages.
    await page.reload();
    await dashboard.getByTestId('delay-seconds').fill('20');
    await dashboard.getByTestId('start-pagination').click();
    await expect(dashboard.getByTestId('pagination-progress')).toContainText('Waiting');
    await dashboard.getByTestId('cancel-pagination').click();
    await expect(dashboard.getByText('Extraction cancelled')).toBeVisible();
    await expect(dashboard.getByTestId('pagination-result')).toContainText('Cancelled by user');
  });

  test('selects elements visually and opens the selection', async ({
    context,
    worker,
    extensionId,
  }) => {
    await activatePro(context, extensionId);
    const { page, tabId } = await openFixture(context, worker, 'nested.html');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: /Select elements on page/ }).click();
    await page.bringToFront();
    const target = page.getByText('Alan Turing');
    await target.hover();
    await page.mouse.move(0, 0);
    await target.hover();
    await target.click();
    const [dashboard] = await Promise.all([
      context.waitForEvent('page', (p) => p.url().includes('dashboard.html')),
      page.keyboard.press('Enter'),
    ]);
    await expect(dashboard.getByTestId('preview-title')).toHaveText('Selected elements');
    await expect(dashboard.getByTestId('row-count')).toHaveText('4');
    // The page itself was not navigated or modified by the picker clicks.
    await expect(page).toHaveURL(/nested\.html$/);
    await expect(page.locator('swde-picker')).toHaveCount(0);
  });

  test('saved presets persist across browser restarts', async ({
    context,
    worker,
    extensionId,
    userDataDir,
  }) => {
    await activatePro(context, extensionId);
    const { tabId } = await openFixture(context, worker, 'pagination/page1.html');
    const popup = await openPopup(context, extensionId, tabId);
    await popup.getByRole('button', { name: 'Detect data' }).click();
    const dashboard = await previewFromPopup(context, popup);
    await dashboard.getByLabel('Preset name').fill('Jobs board');
    await dashboard.getByRole('button', { name: 'Save preset' }).click();
    await expect(dashboard.getByText(/Saved “Jobs board”/)).toBeVisible();
    await context.close();

    const reopened = await launch(userDataDir);
    try {
      const sw = await serviceWorker(reopened);
      const id = new URL(sw.url()).host;
      const page = await reopened.newPage();
      await page.goto(`chrome-extension://${id}/dashboard.html#/presets`);
      await expect(page.getByText('Jobs board')).toBeVisible();
      // And it can be run from the popup on another page of the same site.
      const { tabId: tab2 } = await openFixture(reopened, sw, 'pagination/page2.html');
      const popup2 = await openPopup(reopened, id, tab2);
      const [dash2] = await Promise.all([
        reopened.waitForEvent('page', (p) => p.url().includes('dashboard.html#/preview')),
        popup2.getByRole('button', { name: 'Jobs board' }).click(),
      ]);
      await expect(dash2.getByTestId('preview-title')).toHaveText('Jobs board');
      await expect(dash2.getByTestId('data-grid').getByText('Ember Engineer')).toBeVisible();
    } finally {
      await reopened.close();
    }
  });
});
