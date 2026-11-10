import type { SyncKv } from './kvStorage';

/**
 * expo-sqlite kv-store, for iOS and Android. A separate file so the web build can swap in
 * nativeKv.web.ts and never bundle expo-sqlite's browser worker (which needs a wasm file
 * this project does not ship). Required lazily so plain Node can import the store.
 */
export function loadNativeKv(): SyncKv | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('expo-sqlite/kv-store') as typeof import('expo-sqlite/kv-store');
    const store = mod.default;
    return {
      getItem: (key) => store.getItemSync(key),
      setItem: (key, value) => store.setItemSync(key, value),
    };
  } catch {
    return null;
  }
}
