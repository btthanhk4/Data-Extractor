import { useCallback, useEffect, useState } from 'react';
import type { Settings, Theme } from '@swde/shared';
import { STORAGE_KEYS } from '@swde/shared';
import { DEFAULT_SETTINGS, loadSettings, saveSettings } from '../services/settings';
import { onStorageKeyChange } from '../services/storage';

export function applyTheme(theme: Theme): void {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function useSettings(): {
  settings: Settings;
  loaded: boolean;
  update: (patch: Partial<Settings>) => Promise<void>;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    const refresh = () =>
      void loadSettings().then((s) => {
        if (!alive) return;
        setSettings(s);
        setLoaded(true);
      });
    refresh();
    const off = onStorageKeyChange('local', [STORAGE_KEYS.settings], refresh);
    return () => {
      alive = false;
      off();
    };
  }, []);

  useEffect(() => {
    applyTheme(settings.theme);
    if (settings.theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => applyTheme('system');
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [settings.theme]);

  const update = useCallback(async (patch: Partial<Settings>) => {
    setSettings(await saveSettings(patch));
  }, []);

  return { settings, loaded, update };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}
