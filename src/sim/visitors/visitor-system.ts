import { SERVICE_NEEDS } from '../../data/schemas/visitors';
import type { FocusArea, SimContext } from '../context';
import { emit, type EventQueue } from '../events';
import { randomInt, weightedPick } from '../rng';
import { earnVisitorCoins } from '../economy/revenue';
import type { GameState } from '../state';
import { arrivalRateMilliPerMinute, MILLI, visitorCapacity } from './attractiveness';
import { syncPathCache } from './path-cache';
import { FINE_PER_BASIS_POINT, makeVisitorId, type VisitorState } from './visitor-state';
import { chooseGoal, MS_PER_MINUTE, updateVisitor, type VisitorWorld } from './walk';

/**
 * Visitors away from the camera's focus are updated once every this many steps, with all the
 * time since their last update, so that they never fall behind (D-018, point 7).
 */
export const FAR_UPDATE_INTERVAL_STEPS = 5;
/** One whole visitor group in `arrivalProgress`. */
const ARRIVAL_UNIT = MILLI * MS_PER_MINUTE;

function isInFocus(visitor: VisitorState, focus: FocusArea | null): boolean {
  return (
    focus === null ||
    (visitor.column >= focus.minColumn &&
      visitor.column <= focus.maxColumn &&
      visitor.row >= focus.minRow &&
      visitor.row <= focus.maxRow)
  );
}

/** Beyond this many halvings, every safe integer count is already 0. */
const MAX_USEFUL_HALVINGS = 53;

/**
 * Old wishes fade: every half-life, each count of the suggestion feed is halved. All the
 * half-lives elapsed are applied at once, so that a long gap never loops.
 */
function fadeSuggestions(state: GameState, halfLifeMs: number, nowMs: number): void {
  const visitors = state.visitors;
  const halvings = Math.floor((nowMs - visitors.suggestionsHalvedAtMs) / halfLifeMs);
  if (halvings <= 0) {
    return;
  }
  const divisor = 2 ** Math.min(halvings, MAX_USEFUL_HALVINGS);
  for (const need of SERVICE_NEEDS) {
    visitors.suggestions[need] = Math.floor(visitors.suggestions[need] / divisor);
  }
  visitors.suggestionsHalvedAtMs += halvings * halfLifeMs;
}

function updateVisitors(
  world: VisitorWorld,
  focus: FocusArea | null,
  stepNumber: number,
  nowMs: number,
): void {
  const list = world.state.visitors.list;
  let kept = 0;
  for (let index = 0; index < list.length; index += 1) {
    const visitor = list[index];
    if (visitor === undefined) {
      continue;
    }
    const isDue =
      isInFocus(visitor, focus) || (stepNumber + index) % FAR_UPDATE_INTERVAL_STEPS === 0;
    if (isDue) {
      const left = updateVisitor(world, visitor, nowMs - visitor.updatedAtMs);
      visitor.updatedAtMs = nowMs;
      if (left) {
        continue;
      }
    }
    list[kept] = visitor;
    kept += 1;
  }
  list.length = kept;
}

function admitVisitor(world: VisitorWorld, nowMs: number): void {
  const { state, data } = world;
  const archetype = weightedPick(
    state.rng,
    [...data.visitorArchetypes.values()].map((value) => ({ value, weight: value.spawnWeight })),
  );
  const groupSize = randomInt(state.rng, archetype.groupSize.min, archetype.groupSize.max);
  const { entrance } = data.terrain;
  const column = randomInt(state.rng, entrance.column, entrance.column + entrance.width - 1);
  const row = entrance.row + entrance.depth - 1;
  // Groups come in with some needs already started, so that they do not all get hungry at once.
  const startMax = Math.floor((data.visitorRules.needs.seekThresholdBp * FINE_PER_BASIS_POINT) / 2);
  const visitor: VisitorState = {
    id: makeVisitorId(state.visitors.nextNumber),
    archetypeId: archetype.id,
    groupSize,
    column,
    row,
    nextColumn: column,
    nextRow: row,
    progressMm: 0,
    activity: 'walking',
    goal: { kind: 'exit' },
    waitMs: 0,
    serviceId: null,
    needs: {
      foodDrink: randomInt(state.rng, 0, startMax),
      rest: randomInt(state.rng, 0, startMax),
      comfort: randomInt(state.rng, 0, startMax),
    },
    wonderBp: 0,
    satisfaction: data.visitorRules.satisfaction.startBp * FINE_PER_BASIS_POINT,
    seen: [],
    visitLeftMs: archetype.visitMinutes * MS_PER_MINUTE,
    missingNeeds: [],
    updatedAtMs: nowMs,
  };
  state.visitors.nextNumber += 1;
  state.visitors.list.push(visitor);
  const entryCoins = state.economy.entryPriceCoins * groupSize;
  const coinsTotal = earnVisitorCoins(state, entryCoins);
  emit(world.events, {
    type: 'visitorArrived',
    visitorId: visitor.id,
    archetypeId: archetype.id,
    groupSize,
    entryCoins,
    coinsTotal,
  });
  chooseGoal(world, visitor);
}

/** Lets in the groups that the attractiveness brings, while the park has room for them. */
function admitVisitors(world: VisitorWorld, stepMs: number, nowMs: number): void {
  const { state, data, cache } = world;
  const visitors = state.visitors;
  const rate = arrivalRateMilliPerMinute(state, data, cache);
  if (rate === 0 || data.visitorArchetypes.size === 0) {
    visitors.arrivalProgress = 0;
    return;
  }
  visitors.arrivalProgress += rate * stepMs;
  const capacity = visitorCapacity(data, cache);
  while (visitors.arrivalProgress >= ARRIVAL_UNIT) {
    if (visitors.list.length >= capacity) {
      // A full park keeps one group waiting at the gate, never a crowd.
      visitors.arrivalProgress = ARRIVAL_UNIT;
      return;
    }
    admitVisitor(world, nowMs);
    visitors.arrivalProgress -= ARRIVAL_UNIT;
  }
}

/** The visitors' system: fades old suggestions, moves every group, then lets new ones in. */
export function visitorSystem(
  state: GameState,
  stepMs: number,
  context: SimContext,
  events: EventQueue,
): void {
  const { data } = context;
  const occupancy = syncPathCache(context.paths, state, data);
  const world: VisitorWorld = { state, data, cache: context.paths, occupancy, events };
  const nowMs = state.clock.timeMs + stepMs;
  fadeSuggestions(state, data.visitorRules.suggestionHalfLifeMinutes * MS_PER_MINUTE, nowMs);
  updateVisitors(world, context.focus, Math.floor(state.clock.timeMs / stepMs), nowMs);
  admitVisitors(world, stepMs, nowMs);
}
