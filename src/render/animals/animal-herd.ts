import type { Object3D } from 'three';
import { logger, type EnclosureId, type GridSize, type Result, type SpeciesId } from '@/shared';
import {
  createRng,
  randomFloat,
  randomInt,
  type EnclosureState,
  type GameEvent,
  type SpeciesProgress,
} from '@/sim';
import {
  cloneAnimalSource,
  createAnimalModel,
  disposeAnimalSource,
  type AnimalAnimation,
  type AnimalModel,
  type AnimalModelProblem,
  type AnimalSource,
} from './animal-model';
import { createAnimalSlot, type AnimalSlot, type AnimalSlotProblem } from './animal-slot';
import {
  advanceBehaviour,
  createBehaviour,
  failTravel,
  isTravelling,
  type AnimalBehaviour,
  type BehaviourContext,
} from './behaviour';
import {
  PATH_MARGIN_M,
  createEnclosureArea,
  pickDestination,
  placeInterestPoints,
  segmentStaysInside,
  type EnclosureArea,
  type InterestPoints,
  type Point2,
} from './enclosure-area';
import {
  createSteerBody,
  steerStep,
  type SteerBody,
  type SteerLimits,
  type SteerWorld,
} from './steering';

/** Owned by the render layer, never the simulation's: how animals look has no effect on the game. */
const HERD_SEED = 0x20_05_a1;
/** The signature clip that is played at the water instead of on the spot. */
const SWIM_SIGNATURE = 'swim';

/** Animals further from the camera than this are animated less often. */
export const FAR_DISTANCE_M = 30;
/** A far animal is updated one frame out of this many, with the time of all of them. */
export const FAR_UPDATE_EVERY_FRAMES = 4;
/** A longer gap (a stalled tab) is cut down, so that steering stays stable. */
const MAX_STEP_MS = 200;
const MS_PER_SECOND = 1000;

const TIME_SCALE_MIN = 0.9;
const TIME_SCALE_MAX = 1.1;
const MAX_SPEED_MIN_MPS = 0.45;
const MAX_SPEED_MAX_MPS = 0.75;
const MAX_ACCEL_MPS2 = 0.5;
const MAX_TURN_RATE_RAD_S = 1.6;
const MIN_TRIP_M = 1.5;
const MAX_TRIP_M = 8;
const EXPLORE_MAX_TRIP_M = 3.5;
const START_SPACING_M = 1.5;
const START_ATTEMPTS = 10;
const TWO_PI = Math.PI * 2;

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
  /** Downloads and decodes a model; called once per model, rejects when it cannot. */
  readonly loadSource: (modelId: string) => Promise<AnimalSource>;
}

export interface AnimalHerd {
  /** Rebuilds every group from the state: at start, and after loading a save. */
  syncAll: (world: HerdWorld) => void;
  /** Refreshes only the enclosures the events talk about. */
  handleEvents: (events: readonly GameEvent[], world: HerdWorld) => void;
  /** Moves every animal by `elapsedMs`; far ones are updated less often. */
  update: (elapsedMs: number, cameraX: number, cameraZ: number) => void;
  /** Settles when every animal now in the park has loaded or failed. */
  whenLoaded: () => Promise<void>;
  dispose: () => void;
}

interface Individual {
  readonly slot: AnimalSlot;
  readonly behaviour: AnimalBehaviour;
  readonly body: SteerBody;
  readonly limits: SteerLimits;
  readonly target: Point2;
  shown: AnimalAnimation;
  pendingMs: number;
  skippedFrames: number;
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
  const rng = createRng(HERD_SEED);
  const groups: EnclosureGroup[] = [];
  const sources = new Map<string, SourceEntry>();
  const warned = new Set<string>();
  let disposed = false;

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

  const pickStart = (group: EnclosureGroup, out: Point2): void => {
    const spots = group.area.interior;
    for (let attempt = 0; attempt < START_ATTEMPTS; attempt += 1) {
      const spot = spots[randomInt(rng, 0, spots.length - 1)];
      if (spot === undefined) {
        return;
      }
      out.x = spot.x;
      out.z = spot.z;
      const crowded = group.bodies.some(
        (other) => Math.hypot(other.x - spot.x, other.z - spot.z) < START_SPACING_M,
      );
      if (!crowded) {
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
      timeScale: lerp(TIME_SCALE_MIN, TIME_SCALE_MAX, randomFloat(rng)),
    };
    const limits: SteerLimits = {
      maxSpeed: lerp(MAX_SPEED_MIN_MPS, MAX_SPEED_MAX_MPS, randomFloat(rng)),
      maxAccel: MAX_ACCEL_MPS2,
      maxTurnRate: MAX_TURN_RATE_RAD_S,
    };
    const body = createSteerBody(start.x, start.z, yaw);
    const behaviour = createBehaviour(rng, group.context, withArrival);
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
    group.bodies.push(body);
    group.individuals.push({
      slot,
      behaviour,
      body,
      limits,
      target: { x: start.x, z: start.z },
      shown: 'idle',
      pendingMs: 0,
      // Spread far animals over the frames instead of updating them all in the same one.
      skippedFrames: group.individuals.length % FAR_UPDATE_EVERY_FRAMES,
    });
  };

  const removeLastIndividual = (group: EnclosureGroup): void => {
    group.individuals.pop()?.slot.dispose();
    group.bodies.pop();
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
      steer: { area, others: bodies, scratch: { x: 0, z: 0 } },
    };
  };

  const rebuild = (enclosure: EnclosureState, world: HerdWorld, withArrival: boolean): void => {
    removeGroup(enclosure.id);
    const group = createGroup(enclosure, world);
    if (group === null || enclosure.speciesId === null) {
      return;
    }
    groups.push(group);
    const size = progressOf(world, enclosure.speciesId)?.groupSize ?? 0;
    for (let index = 0; index < size; index += 1) {
      addIndividual(group, withArrival);
    }
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
    while (group.individuals.length < progress.groupSize) {
      addIndividual(group, true);
    }
    while (group.individuals.length > progress.groupSize) {
      removeLastIndividual(group);
    }
  };

  const giveDestination = (group: EnclosureGroup, individual: Individual): void => {
    const { behaviour, body, target } = individual;
    behaviour.needsDestination = false;
    let found = false;
    if (behaviour.destination === 'free') {
      const maxTrip = behaviour.shortTrip ? EXPLORE_MAX_TRIP_M : MAX_TRIP_M;
      found = pickDestination(group.area, rng, body, MIN_TRIP_M, maxTrip, target);
    } else {
      const spot =
        behaviour.destination === 'water'
          ? group.pois.water
          : group.pois.enrichment[behaviour.enrichmentSpot];
      if (
        spot !== null &&
        spot !== undefined &&
        segmentStaysInside(group.area, body.x, body.z, spot.x, spot.z, PATH_MARGIN_M)
      ) {
        target.x = spot.x;
        target.z = spot.z;
        found = true;
      }
    }
    if (found) {
      body.arrived = false;
    } else {
      failTravel(behaviour, rng);
    }
  };

  const tick = (group: EnclosureGroup, individual: Individual, elapsedMs: number): void => {
    const model = individual.slot.model();
    if (model === undefined) {
      return;
    }
    const { behaviour, body } = individual;
    advanceBehaviour(behaviour, elapsedMs, body.arrived, rng, group.context);
    if (behaviour.needsDestination) {
      giveDestination(group, individual);
    }
    steerStep(
      body,
      individual.limits,
      group.steer,
      isTravelling(behaviour.activity),
      individual.target.x,
      individual.target.z,
      elapsedMs / MS_PER_SECOND,
    );
    model.root.position.set(body.x, 0, body.z);
    model.root.rotation.y = body.yaw;
    if (individual.shown !== behaviour.animation) {
      model.play(behaviour.animation);
      individual.shown = behaviour.animation;
    }
    individual.slot.update(elapsedMs);
  };

  const farSquared = FAR_DISTANCE_M * FAR_DISTANCE_M;

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
    update: (elapsedMs, cameraX, cameraZ) => {
      for (const group of groups) {
        for (const individual of group.individuals) {
          individual.pendingMs += elapsedMs;
          const dx = individual.body.x - cameraX;
          const dz = individual.body.z - cameraZ;
          if (dx * dx + dz * dz > farSquared) {
            individual.skippedFrames += 1;
            if (individual.skippedFrames < FAR_UPDATE_EVERY_FRAMES) {
              continue;
            }
          }
          individual.skippedFrames = 0;
          const step = Math.min(individual.pendingMs, MAX_STEP_MS);
          individual.pendingMs = 0;
          tick(group, individual, step);
        }
      }
    },
    whenLoaded: async () => {
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
