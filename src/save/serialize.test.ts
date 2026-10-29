import { describe, expect, it } from 'vitest';
import {
  animalId,
  archetypeId,
  bannerId,
  enclosureId,
  err,
  itemId,
  speciesId,
  visitorId,
  type Result,
} from '../shared';
import { loadGameContent } from '../data';
import {
  advance,
  applyCommand,
  createEventQueue,
  createGameState,
  createSimContext,
  createVisitorsState,
  createSessionState,
  nextUint32,
  STATE_VERSION,
  STEP_MS,
  toSavedState,
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

/** Arrivals, coins, time and random draws, but nothing built: all that older saves could hold. */
function arrivalsState(): GameState {
  const state = createGameState(SEED);
  const events = createEventQueue();
  const data = unwrap(loadGameContent());
  advance(state, PLAYED_MS + STEP_MS / 2, createSimContext(data), events);
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
  state.animals.push({
    id: unwrap(animalId('capy-1')),
    speciesId: unwrap(speciesId('capybara')),
  });
  // What any older save becomes: the suggestion feed fades from the time it was written.
  state.visitors.suggestionsHalvedAtMs = state.clock.timeMs;
  return state;
}

/** A state with something in every field, so that a lost field cannot go unnoticed. */
function playedState(): GameState {
  const state = arrivalsState();
  const events = createEventQueue();
  const data = unwrap(loadGameContent());
  const [met] = state.gacha.collection;
  if (met === undefined) {
    throw new Error('The arrivals state has met a species.');
  }
  const square = [
    { x: 100, y: 100 },
    { x: 108, y: 100 },
    { x: 108, y: 108 },
    { x: 100, y: 108 },
  ];
  const pathCells = Array.from({ length: 8 }, (_unused, index) => ({
    column: 100 + index,
    row: 108,
  }));
  const commands = [
    { type: 'placeEnclosure', outline: square },
    { type: 'placePath', cells: pathCells, surface: unwrap(itemId('gravel')) },
    {
      type: 'installGroup',
      enclosureId: unwrap(enclosureId('enclosure-1')),
      speciesId: met.speciesId,
    },
    {
      type: 'placeBuilding',
      itemId: unwrap(itemId('bench')),
      column: 100,
      row: 109,
      quarterTurns: 0,
    },
    { type: 'undoBuild' },
  ] as const;
  for (const command of commands) {
    unwrap(applyCommand(state, command, data, events));
  }
  // This little park does not reach the entrance, so its visitors are written by hand.
  const enclosure = unwrap(enclosureId('enclosure-1'));
  state.visitors = {
    list: [
      {
        id: unwrap(visitorId('visitor-2')),
        archetypeId: unwrap(archetypeId('couple')),
        groupSize: 2,
        column: 103,
        row: 108,
        nextColumn: 104,
        nextRow: 108,
        progressMm: 420,
        activity: 'walking',
        goal: { kind: 'enclosure', enclosureId: enclosure },
        waitMs: 0,
        serviceId: null,
        needs: { foodDrink: 1_234_567, rest: 7_000_000, comfort: 0 },
        wonderBp: 2100,
        satisfaction: 6_543_210,
        seen: [enclosure],
        visitLeftMs: 300_000,
        missingNeeds: ['rest'],
        updatedAtMs: state.clock.timeMs,
      },
    ],
    nextNumber: 3,
    arrivalProgress: 12_345,
    parkSatisfactionBp: 7777,
    suggestions: { foodDrink: 1, rest: 5, comfort: 0 },
    suggestionsHalvedAtMs: 60_000,
  };
  return state;
}

/** The fields that versions before 3 did not have. */
function withoutPark(
  state: GameState,
): Omit<GameState, 'paths' | 'buildings' | 'nextIds' | 'visitors' | 'session'> {
  const {
    paths: _paths,
    buildings: _buildings,
    nextIds: _nextIds,
    visitors: _visitors,
    session: _session,
    ...rest
  } = state;
  return rest;
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
  it('gives back exactly the same state, with a fresh session', () => {
    const state = playedState();
    const loaded = deserialize(serialize(state, WRITTEN_AT_MS));
    const expected = { ...state, session: createSessionState() };
    expect(loaded).toEqual({ ok: true, value: expected });
    expect(JSON.stringify(unwrap(loaded))).toBe(JSON.stringify(expected));
  });

  it('never writes the undo history', () => {
    const state = playedState();
    expect(state.session.buildHistory.undo.length).toBeGreaterThan(0);
    expect(state.session.buildHistory.redo.length).toBeGreaterThan(0);
    const text = serialize(state, WRITTEN_AT_MS);
    expect(text).not.toContain('session');
    expect(unwrap(deserialize(text)).session).toEqual(createSessionState());
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
    const tampered = text.replace('"shavings\\":7', '"shavings\\":8');
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
  const state = toSavedState(playedState());

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
    const enclosures = state.enclosures.map((enclosure) => ({ ...enclosure, id: '' }));
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

  it('refuses an impossible park', () => {
    const [enclosure] = state.enclosures;
    const [tile] = state.paths;
    if (enclosure === undefined || tile === undefined) {
      throw new Error('The played state has built a park.');
    }
    expect(pathOf({ ...state, enclosures: [enclosure, enclosure] })).toEqual({
      kind: 'invalidState',
      path: 'enclosures',
    });
    const twin = { ...enclosure, id: 'enclosure-99' };
    expect(pathOf({ ...state, enclosures: [enclosure, twin] })).toEqual({
      kind: 'invalidState',
      path: 'enclosures',
    });
    expect(pathOf({ ...state, enclosures: [{ ...enclosure, outline: [] }] })).toEqual({
      kind: 'invalidState',
      path: 'enclosures.0.outline',
    });
    expect(pathOf({ ...state, paths: [tile, tile] })).toEqual({
      kind: 'invalidState',
      path: 'paths',
    });
    const bench = { id: 'building-1', itemId: 'bench', column: 1, row: 1, quarterTurns: 4 };
    expect(pathOf({ ...state, buildings: [bench] })).toEqual({
      kind: 'invalidState',
      path: 'buildings.0.quarterTurns',
    });
    expect(pathOf({ ...state, buildings: [{ ...bench, quarterTurns: 1 }] })).toBe('accepted');
    expect(pathOf({ ...state, nextIds: { enclosure: 0, building: 1 } })).toEqual({
      kind: 'invalidState',
      path: 'nextIds.enclosure',
    });
    // A counter behind the ids already given, or an id the game never issues.
    expect(pathOf({ ...state, nextIds: { ...state.nextIds, enclosure: 1 } })).toEqual({
      kind: 'invalidState',
      path: 'nextIds.enclosure',
    });
    expect(pathOf({ ...state, enclosures: [{ ...enclosure, id: 'meadow-1' }] })).toEqual({
      kind: 'invalidState',
      path: 'nextIds.enclosure',
    });
    expect(
      pathOf({ ...state, buildings: [{ ...bench, quarterTurns: 1, id: 'building-2' }] }),
    ).toEqual({ kind: 'invalidState', path: 'nextIds.building' });
    const far = { x: 70_000, y: 0 };
    expect(pathOf({ ...state, enclosures: [{ ...enclosure, outline: [far, far, far] }] })).toEqual({
      kind: 'invalidState',
      path: 'enclosures.0.outline.0.x',
    });
    const corners = Array.from({ length: 257 }, (_unused, index) => ({ x: index, y: 0 }));
    expect(pathOf({ ...state, enclosures: [{ ...enclosure, outline: corners }] })).toEqual({
      kind: 'invalidState',
      path: 'enclosures.0.outline',
    });
  });

  it('refuses impossible visitors', () => {
    const [visitor] = state.visitors.list;
    if (visitor === undefined) {
      throw new Error('The played state has a visitor.');
    }
    const withVisitor = (patch: Record<string, unknown>): unknown => ({
      ...state,
      visitors: { ...state.visitors, list: [{ ...visitor, ...patch }] },
    });
    expect(pathOf(withVisitor({ nextColumn: visitor.column + 2 }))).toEqual({
      kind: 'invalidState',
      path: 'visitors.list.0.nextColumn',
    });
    expect(pathOf(withVisitor({ progressMm: 1000 }))).toEqual({
      kind: 'invalidState',
      path: 'visitors.list.0.progressMm',
    });
    expect(pathOf(withVisitor({ seen: [...visitor.seen, ...visitor.seen] }))).toEqual({
      kind: 'invalidState',
      path: 'visitors.list.0.seen',
    });
    expect(pathOf(withVisitor({ missingNeeds: ['rest', 'rest'] }))).toEqual({
      kind: 'invalidState',
      path: 'visitors.list.0.missingNeeds',
    });
    expect(pathOf(withVisitor({ goal: { kind: 'service', need: 'fun' } }))).toMatchObject({
      kind: 'invalidState',
    });
    expect(pathOf(withVisitor({ satisfaction: 10_000_001 }))).toEqual({
      kind: 'invalidState',
      path: 'visitors.list.0.satisfaction',
    });
    expect(pathOf(withVisitor({ updatedAtMs: state.clock.timeMs + 1 }))).toEqual({
      kind: 'invalidState',
      path: 'visitors.list',
    });
    expect(pathOf({ ...state, visitors: { ...state.visitors, nextNumber: 2 } })).toEqual({
      kind: 'invalidState',
      path: 'visitors.nextNumber',
    });
    const early = { ...state.visitors, suggestionsHalvedAtMs: state.clock.timeMs + 1 };
    expect(pathOf({ ...state, visitors: early })).toEqual({
      kind: 'invalidState',
      path: 'visitors.suggestionsHalvedAtMs',
    });
    const twins = { ...state.visitors, list: [visitor, visitor] };
    expect(pathOf({ ...state, visitors: twins })).toEqual({
      kind: 'invalidState',
      path: 'visitors.list',
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

describe('migration from version 3', () => {
  const state = playedState();
  const { visitors: _visitors, session: _session, ...stateV3 } = { ...state, version: 3 };

  it('loads a version 3 save, with nobody in the park yet', () => {
    expect(deserialize(forgeSave(stateV3))).toEqual({
      ok: true,
      value: {
        ...state,
        visitors: { ...createVisitorsState(), suggestionsHalvedAtMs: state.clock.timeMs },
        session: createSessionState(),
      },
    });
  });
});

describe('migration from version 2', () => {
  const state = arrivalsState();
  const stateV2 = { ...withoutPark(state), version: 2 };

  it('loads a version 2 save, with nothing built yet', () => {
    expect(deserialize(forgeSave(stateV2))).toEqual({ ok: true, value: state });
  });

  it('reports a version 2 save that cannot be migrated', () => {
    expect(deserialize(forgeSave({ ...stateV2, enclosures: [{ id: 'meadow-1' }] }))).toEqual(
      err({ kind: 'migrationFailed', from: 2, reason: 'unexpectedVersion2Enclosures' }),
    );
  });
});

describe('migration from version 1', () => {
  const state = arrivalsState();
  const { gacha: _gacha, ...stateV1 } = { ...withoutPark(state), version: 1 };

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
  const state = arrivalsState();
  const { shavings: _shavings, ...currenciesV0 } = state.currencies;
  const { gacha: _gacha, ...stateV1 } = withoutPark(state);
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
