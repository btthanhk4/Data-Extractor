import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { BrowserContext, Page, Worker } from '@playwright/test';
import { test as base, chromium, expect } from '@playwright/test';

export const EXTENSION_DIR = resolve(process.cwd(), 'apps/extension/dist/chrome-e2e');
export const FIXTURES = 'http://127.0.0.1:4173';

export async function launch(userDataDir: string): Promise<BrowserContext> {
  return chromium.launchPersistentContext(userDataDir, {
    // The "chromium" channel uses new headless mode, which supports extensions.
    channel: 'chromium',
    headless: true,
    acceptDownloads: true,
    viewport: { width: 1400, height: 900 },
    args: [`--disable-extensions-except=${EXTENSION_DIR}`, `--load-extension=${EXTENSION_DIR}`],
  });
}

export async function serviceWorker(context: BrowserContext): Promise<Worker> {
  return context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
}

interface Fixtures {
  userDataDir: string;
  context: BrowserContext;
  extensionId: string;
  worker: Worker;
}

export const test = base.extend<Fixtures>({
  // eslint-disable-next-line no-empty-pattern
  userDataDir: async ({}, use) => {
    await use(mkdtempSync(join(tmpdir(), 'swde-e2e-')));
  },
  context: async ({ userDataDir }, use) => {
    const context = await launch(userDataDir);
    await use(context);
    await context.close();
  },
  worker: async ({ context }, use) => {
    await use(await serviceWorker(context));
  },
  extensionId: async ({ worker }, use) => {
    await use(new URL(worker.url()).host);
  },
});

export { expect };

/** Opens a fixture page and returns it together with its Chrome tab id. */
export async function openFixture(
  context: BrowserContext,
  worker: Worker,
  path: string,
): Promise<{ page: Page; tabId: number }> {
  const page = await context.newPage();
  const url = `${FIXTURES}/${path}`;
  await page.goto(url);
  const tabId = await worker.evaluate(async (u) => {
    const tabs = await chrome.tabs.query({});
    return tabs.find((t) => t.url === u)?.id ?? -1;
  }, url);
  expect(tabId).toBeGreaterThan(0);
  return { page, tabId };
}

/** Opens the popup UI bound to a tab (the e2e build honours ?tabId= because tests cannot click the toolbar). */
export async function openPopup(
  context: BrowserContext,
  extensionId: string,
  tabId: number,
): Promise<Page> {
  const popup = await context.newPage();
  await popup.setViewportSize({ width: 380, height: 600 });
  await popup.goto(`chrome-extension://${extensionId}/popup.html?tabId=${tabId}`);
  return popup;
}

export async function activatePro(context: BrowserContext, extensionId: string): Promise<void> {
  const page = await context.newPage();
  await page.goto(`chrome-extension://${extensionId}/dashboard.html#/license`);
  await page.getByLabel('License key').fill('SWDE-DEV-PRO');
  await page.getByRole('button', { name: 'Activate' }).click();
  await expect(page.getByTestId('license-status')).toHaveText('Pro — active');
  await page.close();
}

/** Clicks Preview in the popup and returns the dashboard page that opens. */
export async function previewFromPopup(context: BrowserContext, popup: Page): Promise<Page> {
  const [dashboard] = await Promise.all([
    context.waitForEvent('page', (p) => p.url().includes('dashboard.html')),
    popup.getByRole('button', { name: 'Preview data' }).click(),
  ]);
  await dashboard.waitForLoadState();
  return dashboard;
}
