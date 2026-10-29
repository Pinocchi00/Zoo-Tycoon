import { openIndexedDbTextStore } from './indexed-db-store';
import { createLocalStorageTextStore } from './local-storage-store';
import { createMemoryTextStore, type TextStore } from './text-store';

export type TextStoreKind = 'indexedDb' | 'localStorage' | 'memory';

export interface OpenedTextStore {
  readonly store: TextStore;
  /** `memory` means nothing survives a reload: app should warn the player. */
  readonly kind: TextStoreKind;
}

/** Browser storages, injectable so that tests can pass fakes or simulate their absence. */
export interface BrowserStorages {
  readonly indexedDB: IDBFactory | undefined;
  readonly localStorage: Storage | undefined;
}

const PROBE_KEY = 'zoo-refuge:probe';

/** Reads the real browser storages. Some browsers throw on access when privacy settings forbid it. */
export function readBrowserStorages(): BrowserStorages {
  return {
    indexedDB: typeof indexedDB === 'undefined' ? undefined : indexedDB,
    localStorage: readLocalStorage(),
  };
}

function readLocalStorage(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch (error) {
    if (error instanceof DOMException) {
      return undefined;
    }
    throw error;
  }
}

/** Some private modes expose localStorage with a zero quota: only a real write tells. */
function isWritable(storage: Storage): boolean {
  try {
    storage.setItem(PROBE_KEY, PROBE_KEY);
    storage.removeItem(PROBE_KEY);
    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      return false;
    }
    throw error;
  }
}

async function tryIndexedDb(factory: IDBFactory): Promise<TextStore | undefined> {
  try {
    return await openIndexedDbTextStore(factory);
  } catch (error) {
    // Firefox private mode and some WebViews refuse to open a database: fall back.
    if (error instanceof DOMException) {
      return undefined;
    }
    throw error;
  }
}

/** Best storage available: IndexedDB, then localStorage, then memory. */
export async function openBrowserTextStore(
  storages: BrowserStorages = readBrowserStorages(),
): Promise<OpenedTextStore> {
  if (storages.indexedDB !== undefined) {
    const store = await tryIndexedDb(storages.indexedDB);
    if (store !== undefined) {
      return { store, kind: 'indexedDb' };
    }
  }
  if (storages.localStorage !== undefined && isWritable(storages.localStorage)) {
    return { store: createLocalStorageTextStore(storages.localStorage), kind: 'localStorage' };
  }
  return { store: createMemoryTextStore(), kind: 'memory' };
}
