import { describe, expect, it } from 'vitest';
import { applyCommand, type Command } from './commands';
import { createSimContext } from './context';
import { createEventQueue, drain, type GameEvent } from './events';
import { randomInt } from './rng';
import { sliceGameData, testBannerId } from './gacha/test-support';
import { createGameState } from './state';
import { advance, catchUp } from './time';

const GAME_DATA = sliceGameData();
const CONTEXT = createSimContext(GAME_DATA);
const ARRIVAL: Command = {
  type: 'performArrival',
  bannerId: testBannerId('refuge'),
  mode: 'single',
};
const DAY_MS = 24 * 60 * 60 * 1000;
const SIMULATED_DAYS = 30;
/** Irregular frame durations, like a real screen that sometimes stutters. */
const FRAME_PATTERN_MS = [16, 17, 16, 33, 16, 250, 16, 1000, 7];
const FRAMES_PER_SESSION = 500;
/** Time spent away from the game between two play sessions. */
const OFFLINE_PATTERN_MS = [3 * 60 * 60 * 1000, 37 * 60 * 1000 + 123, 15 * 60 * 60 * 1000];

interface PlayedGame {
  readonly json: string;
  readonly events: readonly GameEvent[];
}

/** A scripted month of play: sessions of frames with commands, separated by offline gaps. */
function playMonth(seed: number): PlayedGame {
  const state = createGameState(seed);
  const queue = createEventQueue();
  const events: GameEvent[] = [];
  let session = 0;
  while (state.clock.timeMs < SIMULATED_DAYS * DAY_MS) {
    for (let frame = 0; frame < FRAMES_PER_SESSION; frame += 1) {
      advance(state, FRAME_PATTERN_MS[frame % FRAME_PATTERN_MS.length] ?? 0, CONTEXT, queue);
      if (frame % 100 === 0) {
        // The amount comes from the game's own generator, so its state is exercised too.
        applyCommand(
          state,
          { type: 'addCoins', amount: randomInt(state.rng, 1, 500) },
          GAME_DATA,
          queue,
        );
        state.currencies.arrivalTickets += 1;
        applyCommand(state, ARRIVAL, GAME_DATA, queue);
      }
      events.push(...drain(queue));
    }
    catchUp(state, OFFLINE_PATTERN_MS[session % OFFLINE_PATTERN_MS.length] ?? 0, CONTEXT, queue);
    events.push(...drain(queue));
    session += 1;
  }
  return { json: JSON.stringify(state), events };
}

describe('determinism', () => {
  it('gives byte-identical games after 30 simulated days with the same seed and commands', () => {
    const first = playMonth(42);
    const second = playMonth(42);

    expect(first.json).toBe(second.json);
    expect(first.events).toEqual(second.events);
    expect(first.events.length).toBeGreaterThan(0);
  });

  it('gives a different game with another seed', () => {
    expect(playMonth(42).json).not.toBe(playMonth(43).json);
  });
});
