import type { Object3D } from 'three';
import {
  gridDepth,
  gridWidth,
  logger,
  type EnclosureId,
  type GridSize,
  type Result,
  type SpeciesId,
} from '@/shared';
import {
  createRng,
  randomFloat,
  randomInt,
  type EnclosureState,
  type FocusArea,
  type GameEvent,
  type SpeciesProgress,
} from '@/sim';
import {
  CROSS_FADE_S,
  cloneAnimalSource,
  animalLength,
  createAnimalModel,
  disposeAnimalSource,
  swimClipScale,
  walkClipScale,
  walkPace,
  type AnimalAnimation,
  type AnimalModel,
  type AnimalModelProblem,
  type AnimalSource,
} from './animal-model';
import { createAnimalSlot, type AnimalSlot, type AnimalSlotProblem } from './animal-slot';
import {
  advanceBehaviour,
  attentionOf,
  beginSalute,
  canSalute,
  createBehaviour,
  failTravel,
  isTravelling,
  rollPace,
  type Activity,
  type AnimalBehaviour,
  type BehaviourContext,
} from './behaviour';
import {
  APPROACH_RADIUS_M,
  CROWD_CLEARANCE_M,
  approachRadiusFor,
  PATH_MARGIN_M,
  approachPoint,
  clearanceFor,
  containsPoint,
  createEnclosureArea,
  distanceToEdge,
  isClearOfCrowd,
  segmentStaysInside,
  pickDestination,
  placeInterestPoints,
  type EnclosureArea,
  type InterestPoints,
  type Point2,
} from './enclosure-area';
import {
  bearing,
  createSocialReport,
  followGapM,
  keepsGap,
  observeGroup,
  pointBehind,
  regroupRadiusM,
  sleepContactM,
  type SocialReport,
} from './social';
import {
  createSteerBody,
  steerStep,
  turnToward,
  wrapAngle,
  type SteerBody,
  type SteerWorld,
} from './steering';

/** Owned by the render layer, never the simulation's: how animals look has no effect on the game. */
const HERD_SEED = 0x20_05_a1;
/** The signature clip that is played at the water instead of on the spot. */
const SWIM_SIGNATURE = 'swim';

/**
 * Behaviour, steering and position are updated at every image for every animal: they are cheap,
 * and a lower rate would make movements jerky. Only the animation mixer and the breathing layer
 * are spared, and only when the animal is too small on screen for the difference to show.
 */
/** An animal shorter than this on screen (CSS pixels, nose to tail) counts as small. */
export const SMALL_ON_SCREEN_PX = 16;
/** A small animal's animation is advanced one image out of this many, with the time of all. */
export const SMALL_UPDATE_EVERY_FRAMES = 2;
/** An animal outside the visible area is never seen: its animation is advanced less often. */
export const HIDDEN_UPDATE_EVERY_FRAMES = 4;
/** Phases of the animals are spread over this many images, so they never all update together. */
const PHASE_COUNT = 4;
/** A longer gap (a stalled tab) is cut down, so that steering stays stable. */
const MAX_STEP_MS = 200;
const MS_PER_SECOND = 1000;

const TIME_SCALE_MIN = 0.9;
const TIME_SCALE_MAX = 1.1;
const MAX_SPEED_MIN_MPS = 0.45;
export const MAX_SPEED_MAX_MPS = 0.75;
export const MAX_ACCEL_MPS2 = 0.5;
const MAX_TURN_RATE_RAD_S = 1.6;
const MIN_TRIP_M = 1.5;
const MAX_TRIP_M = 8;
const EXPLORE_MAX_TRIP_M = 3.5;
const START_ATTEMPTS = 40;
/** A relaxed swim: a share of the top speed, in a small circuit round the water. */
const SWIM_PACE = 0.35;
/** The target of a swimmer lies this far ahead on the circuit (radians round the water). */
const SWIM_LOOKAHEAD_RAD = 1.3;
/** A walk that gets no nearer to its target for this long is given up. */
export const MAX_NO_PROGRESS_MS = 5000;
/** Nearer than the best distance so far by this much counts as progress. */
const PROGRESS_M = 0.25;
/** An animal faster than this moves, one turning faster than this turns: its clip must be a walk. */
const MOVING_ON_SPEED_MPS = 0.04;
const TURNING_ON_RATE_RAD_S = 0.2;
/** ... and keeps moving, for this purpose, until it goes below these (so that it cannot flicker). */
const MOVING_OFF_SPEED_MPS = 0.02;
const TURNING_OFF_RATE_RAD_S = 0.1;
/**
 * An animal that sets off waits for its walk clip to take over: it starts to move when the clip
 * has this share of the cross-fade behind it, and is free to go at full pace at the end of it.
 */
const GATE_START = 0.7;
const MS_PER_FADE_S = 1000;
export const RESTART_COOLDOWN_MS = 1500;

/**
 * Whether an animal counts as moving for its clip: it needs a clear movement to start, and keeps
 * counting until it is nearly still, so that a speed that wavers round one threshold does not
 * make the clip flicker.
 */
export function nextMoving(wasMoving: boolean, speedMps: number, turnRateRadS: number): boolean {
  return wasMoving
    ? speedMps > MOVING_OFF_SPEED_MPS || turnRateRadS > TURNING_OFF_RATE_RAD_S
    : speedMps > MOVING_ON_SPEED_MPS || turnRateRadS > TURNING_ON_RATE_RAD_S;
}

/** How long an animal that stopped walking in vain waits before it shows its walk clip again. */
export function restartDelayMs(wantsToMove: boolean): number {
  return wantsToMove ? RESTART_COOLDOWN_MS : 0;
}
/** A walk clip goes on this long after the animal stopped, so that it does not flicker. */
const WALK_HOLD_MS = 500;

const TWO_PI = Math.PI * 2;
/** Two animals greeting each other turn more slowly than they walk round. */
const SALUTE_TURN_SHARE = 0.6;
const SCRATCH_POINT: Point2 = { x: 0, z: 0 };
/** A sleeper may lie this close to a third animal's resting place, short of the contact distance. */
const SLEEP_CLEARANCE_MARGIN_M = 0.02;
/** Successive animals of a group take well-spread places around an interest point. */
const GOLDEN_ANGLE_RAD = 2.399_963;
const MAX_SEED = 0x1_0000_0000;

/** What the herd needs to know about a species; `app` builds it from the game data. */
export interface SpeciesLook {
  /** File name (without extension) of the model, or null while the species has none. */
  readonly modelId: string | null;
  readonly hasWater: boolean;
}

/** The part of the game state the herd reads. */
export interface HerdWorld {
  readonly enclosures: readonly EnclosureState[];
  readonly gacha: { readonly collection: readonly SpeciesProgress[] };
}

export interface HerdOptions {
  readonly parent: Object3D;
  readonly grid: GridSize;
  readonly lookupSpecies: (id: SpeciesId) => SpeciesLook | undefined;
  /**
   * Seed of the visual randomness: an unsigned 32-bit integer, like every seed of `createRng`.
   * A constant of the herd unless a test wants another life.
   */
  readonly seed?: number | undefined;
  /** Downloads and decodes a model; called once per model, rejects when it cannot. */
  readonly loadSource: (modelId: string) => Promise<AnimalSource>;
}

export interface AnimalHerd {
  /** Rebuilds every group from the state: at start, and after loading a save. */
  syncAll: (world: HerdWorld) => void;
  /** Refreshes only the enclosures the events talk about. */
  handleEvents: (events: readonly GameEvent[], world: HerdWorld) => void;
  /**
   * Moves every animal by `elapsedMs`. `pixelsPerMetre` is the scale on screen (viewport height
   * in CSS pixels over the height of the view in metres) and `visible` the cells the camera may
   * show; they only decide how often the animation of an animal is advanced.
   */
  update: (elapsedMs: number, pixelsPerMetre: number, visible: Readonly<FocusArea>) => void;
  /** What each animal does now, group by group (allocates: for tests and development). */
  activities: () => Activity[];
  /** The clip each animal is playing now, group by group (allocates: for tests and development). */
  animations: () => AnimalAnimation[];
  /** Settles when every animal now in the park has loaded or failed. */
  whenLoaded: () => Promise<void>;
  dispose: () => void;
}

/** The limits of one animal; the top speed follows the pace of the current walk. */
interface Limits {
  maxSpeed: number;
  readonly maxAccel: number;
  readonly maxTurnRate: number;
}

interface Individual {
  readonly slot: AnimalSlot;
  readonly behaviour: AnimalBehaviour;
  readonly body: SteerBody;
  readonly limits: Limits;
  /** Top speed before the pace of the walk is applied. */
  readonly topSpeed: number;
  readonly social: SocialReport;
  /** Position in the group, which does not change while the animal is there. */
  readonly index: number;
  /** Index of the animal being greeted or greeting this one while in `salute`, else -1. */
  saluteWith: number;
  /** Index of the walker being followed while in `followWalk`, else -1. */
  followIndex: number;
  readonly target: Point2;
  shown: AnimalAnimation;
  /** Where this animal falls in the cycle of animation updates, to spread them over the images. */
  readonly phase: number;
  /** Direction in which it stands around an interest point, different for each of the group. */
  readonly approachAngle: number;
  /** Time the animation has not been advanced by yet. */
  mixerMs: number;
  /** Nearest the animal has been to its target on this walk, and how long since it improved. */
  bestDistance: number;
  noProgressMs: number;
  /** How long the animal has been standing still (to keep the walk clip a moment). */
  stillMs: number;
  /** Which way round the water the animal swims: 1 or -1. */
  swimDirection: number;
  /** Top speed on the present walk, before the clip has taken over (see `GATE_START`). */
  paceSpeed: number;
  /** Time the clip shown has been shown. */
  clipAgeMs: number;
  /** Whether the animal moves or turns, as far as its clip is concerned (with a margin). */
  moving: boolean;
  /** Time before an animal that stopped walking in vain may show its walk again. */
  restMs: number;
}

interface EnclosureGroup {
  readonly id: EnclosureId;
  readonly speciesId: SpeciesId;
  readonly modelId: string;
  readonly look: SpeciesLook;
  readonly area: EnclosureArea;
  readonly context: BehaviourContext;
  readonly individuals: Individual[];
  readonly bodies: SteerBody[];
  /** Every body and every target of the group, for choosing places clear of the others. */
  readonly crowd: Point2[];
  /** Nose to tail, known once the model is downloaded; the animals appear then. */
  lengthM: number | null;
  /** Least distance between the centres of two animals at rest. */
  clearanceM: number;
  /** Distance from an interest point at which the animals stand round it. */
  approachRadiusM: number;
  /**
   * How many animals the group is to have, and how many of them were there already: the others
   * are newcomers, who go through the arrival sequence, even when they come before the model
   * has finished downloading.
   */
  wanted: number;
  settled: number;
  /** Settles once the length is known and the animals are there. */
  loaded: Promise<void>;
  loading: boolean;
  readonly steer: SteerWorld;
  pois: InterestPoints;
}

interface SourceEntry {
  readonly promise: Promise<AnimalSource>;
  loaded: AnimalSource | null;
}

function lerp(min: number, max: number, ratio: number): number {
  return min + (max - min) * ratio;
}

export function createAnimalHerd(options: HerdOptions): AnimalHerd {
  const rng = createRng(options.seed ?? HERD_SEED);
  const groups: EnclosureGroup[] = [];
  const sources = new Map<string, SourceEntry>();
  const warned = new Set<string>();
  let disposed = false;
  let frame = 0;
  let created = 0;

  const sourceFor = (modelId: string): SourceEntry => {
    const known = sources.get(modelId);
    if (known !== undefined) {
      return known;
    }
    const entry: SourceEntry = {
      loaded: null,
      promise: options.loadSource(modelId).then((source) => {
        if (disposed) {
          disposeAnimalSource(source);
        } else {
          entry.loaded = source;
        }
        return source;
      }),
    };
    sources.set(modelId, entry);
    return entry;
  };

  const reportProblem = (modelId: string, problem: AnimalSlotProblem): void => {
    const key = `${modelId}:${problem.kind}`;
    if (!warned.has(key)) {
      warned.add(key);
      logger.warn(`The ${modelId} animals could not be shown (${problem.kind}).`, problem);
    }
  };

  /** A resting place clear of the others by the clearance of the group; the best found if none is. */
  const pickStart = (group: EnclosureGroup, out: Point2): void => {
    const spots = group.area.interior;
    let bestRoom = -1;
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
      const spot = spots[randomInt(rng, 0, spots.length - 1)];
      if (spot === undefined) {
        return;
      }
      let room = Number.POSITIVE_INFINITY;
      for (const other of group.bodies) {
        room = Math.min(room, Math.hypot(other.x - spot.x, other.z - spot.z));
      }
      if (room > bestRoom) {
        bestRoom = room;
        out.x = spot.x;
        out.z = spot.z;
      }
      if (room >= group.clearanceM) {
        return;
      }
    }
  };

  const addIndividual = (group: EnclosureGroup, withArrival: boolean): void => {
    const start: Point2 = { x: 0, z: 0 };
    pickStart(group, start);
    const yaw = randomFloat(rng) * TWO_PI - Math.PI;
    const look = {
      startPhase: randomFloat(rng),
      seed: randomInt(rng, 0, MAX_SEED - 1),
      timeScale: lerp(TIME_SCALE_MIN, TIME_SCALE_MAX, randomFloat(rng)),
    };
    const topSpeed = lerp(MAX_SPEED_MIN_MPS, MAX_SPEED_MAX_MPS, randomFloat(rng));
    const limits: Limits = {
      maxSpeed: topSpeed,
      maxAccel: MAX_ACCEL_MPS2,
      maxTurnRate: MAX_TURN_RATE_RAD_S,
    };
    const body = createSteerBody(start.x, start.z, yaw, group.lengthM ?? 0);
    const behaviour = createBehaviour(rng, withArrival);
    const entry = sourceFor(group.modelId);
    const loading: Promise<Result<AnimalModel, AnimalModelProblem>> = entry.promise.then(
      (source) => {
        const created = createAnimalModel(cloneAnimalSource(source), look, {
          sharedResources: true,
        });
        if (created.ok) {
          group.context.signatureAtWater =
            group.look.hasWater && created.value.signatureName === SWIM_SIGNATURE;
        }
        return created;
      },
    );
    const slot = createAnimalSlot(
      options.parent,
      loading,
      { x: start.x, z: start.z, yawRad: yaw },
      (problem) => {
        reportProblem(group.modelId, problem);
      },
    );
    const target: Point2 = { x: start.x, z: start.z };
    group.bodies.push(body);
    group.crowd.push(body, target);
    group.individuals.push({
      slot,
      behaviour,
      body,
      limits,
      topSpeed,
      social: createSocialReport(),
      index: group.individuals.length,
      saluteWith: -1,
      followIndex: -1,
      target,
      shown: 'idle',
      mixerMs: 0,
      bestDistance: Number.POSITIVE_INFINITY,
      noProgressMs: 0,
      stillMs: 0,
      swimDirection: created % 2 === 0 ? 1 : -1,
      paceSpeed: topSpeed,
      clipAgeMs: 0,
      moving: false,
      restMs: 0,
      phase: created % PHASE_COUNT,
      approachAngle: group.individuals.length * GOLDEN_ANGLE_RAD,
    });
    created += 1;
  };

  const removeLastIndividual = (group: EnclosureGroup): void => {
    group.individuals.pop()?.slot.dispose();
    group.bodies.pop();
    group.crowd.length -= 2;
  };

  const removeGroup = (id: EnclosureId): void => {
    const index = groups.findIndex((group) => group.id === id);
    const group = groups[index];
    if (group === undefined) {
      return;
    }
    groups.splice(index, 1);
    for (const individual of group.individuals) {
      individual.slot.dispose();
    }
  };

  const progressOf = (world: HerdWorld, speciesId: SpeciesId): SpeciesProgress | undefined =>
    world.gacha.collection.find((progress) => progress.speciesId === speciesId);

  const createGroup = (enclosure: EnclosureState, world: HerdWorld): EnclosureGroup | null => {
    if (enclosure.speciesId === null) {
      return null;
    }
    const look = options.lookupSpecies(enclosure.speciesId);
    const area = createEnclosureArea(enclosure.outline, options.grid);
    if (look === undefined || look.modelId === null || area === null) {
      return null;
    }
    const modelId = look.modelId;
    const stars = progressOf(world, enclosure.speciesId)?.stars ?? 1;
    const pois = placeInterestPoints(area, enclosure.id, look.hasWater, stars);
    const bodies: SteerBody[] = [];
    return {
      id: enclosure.id,
      speciesId: enclosure.speciesId,
      modelId,
      look,
      area,
      pois,
      context: { stars, enrichmentSpots: pois.enrichment.length, signatureAtWater: false },
      individuals: [],
      bodies,
      crowd: [],
      steer: { area, others: bodies, scratch: { x: 0, z: 0 }, goal: null },
      lengthM: null,
      clearanceM: CROWD_CLEARANCE_M,
      approachRadiusM: APPROACH_RADIUS_M,
      wanted: 0,
      settled: 0,
      loaded: Promise.resolve(),
      loading: false,
    };
  };

  /** Adds or removes animals until the group has the size it is to have. */
  const fill = (group: EnclosureGroup): void => {
    if (group.lengthM === null) {
      return;
    }
    while (group.individuals.length < group.wanted) {
      addIndividual(group, group.individuals.length >= group.settled);
    }
    while (group.individuals.length > group.wanted) {
      removeLastIndividual(group);
    }
  };

  const rebuild = (enclosure: EnclosureState, world: HerdWorld, withArrival: boolean): void => {
    removeGroup(enclosure.id);
    const group = createGroup(enclosure, world);
    if (group === null || enclosure.speciesId === null) {
      return;
    }
    groups.push(group);
    group.wanted = progressOf(world, enclosure.speciesId)?.groupSize ?? 0;
    group.settled = withArrival ? 0 : group.wanted;
    load(group);
  };

  /**
   * The animals come once the model is there, since its length decides how much room each
   * needs; a group that is to have nobody downloads nothing.
   */
  const load = (group: EnclosureGroup): void => {
    if (group.loading || group.wanted === 0) {
      return;
    }
    group.loading = true;
    group.loaded = sourceFor(group.modelId).promise.then(
      (source) => {
        if (disposed || !groups.includes(group)) {
          return;
        }
        group.lengthM = animalLength(source.scene);
        group.clearanceM = clearanceFor(group.lengthM);
        group.approachRadiusM = approachRadiusFor(group.lengthM);
        fill(group);
      },
      (error: unknown) => {
        reportProblem(group.modelId, { kind: 'loadFailed', error });
      },
    );
  };

  const rebuildById = (id: EnclosureId, world: HerdWorld, withArrival: boolean): void => {
    const enclosure = world.enclosures.find((candidate) => candidate.id === id);
    if (enclosure === undefined) {
      removeGroup(id);
    } else {
      rebuild(enclosure, world, withArrival);
    }
  };

  /** New arrivals join the group, and new stars move the enrichment points. */
  const reconcile = (enclosure: EnclosureState, world: HerdWorld): void => {
    const group = groups.find((candidate) => candidate.id === enclosure.id);
    if (group === undefined) {
      rebuild(enclosure, world, true);
      return;
    }
    const progress = progressOf(world, group.speciesId);
    if (progress === undefined) {
      return;
    }
    if (progress.stars !== group.context.stars) {
      group.context.stars = progress.stars;
      group.pois = placeInterestPoints(group.area, group.id, group.look.hasWater, progress.stars);
      group.context.enrichmentSpots = group.pois.enrichment.length;
    }
    group.wanted = progress.groupSize;
    group.settled = Math.min(group.settled, group.wanted);
    load(group);
    fill(group);
  };

  /** Where a walk of the kind the behaviour asked for ends; false when there is no way. */
  const chooseTarget = (group: EnclosureGroup, individual: Individual): boolean => {
    const { behaviour, body, target, social } = individual;
    const { area, crowd } = group;
    switch (behaviour.destination) {
      case 'free': {
        const maxTrip = behaviour.shortTrip ? EXPLORE_MAX_TRIP_M : MAX_TRIP_M;
        return pickDestination(
          area,
          rng,
          body,
          MIN_TRIP_M,
          maxTrip,
          target,
          crowd,
          group.clearanceM,
        );
      }
      case 'water':
      case 'enrichment': {
        const spot =
          behaviour.destination === 'water'
            ? group.pois.water
            : group.pois.enrichment[behaviour.enrichmentSpot];
        // Each animal stands at its own place around the point, not on it nor on a neighbour.
        return (
          spot !== null &&
          spot !== undefined &&
          approachPoint(
            area,
            spot,
            individual.approachAngle,
            group.approachRadiusM,
            body,
            crowd,
            target,
            group.clearanceM,
          )
        );
      }
      case 'follow': {
        const walker = group.individuals[social.walker];
        if (walker === undefined) {
          return false;
        }
        individual.followIndex = walker.index;
        return aimBehind(group, individual, walker);
      }
      case 'sleeper': {
        const sleeper = group.individuals[social.sleeper];
        return (
          sleeper !== undefined &&
          approachPoint(
            area,
            sleeper.body,
            individual.approachAngle,
            sleepContactM(group.lengthM ?? 0),
            body,
            crowd,
            target,
            // Lying down in contact: only the other animals are kept at the usual distance.
            sleepContactM(group.lengthM ?? 0) - SLEEP_CLEARANCE_MARGIN_M,
          )
        );
      }
      case 'group':
        return approachPoint(
          area,
          social.centre,
          individual.approachAngle,
          regroupRadiusM(group.lengthM ?? 0),
          body,
          crowd,
          target,
          group.clearanceM,
        );
    }
  };

  /** Puts the target of a follower behind the walker, if that place is free and reachable. */
  const aimBehind = (
    group: EnclosureGroup,
    individual: Individual,
    walker: Individual,
  ): boolean => {
    const { body, target } = individual;
    pointBehind(walker.body, followGapM(group.lengthM ?? 0), SCRATCH_POINT);
    const { x, z } = SCRATCH_POINT;
    if (
      !isClearOfCrowd(group.crowd, x, z, body, target, group.clearanceM) ||
      !segmentStaysInside(group.area, body.x, body.z, x, z, PATH_MARGIN_M)
    ) {
      return false;
    }
    target.x = x;
    target.z = z;
    return true;
  };

  const giveDestination = (group: EnclosureGroup, individual: Individual): void => {
    const { behaviour, body } = individual;
    behaviour.needsDestination = false;
    if (chooseTarget(group, individual)) {
      body.arrived = false;
      individual.bestDistance = distanceToGoal(group, individual);
      individual.noProgressMs = 0;
      // A stroll or a decided pace, for the whole walk.
      individual.paceSpeed = individual.topSpeed * rollPace(rng);
    } else {
      failTravel(behaviour, rng);
    }
  };

  /**
   * An animal that starts a greeting picks its nearest neighbour as partner and, if that one is
   * standing about, greets it back: both then turn to each other. A greeted animal never greets
   * anyone else, so a greeting cannot spread along a chain.
   */
  const greet = (group: EnclosureGroup, individual: Individual): void => {
    individual.saluteWith = individual.social.nearest;
    const partner = group.individuals[individual.saluteWith];
    if (partner !== undefined && canSalute(partner.behaviour)) {
      beginSalute(partner.behaviour, rng);
      partner.saluteWith = individual.index;
    }
  };

  /**
   * How far the animal is from where it is going. A follower's target moves with the walker it
   * follows, so for it the walker itself is the goal.
   */
  const distanceToGoal = (group: EnclosureGroup, individual: Individual): number => {
    const { behaviour, body, target } = individual;
    const leader =
      behaviour.activity === 'followWalk' ? group.individuals[individual.followIndex] : undefined;
    return leader === undefined
      ? Math.hypot(target.x - body.x, target.z - body.z)
      : Math.hypot(leader.body.x - body.x, leader.body.z - body.z);
  };

  /** A walk that gets no nearer for too long (circling a target it cannot reach) is given up. */
  const watchProgress = (
    group: EnclosureGroup,
    individual: Individual,
    elapsedMs: number,
  ): void => {
    const { behaviour, body } = individual;
    if (!isTravelling(behaviour.activity) || behaviour.needsDestination) {
      individual.noProgressMs = 0;
      return;
    }
    const distance = distanceToGoal(group, individual);
    // A follower that keeps its place behind the walker is doing what it is meant to: it is not
    // stuck, even if it never quite reaches a target that moves.
    if (behaviour.activity === 'followWalk' && keepsGap(distance, body.lengthM)) {
      individual.bestDistance = distance;
      individual.noProgressMs = 0;
      return;
    }
    if (distance < individual.bestDistance - PROGRESS_M) {
      individual.bestDistance = distance;
      individual.noProgressMs = 0;
      return;
    }
    individual.noProgressMs += elapsedMs;
    if (individual.noProgressMs >= MAX_NO_PROGRESS_MS) {
      failTravel(behaviour, rng);
      individual.noProgressMs = 0;
    }
  };

  /**
   * The swimmer's next target: a point ahead on a circle round the water, in the direction it
   * swims, turning back if the circle runs into the fence. False when it can go neither way.
   */
  const circuitTarget = (group: EnclosureGroup, individual: Individual): boolean => {
    const water = group.pois.water;
    if (water === null) {
      return false;
    }
    const { body, target } = individual;
    const around = bearing(water.x, water.z, body.x, body.z);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const angle = around + individual.swimDirection * SWIM_LOOKAHEAD_RAD;
      const x = water.x + Math.sin(angle) * group.approachRadiusM;
      const z = water.z + Math.cos(angle) * group.approachRadiusM;
      if (
        containsPoint(group.area, x, z) &&
        distanceToEdge(group.area, x, z, SCRATCH_POINT) >= PATH_MARGIN_M &&
        segmentStaysInside(group.area, body.x, body.z, x, z, PATH_MARGIN_M)
      ) {
        target.x = x;
        target.z = z;
        return true;
      }
      individual.swimDirection = -individual.swimDirection;
    }
    return false;
  };

  /** Moves one animal; true when its animation changed, so that the model must be updated now. */
  const tick = (
    group: EnclosureGroup,
    individual: Individual,
    model: AnimalModel,
    elapsedMs: number,
  ): boolean => {
    const { behaviour, body, social } = individual;
    const dtS = elapsedMs / MS_PER_SECOND;
    const yawBefore = body.yaw;
    observeGroup(individual, group.individuals, social, group.context.signatureAtWater);
    advanceBehaviour(behaviour, elapsedMs, body.arrived, rng, group.context, social.view);
    if (behaviour.needsDestination) {
      giveDestination(group, individual);
    }
    watchProgress(group, individual, elapsedMs);
    const travelling = isTravelling(behaviour.activity);
    // At the water, a swimmer swims: a slow circuit round the point, not a swim clip on the spot.
    const swimming =
      behaviour.activity === 'signature' &&
      group.context.signatureAtWater &&
      group.pois.water !== null;
    const circling = swimming && circuitTarget(group, individual);
    individual.clipAgeMs += elapsedMs;
    // An animal that means to move shows the clip of the movement first, and only gets going
    // as that clip takes over: it never moves while the posture it left still shows.
    let changed = false;
    const legsClip = circling ? 'signature' : 'walk';
    const intent = travelling || circling;
    individual.restMs = Math.max(0, individual.restMs - elapsedMs);
    if (intent && individual.shown !== legsClip && individual.restMs <= 0) {
      model.play(legsClip);
      individual.shown = legsClip;
      individual.clipAgeMs = 0;
      individual.stillMs = 0;
      changed = true;
    }
    const fade = Math.min(1, individual.clipAgeMs / (CROSS_FADE_S * MS_PER_FADE_S));
    // Not showing the clip of the movement yet (or any more): no movement.
    const gate =
      intent && individual.shown === legsClip
        ? Math.max(0, (fade - GATE_START) / (1 - GATE_START))
        : intent
          ? 0
          : 1;
    individual.limits.maxSpeed =
      (circling ? individual.topSpeed * SWIM_PACE : individual.paceSpeed) * gate;
    // Going to lie down next to a sleeper: it is not an obstacle to stop short of, but the goal.
    group.steer.goal =
      behaviour.activity === 'sleeperWalk'
        ? (group.individuals[social.sleeper]?.body ?? null)
        : null;
    steerStep(
      body,
      individual.limits,
      group.steer,
      travelling || circling,
      individual.target.x,
      individual.target.z,
      dtS,
    );
    const neighbour = group.individuals[social.nearest];
    if (behaviour.activity === 'salute') {
      if (individual.saluteWith < 0) {
        greet(group, individual);
      }
      const partner = group.individuals[individual.saluteWith];
      if (partner !== undefined) {
        turnToward(
          body,
          individual.limits.maxTurnRate * SALUTE_TURN_SHARE,
          bearing(body.x, body.z, partner.body.x, partner.body.z),
          dtS,
          group.steer.others,
        );
      }
    } else {
      individual.saluteWith = -1;
    }
    if (behaviour.activity === 'followWalk' && !behaviour.needsDestination) {
      // The walker moves on: the place behind it follows, as long as that place is free.
      const walker = group.individuals[individual.followIndex];
      if (walker !== undefined && isTravelling(walker.behaviour.activity)) {
        aimBehind(group, individual, walker);
      }
    }
    if (!travelling && !circling && !behaviour.resumeWalk) {
      // A resting animal claims the place where it stands, not the one it was heading for.
      individual.target.x = body.x;
      individual.target.z = body.z;
    }
    model.root.position.set(body.x, 0, body.z);
    model.root.rotation.y = body.yaw;
    // The clip fits the movement: whatever the animal is doing, if it moves or turns, it walks
    // (or swims); and a walk clip does not go on long once it stands still.
    const yawRate = Math.abs(wrapAngle(body.yaw - yawBefore)) / dtS;
    individual.moving = nextMoving(individual.moving, body.speed, yawRate);
    const moving = individual.moving;
    let clip = behaviour.animation;
    if (moving) {
      individual.stillMs = 0;
      if (clip !== 'walk' && !(clip === 'signature' && swimming)) {
        clip = 'walk';
      }
    } else if (individual.shown === 'walk' && clip !== 'walk') {
      // It has just stopped: the walk clip goes on a moment, so that a body that flickers
      // between moving and still does not flicker between clips too.
      individual.stillMs += elapsedMs;
      if (individual.stillMs < WALK_HOLD_MS) {
        clip = 'walk';
      }
    } else if (clip === 'walk') {
      individual.stillMs += elapsedMs;
      if (individual.stillMs >= WALK_HOLD_MS) {
        clip = 'idle';
        // An animal that wants to go but cannot (a neighbour in the way) does not start its walk
        // clip again and again: it waits before it tries once more.
        individual.restMs = restartDelayMs(intent);
      }
    } else {
      individual.stillMs = 0;
    }
    if (individual.shown !== clip) {
      model.play(clip);
      individual.shown = clip;
      individual.clipAgeMs = 0;
      changed = true;
    }
    if (clip === 'walk') {
      model.setWalkScale(walkClipScale(walkPace(body.speed, yawRate), model.walkSpeedMps));
    } else if (clip === 'signature' && swimming) {
      model.setSignatureScale(swimClipScale(body.speed));
    }
    model.setAttention(attentionOf(behaviour.activity));
    model.gaze.hasNeighbour = neighbour !== undefined;
    if (neighbour !== undefined) {
      model.gaze.yaw = wrapAngle(
        bearing(body.x, body.z, neighbour.body.x, neighbour.body.z) - body.yaw,
      );
    }
    return changed;
  };

  const isVisible = (body: SteerBody, visible: Readonly<FocusArea>): boolean => {
    const column = Math.floor(body.x + gridWidth(options.grid) / 2);
    const row = Math.floor(body.z + gridDepth(options.grid) / 2);
    return (
      column >= visible.minColumn &&
      column <= visible.maxColumn &&
      row >= visible.minRow &&
      row <= visible.maxRow
    );
  };

  /** How many images apart the animation of this animal is advanced. */
  const animationInterval = (
    individual: Individual,
    model: AnimalModel,
    pixelsPerMetre: number,
    visible: Readonly<FocusArea>,
  ): number => {
    if (!isVisible(individual.body, visible)) {
      return HIDDEN_UPDATE_EVERY_FRAMES;
    }
    return model.lengthM * pixelsPerMetre < SMALL_ON_SCREEN_PX ? SMALL_UPDATE_EVERY_FRAMES : 1;
  };

  return {
    syncAll: (world) => {
      while (groups.length > 0) {
        const last = groups[groups.length - 1];
        if (last === undefined) {
          break;
        }
        removeGroup(last.id);
      }
      for (const enclosure of world.enclosures) {
        rebuild(enclosure, world, false);
      }
    },
    handleEvents: (events, world) => {
      for (const event of events) {
        if (event.type === 'enclosurePlaced' || event.type === 'enclosureMoved') {
          rebuildById(event.enclosureId, world, false);
        } else if (event.type === 'enclosureGroupChanged') {
          rebuildById(event.enclosureId, world, true);
        } else if (event.type === 'enclosureRemoved') {
          removeGroup(event.enclosureId);
        } else if (event.type === 'arrivalOpened') {
          for (const enclosure of world.enclosures) {
            if (enclosure.speciesId === event.speciesId) {
              reconcile(enclosure, world);
            }
          }
        }
      }
    },
    update: (elapsedMs, pixelsPerMetre, visible) => {
      frame += 1;
      const step = Math.min(elapsedMs, MAX_STEP_MS);
      for (const group of groups) {
        for (const individual of group.individuals) {
          const model = individual.slot.model();
          if (model === undefined) {
            continue;
          }
          const changed = tick(group, individual, model, step);
          individual.mixerMs += step;
          const interval = animationInterval(individual, model, pixelsPerMetre, visible);
          // A new clip is set up now (the layers are taken back): the model must run at once.
          if (changed || (frame + individual.phase) % interval === 0) {
            individual.slot.update(individual.mixerMs);
            individual.mixerMs = 0;
          }
        }
      }
    },
    activities: () =>
      groups.flatMap((group) => group.individuals.map((one) => one.behaviour.activity)),
    animations: () => groups.flatMap((group) => group.individuals.map((one) => one.shown)),
    whenLoaded: async () => {
      await Promise.all(groups.map((group) => group.loaded));
      const pending = groups.flatMap((group) => group.individuals.map((one) => one.slot.ready));
      await Promise.all(pending);
    },
    dispose: () => {
      disposed = true;
      while (groups.length > 0) {
        const last = groups[groups.length - 1];
        if (last === undefined) {
          break;
        }
        removeGroup(last.id);
      }
      for (const entry of sources.values()) {
        if (entry.loaded !== null) {
          disposeAnimalSource(entry.loaded);
        }
      }
      sources.clear();
    },
  };
}
