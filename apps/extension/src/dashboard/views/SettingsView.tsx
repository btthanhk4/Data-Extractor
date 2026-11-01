import { useState } from 'react';
import { Monitor, Moon, Sun, Trash2 } from 'lucide-react';
import type { Settings, Theme } from '@swde/shared';
import { STORAGE_KEYS, formatFilename } from '@swde/shared';
import { Button, Card, Field, Input, SectionTitle, Select, Switch, cx } from '../../components/ui';
import { localStore } from '../../services/storage';

export function SettingsView({
  settings,
  updateSettings,
}: {
  settings: Settings;
  updateSettings: (p: Partial<Settings>) => Promise<void>;
}) {
  const [pattern, setPattern] = useState(settings.filenamePattern);
  const [cleared, setCleared] = useState(false);
  const themes: { id: Theme; label: string; icon: typeof Sun }[] = [
    { id: 'system', label: 'System', icon: Monitor },
    { id: 'light', label: 'Light', icon: Sun },
    { id: 'dark', label: 'Dark', icon: Moon },
  ];

  const clearAll = async () => {
    if (
      !confirm(
        'Delete all presets, history and settings stored by this extension? Your license stays active.',
      )
    )
      return;
    await Promise.all([
      localStore.remove(STORAGE_KEYS.presets),
      localStore.remove(STORAGE_KEYS.history),
      localStore.remove(STORAGE_KEYS.settings),
    ]);
    await chrome.storage.session.clear();
    setCleared(true);
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <h2 className="text-lg font-semibold">Settings</h2>

      <Card className="p-5">
        <SectionTitle>Appearance</SectionTitle>
        <div role="radiogroup" aria-label="Theme" className="grid max-w-sm grid-cols-3 gap-2">
          {themes.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={settings.theme === t.id}
              onClick={() => void updateSettings({ theme: t.id })}
              className={cx(
                'flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[13px] transition-colors',
                settings.theme === t.id
                  ? 'border-accent/50 bg-accent-soft text-accent'
                  : 'border-border text-muted hover:bg-sunken',
              )}
            >
              <t.icon className="h-4 w-4" aria-hidden />
              {t.label}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Export defaults</SectionTitle>
        <div className="flex flex-col gap-3">
          <Field
            label="File name pattern"
            hint={`Tokens: {site} {dataset} {date} {time} — e.g. ${formatFilename(pattern || 'data', { url: 'https://shop.example.com/', dataset: 'Products' })}.csv`}
          >
            <Input
              value={pattern}
              maxLength={120}
              onChange={(e) => setPattern(e.target.value)}
              onBlur={() =>
                void updateSettings({
                  filenamePattern: pattern.trim() || '{site}-{dataset}-{date}',
                })
              }
            />
          </Field>
          <Field label="CSV delimiter">
            <Select
              value={settings.csvDelimiter}
              onChange={(e) =>
                void updateSettings({ csvDelimiter: e.target.value as Settings['csvDelimiter'] })
              }
            >
              <option value=",">Comma</option>
              <option value=";">Semicolon</option>
              <option value={'\t'}>Tab</option>
            </Select>
          </Field>
          <Switch
            label="Excel-friendly CSV encoding (UTF-8 BOM)"
            checked={settings.csvBom}
            onChange={(v) => void updateSettings({ csvBom: v })}
          />
          <Switch
            label="Protect against spreadsheet formulas"
            description="Values starting with = + - @ are prefixed with ' so spreadsheet apps show them as text instead of running them. Recommended."
            checked={settings.formulaProtection}
            onChange={(v) => void updateSettings({ formulaProtection: v })}
          />
        </div>
      </Card>

      <Card className="p-5">
        <SectionTitle>Default cleaning</SectionTitle>
        <Switch
          label="Trim whitespace"
          checked={settings.defaultTrimWhitespace}
          onChange={(v) => void updateSettings({ defaultTrimWhitespace: v })}
        />
        <Switch
          label="Remove empty rows"
          checked={settings.defaultRemoveEmptyRows}
          onChange={(v) => void updateSettings({ defaultRemoveEmptyRows: v })}
        />
      </Card>

      <Card className="p-5">
        <SectionTitle>Privacy & data</SectionTitle>
        <ul className="mb-3 list-disc space-y-1 pl-5 text-xs text-muted">
          <li>
            Pages are read only when you click Detect, Preview, Export or start a multi-page run.
          </li>
          <li>
            Extracted data is processed on your device and kept in memory until the browser closes.
          </li>
          <li>
            No analytics or tracking. The only network request the extension makes is license
            activation/verification.
          </li>
        </ul>
        <Switch
          label="Keep extraction history (metadata only)"
          checked={settings.historyEnabled}
          onChange={(v) => void updateSettings({ historyEnabled: v })}
        />
        <Button
          className="mt-3"
          variant="danger"
          size="sm"
          onClick={() => void clearAll()}
          icon={<Trash2 className="h-3.5 w-3.5" />}
        >
          Delete all local data
        </Button>
        {cleared && (
          <p className="mt-2 text-xs text-success">
            All presets, history and settings were deleted.
          </p>
        )}
      </Card>
      <p className="text-center text-[11px] text-subtle">
        Smart Web Data Extractor v{__APP_VERSION__}
      </p>
    </div>
  );
}
