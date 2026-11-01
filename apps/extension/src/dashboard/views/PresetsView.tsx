import { useCallback, useEffect, useRef, useState } from 'react';
import { Bookmark, Download, Trash2, Upload } from 'lucide-react';
import type { Preset } from '@swde/shared';
import { useLicense } from '../../hooks/useLicense';
import { downloadBlob } from '../../services/export';
import { deletePreset, importPresets, listPresets, serializePresets } from '../../services/presets';
import { Button, Card, Notice, ProBadge } from '../../components/ui';

export function PresetsView({ navigate }: { navigate: (route: string) => void }) {
  const entitlements = useLicense((s) => s.entitlements);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const canUse = entitlements.has('presets');
  const canIO = entitlements.has('preset-io');

  const refresh = useCallback(() => void listPresets().then(setPresets), []);
  useEffect(refresh, [refresh]);

  const onImport = async (file: File) => {
    const result = await importPresets(await file.text());
    setMessage(
      result.error
        ? { ok: false, text: result.error }
        : { ok: true, text: `Imported ${result.imported} preset(s).` },
    );
    refresh();
  };

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            Saved presets {!canUse && <ProBadge />}
          </h2>
          <p className="text-sm text-muted">
            Reusable selections with their columns, cleaning rules and pagination settings. Stored
            only in this browser.
          </p>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void onImport(file);
            }}
          />
          <Button
            size="sm"
            disabled={!canIO}
            onClick={() => fileRef.current?.click()}
            icon={<Upload className="h-3.5 w-3.5" />}
          >
            Import
          </Button>
          <Button
            size="sm"
            disabled={!canIO || presets.length === 0}
            onClick={() =>
              downloadBlob(
                new Blob([serializePresets(presets)], { type: 'application/json' }),
                'swde-presets.json',
              )
            }
            icon={<Download className="h-3.5 w-3.5" />}
          >
            Export all
          </Button>
        </div>
      </div>

      {!canUse && (
        <Notice
          tone="accent"
          icon={<Bookmark className="h-4 w-4" />}
          title="Presets are part of Pro"
          action={
            <Button size="sm" onClick={() => navigate('/license?feature=presets')}>
              See Pro
            </Button>
          }
        >
          Save an extraction once, then re-run it from the popup on any page of the same site.
        </Notice>
      )}
      {message && (
        <Notice
          tone={message.ok ? 'success' : 'danger'}
          title={message.ok ? 'Import complete' : 'Import failed'}
        >
          {message.text}
        </Notice>
      )}

      <Card>
        {presets.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-subtle">
            No presets yet. Save one from the preview screen.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {presets.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <Bookmark className="h-4 w-4 shrink-0 text-accent" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium">{p.name}</p>
                  <p className="truncate text-xs text-subtle">
                    {p.origin} · {p.columns.filter((c) => c.visible).length} columns
                    {p.pagination.next ? ` · up to ${p.pagination.maxPages} pages` : ''} · updated{' '}
                    {new Date(p.updatedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  aria-label={`Delete ${p.name}`}
                  onClick={() => {
                    if (confirm(`Delete preset “${p.name}”?`))
                      void deletePreset(p.id).then(refresh);
                  }}
                  icon={<Trash2 className="h-3.5 w-3.5" />}
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <p className="text-xs text-subtle">
        To run a preset, open a page on the same site and pick it under “Presets for this site” in
        the popup.
      </p>
    </div>
  );
}
