import type { GameData } from '../../data/load';
import { BASIS_POINTS_TOTAL } from '../../data/schemas/common';
import type { VisitorArchetype } from '../../data/schemas/park';
import { SERVICE_NEEDS, type ServiceNeed, type VisitorRules } from '../../data/schemas/visitors';
import type { EnclosureId } from '../../shared/brand';
import { emit, type EventQueue } from '../events';
import { CELL_FREE, isWalkable, type Occupancy } from '../park/occupancy';
import { weightedPick, type WeightedEntry } from '../rng';
import type { GameState } from '../state';
import { enclosureAttractivenessMilli } from './attractiveness';
import {
  distanceAt,
  enclosureField,
  exitField,
  needField,
  serviceAt,
  stepTowards,
  UNREACHABLE,
  type PathCache,
} from './path-cache';
import {
  FINE_PER_BASIS_POINT,
  FINE_TOTAL,
  MM_PER_CELL,
  toBasisPoints,
  type VisitorGoal,
  type VisitorState,
} from './visitor-state';

export const MS_PER_SECOND = 1000;
export const MS_PER_MINUTE = 60_000;
/** Safety net against a loop that would never spend its time; far above a one-minute step. */
const MAX_ACTIONS_PER_UPDATE = 10_000;

/** What updating a visitor needs, gathered once per step. */
export interface VisitorWorld {
  readonly state: GameState;
  readonly data: GameData;
  readonly cache: PathCache;
  readonly occupancy: Occupancy;
  readonly events: EventQueue;
}

function cellOf(world: VisitorWorld, column: number, row: number): number {
  return row * world.occupancy.columns + column;
}

function isWalkableCell(world: VisitorWorld, cell: number): boolean {
  return isWalkable(world.occupancy.cells[cell] ?? CELL_FREE);
}

function archetypeOf(world: VisitorWorld, visitor: VisitorState): VisitorArchetype | undefined {
  return world.data.visitorArchetypes.get(visitor.archetypeId);
}

function wantedMultiplierBp(
  archetype: VisitorArchetype,
  need: ServiceNeed | 'wonder',
  rules: VisitorRules,
): number {
  return archetype.wants.includes(need) ? rules.needs.wantedRiseBp : BASIS_POINTS_TOTAL;
}

function riseNeeds(
  visitor: VisitorState,
  archetype: VisitorArchetype,
  rules: VisitorRules,
  elapsedMs: number,
): void {
  for (const need of SERVICE_NEEDS) {
    const multiplier = wantedMultiplierBp(archetype, need, rules);
    const rise = Math.floor(
      (rules.needs[need].risePerMinuteBp * multiplier * elapsedMs * FINE_PER_BASIS_POINT) /
        (MS_PER_MINUTE * BASIS_POINTS_TOTAL),
    );
    visitor.needs[need] = Math.min(FINE_TOTAL, visitor.needs[need] + rise);
  }
}

/** Where the satisfaction is heading: wonder lifts it, urgent needs left unmet pull it down. */
export function targetSatisfaction(visitor: VisitorState, rules: VisitorRules): number {
  const { baseBp, wonderWeightBp, unmetPenaltyBp } = rules.satisfaction;
  const threshold = rules.needs.seekThresholdBp * FINE_PER_BASIS_POINT;
  let target =
    (baseBp + Math.floor((visitor.wonderBp * wonderWeightBp) / BASIS_POINTS_TOTAL)) *
    FINE_PER_BASIS_POINT;
  for (const need of SERVICE_NEEDS) {
    const excess = visitor.needs[need] - threshold;
    if (excess > 0) {
      target -= Math.floor((excess * unmetPenaltyBp) / BASIS_POINTS_TOTAL);
    }
  }
  return Math.min(FINE_TOTAL, Math.max(0, target));
}

/**
 * Smoothing towards the target. A long step moves less than many short ones over the same time
 * (half the gap in one minute instead of about 63 %), which keeps offline visits of the same order.
 */
function smoothSatisfaction(visitor: VisitorState, rules: VisitorRules, elapsedMs: number): void {
  const smoothingMs = rules.satisfaction.smoothingSeconds * MS_PER_SECOND;
  const gap = targetSatisfaction(visitor, rules) - visitor.satisfaction;
  visitor.satisfaction += Math.trunc((gap * elapsedMs) / (elapsedMs + smoothingMs));
}

/** A drop in satisfaction only trims spending a little, it never punishes (GDD). */
export function spendingRateBp(satisfactionBp: number, rules: VisitorRules): number {
  const floor = rules.satisfaction.spendFloorBp;
  return floor + Math.floor(((BASIS_POINTS_TOTAL - floor) * satisfactionBp) / BASIS_POINTS_TOTAL);
}

function reportMissing(world: VisitorWorld, visitor: VisitorState, need: ServiceNeed): void {
  if (visitor.missingNeeds.includes(need)) {
    return;
  }
  visitor.missingNeeds.push(need);
  world.state.visitors.suggestions[need] += 1;
  emit(world.events, { type: 'serviceMissed', visitorId: visitor.id, need });
}

/**
 * The most pressing need above the threshold that a service can meet from here. Needs without a
 * reachable service are reported to the suggestion feed instead.
 */
function reachableUrgentNeed(world: VisitorWorld, visitor: VisitorState): ServiceNeed | null {
  const threshold = world.data.visitorRules.needs.seekThresholdBp * FINE_PER_BASIS_POINT;
  const urgent = SERVICE_NEEDS.filter((need) => visitor.needs[need] >= threshold);
  if (urgent.length === 0) {
    return null;
  }
  urgent.sort((a, b) => visitor.needs[b] - visitor.needs[a]);
  const cell = cellOf(world, visitor.column, visitor.row);
  for (const need of urgent) {
    const field = needField(world.cache, world.state, world.data, need);
    if (distanceAt(field, cell) !== UNREACHABLE) {
      return need;
    }
    reportMissing(world, visitor, need);
  }
  return null;
}

function hasUrgentNeed(world: VisitorWorld, visitor: VisitorState): boolean {
  const threshold = world.data.visitorRules.needs.seekThresholdBp * FINE_PER_BASIS_POINT;
  return SERVICE_NEEDS.some((need) => visitor.needs[need] >= threshold);
}

/**
 * The next enclosure to look at, drawn by attractiveness among those reachable from here: unseen
 * ones first, then any but the one just left, so that a long visit keeps strolling.
 */
function pickEnclosure(
  world: VisitorWorld,
  visitor: VisitorState,
  previous: EnclosureId | null,
): EnclosureId | null {
  const { state, data, cache } = world;
  const cell = cellOf(world, visitor.column, visitor.row);
  const unseen: WeightedEntry<EnclosureId>[] = [];
  const seen: WeightedEntry<EnclosureId>[] = [];
  for (const enclosure of state.enclosures) {
    if (enclosure.speciesId === null) {
      continue;
    }
    const field = enclosureField(cache, state, data, enclosure.id);
    const weight = enclosureAttractivenessMilli(enclosure, state, data);
    if (distanceAt(field, cell) === UNREACHABLE || weight === 0) {
      continue;
    }
    const entry = { value: enclosure.id, weight };
    (visitor.seen.includes(enclosure.id) ? seen : unseen).push(entry);
  }
  if (unseen.length > 0) {
    return weightedPick(state.rng, unseen);
  }
  const others = seen.length > 1 ? seen.filter((entry) => entry.value !== previous) : seen;
  return others.length === 0 ? null : weightedPick(state.rng, others);
}

/** Decides what to do next once the current goal is done or out of reach. */
export function chooseGoal(world: VisitorWorld, visitor: VisitorState): void {
  const previous = visitor.goal.kind === 'enclosure' ? visitor.goal.enclosureId : null;
  visitor.activity = 'walking';
  visitor.serviceId = null;
  visitor.waitMs = 0;
  if (visitor.visitLeftMs === 0) {
    visitor.goal = { kind: 'exit' };
    return;
  }
  const need = reachableUrgentNeed(world, visitor);
  if (need !== null) {
    visitor.goal = { kind: 'service', need };
    return;
  }
  const enclosureId = pickEnclosure(world, visitor, previous);
  visitor.goal = enclosureId === null ? { kind: 'exit' } : { kind: 'enclosure', enclosureId };
}

/** On each new cell: time to go home, or a need that cannot wait for the next enclosure. */
function reconsiderGoal(world: VisitorWorld, visitor: VisitorState): void {
  if (visitor.goal.kind === 'exit') {
    return;
  }
  if (visitor.visitLeftMs === 0) {
    visitor.goal = { kind: 'exit' };
    return;
  }
  if (visitor.goal.kind === 'enclosure' && hasUrgentNeed(world, visitor)) {
    const need = reachableUrgentNeed(world, visitor);
    if (need !== null) {
      visitor.goal = { kind: 'service', need };
    }
  }
}

function goalField(world: VisitorWorld, goal: VisitorGoal): Int32Array {
  switch (goal.kind) {
    case 'exit':
      return exitField(world.cache);
    case 'service':
      return needField(world.cache, world.state, world.data, goal.need);
    case 'enclosure':
      return enclosureField(world.cache, world.state, world.data, goal.enclosureId);
  }
}

/** Removes nothing itself: the caller drops the visitor from the list. Always returns true. */
function leave(world: VisitorWorld, visitor: VisitorState, lost: boolean): true {
  const visitors = world.state.visitors;
  const satisfactionBp = toBasisPoints(visitor.satisfaction);
  const previous = visitors.parkSatisfactionBp;
  const weight = world.data.visitorRules.satisfaction.departureSmoothingVisitors;
  visitors.parkSatisfactionBp =
    previous === null
      ? satisfactionBp
      : previous + Math.trunc((satisfactionBp - previous) / weight);
  emit(world.events, { type: 'visitorLeft', visitorId: visitor.id, satisfactionBp, lost });
  return true;
}

function startViewing(world: VisitorWorld, visitor: VisitorState, enclosureId: EnclosureId): void {
  const enclosure = world.state.enclosures.find((candidate) => candidate.id === enclosureId);
  const archetype = archetypeOf(world, visitor);
  if (enclosure === undefined || enclosure.speciesId === null || archetype === undefined) {
    chooseGoal(world, visitor);
    return;
  }
  const rules = world.data.visitorRules;
  const viewing = rules.viewing;
  visitor.activity = 'viewing';
  visitor.waitMs =
    (viewing.baseSeconds + viewing.secondsPerViewPoint * enclosure.viewScore) * MS_PER_SECOND;
  const gain = viewing.wonderPerViewBp + viewing.wonderPerViewPointBp * enclosure.viewScore;
  const boosted = Math.floor(
    (gain * wantedMultiplierBp(archetype, 'wonder', rules)) / BASIS_POINTS_TOTAL,
  );
  visitor.wonderBp = Math.min(BASIS_POINTS_TOTAL, visitor.wonderBp + boosted);
  if (!visitor.seen.includes(enclosureId)) {
    visitor.seen.push(enclosureId);
  }
}

function startService(world: VisitorWorld, visitor: VisitorState, need: ServiceNeed): void {
  const { state, data } = world;
  const cell = cellOf(world, visitor.column, visitor.row);
  const buildingId = serviceAt(world.cache, state, data, need, cell);
  const building = state.buildings.find((candidate) => candidate.id === buildingId);
  const kind = building === undefined ? undefined : data.buildings.get(building.itemId);
  if (building === undefined || kind === undefined) {
    chooseGoal(world, visitor);
    return;
  }
  visitor.activity = 'usingService';
  visitor.serviceId = building.id;
  visitor.waitMs = kind.visitorUse.seconds * MS_PER_SECOND;
  visitor.needs[need] = 0;
  const price = kind.visitorUse.priceCoins * visitor.groupSize;
  const rateBp = spendingRateBp(toBasisPoints(visitor.satisfaction), data.visitorRules);
  const coinsSpent = Math.floor((price * rateBp) / BASIS_POINTS_TOTAL);
  const total = Math.min(Number.MAX_SAFE_INTEGER, state.currencies.coins + coinsSpent);
  state.currencies.coins = total;
  emit(world.events, {
    type: 'visitorUsedService',
    visitorId: visitor.id,
    buildingId: building.id,
    coinsSpent,
    total,
  });
}

/** The visitor stands on a cell of its goal. Returns true when it left the park. */
function arrive(world: VisitorWorld, visitor: VisitorState): boolean {
  const goal = visitor.goal;
  switch (goal.kind) {
    case 'exit':
      return leave(world, visitor, false);
    case 'enclosure':
      startViewing(world, visitor, goal.enclosureId);
      return false;
    case 'service':
      startService(world, visitor, goal.need);
      return false;
  }
}

function isMoving(visitor: VisitorState): boolean {
  return visitor.nextColumn !== visitor.column || visitor.nextRow !== visitor.row;
}

function stopMoving(visitor: VisitorState): void {
  visitor.nextColumn = visitor.column;
  visitor.nextRow = visitor.row;
  visitor.progressMm = 0;
}

/** Walks towards the next cell with the time available; returns the time left over. */
function walkToNextCell(
  world: VisitorWorld,
  visitor: VisitorState,
  speedMmPerSecond: number,
  budgetMs: number,
): number {
  if (!isWalkableCell(world, cellOf(world, visitor.nextColumn, visitor.nextRow))) {
    // The path ahead was taken up: turn back to the middle of the current cell.
    stopMoving(visitor);
    return budgetMs;
  }
  const remainingMm = MM_PER_CELL - visitor.progressMm;
  const neededMs = Math.ceil((remainingMm * MS_PER_SECOND) / speedMmPerSecond);
  if (budgetMs < neededMs) {
    visitor.progressMm += Math.floor((budgetMs * speedMmPerSecond) / MS_PER_SECOND);
    return 0;
  }
  visitor.column = visitor.nextColumn;
  visitor.row = visitor.nextRow;
  visitor.progressMm = 0;
  reconsiderGoal(world, visitor);
  return budgetMs - neededMs;
}

/**
 * Spends `budgetMs` on walking, looking and services, in that order of events, so that one long
 * step (offline catch-up) and many short ones lead to the same kind of visit.
 * Returns true when the visitor left the park.
 */
function spendTime(
  world: VisitorWorld,
  visitor: VisitorState,
  archetype: VisitorArchetype,
  budgetMs: number,
): boolean {
  let budget = budgetMs;
  for (let action = 0; budget > 0 && action < MAX_ACTIONS_PER_UPDATE; action += 1) {
    if (visitor.activity !== 'walking') {
      const used = Math.min(budget, visitor.waitMs);
      visitor.waitMs -= used;
      budget -= used;
      if (visitor.waitMs === 0) {
        chooseGoal(world, visitor);
      }
      continue;
    }
    if (isMoving(visitor)) {
      budget = walkToNextCell(world, visitor, archetype.walkSpeedMmPerSecond, budget);
      continue;
    }
    const cell = cellOf(world, visitor.column, visitor.row);
    const field = goalField(world, visitor.goal);
    const distance = distanceAt(field, cell);
    if (distance === UNREACHABLE) {
      if (visitor.goal.kind === 'exit') {
        return leave(world, visitor, true);
      }
      chooseGoal(world, visitor);
    } else if (distance === 0) {
      if (arrive(world, visitor)) {
        return true;
      }
    } else {
      const next = stepTowards(field, cell, world.occupancy.columns);
      visitor.nextColumn = next % world.occupancy.columns;
      visitor.nextRow = (next - visitor.nextColumn) / world.occupancy.columns;
    }
  }
  return false;
}

/** Moves one visitor forward by `elapsedMs`. Returns true when it left the park. */
export function updateVisitor(
  world: VisitorWorld,
  visitor: VisitorState,
  elapsedMs: number,
): boolean {
  const archetype = archetypeOf(world, visitor);
  const { columns, rows } = world.occupancy;
  // A save may hold coordinates beyond this land: they would wrap onto another row.
  const isOnLand =
    Math.max(visitor.column, visitor.nextColumn) < columns &&
    Math.max(visitor.row, visitor.nextRow) < rows;
  const cell = cellOf(world, visitor.column, visitor.row);
  if (archetype === undefined || !isOnLand || !isWalkableCell(world, cell)) {
    // Its walkway is gone (or its kind left the data): it slips away rather than stand on grass.
    return leave(world, visitor, true);
  }
  const rules = world.data.visitorRules;
  riseNeeds(visitor, archetype, rules, elapsedMs);
  smoothSatisfaction(visitor, rules, elapsedMs);
  visitor.visitLeftMs = Math.max(0, visitor.visitLeftMs - elapsedMs);
  return spendTime(world, visitor, archetype, elapsedMs);
}
