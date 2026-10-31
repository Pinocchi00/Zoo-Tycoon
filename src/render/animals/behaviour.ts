import { randomFloat, randomInt, weightedPick, type RngState } from '@/sim';
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
  | 'waterWalk'
  /** Standing still and looking about: the head gestures are at their liveliest. */
  | 'lookAround'
  /** Two neighbours turn to each other for a moment. */
  | 'salute'
  /** Stopped for a moment in the middle of a walk, looking around; the walk goes on after. */
  | 'wayPause'
  /** Nose to the ground in the middle of a walk; the walk goes on after. */
  | 'wayInspect'
  | 'followWalk'
  | 'regroupWalk'
  /** Walking to lie down next to a neighbour who already sleeps. */
  | 'sleeperWalk';

/** Where a walking activity goes; the herd turns this into a point of the enclosure. */
export type DestinationKind = 'free' | 'enrichment' | 'water' | 'follow' | 'group' | 'sleeper';

/**
 * What an animal sees of its group, written by the herd before each step. Plain flags: the
 * behaviour knows nothing of positions.
 */
export interface SocialView {
  /** A neighbour is walking not far away: someone to follow. */
  walkerNear: boolean;
  /** A neighbour is asleep: someone to sleep next to. */
  sleeperNear: boolean;
  /** The group is spread out and this animal is far from the others. */
  scattered: boolean;
  /** A resting neighbour is close enough for a greeting. */
  neighbourClose: boolean;
  /** A neighbour is already in the water (walking there, or swimming): there is room for one. */
  waterBusy: boolean;
}

export const NO_SOCIAL: Readonly<SocialView> = {
  walkerNear: false,
  sleeperNear: false,
  scattered: false,
  neighbourClose: false,
  waterBusy: false,
};

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
  /** Time before the walk is interrupted by a pause or a sniff; negative: not drawn yet. */
  wayEventMs: number;
  /** How long the walk may take before it is given up (see `tripLimitMs`). */
  travelLimitMs: number;
  /** Time before a regrouping that failed may be tried again. */
  regroupCooldownMs: number;
  /** The timed activity is an interruption: the walk resumes, with the same target, after it. */
  resumeWalk: boolean;
}

/** Fewest stars from which enrichment is used (star 1 is the arrival kit only). */
export const ENRICHMENT_MIN_STARS = 2;
/** A walk that has not arrived after this long is given up. */
export const MAX_TRAVEL_MS = 30_000;
/**
 * Going to a sleeping neighbour or back to the group can mean a long way at a stroll (a dozen
 * metres at 0.25 m/s): those walks get three times as long.
 */
export const MAX_PURPOSEFUL_TRAVEL_MS = 90_000;

const MS_PER_SECOND = 1000;

/** A long walk gets this much more time than the trip needs at the pace of the walker. */
export const TRIP_TIME_MARGIN = 2.5;

/**
 * How long a long walk may take: the time the trip needs at its pace, plus a margin, but between
 * the limit of an ordinary walk and `MAX_PURPOSEFUL_TRAVEL_MS`.
 */
export function tripLimitMs(distanceM: number, paceMps: number): number {
  const needed = paceMps > 0 ? (distanceM / paceMps) * TRIP_TIME_MARGIN * MS_PER_SECOND : Infinity;
  return Math.max(MAX_TRAVEL_MS, Math.min(MAX_PURPOSEFUL_TRAVEL_MS, needed));
}

/** How long a walk of this kind may take before it is given up, until its trip is known. */
export function travelLimitMs(activity: Activity): number {
  return activity === 'sleeperWalk' ||
    activity === 'regroupWalk' ||
    activity === 'waterWalk' ||
    activity === 'enrichmentWalk'
    ? MAX_PURPOSEFUL_TRAVEL_MS
    : MAX_TRAVEL_MS;
}

const WALK_WEIGHT = 30;
const REST_WEIGHT = 25;
const EAT_WEIGHT = 20;
const SLEEP_WEIGHT = 10;
const SIGNATURE_WEIGHT = 10;
const LOOK_AROUND_WEIGHT = 14;
const FOLLOW_WEIGHT = 14;
/** A scattered group pulls its far members back: this must be a clear favourite. */
const REGROUP_WEIGHT = 60;
const SALUTE_WEIGHT = 8;
/** After a regrouping that found no way, the animal waits this long before trying again. */
export const REGROUP_RETRY_MS = 15_000;
/** Share of the sleepers that lie next to a sleeping neighbour, when there is one. */
const SLEEP_NEXT_TO_PERCENT = 75;
const PERCENT_TOTAL = 100;
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
const LOOK_AROUND_MS: DurationRange = { minMs: 3000, maxMs: 8000 };
const SALUTE_MS: DurationRange = { minMs: 1500, maxMs: 3500 };
const WAY_PAUSE_MS: DurationRange = { minMs: 1500, maxMs: 4000 };
const WAY_INSPECT_MS: DurationRange = { minMs: 1200, maxMs: 2500 };
/** Time between two interruptions of a walk (a pause, a sniff). */
const WAY_EVENT_MS: DurationRange = { minMs: 3500, maxMs: 9000 };
const WAY_PAUSE_PERCENT = 50;

/** How fast a walk is, as a share of the top speed: a stroll or a decided pace. */
interface PaceRange {
  readonly minRatio: number;
  readonly maxRatio: number;
}
const STROLL_PACE: PaceRange = { minRatio: 0.45, maxRatio: 0.65 };
const BRISK_PACE: PaceRange = { minRatio: 0.85, maxRatio: 1 };
const STROLL_PACE_WEIGHT = 60;
const BRISK_PACE_WEIGHT = 40;
const EXPLORE_WALKS_MIN = 2;
const EXPLORE_WALKS_MAX = 3;
/** Draws that land on the previous duration are redrawn this many times. */
const DURATION_REDRAWS = 3;

type Routine =
  | 'walk'
  | 'rest'
  | 'eat'
  | 'sleep'
  | 'signature'
  | 'enrichment'
  | 'lookAround'
  | 'follow'
  | 'regroup'
  | 'salute';
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
const lookAroundEntry: Entry<Routine> = { value: 'lookAround', weight: 0 };
const followEntry: Entry<Routine> = { value: 'follow', weight: 0 };
const regroupEntry: Entry<Routine> = { value: 'regroup', weight: 0 };
const saluteEntry: Entry<Routine> = { value: 'salute', weight: 0 };
const ROUTINE_ENTRIES: readonly Entry<Routine>[] = [
  walkEntry,
  restEntry,
  eatEntry,
  sleepEntry,
  signatureEntry,
  enrichmentEntry,
  lookAroundEntry,
  followEntry,
  regroupEntry,
  saluteEntry,
];
const strollEntry: Entry<PaceRange> = { value: STROLL_PACE, weight: STROLL_PACE_WEIGHT };
const briskEntry: Entry<PaceRange> = { value: BRISK_PACE, weight: BRISK_PACE_WEIGHT };
const PACE_ENTRIES: readonly Entry<PaceRange>[] = [strollEntry, briskEntry];
const useEatEntry: Entry<EnrichmentUse> = { value: 'eat', weight: 0 };
const useSignatureEntry: Entry<EnrichmentUse> = { value: 'signature', weight: 0 };
const USE_ENTRIES: readonly Entry<EnrichmentUse>[] = [useEatEntry, useSignatureEntry];

export function animationOf(activity: Activity): AnimalAnimation {
  switch (activity) {
    case 'hesitate':
    case 'rest':
    case 'lookAround':
    case 'salute':
    case 'wayPause':
      return 'idle';
    case 'walk':
    case 'enrichmentWalk':
    case 'waterWalk':
    case 'followWalk':
    case 'regroupWalk':
    case 'sleeperWalk':
      return 'walk';
    case 'sniff':
    case 'eat':
    case 'wayInspect':
      return 'eat';
    case 'sleep':
      return 'sleep';
    case 'signature':
      return 'signature';
  }
}

/** Walking activities move the animal; the others keep it where it stands. */
export function isTravelling(activity: Activity): boolean {
  switch (activity) {
    case 'walk':
    case 'enrichmentWalk':
    case 'waterWalk':
    case 'followWalk':
    case 'regroupWalk':
    case 'sleeperWalk':
      return true;
    case 'hesitate':
    case 'sniff':
    case 'rest':
    case 'eat':
    case 'sleep':
    case 'signature':
    case 'lookAround':
    case 'salute':
    case 'wayPause':
    case 'wayInspect':
      return false;
  }
}

/** How much the animal looks about, from 0 (head still) to 1 (looking around). */
export function attentionOf(activity: Activity): number {
  switch (activity) {
    case 'lookAround':
    case 'wayPause':
    case 'hesitate':
    case 'sniff':
      return 1;
    case 'rest':
    case 'salute':
      return 0.5;
    case 'walk':
    case 'enrichmentWalk':
    case 'waterWalk':
    case 'followWalk':
    case 'regroupWalk':
    case 'sleeperWalk':
    case 'signature':
    case 'wayInspect':
      return 0.3;
    case 'eat':
      return 0.2;
    case 'sleep':
      return 0;
  }
}

/** The share of its top speed an animal walks at this time: a stroll more often than a brisk pace. */
export function rollPace(rng: RngState): number {
  const range = weightedPick(rng, PACE_ENTRIES);
  return range.minRatio + randomFloat(rng) * (range.maxRatio - range.minRatio);
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
  behaviour.resumeWalk = false;
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
  behaviour.resumeWalk = false;
  behaviour.wayEventMs = -1;
  behaviour.travelLimitMs = travelLimitMs(activity);
}

function startRest(behaviour: AnimalBehaviour, rng: RngState): void {
  startTimed(behaviour, rng, 'rest', REST_MS);
}

function startSignature(behaviour: AnimalBehaviour, rng: RngState): void {
  startTimed(behaviour, rng, 'signature', SIGNATURE_MS);
}

function chooseRoutine(
  behaviour: AnimalBehaviour,
  rng: RngState,
  context: BehaviourContext,
  social: Readonly<SocialView>,
): void {
  walkEntry.weight = WALK_WEIGHT;
  restEntry.weight = REST_WEIGHT;
  eatEntry.weight = EAT_WEIGHT;
  // Never twice in a row: a sleeper wakes up and does something else first.
  sleepEntry.weight = behaviour.activity === 'sleep' ? 0 : SLEEP_WEIGHT;
  // The water takes one swimmer at a time: the others wait or do something else.
  signatureEntry.weight = context.signatureAtWater && social.waterBusy ? 0 : SIGNATURE_WEIGHT;
  enrichmentEntry.weight = hasEnrichment(context)
    ? ENRICHMENT_WEIGHT_PER_STAR * (context.stars - 1)
    : 0;
  lookAroundEntry.weight = LOOK_AROUND_WEIGHT;
  followEntry.weight = social.walkerNear ? FOLLOW_WEIGHT : 0;
  regroupEntry.weight = social.scattered && behaviour.regroupCooldownMs <= 0 ? REGROUP_WEIGHT : 0;
  saluteEntry.weight = social.neighbourClose ? SALUTE_WEIGHT : 0;
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
      if (social.sleeperNear && randomInt(rng, 1, PERCENT_TOTAL) <= SLEEP_NEXT_TO_PERCENT) {
        startTravel(behaviour, 'sleeperWalk', 'sleeper', false);
      } else {
        startTimed(behaviour, rng, 'sleep', SLEEP_MS);
      }
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
    case 'lookAround':
      startTimed(behaviour, rng, 'lookAround', LOOK_AROUND_MS);
      return;
    case 'follow':
      startTravel(behaviour, 'followWalk', 'follow', false);
      return;
    case 'regroup':
      startTravel(behaviour, 'regroupWalk', 'group', false);
      return;
    case 'salute':
      startTimed(behaviour, rng, 'salute', SALUTE_MS);
      return;
  }
}

/** Whether a greeting can start now: only an animal standing about, past its arrival. */
export function canSalute(behaviour: AnimalBehaviour): boolean {
  return (
    behaviour.stage === 'done' &&
    (behaviour.activity === 'rest' || behaviour.activity === 'lookAround')
  );
}

/** Starts a greeting the partner asked for (see `canSalute`). */
export function beginSalute(behaviour: AnimalBehaviour, rng: RngState): void {
  startTimed(behaviour, rng, 'salute', SALUTE_MS);
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
    wayEventMs: -1,
    travelLimitMs: MAX_TRAVEL_MS,
    regroupCooldownMs: 0,
    resumeWalk: false,
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

function finishTimed(
  behaviour: AnimalBehaviour,
  rng: RngState,
  context: BehaviourContext,
  social: Readonly<SocialView>,
): void {
  if (behaviour.resumeWalk) {
    // The interruption is over: back to the same walk, towards the same target.
    behaviour.resumeWalk = false;
    behaviour.activity = 'walk';
    behaviour.animation = animationOf('walk');
    behaviour.wayEventMs = -1;
  } else if (behaviour.stage === 'hesitate') {
    behaviour.stage = 'sniff';
    startTimed(behaviour, rng, 'sniff', SNIFF_MS);
  } else if (behaviour.stage === 'sniff') {
    behaviour.stage = 'explore';
    behaviour.exploreWalksLeft = randomInt(rng, EXPLORE_WALKS_MIN, EXPLORE_WALKS_MAX);
    startExploreWalk(behaviour);
  } else {
    chooseRoutine(behaviour, rng, context, social);
  }
}

function finishTravel(
  behaviour: AnimalBehaviour,
  arrived: boolean,
  rng: RngState,
  context: BehaviourContext,
  social: Readonly<SocialView>,
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
    chooseRoutine(behaviour, rng, context, social);
  } else if (!arrived) {
    startRest(behaviour, rng);
  } else if (behaviour.activity === 'waterWalk') {
    startSignature(behaviour, rng);
  } else if (behaviour.activity === 'sleeperWalk') {
    startTimed(behaviour, rng, 'sleep', SLEEP_MS);
  } else if (behaviour.activity === 'followWalk' || behaviour.activity === 'regroupWalk') {
    startTimed(behaviour, rng, 'lookAround', LOOK_AROUND_MS);
  } else {
    useEnrichment(behaviour, rng, context);
  }
}

/** Interrupts a free walk now and then: a stop to look around, or a sniff of the ground. */
function interruptWalk(behaviour: AnimalBehaviour, elapsedMs: number, rng: RngState): void {
  if (behaviour.wayEventMs < 0) {
    behaviour.wayEventMs =
      randomInt(rng, toSteps(WAY_EVENT_MS.minMs), toSteps(WAY_EVENT_MS.maxMs)) * DURATION_STEP_MS;
  }
  behaviour.wayEventMs -= elapsedMs;
  if (behaviour.wayEventMs > 0) {
    return;
  }
  if (randomInt(rng, 1, PERCENT_TOTAL) <= WAY_PAUSE_PERCENT) {
    startTimed(behaviour, rng, 'wayPause', WAY_PAUSE_MS);
  } else {
    startTimed(behaviour, rng, 'wayInspect', WAY_INSPECT_MS);
  }
  behaviour.resumeWalk = true;
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
  social: Readonly<SocialView> = NO_SOCIAL,
): void {
  behaviour.regroupCooldownMs = Math.max(0, behaviour.regroupCooldownMs - elapsedMs);
  if (isTravelling(behaviour.activity)) {
    if (behaviour.needsDestination) {
      return;
    }
    behaviour.travelledMs += elapsedMs;
    if (arrived || behaviour.travelledMs >= behaviour.travelLimitMs) {
      finishTravel(behaviour, arrived, rng, context, social);
    } else if (behaviour.activity === 'walk' && !behaviour.shortTrip) {
      interruptWalk(behaviour, elapsedMs, rng);
    }
    return;
  }
  behaviour.remainingMs -= elapsedMs;
  if (behaviour.remainingMs <= 0) {
    finishTimed(behaviour, rng, context, social);
  }
}

/** The herd found no way to the target: the animal rests instead and tries something else later. */
export function failTravel(behaviour: AnimalBehaviour, rng: RngState): void {
  if (behaviour.activity === 'regroupWalk') {
    behaviour.regroupCooldownMs = REGROUP_RETRY_MS;
  }
  if (behaviour.stage === 'explore') {
    behaviour.stage = 'done';
  }
  startRest(behaviour, rng);
}
