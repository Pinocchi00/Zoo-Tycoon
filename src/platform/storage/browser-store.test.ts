import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { openBrowserTextStore } from './browser-store';
import { openIndexedDbTextStore } from './indexed-db-store';
import { createLocalStorageTextStore } from './local-storage-store';
import { checkTextStore } from './text-store-contract';

/** In-memory Storage, with an optional quota to simulate a full or private-mode browser. */
class FakeStorage implements Storage {
  private readonly entries = new Map<string, string>();

  constructor(private readonly quota = Number.POSITIVE_INFINITY) {}

  get length(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null;
  }

  key(index: number): string | null {
    return [...this.entries.keys()][index] ?? null;
  }

  removeItem(key: string): void {
    this.entries.delete(key);
  }

  setItem(key: string, value: string): void {
    if (this.entries.size >= this.quota) {
      throw new DOMException('Storage is full.', 'QuotaExceededError');
    }
    this.entries.set(key, value);
  }
}

function refusingFactory(error: Error): IDBFactory {
  const refuse = (): never => {
    throw error;
  };
  return { open: refuse, deleteDatabase: refuse, cmp: refuse, databases: refuse };
}

/** A database already upgraded by a newer game: opening it at our version fails asynchronously. */
async function newerDatabaseFactory(): Promise<IDBFactory> {
  const factory = new IDBFactory();
  await new Promise<void>((resolve, reject) => {
    const request = factory.open('zoo-refuge', 2);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => {
      reject(new Error('Could not prepare the newer database.'));
    };
  });
  return factory;
}

describe('IndexedDB store', () => {
  it('honours the text store contract', async () => {
    await checkTextStore(await openIndexedDbTextStore(new IDBFactory()));
  });

  it('keeps data across connections', async () => {
    const factory = new IDBFactory();
    await (await openIndexedDbTextStore(factory)).set('save', 'park');
    expect(await (await openIndexedDbTextStore(factory)).get('save')).toBe('park');
  });
});

describe('localStorage store', () => {
  it('honours the text store contract', async () => {
    await checkTextStore(createLocalStorageTextStore(new FakeStorage()));
  });

  it('ignores keys that belong to someone else on the same origin', async () => {
    const storage = new FakeStorage();
    storage.setItem('other-app', 'x');
    const store = createLocalStorageTextStore(storage);
    await store.set('save', 'park');
    expect(await store.keys()).toEqual(['save']);
  });

  it('rejects a write beyond the quota', async () => {
    const store = createLocalStorageTextStore(new FakeStorage(0));
    await expect(store.set('save', 'park')).rejects.toThrow('Storage is full.');
  });
});

describe('browser store selection', () => {
  it('prefers IndexedDB', async () => {
    const opened = await openBrowserTextStore({
      indexedDB: new IDBFactory(),
      localStorage: new FakeStorage(),
    });
    expect(opened.kind).toBe('indexedDb');
  });

  it('falls back to localStorage when IndexedDB is missing', async () => {
    const opened = await openBrowserTextStore({
      indexedDB: undefined,
      localStorage: new FakeStorage(),
    });
    expect(opened).toMatchObject({ kind: 'localStorage', indexedDbFailure: null });
  });

  it('falls back to localStorage on any IndexedDB failure, and says why', async () => {
    const failures: [IDBFactory, string][] = [
      [
        refusingFactory(new DOMException('IndexedDB is disabled.', 'InvalidStateError')),
        'InvalidStateError: IndexedDB is disabled.',
      ],
      [refusingFactory(new TypeError('open is broken')), 'TypeError: open is broken'],
      [await newerDatabaseFactory(), 'VersionError'],
    ];
    for (const [indexedDB, reason] of failures) {
      const opened = await openBrowserTextStore({ indexedDB, localStorage: new FakeStorage() });
      expect(opened.kind).toBe('localStorage');
      expect(opened.indexedDbFailure).toContain(reason);
    }
  });

  it('falls back to memory when nothing can be written', async () => {
    for (const localStorage of [undefined, new FakeStorage(0)]) {
      const opened = await openBrowserTextStore({ indexedDB: undefined, localStorage });
      expect(opened.kind).toBe('memory');
      await checkTextStore(opened.store);
    }
  });
});
