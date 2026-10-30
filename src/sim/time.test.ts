import { describe, expect, it } from 'vitest';
import { createSimContext } from './context';
import { createEventQueue } from './events';
import { sliceGameData } from './gacha/test-support';
import { createGameState, type GameState } from './state';
import { advance, catchUp, MAX_OFFLINE_MS, OFFLINE_STEP_MS, STEP_MS } from './time';

const HOUR_MS = 60 * 60 * 1000;
const CONTEXT = createSimContext(sliceGameData());

function freshState(): GameState {
  return createGameState(42);
}

describe('advance', () => {
  it('gives the same state for 1000 × 16 ms as for 1 × 16 000 ms', () => {
    const small = freshState();
    const large = freshState();
    const events = createEventQueue();

    for (let frame = 0; frame < 1000; frame += 1) {
      advance(small, 16, CONTEXT, events);
    }
    advance(large, 16_000, CONTEXT, events);

    expect(JSON.stringify(small)).toBe(JSON.stringify(large));
    expect(small.clock).toEqual({ timeMs: 16_000, accumulatorMs: 0 });
  });

  it('only moves the clock by whole steps and keeps the remainder', () => {
    const state = freshState();
    const events = createEventQueue();

    advance(state, 99, CONTEXT, events);
    expect(state.clock).toEqual({ timeMs: 0, accumulatorMs: 99 });

    advance(state, 1, CONTEXT, events);
    expect(state.clock).toEqual({ timeMs: STEP_MS, accumulatorMs: 0 });

    advance(state, 250, CONTEXT, events);
    expect(state.clock).toEqual({ timeMs: 3 * STEP_MS, accumulatorMs: 50 });
  });

  it('accepts a zero delta', () => {
    const state = freshState();
    advance(state, 0, CONTEXT, createEventQueue());
    expect(state.clock).toEqual({ timeMs: 0, accumulatorMs: 0 });
  });

  it.each([-1, 16.6, Number.NaN, Number.POSITIVE_INFINITY])('rejects the delta %s', (deltaMs) => {
    const state = freshState();
    expect(() => {
      advance(state, deltaMs, CONTEXT, createEventQueue());
    }).toThrow(RangeError);
    expect(state.clock).toEqual({ timeMs: 0, accumulatorMs: 0 });
  });
});

describe('catchUp', () => {
  it('simulates the whole offline time when below the cap', () => {
    const state = freshState();
    const offlineMs = 3 * HOUR_MS + 5 * OFFLINE_STEP_MS + 1234;

    expect(catchUp(state, offlineMs, CONTEXT, createEventQueue())).toBe(offlineMs);
    expect(state.clock).toEqual({ timeMs: offlineMs - 34, accumulatorMs: 34 });
  });

  it('caps the simulated time at 12 hours', () => {
    const state = freshState();

    expect(catchUp(state, 3 * 24 * HOUR_MS, CONTEXT, createEventQueue())).toBe(MAX_OFFLINE_MS);
    expect(state.clock).toEqual({ timeMs: MAX_OFFLINE_MS, accumulatorMs: 0 });
  });

  it('simulates exactly the cap when offline for exactly 12 hours', () => {
    const state = freshState();
    expect(catchUp(state, MAX_OFFLINE_MS, CONTEXT, createEventQueue())).toBe(MAX_OFFLINE_MS);
    expect(state.clock.timeMs).toBe(MAX_OFFLINE_MS);
  });

  it('reaches the same clock as advance for the same duration', () => {
    const coarse = freshState();
    const fine = freshState();
    const events = createEventQueue();
    advance(coarse, 70, CONTEXT, events);
    advance(fine, 70, CONTEXT, events);

    catchUp(coarse, 2 * HOUR_MS + 555, CONTEXT, events);
    advance(fine, 2 * HOUR_MS + 555, CONTEXT, events);

    expect(coarse.clock).toEqual(fine.clock);
  });

  it('does nothing for zero offline time', () => {
    const state = freshState();
    const events = createEventQueue();
    expect(catchUp(state, 0, CONTEXT, events)).toBe(0);
    expect(state.clock).toEqual({ timeMs: 0, accumulatorMs: 0 });
    expect(events.pending).toEqual([]);
  });

  it('runs every visitor at full rate meanwhile, then gives the focus back', () => {
    const context = createSimContext(sliceGameData());
    const focus = { minColumn: 0, minRow: 0, maxColumn: 1, maxRow: 1 };
    context.focus = focus;
    catchUp(freshState(), OFFLINE_STEP_MS, context, createEventQueue());
    expect(context.focus).toBe(focus);
  });

  it.each([-5, 0.5, Number.NaN])('rejects the offline time %s', (offlineMs) => {
    expect(() => catchUp(freshState(), offlineMs, CONTEXT, createEventQueue())).toThrow(RangeError);
  });
});
