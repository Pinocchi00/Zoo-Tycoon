/**
 * Minimal key → text storage that every backend (IndexedDB, localStorage, Capacitor) provides.
 * Methods may reject on I/O failure (quota, permissions); SaveStorage turns that into a Result.
 */
export interface TextStore {
  get: (key: string) => Promise<string | null>;
  set: (key: string, value: string) => Promise<void>;
  remove: (key: string) => Promise<void>;
  keys: () => Promise<string[]>;
}

/** Lost when the page closes: the last resort when the browser refuses every storage, and for tests. */
export function createMemoryTextStore(): TextStore {
  const entries = new Map<string, string>();
  return {
    get: (key) => Promise.resolve(entries.get(key) ?? null),
    set: (key, value) => {
      entries.set(key, value);
      return Promise.resolve();
    },
    remove: (key) => {
      entries.delete(key);
      return Promise.resolve();
    },
    keys: () => Promise.resolve([...entries.keys()]),
  };
}
