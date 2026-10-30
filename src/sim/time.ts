import type { SimContext } from './context';
import { emit, type EventQueue } from './events';
import { economySystem } from './economy/economy-system';
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
const SYSTEMS: readonly System[] = [visitorSystem, economySystem];

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

interface OfflineSnapshot {
  readonly visitorGroups: number;
  readonly visitorCoins: number;
  readonly upkeepCoins: number;
  readonly parkLevel: number;
}

function offlineSnapshot(state: GameState): OfflineSnapshot {
  return {
    visitorGroups: state.visitors.nextNumber,
    visitorCoins: state.economy.totals.visitorCoins,
    upkeepCoins: state.economy.totals.upkeepCoins,
    parkLevel: state.economy.parkLevel,
  };
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
 * Simulates time spent away from the game with one-minute steps, capped at 12 hours: beyond that,
 * the park simply rests (D-018, point 6). The last partial minute goes through `advance` so that
 * no time is lost. Nobody looks at the park meanwhile, so every visitor runs at full rate (no
 * focus). Emits `offlineReport` for the park's journal (nothing when no time passed) and returns
 * the duration simulated.
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
  const before = offlineSnapshot(state);
  context.focus = null;
  try {
    for (let index = 0; index < coarseSteps; index += 1) {
      step(state, OFFLINE_STEP_MS, context, events);
    }
    advance(state, simulatedMs - coarseSteps * OFFLINE_STEP_MS, context, events);
  } finally {
    context.focus = focus;
  }
  if (simulatedMs === 0) {
    return 0;
  }
  const after = offlineSnapshot(state);
  emit(events, {
    type: 'offlineReport',
    awayMs: offlineMs,
    simulatedMs,
    visitorGroups: after.visitorGroups - before.visitorGroups,
    visitorCoins: after.visitorCoins - before.visitorCoins,
    upkeepCoins: after.upkeepCoins - before.upkeepCoins,
    levelsGained: after.parkLevel - before.parkLevel,
  });
  return simulatedMs;
}
