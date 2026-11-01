import { create } from 'zustand';
import type { Entitlements, LicenseState } from '@swde/licensing';
import { FREE_ENTITLEMENTS, resolveEntitlements } from '@swde/licensing';
import { STORAGE_KEYS, errorMessage } from '@swde/shared';
import { getLicenseClient } from '../services/license';
import { onStorageKeyChange } from '../services/storage';

interface LicenseStore {
  ready: boolean;
  state: LicenseState | null;
  /** The single source of truth for feature access in the UI. */
  entitlements: Entitlements;
  busy: boolean;
  error: string | null;
  load: () => Promise<void>;
  activate: (key: string) => Promise<boolean>;
  deactivate: () => Promise<void>;
}

export const useLicense = create<LicenseStore>((set) => ({
  ready: false,
  state: null,
  entitlements: FREE_ENTITLEMENTS,
  busy: false,
  error: null,
  async load() {
    try {
      const client = await getLicenseClient();
      const state = await client.getState();
      set({
        ready: true,
        state,
        entitlements: resolveEntitlements(state.status === 'active' ? state.features : null),
      });
    } catch (error) {
      // Licensing problems must never break Free features.
      set({
        ready: true,
        state: null,
        entitlements: FREE_ENTITLEMENTS,
        error: errorMessage(error),
      });
    }
  },
  async activate(key) {
    set({ busy: true, error: null });
    try {
      const client = await getLicenseClient();
      const result = await client.activate(key);
      set({
        busy: false,
        state: result.state,
        error: result.ok ? null : result.message,
        entitlements: resolveEntitlements(
          result.state.status === 'active' ? result.state.features : null,
        ),
      });
      return result.ok;
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
      return false;
    }
  },
  async deactivate() {
    set({ busy: true, error: null });
    try {
      const client = await getLicenseClient();
      const state = await client.deactivate();
      set({ busy: false, state, entitlements: FREE_ENTITLEMENTS });
    } catch (error) {
      set({ busy: false, error: errorMessage(error) });
    }
  },
}));

let watching = false;

/** Loads the license once per page and re-verifies when another extension page changes it. */
export function initLicense(): void {
  if (watching) return;
  watching = true;
  void useLicense.getState().load();
  onStorageKeyChange('local', [STORAGE_KEYS.licenseToken], () => void useLicense.getState().load());
}
