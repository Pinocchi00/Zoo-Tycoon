import type { ServiceNeed } from '../../data/schemas/visitors';
import {
  visitorId,
  type ArchetypeId,
  type BuildingId,
  type EnclosureId,
  type VisitorId,
} from '../../shared/brand';

/** Needs and satisfaction are kept in thousandths of a basis point, so that a 100 ms step moves them. */
export const FINE_PER_BASIS_POINT = 1000;
/** 100 % in fine units. */
export const FINE_TOTAL = 10_000 * FINE_PER_BASIS_POINT;
/** Length of one cell walked by a visitor. */
export const MM_PER_CELL = 1000;

export const VISITOR_ACTIVITIES = ['walking', 'viewing', 'usingService'] as const;
export type VisitorActivity = (typeof VISITOR_ACTIVITIES)[number];

/** Where a visitor is heading. */
export type VisitorGoal =
  | { readonly kind: 'enclosure'; readonly enclosureId: EnclosureId }
  | { readonly kind: 'service'; readonly need: ServiceNeed }
  | { readonly kind: 'exit' };

/** One value per service need. */
export type NeedLevels = Record<ServiceNeed, number>;

/**
 * A visitor group of one archetype, walking from cell to cell on the paths. Unlike the park
 * objects, it is updated in place at every step.
 */
export interface VisitorState {
  readonly id: VisitorId;
  readonly archetypeId: ArchetypeId;
  /** People in the group; they spend together. */
  readonly groupSize: number;
  column: number;
  row: number;
  /** Cell being walked to; the current cell while standing still. */
  nextColumn: number;
  nextRow: number;
  /** Distance walked towards the next cell, from 0 to `MM_PER_CELL` excluded. */
  progressMm: number;
  activity: VisitorActivity;
  goal: VisitorGoal;
  /** Time left looking at an enclosure or using a service. */
  waitMs: number;
  /** Building in use while `activity` is `usingService`. */
  serviceId: BuildingId | null;
  /** Fine units (see `FINE_PER_BASIS_POINT`), 0 to `FINE_TOTAL`. */
  needs: NeedLevels;
  /** Basis points, 0 to 10 000: what the animals gave so far. */
  wonderBp: number;
  /** Smoothed, in fine units. */
  satisfaction: number;
  /** Enclosures looked at during this visit, without duplicates. */
  seen: EnclosureId[];
  visitLeftMs: number;
  /** Needs for which no service could be reached; each one is reported once per visit. */
  missingNeeds: ServiceNeed[];
  /** Game time up to which this visitor has been simulated. */
  updatedAtMs: number;
}

export interface VisitorsState {
  /** In arrival order. */
  list: VisitorState[];
  /** Number of the next visitor id; ids are never reused. */
  nextNumber: number;
  /** Arrivals building up, in thousandths of a visitor times milliseconds per minute. */
  arrivalProgress: number;
  /** Smoothed satisfaction of the groups that left, in basis points; null before the first one. */
  parkSatisfactionBp: number | null;
  /** How many groups missed each kind of service; halved every half-life. */
  suggestions: NeedLevels;
  suggestionsHalvedAtMs: number;
}

export function createVisitorsState(): VisitorsState {
  return {
    list: [],
    nextNumber: 1,
    arrivalProgress: 0,
    parkSatisfactionBp: null,
    suggestions: { foodDrink: 0, rest: 0, comfort: 0 },
    suggestionsHalvedAtMs: 0,
  };
}

export function makeVisitorId(number: number): VisitorId {
  const id = visitorId(`visitor-${String(number)}`);
  if (!id.ok) {
    throw new Error(`makeVisitorId: ${id.error} for ${String(number)}.`);
  }
  return id.value;
}

export function toBasisPoints(fine: number): number {
  return Math.floor(fine / FINE_PER_BASIS_POINT);
}
