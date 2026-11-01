import { BackgroundRequestSchema, STORAGE_KEYS, SettingsSchema } from '@swde/shared';
import { createSession, openDashboard } from '../services/sessions';

/**
 * The service worker is intentionally small: it never scans pages or runs timers. It only
 * initialises defaults and receives the result of the visual picker (which runs in the page
 * after the popup has closed).
 */

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  const existing = await chrome.storage.local.get(STORAGE_KEYS.settings);
  if (!existing[STORAGE_KEYS.settings]) {
    await chrome.storage.local.set({ [STORAGE_KEYS.settings]: SettingsSchema.parse({}) });
  }
  if (reason === 'install' && !__E2E__) {
    await openDashboard('/welcome');
  }
});

chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
  // Accept messages only from our own content scripts running in a tab.
  if (sender.id !== chrome.runtime.id || !sender.tab?.id || sender.tab.id < 0) return false;
  const parsed = BackgroundRequestSchema.safeParse(message);
  if (!parsed.success) {
    sendResponse({ ok: false, error: 'Invalid request' });
    return false;
  }
  const request = parsed.data;
  if (request.type === 'swde:pickerCancelled') {
    sendResponse({ ok: true });
    return false;
  }
  const tabId = sender.tab.id;
  void (async () => {
    try {
      const id = await createSession({
        tabId,
        // Trust the browser's view of the tab URL over what the page reported.
        page: {
          url: sender.tab?.url ?? request.page.url,
          title: sender.tab?.title ?? request.page.title,
        },
        label: 'Selected elements',
        descriptor: request.descriptor,
        presetId: null,
        data: null,
        pages: 1,
      });
      await openDashboard(`/preview?s=${id}`);
      sendResponse({ ok: true });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : 'Failed' });
    }
  })();
  return true;
});
