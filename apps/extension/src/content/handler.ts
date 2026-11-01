import type { ContentRequest, PageInfo } from '@swde/shared';
import { errorMessage } from '@swde/shared';
import {
  ExtractionError,
  clickNextControl,
  detectDatasets,
  extractDataset,
  findNextControl,
} from '@swde/extraction-core';

export interface PickerControl {
  start(): void;
  stop(): void;
}

export function pageInfo(doc: Document): PageInfo {
  return {
    url: doc.location?.href.slice(0, 4_000) ?? '',
    title: (doc.title || '').slice(0, 1_000),
  };
}

/**
 * Handles a validated request from the extension. Kept free of chrome.* APIs so it can be
 * tested against fixture documents.
 */
export function handleContentRequest(
  request: ContentRequest,
  doc: Document,
  picker: PickerControl,
): unknown {
  try {
    switch (request.type) {
      case 'swde:ping':
        return { ok: true, version: __APP_VERSION__ };
      case 'swde:detect':
        return { ok: true, page: pageInfo(doc), datasets: detectDatasets(doc) };
      case 'swde:extract': {
        const result = extractDataset(doc, request.descriptor);
        return {
          ok: true,
          page: pageInfo(doc),
          data: result.data,
          fingerprint: result.fingerprint,
          resolvedByFallback: result.resolvedByFallback,
        };
      }
      case 'swde:findNext':
        return { ok: true, next: findNextControl(doc) };
      case 'swde:clickNext':
        return { ok: true, clicked: clickNextControl(doc, request.next) };
      case 'swde:pickerStart':
        picker.start();
        return { ok: true };
      case 'swde:pickerStop':
        picker.stop();
        return { ok: true };
      default:
        return { ok: false, error: 'Unknown request' };
    }
  } catch (error) {
    if (error instanceof ExtractionError) return { ok: false, error: error.message };
    return { ok: false, error: `Could not read this page: ${errorMessage(error)}`.slice(0, 500) };
  }
}
