import { ContentRequestSchema } from '@swde/shared';
import { handleContentRequest } from './handler';
import { createPicker } from './picker';

declare global {
  interface Window {
    __swdeContentLoaded?: boolean;
  }
}

// Content scripts run in an isolated world: page scripts cannot see or forge this flag.
if (!window.__swdeContentLoaded) {
  window.__swdeContentLoaded = true;
  const picker = createPicker(document);

  chrome.runtime.onMessage.addListener((message: unknown, sender, sendResponse) => {
    // Only the extension itself can message content scripts (no externally_connectable), but
    // verify anyway and validate the shape before acting on it.
    if (sender.id !== chrome.runtime.id) return false;
    const parsed = ContentRequestSchema.safeParse(message);
    if (!parsed.success) {
      sendResponse({ ok: false, error: 'Invalid request' });
      return false;
    }
    sendResponse(handleContentRequest(parsed.data, document, picker));
    return false;
  });
}
