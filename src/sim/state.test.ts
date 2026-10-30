import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createGameState, fromSavedState, STATE_VERSION, toSavedState } from './state';

describe('createGameState', () => {
  it('starts an empty park at time zero with the seeded generator', () => {
    expect(createGameState(42)).toEqual({
      version: STATE_VERSION,
      clock: { timeMs: 0, accumulatorMs: 0 },
      rng: createRng(42),
      currencies: { coins: 0, arrivalTickets: 0, careMedals: 0, decorTickets: 0, shavings: 0 },
      enclosures: [],
      animals: [],
      gacha: {
        arrivalsSince: { rare: 0, veryRare: 0, iconic: 0 },
        welcome: { arrivalsDone: 0, pendingChoice: null },
        collection: [],
        history: [],
      },
      paths: [],
      buildings: [],
      nextIds: { enclosure: 1, building: 1 },
      visitors: {
        list: [],
        nextNumber: 1,
        arrivalProgress: 0,
        parkSatisfactionBp: null,
        suggestions: { foodDrink: 0, rest: 0, comfort: 0 },
        suggestionsHalvedAtMs: 0,
      },
      economy: {
        entryPriceCoins: 0,
        parkStars: 0,
        parkLevel: 1,
        lastMailDay: null,
        counterDay: null,
        counterBought: 0,
        upkeepOwed: 0,
        periodRevenue: 0,
        settledAtMs: 0,
        totals: { visitorCoins: 0, upkeepCoins: 0 },
      },
      session: { buildHistory: { undo: [], redo: [] } },
    });
  });

  it('saves everything but the session, and a loaded game starts a fresh one', () => {
    const state = createGameState(3);
    state.session.buildHistory.redo.push({
      enclosures: [],
      buildings: [],
      paths: [],
      coinsDelta: 5,
    });
    const saved = toSavedState(state);
    expect(saved).not.toHaveProperty('session');
    expect(fromSavedState(saved)).toEqual(createGameState(3));
  });

  it('survives a JSON round trip unchanged', () => {
    const state = createGameState(7);
    expect(JSON.parse(JSON.stringify(state))).toEqual(state);
  });

  it('never shares objects between two games', () => {
    const first = createGameState(1);
    const second = createGameState(1);
    first.currencies.coins = 10;
    first.rng[0] = 0;
    expect(second.currencies.coins).toBe(0);
    expect(second.rng).toEqual(createRng(1));
    expect(second.enclosures).not.toBe(first.enclosures);
    expect(second.animals).not.toBe(first.animals);
    expect(second.gacha.arrivalsSince).not.toBe(first.gacha.arrivalsSince);
    expect(second.gacha.history).not.toBe(first.gacha.history);
    expect(second.paths).not.toBe(first.paths);
    expect(second.buildings).not.toBe(first.buildings);
    expect(second.nextIds).not.toBe(first.nextIds);
    expect(second.session.buildHistory).not.toBe(first.session.buildHistory);
  });

  it('rejects an invalid seed', () => {
    expect(() => createGameState(-1)).toThrow(RangeError);
  });
});
