import type { GameData } from '../../data/load';
import { SERVICE_NEEDS, type ServiceNeed, type VisitorRules } from '../../data/schemas/visitors';
import type { GameState } from '../state';
import { toBasisPoints, type VisitorState } from './visitor-state';

/** A text key of the data; the sim only picks it, ui translates it. */
export type ThoughtKey = VisitorRules['thoughts']['contentKey'];

/**
 * The thought bubble of a visitor, from its state: a missing service first (the useful remark),
 * then the need it is walking to meet, then how its visit goes.
 */
export function visitorThoughtKey(visitor: VisitorState, data: GameData): ThoughtKey {
  const rules = data.visitorRules;
  const missing = visitor.missingNeeds.at(-1);
  if (missing !== undefined) {
    return rules.needs[missing].missingThoughtKey;
  }
  const goal = visitor.goal;
  if (goal.kind === 'service') {
    return rules.needs[goal.need].urgentThoughtKey;
  }
  if (visitor.activity === 'viewing') {
    return rules.thoughts.amazedKey;
  }
  if (goal.kind === 'exit') {
    return rules.thoughts.leavingKey;
  }
  return rules.thoughts.contentKey;
}

export interface Suggestion {
  readonly need: ServiceNeed;
  /** Groups that missed this service lately (halved every half-life). */
  readonly count: number;
  readonly textKey: ThoughtKey;
}

/** The suggestion feed: missing services, most requested first. */
export function suggestionFeed(state: GameState, data: GameData): Suggestion[] {
  return SERVICE_NEEDS.map((need) => ({
    need,
    count: state.visitors.suggestions[need],
    textKey: data.visitorRules.needs[need].missingThoughtKey,
  }))
    .filter((suggestion) => suggestion.count > 0)
    .sort((a, b) => b.count - a.count);
}

export interface ZoneSatisfaction {
  /** Zone coordinates: the zone covers cells [zoneColumn × size, (zoneColumn + 1) × size). */
  readonly zoneColumn: number;
  readonly zoneRow: number;
  readonly visitors: number;
  readonly averageBp: number;
}

/** Average satisfaction of the groups in each square zone that has some, row by row. */
export function satisfactionByZone(state: GameState, data: GameData): ZoneSatisfaction[] {
  const size = data.visitorRules.zoneSizeCells;
  const zonesPerRow = Math.ceil(data.terrain.columns / size);
  const totals = new Map<number, { sum: number; count: number }>();
  for (const visitor of state.visitors.list) {
    const key = Math.floor(visitor.row / size) * zonesPerRow + Math.floor(visitor.column / size);
    const total = totals.get(key) ?? { sum: 0, count: 0 };
    total.sum += toBasisPoints(visitor.satisfaction);
    total.count += 1;
    totals.set(key, total);
  }
  return [...totals.entries()]
    .sort(([a], [b]) => a - b)
    .map(([key, { sum, count }]) => ({
      zoneColumn: key % zonesPerRow,
      zoneRow: Math.floor(key / zonesPerRow),
      visitors: count,
      averageBp: Math.floor(sum / count),
    }));
}
