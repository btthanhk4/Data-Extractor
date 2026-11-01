import type { Entitlements, ExportFormat } from '@swde/licensing';
import { canExport } from '@swde/licensing';
import type { PageInfo, Settings } from '@swde/shared';
import { formatFilename, sanitizeFilename } from '@swde/shared';
import { XLSX_MIME, toCsv, toXlsx } from '@swde/extraction-core';
import { recordExport } from './history';

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  a.style.display = 'none';
  document.body.append(a);
  a.click();
  a.remove();
  // Give the download a moment to start before releasing the blob.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}

export function defaultFilename(settings: Settings, page: PageInfo, dataset: string): string {
  return formatFilename(settings.filenamePattern, { url: page.url, dataset });
}

export interface ExportRequest {
  format: ExportFormat;
  header: string[];
  rows: string[][];
  filename: string;
  settings: Settings;
  entitlements: Entitlements;
  page: PageInfo;
  dataset: string;
  pages: number;
}

export async function exportData(req: ExportRequest): Promise<string> {
  if (!canExport(req.format, req.entitlements)) {
    throw new Error('Excel export is a Pro feature.');
  }
  if (req.header.length === 0) throw new Error('Select at least one column to export.');
  const base = sanitizeFilename(req.filename.replace(/\.(csv|xlsx)$/i, ''), 'data');
  let blob: Blob;
  let filename: string;
  if (req.format === 'csv') {
    const csv = toCsv(req.header, req.rows, {
      bom: req.settings.csvBom,
      delimiter: req.settings.csvDelimiter,
      formulaProtection: req.settings.formulaProtection,
    });
    blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    filename = `${base}.csv`;
  } else {
    const bytes = toXlsx([
      { name: req.dataset || 'Data', header: req.header, rows: req.rows },
      {
        name: 'Source',
        header: ['Field', 'Value'],
        rows: [
          ['Page title', req.page.title],
          ['Page URL', req.page.url],
          ['Dataset', req.dataset],
          ['Pages extracted', String(req.pages)],
          ['Rows', String(req.rows.length)],
          ['Exported at', new Date().toISOString()],
        ],
        types: ['text', 'text'],
      },
    ]);
    blob = new Blob([bytes], { type: XLSX_MIME });
    filename = `${base}.xlsx`;
  }
  downloadBlob(blob, filename);
  await recordExport({
    url: req.page.url,
    title: req.page.title,
    dataset: req.dataset,
    rows: req.rows.length,
    columns: req.header.length,
    pages: req.pages,
    format: req.format,
  });
  return filename;
}
