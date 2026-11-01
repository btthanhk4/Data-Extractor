import type { Preset, PresetFile } from '@swde/shared';
import {
  LIMITS,
  PresetFileSchema,
  PresetSchema,
  STORAGE_KEYS,
  createId,
  errorMessage,
  safeJsonParse,
} from '@swde/shared';
import { localStore } from './storage';

export async function listPresets(): Promise<Preset[]> {
  const raw = await localStore.get(STORAGE_KEYS.presets);
  if (!Array.isArray(raw)) return [];
  // Validate on read too: storage could hold data written by an older version.
  return raw.flatMap((p) => {
    const parsed = PresetSchema.safeParse(p);
    return parsed.success ? [parsed.data] : [];
  });
}

async function writePresets(presets: Preset[]): Promise<void> {
  await localStore.set(STORAGE_KEYS.presets, presets.slice(0, LIMITS.maxPresets));
}

export async function savePreset(preset: Preset): Promise<Preset> {
  const valid = PresetSchema.parse(preset);
  const all = await listPresets();
  const index = all.findIndex((p) => p.id === valid.id);
  if (index >= 0) all[index] = valid;
  else {
    if (all.length >= LIMITS.maxPresets)
      throw new Error(`You can store up to ${LIMITS.maxPresets} presets.`);
    all.unshift(valid);
  }
  await writePresets(all);
  return valid;
}

export async function deletePreset(id: string): Promise<void> {
  await writePresets((await listPresets()).filter((p) => p.id !== id));
}

export async function presetsForOrigin(origin: string): Promise<Preset[]> {
  return (await listPresets()).filter((p) => p.origin === origin);
}

export function serializePresets(presets: Preset[]): string {
  const file: PresetFile = { format: 'swde-presets', version: 1, exportedAt: Date.now(), presets };
  return JSON.stringify(file, null, 2);
}

export interface ImportResult {
  imported: number;
  error: string | null;
}

/**
 * Imports a preset file. Presets are pure data (selectors, names, rules); nothing in them is
 * ever executed. Parsing strips prototype-pollution keys and the schema rejects unknown shapes.
 */
export async function importPresets(text: string): Promise<ImportResult> {
  if (text.length > LIMITS.maxPresetImportBytes) {
    return { imported: 0, error: 'This file is too large to be a preset export.' };
  }
  let data: unknown;
  try {
    data = safeJsonParse(text);
  } catch (error) {
    return { imported: 0, error: `Not valid JSON: ${errorMessage(error)}` };
  }
  const parsed = PresetFileSchema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      imported: 0,
      error: `Not a valid preset file${issue ? ` (${issue.path.join('.') || 'root'}: ${issue.message})` : ''}.`,
    };
  }
  const existing = await listPresets();
  const room = LIMITS.maxPresets - existing.length;
  if (room <= 0) return { imported: 0, error: `You already have ${LIMITS.maxPresets} presets.` };
  const now = Date.now();
  // Fresh ids avoid silently overwriting local presets with imported ones.
  const incoming = parsed.data.presets
    .slice(0, room)
    .map((p) => ({ ...p, id: createId('preset'), updatedAt: now }));
  await writePresets([...incoming, ...existing]);
  return { imported: incoming.length, error: null };
}
