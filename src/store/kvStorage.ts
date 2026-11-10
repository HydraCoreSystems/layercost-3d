/**
 * Key value storage for the LayerCost store.
 *
 * Native (iOS and Android): expo-sqlite kv-store, which is backed by a SQLite file and
 * survives app restarts. Web export: window.localStorage, exactly as before.
 * Node (vitest): no storage, so importing the store in tests stays side effect free.
 *
 * Native modules are required lazily so this file loads cleanly in a plain Node process.
 */

import { loadNativeKv } from './nativeKv';

export interface SyncKv {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export type KvBackend = 'sqlite' | 'localStorage' | 'none';

function isNativeRuntime(): boolean {
  return typeof navigator !== 'undefined' && navigator.product === 'ReactNative';
}

let cached: { kv: SyncKv | null; backend: KvBackend } | null = null;

function resolve(): { kv: SyncKv | null; backend: KvBackend } {
  if (cached) return cached;
  let result: { kv: SyncKv | null; backend: KvBackend } = { kv: null, backend: 'none' };
  if (isNativeRuntime()) {
    const kv = loadNativeKv();
    result = kv ? { backend: 'sqlite', kv } : { kv: null, backend: 'none' };
  } else if (typeof window !== 'undefined' && window.localStorage) {
    const ls = window.localStorage;
    result = {
      backend: 'localStorage',
      kv: {
        getItem: (key) => ls.getItem(key),
        setItem: (key, value) => ls.setItem(key, value),
      },
    };
  }
  cached = result;
  return result;
}

export function getKvStorage(): SyncKv | null {
  return resolve().kv;
}

export function getKvBackend(): KvBackend {
  return resolve().backend;
}

/** Test hook: forget the cached backend. */
export function resetKvStorageCache(): void {
  cached = null;
}

export interface DebouncedSaver {
  save(value: string): void;
  flush(): void;
}

/**
 * Collapses rapid writes (every keystroke in the calculator changes state) into one
 * write per delay window. delayMs of 0 writes immediately, which is the web behavior.
 */
export function createDebouncedSaver(kv: SyncKv, key: string, delayMs: number): DebouncedSaver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let pending: string | null = null;

  const flush = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === null) return;
    const value = pending;
    pending = null;
    try {
      kv.setItem(key, value);
    } catch {
      // ignore storage errors, same as the original localStorage path
    }
  };

  return {
    save(value: string) {
      pending = value;
      if (delayMs <= 0) {
        flush();
        return;
      }
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, delayMs);
    },
    flush,
  };
}

/** Calls onLeave when the app goes to the background or the page is hidden. Returns an unsubscribe. */
export function subscribeToAppLeave(onLeave: () => void): () => void {
  if (isNativeRuntime()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { AppState } = require('react-native') as typeof import('react-native');
      const sub = AppState.addEventListener('change', (next) => {
        if (next !== 'active') onLeave();
      });
      return () => sub.remove();
    } catch {
      return () => undefined;
    }
  }
  if (typeof document !== 'undefined' && typeof window !== 'undefined') {
    const handler = () => {
      if (document.visibilityState === 'hidden') onLeave();
    };
    document.addEventListener('visibilitychange', handler);
    window.addEventListener('pagehide', onLeave);
    return () => {
      document.removeEventListener('visibilitychange', handler);
      window.removeEventListener('pagehide', onLeave);
    };
  }
  return () => undefined;
}
