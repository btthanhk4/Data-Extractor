import type { DatasetDescriptor, ExtractedData } from '@swde/shared';
import { LIMITS, hashString } from '@swde/shared';
import { safeQuery } from './parsing/dom';
import { countItems, extractRows } from './parsing/rows';
import { detectCandidates } from './detection/detect';

export class ExtractionError extends Error {
  constructor(
    message: string,
    readonly code: 'not-found' | 'empty',
  ) {
    super(message);
    this.name = 'ExtractionError';
  }
}

export interface ResolvedContainer {
  container: Element;
  byFallback: boolean;
}

/**
 * Finds the dataset container on the current page: first by stored selector, then by
 * structural signature (handles presets on other pages of the same site and pagination where
 * the DOM path shifts slightly).
 */
export function resolveContainer(doc: Document, descriptor: DatasetDescriptor): ResolvedContainer {
  const direct = safeQuery(doc, descriptor.containerSelector);
  if (direct && countItems(direct, descriptor) > 0) return { container: direct, byFallback: false };

  const candidates = detectCandidates(doc).filter(
    (c) => c.kind === (descriptor.kind === 'table' ? 'table' : 'list'),
  );
  const exact = candidates.find((c) => c.descriptor.itemSignature === descriptor.itemSignature);
  if (exact) return { container: exact.container, byFallback: true };
  const sameStep = candidates.find(
    (c) => descriptor.kind !== 'table' && c.descriptor.itemSelector === descriptor.itemSelector,
  );
  if (sameStep) return { container: sameStep.container, byFallback: true };
  throw new ExtractionError('The selected dataset could not be found on this page.', 'not-found');
}

export interface ExtractResult {
  data: ExtractedData;
  fingerprint: string;
  resolvedByFallback: boolean;
}

export function fingerprintRows(rows: string[][]): string {
  const head = rows
    .slice(0, 3)
    .map((r) => r.join('\u0001'))
    .join('\u0002');
  const tail = rows.length > 3 ? rows[rows.length - 1]!.join('\u0001') : '';
  return `${rows.length}:${hashString(head + '\u0003' + tail)}`;
}

export function extractDataset(
  doc: Document,
  descriptor: DatasetDescriptor,
  maxRows: number = LIMITS.maxRows,
): ExtractResult {
  const { container, byFallback } = resolveContainer(doc, descriptor);
  const total = countItems(container, descriptor);
  const rows = extractRows(container, descriptor, Math.min(maxRows, LIMITS.maxRows));
  return {
    data: {
      columns: descriptor.columns.map((c) => ({ id: c.id, name: c.name })),
      rows,
      truncated: total - (descriptor.skipLeadingItems ?? 0) > rows.length,
    },
    fingerprint: fingerprintRows(rows),
    resolvedByFallback: byFallback,
  };
}
