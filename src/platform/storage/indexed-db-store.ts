import type { TextStore } from './text-store';

const DATABASE_NAME = 'zoo-refuge';
const DATABASE_VERSION = 1;
const OBJECT_STORE = 'texts';

function failure(error: DOMException | null, fallback: string): Error {
  return error ?? new Error(fallback);
}

function openDatabase(factory: IDBFactory): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      request.result.createObjectStore(OBJECT_STORE);
    };
    request.onsuccess = () => {
      resolve(request.result);
    };
    request.onerror = () => {
      reject(failure(request.error, 'Could not open IndexedDB.'));
    };
  });
}

/**
 * Runs one request in its own transaction and resolves only once the transaction is committed,
 * so that a resolved write is really on disk before the save is read back.
 */
function transact<T>(
  database: IDBDatabase,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(OBJECT_STORE, mode);
    const request = action(transaction.objectStore(OBJECT_STORE));
    transaction.oncomplete = () => {
      resolve(request.result);
    };
    transaction.onerror = () => {
      reject(failure(transaction.error, 'IndexedDB transaction failed.'));
    };
    transaction.onabort = () => {
      reject(failure(transaction.error, 'IndexedDB transaction aborted.'));
    };
  });
}

/** Main browser storage: larger quota than localStorage and less eager to be cleared. */
export async function openIndexedDbTextStore(factory: IDBFactory): Promise<TextStore> {
  const database = await openDatabase(factory);
  return {
    get: async (key) => {
      const value = await transact<unknown>(database, 'readonly', (store) => store.get(key));
      return typeof value === 'string' ? value : null;
    },
    set: async (key, value) => {
      await transact(database, 'readwrite', (store) => store.put(value, key));
    },
    remove: async (key) => {
      await transact(database, 'readwrite', (store) => store.delete(key));
    },
    keys: async () => {
      const keys = await transact(database, 'readonly', (store) => store.getAllKeys());
      return keys.filter((key) => typeof key === 'string');
    },
  };
}
