export const PRODUCT_NAME = 'Smart Web Data Extractor';
export const PRODUCT_SHORT_NAME = 'Data Extractor';

/** Hard limits that keep memory and message sizes bounded on hostile or huge pages. */
export const LIMITS = {
  maxRows: 50_000,
  maxColumns: 60,
  maxCellLength: 10_000,
  maxDetectedDatasets: 12,
  previewRows: 5,
  maxScanElements: 40_000,
  maxPresets: 500,
  maxPresetImportBytes: 1_000_000,
  maxHistoryEntries: 200,
  maxSelectorLength: 1_000,
} as const;

export const PAGINATION_LIMITS = {
  minDelayMs: 1_000,
  defaultDelayMs: 2_500,
  maxDelayMs: 60_000,
  minPages: 2,
  maxPages: 100,
  defaultMaxPages: 10,
  pageTimeoutMs: 20_000,
  maxRetries: 3,
  backoffBaseMs: 1_000,
} as const;

/** Message type prefix shared by every runtime message so foreign messages are easy to reject. */
export const MESSAGE_PREFIX = 'swde:';

export const STORAGE_KEYS = {
  settings: 'swde.settings',
  presets: 'swde.presets',
  history: 'swde.history',
  licenseToken: 'swde.license.token',
  licenseMeta: 'swde.license.meta',
  deviceId: 'swde.device.id',
  sessionPrefix: 'swde.session.',
} as const;
