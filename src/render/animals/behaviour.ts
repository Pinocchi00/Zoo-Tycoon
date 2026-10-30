import { randomInt, weightedPick, type RngState } from '@/sim';
import type { AnimalAnimation } from './animal-model';

/** What an animal is doing. Walking ones end on arrival, the others when their time is up. */
export type Activity =
  | 'hesitate'
  | 'sniff'
  | 'walk'
  | 'rest'
  | 'eat'
  | 'sleep'
  | 'signature'
  | 'enrichmentWalk'
  | 'waterWalk';

/** Where a walking activity goes; the herd turns this into a point of the enclosure. */
export type DestinationKind = 'free' | 'enrichment' | 'water';

/** A group that has just arrived hesitates, sniffs the air, then explores a little. */
export type ArrivalStage = 'hesitate' | 'sniff' | 'explore' | 'done';

/** What the habitat offers to this group, kept up to date by the herd. */
export interface BehaviourContext {
  /** Habitat stars, 1 to 5. */
  stars: number;
  /** How many enrichment points the enclosure has. */
  enrichmentSpots: number;
  /** The signature is swimming and the species has water: it is played at the water. */
  signatureAtWater: boolean;
}

/** State of one animal's behaviour. Mutated in place, never replaced. */
export interface AnimalBehaviour {
  activity: Activity;
  animation: AnimalAnimation;
  /** Time left of a timed activity. */
  remainingMs: number;
  /** Time spent on the current walk. */
  travelledMs: number;
  /** Set when a walk begins: the herd must give it a target, or call `failTravel`. */
  needsDestination: boolean;
  destination: DestinationKind;
  enrichmentSpot: number;
  /** Arrival exploration walks stay close to where the animal stands. */
  shortTrip: boolean;
  stage: ArrivalStage;
  exploreWalksLeft: number;
  lastDurationMs: number;
}

/** Fewest stars from which enrichment is used (star 1 is the arrival kit only). */
export const ENRICHMENT_MIN_STARS = 2;
/** A walk that has not arrived after this long is given up. */
export const MAX_TRAVEL_MS = 30_000;

const WALK_WEIGHT = 30;
const REST_WEIGHT = 25;
const EAT_WEIGHT = 20;
const SLEEP_WEIGHT = 10;
const SIGNATURE_WEIGHT = 10;
/** Per star above the first: the richer the habitat, the more the animals use it. */
const ENRICHMENT_WEIGHT_PER_STAR = 8;
/** Using an enrichment element: eating is more common than the signature. */
const USE_EAT_WEIGHT = 2;
const USE_SIGNATURE_WEIGHT = 1;

/** Durations are drawn in steps of this size, in [min, max]. */
const DURATION_STEP_MS = 100;
interface DurationRange {
  readonly minMs: number;
  readonly maxMs: number;
}
const HESITATE_MS: DurationRange = { minMs: 1500, maxMs: 5000 };
const SNIFF_MS: DurationRange = { minMs: 1500, maxMs: 3500 };
/** Animals that were already there start at different moments, never in step. */
const SETTLE_MS: DurationRange = { minMs: 500, maxMs: 6000 };
const REST_MS: DurationRange = { minMs: 3000, maxMs: 9000 };
const EAT_MS: DurationRange = { minMs: 4000, maxMs: 10_000 };
const SLEEP_MS: DurationRange = { minMs: 15_000, maxMs: 40_000 };
const SIGNATURE_MS: DurationRange = { minMs: 4000, maxMs: 9000 };
const EXPLORE_WALKS_MIN = 2;
const EXPLORE_WALKS_MAX = 3;
/** Draws that land on the previous duration are redrawn this many times. */
const DURATION_REDRAWS = 3;

type Routine = 'walk' | 'rest' | 'eat' | 'sleep' | 'signature' | 'enrichment';
type EnrichmentUse = 'eat' | 'signature';
interface Entry<T> {
  readonly value: T;
  weight: number;
}

// Weights are rewritten for each choice and the entries reused, so choosing allocates nothing.
const walkEntry: Entry<Routine> = { value: 'walk', weight: 0 };
const restEntry: Entry<Routine> = { value: 'rest', weight: 0 };
const eatEntry: Entry<Routine> = { value: 'eat', weight: 0 };
const sleepEntry: Entry<Routine> = { value: 'sleep', weight: 0 };
const signatureEntry: Entry<Routine> = { value: 'signature', weight: 0 };
const enrichmentEntry: Entry<Routine> = { value: 'enrichment', weight: 0 };
const ROUTINE_ENTRIES: readonly Entry<Routine>[] = [
  walkEntry,
  restEntry,
  eatEntry,
  sleepEntry,
  signatureEntry,
  enrichmentEntry,
];
const useEatEntry: Entry<EnrichmentUse> = { value: 'eat', weight: 0 };
const useSignatureEntry: Entry<EnrichmentUse> = { value: 'signature', weight: 0 };
const USE_ENTRIES: readonly Entry<EnrichmentUse>[] = [useEatEntry, useSignatureEntry];

export function animationOf(activity: Activity): AnimalAnimation {
  switch (activity) {
    case 'hesitate':
    case 'rest':
      return 'idle';
    case 'walk':
    case 'enrichmentWalk':
    case 'waterWalk':
      return 'walk';
    case 'sniff':
    case 'eat':
      return 'eat';
    case 'sleep':
      return 'sleep';
    case 'signature':
      return 'signature';
  }
}

/** Walking activities move the animal; the others keep it where it stands. */
export function isTravelling(activity: Activity): boolean {
  return activity === 'walk' || activity === 'enrichmentWalk' || activity === 'waterWalk';
}

export function hasEnrichment(context: BehaviourContext): boolean {
  return context.stars >= ENRICHMENT_MIN_STARS && context.enrichmentSpots > 0;
}

function toSteps(ms: number): number {
  return Math.round(ms / DURATION_STEP_MS);
}

function rollDuration(behaviour: AnimalBehaviour, rng: RngState, range: DurationRange): number {
  let duration = 0;
  for (let attempt = 0; attempt <= DURATION_REDRAWS; attempt += 1) {
    duration = randomInt(rng, toSteps(range.minMs), toSteps(range.maxMs)) * DURATION_STEP_MS;
    if (duration !== behaviour.lastDurationMs) {
      break;
    }
  }
  behaviour.lastDurationMs = duration;
  return duration;
}

function startTimed(
  behaviour: AnimalBehaviour,
  rng: RngState,
  activity: Activity,
  range: DurationRange,
): void {
  behaviour.activity = activity;
  behaviour.animation = animationOf(activity);
  behaviour.remainingMs = rollDuration(behaviour, rng, range);
  behaviour.needsDestination = false;
}

function startTravel(
  behaviour: AnimalBehaviour,
  activity: Activity,
  destination: DestinationKind,
  shortTrip: boolean,
): void {
  behaviour.activity = activity;
  behaviour.animation = animationOf(activity);
  behaviour.destination = destination;
  behaviour.shortTrip = shortTrip;
  behaviour.travelledMs = 0;
  behaviour.needsDestination = true;
}

function startRest(behaviour: AnimalBehaviour, rng: RngState): void {
  startTimed(behaviour, rng, 'rest', REST_MS);
}

function startSignature(behaviour: AnimalBehaviour, rng: RngState): void {
  startTimed(behaviour, rng, 'signature', SIGNATURE_MS);
}

function chooseRoutine(behaviour: AnimalBehaviour, rng: RngState, context: BehaviourContext): void {
  walkEntry.weight = WALK_WEIGHT;
  restEntry.weight = REST_WEIGHT;
  eatEntry.weight = EAT_WEIGHT;
  // Never twice in a row: a sleeper wakes up and does something else first.
  sleepEntry.weight = behaviour.activity === 'sleep' ? 0 : SLEEP_WEIGHT;
  signatureEntry.weight = SIGNATURE_WEIGHT;
  enrichmentEntry.weight = hasEnrichment(context)
    ? ENRICHMENT_WEIGHT_PER_STAR * (context.stars - 1)
    : 0;
  switch (weightedPick(rng, ROUTINE_ENTRIES)) {
    case 'walk':
      startTravel(behaviour, 'walk', 'free', false);
      return;
    case 'rest':
      startRest(behaviour, rng);
      return;
    case 'eat':
      startTimed(behaviour, rng, 'eat', EAT_MS);
      return;
    case 'sleep':
      startTimed(behaviour, rng, 'sleep', SLEEP_MS);
      return;
    case 'signature':
      if (context.signatureAtWater) {
        startTravel(behaviour, 'waterWalk', 'water', false);
      } else {
        startSignature(behaviour, rng);
      }
      return;
    case 'enrichment':
      behaviour.enrichmentSpot = randomInt(rng, 0, context.enrichmentSpots - 1);
      startTravel(behaviour, 'enrichmentWalk', 'enrichment', false);
      return;
  }
}

function useEnrichment(behaviour: AnimalBehaviour, rng: RngState, context: BehaviourContext): void {
  useEatEntry.weight = USE_EAT_WEIGHT;
  // A swimmer has no use for a toy on dry land: it only eats there.
  useSignatureEntry.weight = context.signatureAtWater ? 0 : USE_SIGNATURE_WEIGHT;
  if (weightedPick(rng, USE_ENTRIES) === 'eat') {
    startTimed(behaviour, rng, 'eat', EAT_MS);
  } else {
    startSignature(behaviour, rng);
  }
}

/**
 * A new animal. With `withArrival` it begins by hesitating; otherwise it rests a little first,
 * then joins the routine. The first routine is chosen then, not now, because what the habitat
 * offers (water for a swimmer) is only known once the model has loaded.
 */
export function createBehaviour(rng: RngState, withArrival: boolean): AnimalBehaviour {
  const behaviour: AnimalBehaviour = {
    activity: 'rest',
    animation: 'idle',
    remainingMs: 0,
    travelledMs: 0,
    needsDestination: false,
    destination: 'free',
    enrichmentSpot: 0,
    shortTrip: false,
    stage: 'done',
    exploreWalksLeft: 0,
    lastDurationMs: 0,
  };
  if (withArrival) {
    behaviour.stage = 'hesitate';
    startTimed(behaviour, rng, 'hesitate', HESITATE_MS);
  } else {
    startTimed(behaviour, rng, 'rest', SETTLE_MS);
  }
  return behaviour;
}

function startExploreWalk(behaviour: AnimalBehaviour): void {
  startTravel(behaviour, 'walk', 'free', true);
}

function finishTimed(behaviour: AnimalBehaviour, rng: RngState, context: BehaviourContext): void {
  if (behaviour.stage === 'hesitate') {
    behaviour.stage = 'sniff';
    startTimed(behaviour, rng, 'sniff', SNIFF_MS);
  } else if (behaviour.stage === 'sniff') {
    behaviour.stage = 'explore';
    behaviour.exploreWalksLeft = randomInt(rng, EXPLORE_WALKS_MIN, EXPLORE_WALKS_MAX);
    startExploreWalk(behaviour);
  } else {
    chooseRoutine(behaviour, rng, context);
  }
}

function finishTravel(
  behaviour: AnimalBehaviour,
  arrived: boolean,
  rng: RngState,
  context: BehaviourContext,
): void {
  if (behaviour.activity === 'walk') {
    if (behaviour.stage === 'explore') {
      behaviour.exploreWalksLeft -= 1;
      if (behaviour.exploreWalksLeft > 0) {
        startExploreWalk(behaviour);
        return;
      }
      behaviour.stage = 'done';
    }
    chooseRoutine(behaviour, rng, context);
  } else if (!arrived) {
    startRest(behaviour, rng);
  } else if (behaviour.activity === 'waterWalk') {
    startSignature(behaviour, rng);
  } else {
    useEnrichment(behaviour, rng, context);
  }
}

/**
 * Moves the behaviour on by `elapsedMs`. `arrived` says whether the body reached its target;
 * while a walk still waits for its target (`needsDestination`), no time passes for it.
 */
export function advanceBehaviour(
  behaviour: AnimalBehaviour,
  elapsedMs: number,
  arrived: boolean,
  rng: RngState,
  context: BehaviourContext,
): void {
  if (isTravelling(behaviour.activity)) {
    if (behaviour.needsDestination) {
      return;
    }
    behaviour.travelledMs += elapsedMs;
    if (arrived || behaviour.travelledMs >= MAX_TRAVEL_MS) {
      finishTravel(behaviour, arrived, rng, context);
    }
    return;
  }
  behaviour.remainingMs -= elapsedMs;
  if (behaviour.remainingMs <= 0) {
    finishTimed(behaviour, rng, context);
  }
}

/** The herd found no way to the target: the animal rests instead and tries something else later. */
export function failTravel(behaviour: AnimalBehaviour, rng: RngState): void {
  if (behaviour.stage === 'explore') {
    behaviour.stage = 'done';
  }
  startRest(behaviour, rng);
}
