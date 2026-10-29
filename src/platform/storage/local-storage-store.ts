import type { TextStore } from './text-store';

/** Keeps our keys apart from anything else the page's origin stores. */
const KEY_PREFIX = 'zoo-refuge:';

/** Fallback when IndexedDB is missing. Synchronous underneath, exposed as promises like the others. */
export function createLocalStorageTextStore(storage: Storage): TextStore {
  return {
    get: (key) => Promise.resolve(storage.getItem(KEY_PREFIX + key)),
    set: (key, value) => {
      // setItem throws on a full quota; inside the executor that becomes a rejection.
      return new Promise((resolve) => {
        storage.setItem(KEY_PREFIX + key, value);
        resolve();
      });
    },
    remove: (key) => {
      storage.removeItem(KEY_PREFIX + key);
      return Promise.resolve();
    },
    keys: () => {
      const keys: string[] = [];
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(KEY_PREFIX) === true) {
          keys.push(key.slice(KEY_PREFIX.length));
        }
      }
      return Promise.resolve(keys);
    },
  };
}
