import { useState } from 'react';
import { BookmarkPlus, CheckCircle2 } from 'lucide-react';
import type { Preset } from '@swde/shared';
import { createId, errorMessage, toOrigin } from '@swde/shared';
import { useLicense } from '../../hooks/useLicense';
import { listPresets, savePreset } from '../../services/presets';
import { usePreview } from '../store';
import { Button, Input, ProBadge, SectionTitle } from '../../components/ui';

export function SavePresetPanel() {
  const allowed = useLicense((s) => s.entitlements.has('presets'));
  const session = usePreview((s) => s.session);
  const columns = usePreview((s) => s.columns);
  const rules = usePreview((s) => s.rules);
  const pagination = usePreview((s) => s.pagination);
  const presetId = usePreview((s) => s.presetId);
  const presetName = usePreview((s) => s.presetName);
  const setPreset = usePreview((s) => s.setPreset);
  const [name, setName] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const origin = session ? toOrigin(session.page.url) : null;

  if (!allowed) {
    return (
      <div>
        <SectionTitle action={<ProBadge />}>Preset</SectionTitle>
        <p className="text-xs text-muted">
          Save this selection, column setup and cleaning rules to re-run them on this site in one
          click.
        </p>
      </div>
    );
  }

  const save = async (asNew: boolean) => {
    if (!session || !origin) return;
    setError(null);
    try {
      const now = Date.now();
      const existing =
        !asNew && presetId ? (await listPresets()).find((p) => p.id === presetId) : undefined;
      const preset: Preset = {
        id: existing?.id ?? createId('preset'),
        name: (name.trim() || presetName || session.label).slice(0, 120),
        origin,
        descriptor: session.descriptor,
        columns,
        cleaning: rules,
        pagination,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const saved = await savePreset(preset);
      setPreset(saved.id, saved.name);
      setMessage(`Saved “${saved.name}” for ${origin}.`);
      setName('');
    } catch (e) {
      setError(errorMessage(e));
    }
  };

  return (
    <div>
      <SectionTitle>Preset</SectionTitle>
      {!origin ? (
        <p className="text-xs text-subtle">Presets can only be saved for http(s) websites.</p>
      ) : (
        <div className="flex flex-col gap-2">
          <Input
            placeholder={presetName ?? session?.label ?? 'Preset name'}
            value={name}
            maxLength={120}
            onChange={(e) => setName(e.target.value)}
            aria-label="Preset name"
          />
          <div className="flex gap-1.5">
            <Button
              size="sm"
              variant="primary"
              onClick={() => void save(false)}
              icon={<BookmarkPlus className="h-3.5 w-3.5" />}
            >
              {presetId ? 'Update preset' : 'Save preset'}
            </Button>
            {presetId && (
              <Button size="sm" onClick={() => void save(true)}>
                Save as new
              </Button>
            )}
          </div>
          {message && (
            <p className="flex items-center gap-1 text-[11px] text-success">
              <CheckCircle2 className="h-3 w-3" aria-hidden /> {message}
            </p>
          )}
          {error && <p className="text-[11px] text-danger">{error}</p>}
        </div>
      )}
    </div>
  );
}
