import { describe, expect, it } from 'vitest';
import { animalId, bannerId, enclosureId, err, speciesId, type Result } from '../shared';
import { loadGameContent } from '../data';
import {
  advance,
  applyCommand,
  createEventQueue,
  createGameState,
  nextUint32,
  STATE_VERSION,
  STEP_MS,
  type GameState,
} from '../sim';
import { checksum } from './checksum';
import { deserialize, readSave, SAVE_FORMAT, SAVE_FORMAT_VERSION, serialize } from './serialize';

const WRITTEN_AT_MS = 1_793_260_800_000;
const SEED = 2024;
const PLAYED_MS = 123_456;
const SPENT_DRAWS = 17;
/** Enough to reach the welcome banner's guaranteed choice, which stays pending. */
const WELCOME_TICKETS = 18;

function unwrap<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Unexpected error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/** A state with something in every field, so that a lost field cannot go unnoticed. */
function playedState(): GameState {
  const state = createGameState(SEED);
  const events = createEventQueue();
  advance(state, PLAYED_MS + STEP_MS / 2, events);
  const data = unwrap(loadGameContent());
  applyCommand(state, { type: 'addCoins', amount: 1234 }, data, events);
  state.currencies.arrivalTickets = WELCOME_TICKETS;
  const welcome = unwrap(bannerId('welcome'));
  for (let batch = 0; batch < 2; batch += 1) {
    applyCommand(state, { type: 'performArrival', bannerId: welcome, mode: 'multi' }, data, events);
  }
  for (let draw = 0; draw < SPENT_DRAWS; draw += 1) {
    nextUint32(state.rng);
  }
  state.currencies.shavings = 7;
  state.enclosures.push({ id: unwrap(enclosureId('meadow-1')) });
  state.animals.push({
    id: unwrap(animalId('capy-1')),
    speciesId: unwrap(speciesId('capybara')),
  });
  return state;
}

/** A save with a correct checksum around any payload: reaches the checks behind the checksum. */
function forgeSave(rawState: unknown): string {
  const payload = JSON.stringify(rawState);
  return JSON.stringify(envelopeFields(payload));
}

function envelopeFields(payload: string): Record<string, unknown> {
  return {
    format: SAVE_FORMAT,
    formatVersion: SAVE_FORMAT_VERSION,
    writtenAtMs: WRITTEN_AT_MS,
    checksum: checksum(payload),
    payload,
  };
}

describe('round trip', () => {
  it('gives back exactly the same state', () => {
    const state = playedState();
    const loaded = deserialize(serialize(state, WRITTEN_AT_MS));
    expect(loaded).toEqual({ ok: true, value: state });
    expect(JSON.stringify(unwrap(loaded))).toBe(JSON.stringify(state));
  });

  it('restores the same future random draws', () => {
    const state = playedState();
    const loaded = unwrap(deserialize(serialize(state, WRITTEN_AT_MS)));
    expect(nextUint32(loaded.rng)).toBe(nextUint32(state.rng));
  });

  it('round-trips a fresh park and keeps the write time', () => {
    const state = createGameState(0);
    expect(readSave(serialize(state, 0))).toEqual({
      ok: true,
      value: { state, writtenAtMs: 0 },
    });
    expect(unwrap(readSave(serialize(state, WRITTEN_AT_MS))).writtenAtMs).toBe(WRITTEN_AT_MS);
  });

  it('refuses a write time that is not a whole non-negative number', () => {
    const state = createGameState(0);
    for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => serialize(state, bad)).toThrow(RangeError);
    }
  });
});

describe('damaged files', () => {
  const text = serialize(playedState(), WRITTEN_AT_MS);

  it('rejects every truncation without throwing', () => {
    for (let length = 0; length < text.length; length += 1) {
      expect(deserialize(text.slice(0, length)).ok).toBe(false);
    }
  });

  it('reports text that is not JSON', () => {
    for (const bad of ['', 'not json', '{"format":', '\u0000\u0000']) {
      expect(deserialize(bad)).toEqual(err({ kind: 'invalidJson' }));
    }
  });

  it('reports a changed payload as a checksum mismatch', () => {
    const tampered = text.replace('1234', '9999');
    expect(tampered).not.toBe(text);
    expect(deserialize(tampered)).toEqual(err({ kind: 'checksumMismatch' }));
  });

  it('reports a missing, wrong or extra envelope field', () => {
    const { writtenAtMs: _writtenAtMs, ...withoutDate } = envelopeFields('{}');
    expect(deserialize(JSON.stringify(withoutDate))).toEqual(
      err({ kind: 'invalidEnvelope', path: 'writtenAtMs' }),
    );
    const foreign = { ...envelopeFields('{}'), format: 'another-game' };
    expect(deserialize(JSON.stringify(foreign))).toEqual(
      err({ kind: 'invalidEnvelope', path: 'format' }),
    );
    const badChecksum = { ...envelopeFields('{}'), checksum: 'XYZ' };
    expect(deserialize(JSON.stringify(badChecksum))).toEqual(
      err({ kind: 'invalidEnvelope', path: 'checksum' }),
    );
    const extra = { ...envelopeFields('{}'), cheat: true };
    expect(deserialize(JSON.stringify(extra)).ok).toBe(false);
    for (const notAnEnvelope of ['null', '42', '[]', '"save"']) {
      expect(deserialize(notAnEnvelope)).toMatchObject(err({ kind: 'invalidEnvelope' }));
    }
  });

  it('reports an envelope from a newer game as unsupported', () => {
    const newer = { ...envelopeFields('{}'), formatVersion: SAVE_FORMAT_VERSION + 1 };
    expect(deserialize(JSON.stringify(newer))).toEqual(
      err({ kind: 'unsupportedFormat', formatVersion: SAVE_FORMAT_VERSION + 1 }),
    );
  });

  it('reports a payload that is not a versioned JSON object', () => {
    const notJson = JSON.stringify(envelopeFields('{"version":'));
    expect(deserialize(notJson)).toEqual(err({ kind: 'invalidPayload' }));
    expect(deserialize(forgeSave([1, 2]))).toEqual(err({ kind: 'invalidPayload' }));
  });

  it('reports a state from a newer game', () => {
    const state = playedState();
    const future = STATE_VERSION + 1;
    expect(deserialize(forgeSave({ ...state, version: future }))).toEqual(
      err({ kind: 'versionFromFuture', version: future }),
    );
  });
});

describe('state validation', () => {
  const state = playedState();

  function pathOf(rawState: unknown): unknown {
    const result = deserialize(forgeSave(rawState));
    return result.ok ? 'accepted' : result.error;
  }

  it('reports a missing field with its path', () => {
    const { coins: _coins, ...currencies } = state.currencies;
    expect(pathOf({ ...state, currencies })).toEqual({
      kind: 'invalidState',
      path: 'currencies.coins',
    });
    const { rng: _rng, ...withoutRng } = state;
    expect(pathOf(withoutRng)).toEqual({ kind: 'invalidState', path: 'rng' });
  });

  it('refuses money that is not a whole non-negative number', () => {
    for (const coins of [1.5, -1, '12', null, Number.MAX_SAFE_INTEGER + 2]) {
      expect(pathOf({ ...state, currencies: { ...state.currencies, coins } })).toEqual({
        kind: 'invalidState',
        path: 'currencies.coins',
      });
    }
  });

  it('refuses a clock that holds a whole step', () => {
    expect(pathOf({ ...state, clock: { ...state.clock, accumulatorMs: STEP_MS } })).toEqual({
      kind: 'invalidState',
      path: 'clock.accumulatorMs',
    });
  });

  it('refuses a generator word outside 32 bits', () => {
    expect(pathOf({ ...state, rng: [0, 1, 2, 2 ** 32] })).toEqual({
      kind: 'invalidState',
      path: 'rng.3',
    });
    expect(pathOf({ ...state, rng: [0, 1, 2] })).toMatchObject({ kind: 'invalidState' });
  });

  it('refuses the all-zero generator, which would draw zero forever', () => {
    expect(pathOf({ ...state, rng: [0, 0, 0, 0] })).toEqual({ kind: 'invalidState', path: 'rng' });
    expect(pathOf({ ...state, rng: [0, 0, 0, 1] })).toBe('accepted');
  });

  it('refuses a malformed identifier', () => {
    const animals = [{ id: 'Capy 1', speciesId: 'capybara' }];
    expect(pathOf({ ...state, animals })).toEqual({ kind: 'invalidState', path: 'animals.0.id' });
    const enclosures = [{ id: '' }];
    expect(pathOf({ ...state, enclosures })).toEqual({
      kind: 'invalidState',
      path: 'enclosures.0.id',
    });
  });

  it('refuses impossible arrival progress', () => {
    const gacha = state.gacha;
    const [first] = gacha.collection;
    if (first === undefined) {
      throw new Error('The played state has met a species.');
    }
    expect(pathOf({ ...state, gacha: { ...gacha, collection: [{ ...first, stars: 6 }] } })).toEqual(
      {
        kind: 'invalidState',
        path: 'gacha.collection.0.stars',
      },
    );
    expect(pathOf({ ...state, gacha: { ...gacha, collection: [first, first] } })).toEqual({
      kind: 'invalidState',
      path: 'gacha.collection',
    });
    expect(
      pathOf({
        ...state,
        gacha: { ...gacha, arrivalsSince: { ...gacha.arrivalsSince, rare: -1 } },
      }),
    ).toEqual({ kind: 'invalidState', path: 'gacha.arrivalsSince.rare' });
    const pendingChoice = { bannerId: 'welcome', options: [] };
    expect(
      pathOf({ ...state, gacha: { ...gacha, welcome: { ...gacha.welcome, pendingChoice } } }),
    ).toEqual({ kind: 'invalidState', path: 'gacha.welcome.pendingChoice.options' });
    const twice = { bannerId: 'welcome', options: ['jaguar', 'jaguar'] };
    expect(
      pathOf({
        ...state,
        gacha: { ...gacha, welcome: { ...gacha.welcome, pendingChoice: twice } },
      }),
    ).toEqual({ kind: 'invalidState', path: 'gacha.welcome.pendingChoice.options' });
  });

  it('refuses a history with a gap or an unknown rarity', () => {
    const history = state.gacha.history;
    expect(pathOf({ ...state, gacha: { ...state.gacha, history: history.slice(1) } })).toEqual({
      kind: 'invalidState',
      path: 'gacha.history',
    });
    const [first, ...rest] = history;
    const forged = [{ ...first, rarity: 'legendary' }, ...rest];
    expect(pathOf({ ...state, gacha: { ...state.gacha, history: forged } })).toEqual({
      kind: 'invalidState',
      path: 'gacha.history.0.rarity',
    });
  });

  it('refuses an unknown field', () => {
    expect(pathOf({ ...state, hackedGems: 9999 })).toMatchObject({ kind: 'invalidState' });
  });
});

const EMPTY_GACHA = {
  arrivalsSince: { rare: 0, veryRare: 0, iconic: 0 },
  welcome: { arrivalsDone: 0, pendingChoice: null },
  collection: [],
  history: [],
};

describe('migration from version 1', () => {
  const state = playedState();
  const { gacha: _gacha, ...stateV1 } = { ...state, version: 1 };

  it('loads a version 1 save, with no arrival made yet', () => {
    expect(deserialize(forgeSave(stateV1))).toEqual({
      ok: true,
      value: { ...state, gacha: EMPTY_GACHA },
    });
  });

  it('reports a version 1 save that cannot be migrated', () => {
    expect(deserialize(forgeSave([]))).toEqual(err({ kind: 'invalidPayload' }));
    expect(deserialize(forgeSave({ version: 1 }))).toMatchObject({
      ok: false,
      error: { kind: 'invalidState' },
    });
  });
});

describe('migration from version 0', () => {
  const state = playedState();
  const { shavings: _shavings, ...currenciesV0 } = state.currencies;
  const { gacha: _gacha, ...stateV1 } = state;
  const stateV0 = {
    ...stateV1,
    version: 0,
    clock: { timeMs: state.clock.timeMs },
    currencies: currenciesV0,
  };

  it('loads a version 0 save, with the new fields at zero', () => {
    expect(deserialize(forgeSave(stateV0))).toEqual({
      ok: true,
      value: {
        ...state,
        clock: { ...state.clock, accumulatorMs: 0 },
        currencies: { ...state.currencies, shavings: 0 },
        gacha: EMPTY_GACHA,
      },
    });
  });

  it('reports a version 0 save that cannot be migrated', () => {
    const { clock: _clock, ...broken } = stateV0;
    expect(deserialize(forgeSave(broken))).toEqual(
      err({ kind: 'migrationFailed', from: 0, reason: 'notAVersion0State' }),
    );
  });
});
