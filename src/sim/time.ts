import type { SimContext } from './context';
import type { EventQueue } from './events';
import type { GameState } from './state';
import { visitorSystem } from './visitors/visitor-system';

/** Fixed simulation step: 10 steps per second (AGENTS.md 4.4). */
export const STEP_MS = 100;
/** Coarse step used to catch up offline time without simulating every 100 ms. */
export const OFFLINE_STEP_MS = 60_000;
/** Offline time beyond this is ignored. */
export const MAX_OFFLINE_MS = 12 * 60 * 60 * 1000;

/** A system moves one part of the world forward by `stepMs`. */
export type System = (
  state: GameState,
  stepMs: number,
  context: SimContext,
  events: EventQueue,
) => void;

/** Run in this order at every step. */
const SYSTEMS: readonly System[] = [visitorSystem];

function assertDuration(name: string, durationMs: number): void {
  if (!Number.isSafeInteger(durationMs) || durationMs < 0) {
    throw new RangeError(`${name} must be a non-negative integer, got ${String(durationMs)}.`);
  }
}

function step(state: GameState, stepMs: number, context: SimContext, events: EventQueue): void {
  for (const system of SYSTEMS) {
    system(state, stepMs, context, events);
  }
  state.clock.timeMs += stepMs;
}

/**
 * Feeds real elapsed time to the simulation, which runs as many fixed steps as fit
 * and keeps the remainder for the next call. Splitting a duration differently never
 * changes the result. The context carries the data and the camera's focus, an input like the
 * commands: the same state, inputs and durations always give the same result.
 */
export function advance(
  state: GameState,
  deltaMs: number,
  context: SimContext,
  events: EventQueue,
): void {
  assertDuration('deltaMs', deltaMs);
  const clock = state.clock;
  clock.accumulatorMs += deltaMs;
  while (clock.accumulatorMs >= STEP_MS) {
    clock.accumulatorMs -= STEP_MS;
    step(state, STEP_MS, context, events);
  }
}

/**
 * Simulates time spent away from the game with one-minute steps, capped at 12 hours.
 * The last partial minute goes through `advance` so that no time is lost.
 * Nobody looks at the park meanwhile, so every visitor runs at full rate (no focus).
 * Returns the duration actually simulated.
 */
export function catchUp(
  state: GameState,
  offlineMs: number,
  context: SimContext,
  events: EventQueue,
): number {
  assertDuration('offlineMs', offlineMs);
  const simulatedMs = Math.min(offlineMs, MAX_OFFLINE_MS);
  const coarseSteps = Math.floor(simulatedMs / OFFLINE_STEP_MS);
  const focus = context.focus;
  context.focus = null;
  try {
    for (let index = 0; index < coarseSteps; index += 1) {
      step(state, OFFLINE_STEP_MS, context, events);
    }
    advance(state, simulatedMs - coarseSteps * OFFLINE_STEP_MS, context, events);
  } finally {
    context.focus = focus;
  }
  return simulatedMs;
}
