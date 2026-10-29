import { describe, expect, it } from 'vitest';
import { applyCommand } from './commands';
import { createEventQueue, drain } from './events';
import { createGameState } from './state';

describe('applyCommand addCoins', () => {
  it('adds the coins and emits coinsAdded', () => {
    const state = createGameState(1);
    const events = createEventQueue();

    expect(applyCommand(state, { type: 'addCoins', amount: 250 }, events)).toEqual({
      ok: true,
      value: undefined,
    });
    expect(applyCommand(state, { type: 'addCoins', amount: 50 }, events).ok).toBe(true);

    expect(state.currencies.coins).toBe(300);
    expect(drain(events)).toEqual([
      { type: 'coinsAdded', amount: 250, total: 250 },
      { type: 'coinsAdded', amount: 50, total: 300 },
    ]);
  });

  it.each([0, -10, 1.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    'refuses the amount %s and changes nothing',
    (amount) => {
      const state = createGameState(1);
      const before = JSON.stringify(state);
      const events = createEventQueue();

      expect(applyCommand(state, { type: 'addCoins', amount }, events)).toEqual({
        ok: false,
        error: 'invalidAmount',
      });
      expect(JSON.stringify(state)).toBe(before);
      expect(drain(events)).toEqual([]);
    },
  );

  it('refuses an addition that would leave the safe integer range', () => {
    const state = createGameState(1);
    state.currencies.coins = Number.MAX_SAFE_INTEGER - 1;
    const events = createEventQueue();

    expect(applyCommand(state, { type: 'addCoins', amount: 2 }, events)).toEqual({
      ok: false,
      error: 'currencyOverflow',
    });
    expect(state.currencies.coins).toBe(Number.MAX_SAFE_INTEGER - 1);
    expect(drain(events)).toEqual([]);

    expect(applyCommand(state, { type: 'addCoins', amount: 1 }, events).ok).toBe(true);
    expect(state.currencies.coins).toBe(Number.MAX_SAFE_INTEGER);
  });
});
