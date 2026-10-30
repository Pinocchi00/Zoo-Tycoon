import { describe, expect, it } from 'vitest';
import { createMemoryTextStore, createSaveStorage, type TextStore } from '@/platform';
import { deserialize, serialize } from '@/save';
import { createEventQueue, createGameState, drain, type GameState } from '@/sim';
import {
  AUTOSAVE_INTERVAL_MS,
  createAutosaver,
  loadOrCreatePark,
  type ParkSaveStorage,
} from './park-save';

const WRITTEN_AT_MS = 1_793_260_800_000;
const NEW_PARK_SEED = 42;

function newPark(): GameState {
  return createGameState(NEW_PARK_SEED);
}

function savesOn(store: TextStore): ParkSaveStorage {
  return createSaveStorage(store, deserialize);
}

async function coinsSaved(saves: ParkSaveStorage): Promise<number | null> {
  const loaded = await saves.read();
  return loaded.ok ? loaded.value.value.currencies.coins : null;
}

describe('loading the park', () => {
  it('opens a new park when there is no save', async () => {
    const events = createEventQueue();
    const state = await loadOrCreatePark(savesOn(createMemoryTextStore()), events, newPark);
    expect(state).toEqual(createGameState(NEW_PARK_SEED));
    expect(drain(events)).toEqual([]);
  });

  it('loads the newest save', async () => {
    const saves = savesOn(createMemoryTextStore());
    const saved = createGameState(7);
    saved.currencies.coins = 500;
    await saves.write(serialize(saved, WRITTEN_AT_MS));
    const events = createEventQueue();
    expect(await loadOrCreatePark(saves, events, newPark)).toEqual(saved);
    expect(drain(events)).toEqual([]);
  });

  it('announces a recovery when the newest copy is damaged', async () => {
    const store = createMemoryTextStore();
    const saves = savesOn(store);
    const saved = createGameState(7);
    await saves.write(serialize(saved, WRITTEN_AT_MS));
    await saves.write(serialize(saved, WRITTEN_AT_MS + 1));
    await store.set('save.copy.2', '{{{');
    const events = createEventQueue();
    expect(await loadOrCreatePark(saves, events, newPark)).toEqual(saved);
    expect(drain(events)).toEqual([{ type: 'saveRecovered', skippedCopies: 1 }]);
  });

  it('opens a new park when no copy can be read', async () => {
    const store = createMemoryTextStore();
    await store.set('save.copy.1', '{{{');
    const state = await loadOrCreatePark(savesOn(store), createEventQueue(), newPark);
    expect(state).toEqual(createGameState(NEW_PARK_SEED));
  });
});

describe('autosave', () => {
  it('saves each time the interval of played time has passed', async () => {
    const saves = savesOn(createMemoryTextStore());
    const state = createGameState(1);
    let saveRequests = 0;
    const autosaver = createAutosaver(saves, state, () => {
      saveRequests += 1;
      return WRITTEN_AT_MS;
    });
    autosaver.record(AUTOSAVE_INTERVAL_MS - 1);
    expect(saveRequests).toBe(0);
    state.currencies.coins = 10;
    autosaver.record(1);
    expect(saveRequests).toBe(1);
    autosaver.record(AUTOSAVE_INTERVAL_MS - 1);
    expect(saveRequests).toBe(1);
    autosaver.record(1);
    expect(saveRequests).toBe(2);
    // Writes run one after the other: once this one is done, the automatic ones are too.
    await autosaver.saveNow();
    expect(await coinsSaved(saves)).toBe(10);
  });

  it('restarts the interval after a save asked for by the app', async () => {
    const state = createGameState(1);
    let saveRequests = 0;
    const autosaver = createAutosaver(savesOn(createMemoryTextStore()), state, () => {
      saveRequests += 1;
      return WRITTEN_AT_MS;
    });
    autosaver.record(AUTOSAVE_INTERVAL_MS - 1);
    await autosaver.saveNow();
    autosaver.record(AUTOSAVE_INTERVAL_MS - 1);
    expect(saveRequests).toBe(1);
  });

  it('saves the park as it was when the save was asked for', async () => {
    const saves = savesOn(createMemoryTextStore());
    const state = createGameState(1);
    const autosaver = createAutosaver(saves, state, () => WRITTEN_AT_MS);
    state.currencies.coins = 10;
    const first = autosaver.saveNow();
    state.currencies.coins = 20;
    await first;
    expect(await coinsSaved(saves)).toBe(10);
  });

  it('writes one save at a time, in order', async () => {
    const store = createMemoryTextStore();
    const saves = savesOn(store);
    const state = createGameState(1);
    const autosaver = createAutosaver(saves, state, () => WRITTEN_AT_MS);
    const pending: Promise<void>[] = [];
    for (let coins = 1; coins <= 5; coins += 1) {
      state.currencies.coins = coins;
      pending.push(autosaver.saveNow());
    }
    await Promise.all(pending);
    expect(await coinsSaved(saves)).toBe(5);
    expect((await store.keys()).filter((key) => key === 'save.tmp')).toEqual([]);
  });

  it('keeps playing when a save fails, and saves again later', async () => {
    const store = createMemoryTextStore();
    let broken = true;
    const flaky: TextStore = {
      ...store,
      set: (key, value) =>
        broken ? Promise.reject(new Error('disk full')) : store.set(key, value),
    };
    const saves = savesOn(flaky);
    const state = createGameState(1);
    const autosaver = createAutosaver(saves, state, () => WRITTEN_AT_MS);
    await autosaver.saveNow();
    expect(await coinsSaved(saves)).toBeNull();
    broken = false;
    state.currencies.coins = 30;
    await autosaver.saveNow();
    expect(await coinsSaved(saves)).toBe(30);
  });

  it('never stops the game when the park cannot be serialized', async () => {
    const saves = savesOn(createMemoryTextStore());
    const state = createGameState(1);
    let clockBroken = true;
    const autosaver = createAutosaver(saves, state, () => {
      if (clockBroken) {
        throw new Error('clock is broken');
      }
      return WRITTEN_AT_MS;
    });
    expect(() => {
      autosaver.record(AUTOSAVE_INTERVAL_MS);
    }).not.toThrow();
    await autosaver.saveNow();
    expect(await coinsSaved(saves)).toBeNull();
    clockBroken = false;
    state.currencies.coins = 40;
    await autosaver.saveNow();
    expect(await coinsSaved(saves)).toBe(40);
  });

  it('keeps saving after a write fails unexpectedly', async () => {
    const saves = savesOn(createMemoryTextStore());
    let throwing = true;
    const unreliable: ParkSaveStorage = {
      ...saves,
      write: (text) => (throwing ? Promise.reject(new Error('bug')) : saves.write(text)),
    };
    const state = createGameState(1);
    const autosaver = createAutosaver(unreliable, state, () => WRITTEN_AT_MS);
    await expect(autosaver.saveNow()).resolves.toBeUndefined();
    throwing = false;
    state.currencies.coins = 50;
    await autosaver.saveNow();
    expect(await coinsSaved(saves)).toBe(50);
  });
});
