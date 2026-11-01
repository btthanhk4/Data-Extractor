import { useEffect, useState } from 'react';
import { CheckCircle2, Download, FileSpreadsheet, FileText, AlertTriangle } from 'lucide-react';
import type { DataColumn, Settings } from '@swde/shared';
import { errorMessage } from '@swde/shared';
import type { ExportFormat } from '@swde/licensing';
import { canExport } from '@swde/licensing';
import { useLicense } from '../../hooks/useLicense';
import { defaultFilename, exportData } from '../../services/export';
import { usePreview } from '../store';
import {
  Button,
  Field,
  Input,
  Notice,
  ProBadge,
  SectionTitle,
  Select,
  Switch,
  cx,
} from '../../components/ui';

export function ExportPanel({
  columns,
  rows,
  settings,
  updateSettings,
}: {
  columns: DataColumn[];
  rows: string[][];
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => Promise<void>;
}) {
  const entitlements = useLicense((s) => s.entitlements);
  const session = usePreview((s) => s.session);
  const pages = usePreview((s) => s.pages);
  const presetName = usePreview((s) => s.presetName);
  const [format, setFormat] = useState<ExportFormat>('csv');
  const [filename, setFilename] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const label = presetName ?? session?.label ?? 'data';

  useEffect(() => {
    if (session) setFilename(defaultFilename(settings, session.page, label));
  }, [session, settings, label]);

  const run = async () => {
    if (!session) return;
    setBusy(true);
    setResult(null);
    try {
      const saved = await exportData({
        format,
        header: columns.map((c) => c.name),
        rows,
        filename,
        settings,
        entitlements,
        page: session.page,
        dataset: label,
        pages,
      });
      setResult({
        ok: true,
        text: `Saved ${saved} (${rows.length.toLocaleString('en-US')} rows, ${columns.length} columns).`,
      });
    } catch (error) {
      setResult({ ok: false, text: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  const formats: { id: ExportFormat; label: string; icon: typeof FileText }[] = [
    { id: 'csv', label: 'CSV', icon: FileText },
    { id: 'xlsx', label: 'Excel', icon: FileSpreadsheet },
  ];

  return (
    <div>
      <SectionTitle>Export</SectionTitle>
      <div role="radiogroup" aria-label="Export format" className="grid grid-cols-2 gap-1.5">
        {formats.map((f) => {
          const allowed = canExport(f.id, entitlements);
          const active = format === f.id;
          return (
            <button
              key={f.id}
              type="button"
              role="radio"
              aria-checked={active}
              aria-disabled={!allowed}
              data-testid={`format-${f.id}`}
              onClick={() => allowed && setFormat(f.id)}
              className={cx(
                'flex items-center justify-center gap-1.5 rounded-lg border px-2 py-2 text-[13px] font-medium transition-colors',
                active
                  ? 'border-accent/50 bg-accent-soft text-accent'
                  : 'border-border text-muted hover:bg-sunken',
                !allowed && 'cursor-not-allowed opacity-60 hover:bg-transparent',
              )}
            >
              <f.icon className="h-4 w-4" aria-hidden />
              {f.label}
              {!allowed && <ProBadge />}
            </button>
          );
        })}
      </div>

      <div className="mt-3 flex flex-col gap-2.5">
        <Field label="File name" hint={`.${format} is added automatically`}>
          <Input
            value={filename}
            onChange={(e) => setFilename(e.target.value)}
            maxLength={120}
            data-testid="export-filename"
          />
        </Field>
        {format === 'csv' && (
          <>
            <Field label="Delimiter">
              <Select
                value={settings.csvDelimiter}
                onChange={(e) =>
                  void updateSettings({ csvDelimiter: e.target.value as Settings['csvDelimiter'] })
                }
                className="w-full"
              >
                <option value=",">Comma ( , )</option>
                <option value=";">Semicolon ( ; ) — European Excel</option>
                <option value={'\t'}>Tab</option>
              </Select>
            </Field>
            <Switch
              label="Excel-friendly encoding"
              description="Adds a UTF-8 byte-order mark so accents and non-Latin text open correctly"
              checked={settings.csvBom}
              onChange={(v) => void updateSettings({ csvBom: v })}
            />
          </>
        )}
        <Button
          variant="primary"
          size="lg"
          onClick={() => void run()}
          loading={busy}
          disabled={!session || columns.length === 0}
          icon={<Download className="h-4 w-4" />}
          data-testid="export-button"
        >
          Export {rows.length.toLocaleString('en-US')} rows
        </Button>
        {result && (
          <Notice
            tone={result.ok ? 'success' : 'danger'}
            icon={
              result.ok ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertTriangle className="h-4 w-4" />
              )
            }
            title={result.ok ? 'Export complete' : 'Export failed'}
          >
            <span data-testid="export-result">{result.text}</span>
          </Notice>
        )}
      </div>
    </div>
  );
}
