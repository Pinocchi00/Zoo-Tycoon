import { describe, expect, it } from 'vitest';
import { createRng } from './rng';
import { createGameState, STATE_VERSION } from './state';

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
    });
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
  });

  it('rejects an invalid seed', () => {
    expect(() => createGameState(-1)).toThrow(RangeError);
  });
});
