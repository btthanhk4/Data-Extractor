import type { z } from 'zod';
import type { ContentRequest } from '@swde/shared';
import { ErrorResponseSchema, PingResponseSchema, errorMessage } from '@swde/shared';

export type TabErrorCode = 'unsupported' | 'permission' | 'no-response' | 'content-error' | 'gone';

export class TabError extends Error {
  constructor(
    message: string,
    readonly code: TabErrorCode,
  ) {
    super(message);
    this.name = 'TabError';
  }
}

export type PageSupport = { supported: true } | { supported: false; reason: string };

const BLOCKED_HOSTS = [
  'chrome.google.com',
  'chromewebstore.google.com',
  'microsoftedge.microsoft.com',
  'addons.mozilla.org',
];

/** Pages where browsers forbid extensions from running scripts. */
export function checkUrlSupport(url: string | undefined): PageSupport {
  if (!url) return { supported: false, reason: 'This tab has no accessible page.' };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { supported: false, reason: 'This tab has no accessible page.' };
  }
  if (parsed.protocol === 'file:') return { supported: true };
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      supported: false,
      reason: 'Browser pages (settings, new tab, extensions) cannot be read by extensions.',
    };
  }
  if (
    BLOCKED_HOSTS.some((h) => parsed.hostname === h) &&
    /webstore|detail|addon/.test(parsed.href)
  ) {
    return {
      supported: false,
      reason: 'Extension stores do not allow extensions to read their pages.',
    };
  }
  return { supported: true };
}

/**
 * The tab the popup acts on. E2E builds may target a specific tab via ?tabId= because tests
 * cannot click the toolbar button; this is compiled out of production builds.
 */
export async function getTargetTab(): Promise<chrome.tabs.Tab | null> {
  if (__E2E__) {
    const id = Number(new URLSearchParams(location.search).get('tabId'));
    if (Number.isInteger(id) && id > 0) return chrome.tabs.get(id).catch(() => null);
  }
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  return tab ?? null;
}

function mapChromeError(error: unknown, url?: string): TabError {
  const message = errorMessage(error);
  if (/file:\/\//.test(message) || (url?.startsWith('file:') && /Cannot access/.test(message))) {
    return new TabError(
      'To read local files, enable "Allow access to file URLs" for this extension in chrome://extensions.',
      'permission',
    );
  }
  if (/Cannot access|Missing host permission|permission/i.test(message)) {
    return new TabError(
      'The extension does not have access to this page. Click the extension icon on the page again to grant access.',
      'permission',
    );
  }
  if (/cannot be scripted|chrome:\/\/|edge:\/\/|about:/i.test(message)) {
    return new TabError('Browser pages cannot be read by extensions.', 'unsupported');
  }
  if (/No tab with id|tab was closed/i.test(message)) {
    return new TabError('The source tab was closed.', 'gone');
  }
  if (
    /Receiving end does not exist|message port closed|Could not establish connection/i.test(message)
  ) {
    return new TabError(
      'The page did not respond. It may still be loading — try again.',
      'no-response',
    );
  }
  if (/Frame with ID 0 was removed|page.*(navigat|unload)/i.test(message)) {
    return new TabError('The page navigated while it was being read.', 'no-response');
  }
  return new TabError(message, 'content-error');
}

async function ping(tabId: number): Promise<boolean> {
  try {
    const res: unknown = await chrome.tabs.sendMessage(tabId, {
      type: 'swde:ping',
    } satisfies ContentRequest);
    return PingResponseSchema.safeParse(res).success;
  } catch {
    return false;
  }
}

/** Injects the content script on demand (no persistent content scripts on every page). */
export async function ensureContentScript(tabId: number, url?: string): Promise<void> {
  if (await ping(tabId)) return;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
  } catch (error) {
    throw mapChromeError(error, url);
  }
}

/** Sends a request to the content script and validates the response against `schema`. */
export async function sendToTab<S extends z.ZodTypeAny>(
  tabId: number,
  request: ContentRequest,
  schema: S,
): Promise<z.infer<S>> {
  let response: unknown;
  try {
    response = await chrome.tabs.sendMessage(tabId, request);
  } catch (error) {
    throw mapChromeError(error);
  }
  const ok = schema.safeParse(response);
  if (ok.success) return ok.data;
  const failure = ErrorResponseSchema.safeParse(response);
  if (failure.success) throw new TabError(failure.data.error, 'content-error');
  throw new TabError('The page returned an unexpected response.', 'content-error');
}

export async function requestOriginAccess(url: string): Promise<boolean> {
  let origin: string;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    origin = `${parsed.origin}/*`;
  } catch {
    return false;
  }
  try {
    // Must run directly inside a user gesture; Chrome resolves true without a prompt if granted.
    return await chrome.permissions.request({ origins: [origin] });
  } catch {
    return false;
  }
}
