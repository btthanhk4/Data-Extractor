import type { Settings } from '@swde/shared';
import { STORAGE_KEYS, SettingsSchema } from '@swde/shared';
import { localStore } from './storage';

export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

export async function loadSettings(): Promise<Settings> {
  const raw = await localStore.get(STORAGE_KEYS.settings);
  const parsed = SettingsSchema.safeParse(raw ?? {});
  return parsed.success ? parsed.data : DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<Settings>): Promise<Settings> {
  const next = SettingsSchema.parse({ ...(await loadSettings()), ...patch });
  await localStore.set(STORAGE_KEYS.settings, next);
  return next;
}
