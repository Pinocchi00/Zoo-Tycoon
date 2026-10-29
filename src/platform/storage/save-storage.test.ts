import { describe, expect, it } from 'vitest';
import { deserialize, serialize, type SaveError } from '../../save';
import { createGameState, type GameState } from '../../sim';
import { createSaveStorage, KEPT_VALID_COPIES, type SaveStorage } from './save-storage';
import { createMemoryTextStore, type TextStore } from './text-store';

const WRITTEN_AT_MS = 1_793_260_800_000;
const TEMPORARY_KEY = 'save.tmp';

function saveWithCoins(coins: number): string {
  const state = createGameState(1);
  state.currencies.coins = coins;
  return serialize(state, WRITTEN_AT_MS + coins);
}

function storageOn(store: TextStore): SaveStorage<GameState, SaveError> {
  return createSaveStorage(store, deserialize);
}

async function coinsLoaded(storage: SaveStorage<GameState, SaveError>): Promise<number> {
  const loaded = await storage.read();
  if (!loaded.ok) {
    throw new Error(`Expected a save, got ${JSON.stringify(loaded.error)}`);
  }
  return loaded.value.value.currencies.coins;
}

async function writeAll(storage: SaveStorage<GameState, SaveError>, count: number): Promise<void> {
  for (let coins = 1; coins <= count; coins += 1) {
    expect((await storage.write(saveWithCoins(coins))).ok).toBe(true);
  }
}

/** The four kinds of damage named by the brief, applied to a valid save. */
const DAMAGES: Record<string, (text: string) => string> = {
  truncated: (text) => text.slice(0, text.length / 2),
  invalidJson: () => '{{{',
  wrongChecksum: (text) => text.replace(/"checksum":"[0-9a-f]{8}"/, '"checksum":"00000000"'),
  missingField: (text) => text.replace('"writtenAtMs"', '"writtenAtMsX"'),
};

describe('safe write', () => {
  it('starts with no save', async () => {
    expect(await storageOn(createMemoryTextStore()).read()).toEqual({
      ok: false,
      error: { kind: 'noSave' },
    });
  });

  it('writes a numbered copy, reads it back and leaves no temporary file', async () => {
    const store = createMemoryTextStore();
    const storage = storageOn(store);
    expect(await storage.write(saveWithCoins(42))).toEqual({
      ok: true,
      value: { sequence: 1, cleanupFailure: null },
    });
    expect(await store.keys()).toEqual(['save.copy.1']);
    expect(await storage.read()).toMatchObject({
      ok: true,
      value: { sequence: 1, skippedCopies: 0 },
    });
    expect(await coinsLoaded(storage)).toBe(42);
  });

  it(`keeps only the ${String(KEPT_VALID_COPIES)} newest valid copies`, async () => {
    const storage = storageOn(createMemoryTextStore());
    await writeAll(storage, 6);
    expect(await storage.listCopies()).toEqual({
      ok: true,
      value: [
        { sequence: 6, error: null },
        { sequence: 5, error: null },
        { sequence: 4, error: null },
      ],
    });
    expect(await coinsLoaded(storage)).toBe(6);
  });

  it('refuses text that does not validate and touches nothing', async () => {
    const store = createMemoryTextStore();
    const storage = storageOn(store);
    await writeAll(storage, 2);
    expect(await storage.write('garbage')).toEqual({
      ok: false,
      error: { kind: 'verificationFailed', stage: 'temporary' },
    });
    expect((await store.keys()).sort()).toEqual(['save.copy.1', 'save.copy.2']);
    expect(await coinsLoaded(storage)).toBe(2);
  });

  it('gives up when the temporary file reads back damaged', async () => {
    const memory = createMemoryTextStore();
    const store: TextStore = {
      ...memory,
      get: async (key) => {
        const text = await memory.get(key);
        return key === TEMPORARY_KEY && text !== null ? text.slice(1) : text;
      },
    };
    const storage = storageOn(store);
    expect(await storage.write(saveWithCoins(1))).toEqual({
      ok: false,
      error: { kind: 'verificationFailed', stage: 'temporary' },
    });
    expect(await memory.keys()).toEqual([]);
  });

  it('removes a copy that reads back damaged and keeps the older ones', async () => {
    const memory = createMemoryTextStore();
    let damageNewCopy = false;
    const store: TextStore = {
      ...memory,
      get: async (key) => {
        const text = await memory.get(key);
        return damageNewCopy && key === 'save.copy.3' && text !== null ? `${text}!` : text;
      },
    };
    const storage = storageOn(store);
    await writeAll(storage, 2);
    damageNewCopy = true;
    expect(await storage.write(saveWithCoins(3))).toEqual({
      ok: false,
      error: { kind: 'verificationFailed', stage: 'copy' },
    });
    expect((await memory.keys()).sort()).toEqual(['save.copy.1', 'save.copy.2', TEMPORARY_KEY]);
    expect(await coinsLoaded(storage)).toBe(2);
  });

  it('reports a full storage without losing the previous save', async () => {
    const memory = createMemoryTextStore();
    let full = false;
    const store: TextStore = {
      ...memory,
      set: (key, value) =>
        full ? Promise.reject(new Error('QuotaExceededError')) : memory.set(key, value),
    };
    const storage = storageOn(store);
    await writeAll(storage, 1);
    full = true;
    expect(await storage.write(saveWithCoins(2))).toEqual({
      ok: false,
      error: { kind: 'storageFailed', reason: 'QuotaExceededError' },
    });
    expect(await coinsLoaded(storage)).toBe(1);
  });

  it('reports a storage that cannot list its keys', async () => {
    const store: TextStore = {
      ...createMemoryTextStore(),
      keys: () => Promise.reject(new Error('locked')),
    };
    const storage = storageOn(store);
    const failure = { ok: false, error: { kind: 'storageFailed', reason: 'locked' } };
    expect(await storage.read()).toEqual(failure);
    expect(await storage.write(saveWithCoins(1))).toEqual(failure);
    expect(await storage.listCopies()).toEqual(failure);
  });

  it('never reuses the number of a damaged copy', async () => {
    const store = createMemoryTextStore();
    const storage = storageOn(store);
    await writeAll(storage, 2);
    await store.set('save.copy.2', 'damaged');
    expect(await storage.write(saveWithCoins(3))).toMatchObject({
      ok: true,
      value: { sequence: 3 },
    });
  });

  it('prunes only copies older than the third newest valid one', async () => {
    const store = createMemoryTextStore();
    const storage = storageOn(store);
    await writeAll(storage, 3);
    await store.set('save.copy.3', 'damaged');
    await storage.write(saveWithCoins(4));
    expect((await store.keys()).sort()).toEqual([
      'save.copy.1',
      'save.copy.2',
      'save.copy.3',
      'save.copy.4',
    ]);
    await storage.write(saveWithCoins(5));
    expect((await store.keys()).sort()).toEqual([
      'save.copy.2',
      'save.copy.3',
      'save.copy.4',
      'save.copy.5',
    ]);
  });

  it('still reports success when pruning fails, and prunes on the next write', async () => {
    const memory = createMemoryTextStore();
    let locked = true;
    const store: TextStore = {
      ...memory,
      remove: (key) =>
        locked && key !== TEMPORARY_KEY ? Promise.reject(new Error('locked')) : memory.remove(key),
    };
    const storage = storageOn(store);
    await writeAll(storage, KEPT_VALID_COPIES);
    expect(await storage.write(saveWithCoins(9))).toEqual({
      ok: true,
      value: { sequence: 4, cleanupFailure: { kind: 'storageFailed', reason: 'locked' } },
    });
    expect(await coinsLoaded(storage)).toBe(9);
    locked = false;
    await storage.write(saveWithCoins(10));
    expect((await memory.keys()).sort()).toEqual(['save.copy.3', 'save.copy.4', 'save.copy.5']);
  });

  it('still reports success when the temporary file cannot be removed', async () => {
    const memory = createMemoryTextStore();
    const store: TextStore = { ...memory, remove: () => Promise.reject(new Error('locked')) };
    const storage = storageOn(store);
    expect(await storage.write(saveWithCoins(1))).toEqual({
      ok: true,
      value: { sequence: 1, cleanupFailure: { kind: 'storageFailed', reason: 'locked' } },
    });
    expect(await coinsLoaded(storage)).toBe(1);
  });

  it('reports a failing pruning listing as a cleanup failure', async () => {
    const memory = createMemoryTextStore();
    let reads = 0;
    const store: TextStore = {
      ...memory,
      // The two verification reads succeed, then the storage breaks while pruning.
      get: (key) => {
        reads += 1;
        return reads > 2 ? Promise.reject(new Error('io')) : memory.get(key);
      },
    };
    expect(await storageOn(store).write(saveWithCoins(1))).toEqual({
      ok: true,
      value: { sequence: 1, cleanupFailure: { kind: 'storageFailed', reason: 'io' } },
    });
  });
});

describe('resilient load', () => {
  for (const [name, damage] of Object.entries(DAMAGES)) {
    it(`falls back to the previous copy when the newest is ${name}`, async () => {
      const store = createMemoryTextStore();
      const storage = storageOn(store);
      await writeAll(storage, 3);
      const newest = await store.get('save.copy.3');
      await store.set('save.copy.3', damage(newest ?? ''));

      const loaded = await storage.read();
      expect(loaded).toMatchObject({ ok: true, value: { sequence: 2, skippedCopies: 1 } });
      expect(await coinsLoaded(storage)).toBe(2);
    });
  }

  it('reports every error when no copy is readable', async () => {
    const store = createMemoryTextStore();
    const storage = storageOn(store);
    await writeAll(storage, 2);
    await store.set('save.copy.1', '{{{');
    await store.set('save.copy.2', '');
    expect(await storage.read()).toEqual({
      ok: false,
      error: {
        kind: 'noValidCopy',
        errors: [{ kind: 'invalidJson' }, { kind: 'invalidJson' }],
      },
    });
    expect(await storage.listCopies()).toEqual({
      ok: true,
      value: [
        { sequence: 2, error: { kind: 'invalidJson' } },
        { sequence: 1, error: { kind: 'invalidJson' } },
      ],
    });
  });

  it('skips a copy that vanished between listing and reading', async () => {
    const memory = createMemoryTextStore();
    const store: TextStore = {
      ...memory,
      get: (key) => (key === 'save.copy.2' ? Promise.resolve(null) : memory.get(key)),
    };
    await writeAll(storageOn(memory), 2);
    const storage = storageOn(store);
    expect(await storage.read()).toMatchObject({ ok: true, value: { skippedCopies: 1 } });
    expect(await storage.listCopies()).toEqual({
      ok: true,
      value: [{ sequence: 1, error: null }],
    });
  });

  it('skips a copy the storage fails to read and loads the previous one', async () => {
    const memory = createMemoryTextStore();
    await writeAll(storageOn(memory), 2);
    const storage = storageOn({
      ...memory,
      get: (key) => (key === 'save.copy.2' ? Promise.reject(new Error('io')) : memory.get(key)),
    });
    expect(await storage.read()).toMatchObject({
      ok: true,
      value: { sequence: 1, skippedCopies: 1 },
    });
  });

  it('reports a storage that fails to read every copy', async () => {
    const memory = createMemoryTextStore();
    await writeAll(storageOn(memory), 1);
    const storage = storageOn({ ...memory, get: () => Promise.reject(new Error('io')) });
    const failure = { ok: false, error: { kind: 'storageFailed', reason: 'io' } };
    expect(await storage.read()).toEqual(failure);
    expect(await storage.listCopies()).toEqual(failure);
    expect(await storage.write(saveWithCoins(2))).toEqual(failure);
  });

  it('reports damaged copies even when another copy failed to read', async () => {
    const memory = createMemoryTextStore();
    await writeAll(storageOn(memory), 2);
    await memory.set('save.copy.1', '{{{');
    const storage = storageOn({
      ...memory,
      get: (key) => (key === 'save.copy.2' ? Promise.reject(new Error('io')) : memory.get(key)),
    });
    expect(await storage.read()).toEqual({
      ok: false,
      error: { kind: 'noValidCopy', errors: [{ kind: 'invalidJson' }] },
    });
  });

  it('ignores keys that are not save copies', async () => {
    const store = createMemoryTextStore();
    await store.set('settings', '{}');
    await store.set('save.copy.x', '{}');
    await store.set('save.copy.007', '{}');
    await store.set('save.copy.0', '{}');
    expect(await storageOn(store).read()).toEqual({ ok: false, error: { kind: 'noSave' } });
  });
});
