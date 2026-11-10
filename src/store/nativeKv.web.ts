import type { SyncKv } from './kvStorage';

/** Web export: native SQLite storage does not exist here. kvStorage falls back to localStorage. */
export function loadNativeKv(): SyncKv | null {
  return null;
}
