import { openIndexedDbTextStore } from './indexed-db-store';
import { createLocalStorageTextStore } from './local-storage-store';
import { createMemoryTextStore, type TextStore } from './text-store';

export type TextStoreKind = 'indexedDb' | 'localStorage' | 'memory';

export interface OpenedTextStore {
  readonly store: TextStore;
  /** `memory` means nothing survives a reload: app should warn the player. */
  readonly kind: TextStoreKind;
  /** Why IndexedDB was not used although present, for the development log. */
  readonly indexedDbFailure: string | null;
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

async function tryIndexedDb(factory: IDBFactory): Promise<TextStore | string> {
  try {
    return await openIndexedDbTextStore(factory);
  } catch (error) {
    // Firefox private mode and some WebViews refuse IndexedDB in odd ways. Any failure to open
    // it must fall back to another storage, never leave the game without saves; the reason is kept.
    return error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  }
}

/** Best storage available: IndexedDB, then localStorage, then memory. */
export async function openBrowserTextStore(
  storages: BrowserStorages = readBrowserStorages(),
): Promise<OpenedTextStore> {
  let indexedDbFailure: string | null = null;
  if (storages.indexedDB !== undefined) {
    const opened = await tryIndexedDb(storages.indexedDB);
    if (typeof opened !== 'string') {
      return { store: opened, kind: 'indexedDb', indexedDbFailure };
    }
    indexedDbFailure = opened;
  }
  if (storages.localStorage !== undefined && isWritable(storages.localStorage)) {
    const store = createLocalStorageTextStore(storages.localStorage);
    return { store, kind: 'localStorage', indexedDbFailure };
  }
  return { store: createMemoryTextStore(), kind: 'memory', indexedDbFailure };
}
