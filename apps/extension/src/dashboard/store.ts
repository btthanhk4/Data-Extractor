import { create } from 'zustand';
import type {
  CleaningRules,
  ColumnState,
  ExtractedData,
  PaginationSettings,
  SessionRecord,
} from '@swde/shared';
import { PaginationSettingsSchema, errorMessage } from '@swde/shared';
import { defaultCleaningRules, initialColumnState } from '@swde/extraction-core';
import type { Settings } from '@swde/shared';
import { extractInTab } from '../services/extraction';
import { listPresets } from '../services/presets';
import { cacheSessionData, getSession } from '../services/sessions';
import { TabError } from '../services/tabs';

export type LoadStatus = 'idle' | 'loading' | 'ready' | 'error';

interface PreviewStore {
  status: LoadStatus;
  error: string | null;
  sourceGone: boolean;
  session: SessionRecord | null;
  data: ExtractedData | null;
  columns: ColumnState[];
  rules: CleaningRules;
  pagination: PaginationSettings;
  pages: number;
  presetName: string | null;
  presetId: string | null;
  notice: string | null;
  load: (sessionId: string, settings: Settings) => Promise<void>;
  reextract: () => Promise<void>;
  setColumns: (columns: ColumnState[]) => void;
  setRules: (patch: Partial<CleaningRules>) => void;
  setPagination: (patch: Partial<PaginationSettings>) => void;
  setRows: (rows: string[][], pages: number) => void;
  setPreset: (id: string, name: string) => void;
}

export const usePreview = create<PreviewStore>((set, get) => ({
  status: 'idle',
  error: null,
  sourceGone: false,
  session: null,
  data: null,
  columns: [],
  rules: defaultCleaningRules(),
  pagination: PaginationSettingsSchema.parse({}),
  pages: 1,
  presetName: null,
  presetId: null,
  notice: null,

  async load(sessionId, settings) {
    set({ status: 'loading', error: null, notice: null, sourceGone: false });
    const session = await getSession(sessionId);
    if (!session) {
      set({
        status: 'error',
        error:
          'This preview has expired. Previews are kept in memory only and are cleared when the browser closes.',
      });
      return;
    }
    let rules = defaultCleaningRules({
      trimWhitespace: settings.defaultTrimWhitespace,
      removeEmptyRows: settings.defaultRemoveEmptyRows,
    });
    let columns: ColumnState[] | null = null;
    let pagination = PaginationSettingsSchema.parse({});
    let presetName: string | null = null;
    if (session.presetId) {
      const preset = (await listPresets()).find((p) => p.id === session.presetId);
      if (preset) {
        rules = preset.cleaning;
        columns = preset.columns;
        pagination = preset.pagination;
        presetName = preset.name;
      }
    }
    set({ session, rules, pagination, presetName, presetId: session.presetId });
    let data = session.data;
    let pages = session.pages;
    let notice: string | null = null;
    if (!data) {
      try {
        const result = await extractInTab(session.tabId, session.descriptor, session.page.url);
        data = result.data;
        pages = 1;
        if (result.resolvedByFallback) {
          notice =
            'The page layout differed from the saved selection, so the dataset was matched by structure. Check the columns.';
        }
        if (result.data.truncated)
          notice = `Only the first ${result.data.rows.length.toLocaleString('en-US')} rows were extracted (row limit).`;
        void cacheSessionData(session.id, data, pages);
      } catch (error) {
        set({
          status: 'error',
          error: errorMessage(error),
          sourceGone:
            error instanceof TabError && (error.code === 'gone' || error.code === 'permission'),
        });
        return;
      }
    }
    set({
      status: 'ready',
      data,
      pages,
      notice,
      columns: columns ?? initialColumnState(data),
    });
  },

  async reextract() {
    const { session } = get();
    if (!session) return;
    set({ status: 'loading', error: null });
    try {
      const result = await extractInTab(session.tabId, session.descriptor, session.page.url);
      void cacheSessionData(session.id, result.data, 1);
      set({ status: 'ready', data: result.data, pages: 1, notice: null });
    } catch (error) {
      set({
        status: 'error',
        error: errorMessage(error),
        sourceGone: error instanceof TabError && error.code === 'gone',
      });
    }
  },

  setColumns: (columns) => set({ columns }),
  setRules: (patch) => set({ rules: { ...get().rules, ...patch } }),
  setPagination: (patch) => set({ pagination: { ...get().pagination, ...patch } }),
  setRows(rows, pages) {
    const { data, session } = get();
    if (!data) return;
    const next = { ...data, rows, truncated: false };
    set({ data: next, pages });
    if (session) void cacheSessionData(session.id, next, pages);
  },
  setPreset: (id, name) => set({ presetId: id, presetName: name }),
}));
