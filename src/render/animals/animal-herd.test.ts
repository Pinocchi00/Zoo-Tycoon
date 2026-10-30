import {
  AnimationClip,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  VectorKeyframeTrack,
  type Object3D,
} from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createGridSize,
  enclosureId,
  logger,
  speciesId,
  type EnclosureId,
  type Result,
  type SpeciesId,
} from '@/shared';
import type { EnclosureState, GameEvent, GridPoint } from '@/sim';
import type { AnimalSource } from './animal-model';
import {
  FAR_DISTANCE_M,
  MAX_ACCEL_MPS2,
  MAX_SPEED_MAX_MPS,
  FAR_UPDATE_EVERY_FRAMES,
  createAnimalHerd,
  type HerdWorld,
  type SpeciesLook,
} from './animal-herd';
import {
  APPROACH_RADIUS_M,
  containsPoint,
  createEnclosureArea,
  placeInterestPoints,
} from './enclosure-area';

function unwrap<T>(result: Result<T, string>): T {
  if (!result.ok) {
    throw new Error(result.error);
  }
  return result.value;
}

const GRID = createGridSize(40, 30);
const FRAME_MS = 100;
/** A close view: only the distance to what is looked at tells near from far. */
const NEAR_VIEW_M = 6;
const SIGNATURE_SCALE = 3;
const CLIP_LENGTH_S = 10;
const CAPYBARA = unwrap(speciesId('capybara'));
const JAGUAR = unwrap(speciesId('jaguar'));
const GHOST = unwrap(speciesId('ghost'));
const BROKEN = unwrap(speciesId('broken'));

const LOOKS = new Map<SpeciesId, SpeciesLook>([
  [CAPYBARA, { modelId: 'capybara', hasWater: true }],
  [JAGUAR, { modelId: 'jaguar', hasWater: false }],
  [GHOST, { modelId: null, hasWater: false }],
  [BROKEN, { modelId: 'broken', hasWater: false }],
]);

const SQUARE: readonly GridPoint[] = [
  { x: 10, y: 10 },
  { x: 20, y: 10 },
  { x: 20, y: 20 },
  { x: 10, y: 20 },
];
const L_SHAPE: readonly GridPoint[] = [
  { x: 10, y: 10 },
  { x: 14, y: 10 },
  { x: 14, y: 14 },
  { x: 24, y: 14 },
  { x: 24, y: 24 },
  { x: 10, y: 24 },
];
const FAR_AWAY_SQUARE: readonly GridPoint[] = [
  { x: 28, y: 4 },
  { x: 36, y: 4 },
  { x: 36, y: 12 },
  { x: 28, y: 12 },
];

/** Idle breathes (scales the body); the other clips only nudge it, so each is visible alone. */
function fakeSource(signature: string): AnimalSource {
  const mesh = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
  mesh.name = 'body';
  const scene = new Group();
  scene.add(mesh);
  const nudge = (name: string): AnimationClip =>
    new AnimationClip(name, CLIP_LENGTH_S, [
      new VectorKeyframeTrack('body.position', [0, CLIP_LENGTH_S], [0, 0, 0, 0, 0, 0]),
    ]);
  // The signature scales the body to a value no other clip reaches, so it can be spotted.
  const signatureClip = new AnimationClip(signature, CLIP_LENGTH_S, [
    new VectorKeyframeTrack('body.scale', [0, CLIP_LENGTH_S], Array(6).fill(SIGNATURE_SCALE)),
  ]);
  const idle = new AnimationClip('idle', CLIP_LENGTH_S, [
    new VectorKeyframeTrack('body.scale', [0, CLIP_LENGTH_S], [1, 1, 1, 2, 2, 2]),
  ]);
  return {
    scene,
    animations: [idle, nudge('walk'), nudge('sleep'), nudge('eat'), signatureClip],
  };
}

function outlineEnclosure(
  name: string,
  outline: readonly GridPoint[],
  species: SpeciesId | null,
): EnclosureState {
  return { id: unwrap(enclosureId(name)), outline, speciesId: species, viewScore: 0 };
}

function worldOf(
  enclosures: readonly EnclosureState[],
  collection: readonly { speciesId: SpeciesId; stars: number; groupSize: number }[],
): HerdWorld {
  return { enclosures, gacha: { collection } };
}

function setup(): {
  herd: ReturnType<typeof createAnimalHerd>;
  parent: Group;
  downloads: string[];
} {
  const parent = new Group();
  const downloads: string[] = [];
  const herd = createAnimalHerd({
    parent,
    grid: GRID,
    lookupSpecies: (id) => LOOKS.get(id),
    loadSource: (modelId) => {
      downloads.push(modelId);
      return modelId === 'broken'
        ? Promise.reject(new Error('404'))
        : Promise.resolve(fakeSource(modelId === 'capybara' ? 'swim' : 'stretch'));
    },
  });
  return { herd, parent, downloads };
}

function run(herd: ReturnType<typeof createAnimalHerd>, seconds: number, camera = [0, 0]): void {
  const [cameraX = 0, cameraZ = 0] = camera;
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += FRAME_MS) {
    herd.update(FRAME_MS, cameraX, cameraZ, NEAR_VIEW_M);
  }
}

function positions(parent: Object3D): string[] {
  return parent.children.map(
    (child) => `${child.position.x.toFixed(3)},${child.position.z.toFixed(3)}`,
  );
}

function eventOf(event: GameEvent): readonly GameEvent[] {
  return [event];
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('syncAll', () => {
  it('shows the whole group of each enclosure, downloading each model once', async () => {
    const { herd, parent, downloads } = setup();
    const world = worldOf(
      [
        outlineEnclosure('enclosure-1', SQUARE, CAPYBARA),
        outlineEnclosure('enclosure-2', L_SHAPE, JAGUAR),
        outlineEnclosure('enclosure-3', FAR_AWAY_SQUARE, CAPYBARA),
        outlineEnclosure('enclosure-4', [], null),
      ],
      [
        { speciesId: CAPYBARA, stars: 1, groupSize: 3 },
        { speciesId: JAGUAR, stars: 1, groupSize: 2 },
      ],
    );
    herd.syncAll(world);
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(3 + 2 + 3);
    expect(downloads.sort()).toEqual(['capybara', 'jaguar']);
  });

  it('shows nothing for a species without a model, an unknown one or a group of zero', async () => {
    const { herd, parent, downloads } = setup();
    const unknown = unwrap(speciesId('unknown'));
    herd.syncAll(
      worldOf(
        [
          outlineEnclosure('enclosure-1', SQUARE, GHOST),
          outlineEnclosure('enclosure-2', L_SHAPE, unknown),
          outlineEnclosure('enclosure-3', FAR_AWAY_SQUARE, JAGUAR),
        ],
        [
          { speciesId: GHOST, stars: 1, groupSize: 2 },
          { speciesId: unknown, stars: 1, groupSize: 2 },
        ],
      ),
    );
    await herd.whenLoaded();
    expect(parent.children).toEqual([]);
    expect(downloads).toEqual([]);
  });

  it('replaces what was there before', async () => {
    const { herd, parent } = setup();
    const collection = [{ speciesId: CAPYBARA, stars: 1, groupSize: 2 }];
    herd.syncAll(worldOf([outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)], collection));
    herd.syncAll(worldOf([outlineEnclosure('enclosure-2', L_SHAPE, CAPYBARA)], collection));
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(2);
  });

  it('warns once, does not throw and shows nothing when a model cannot be downloaded', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, BROKEN)],
        [{ speciesId: BROKEN, stars: 1, groupSize: 3 }],
      ),
    );
    await herd.whenLoaded();
    herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
    expect(parent.children).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });

  it('warns about a model whose clips are wrong', async () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => undefined);
    const parent = new Group();
    const herd = createAnimalHerd({
      parent,
      grid: GRID,
      lookupSpecies: (id) => LOOKS.get(id),
      loadSource: () => Promise.resolve({ scene: new Group(), animations: [] }),
    });
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: 2 }],
      ),
    );
    await herd.whenLoaded();
    expect(parent.children).toEqual([]);
    expect(warn).toHaveBeenCalledOnce();
  });
});

describe('life in the enclosure', () => {
  it('keeps every animal inside a non-convex enclosure, always', async () => {
    const { herd, parent } = setup();
    const area = createEnclosureArea(L_SHAPE, GRID);
    if (area === null) {
      throw new Error('expected an area');
    }
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', L_SHAPE, JAGUAR)],
        [{ speciesId: JAGUAR, stars: 1, groupSize: 5 }],
      ),
    );
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(5);
    for (let minute = 0; minute < 20; minute += 1) {
      run(herd, 60);
      for (const child of parent.children) {
        expect(containsPoint(area, child.position.x, child.position.z)).toBe(true);
      }
    }
  });

  it('moves gently: speed and acceleration never exceed their limits, with no abrupt stop', async () => {
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: 4 }],
      ),
    );
    await herd.whenLoaded();
    const dtS = FRAME_MS / 1000;
    const TOLERANCE = 1e-6;
    let previous = parent.children.map((child) => child.position.clone());
    let previousSpeeds = parent.children.map(() => 0);
    let moved = 0;
    for (let frame = 0; frame < 3000; frame += 1) {
      herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
      const speeds = parent.children.map(
        (child, index) => child.position.distanceTo(previous[index] ?? child.position) / dtS,
      );
      speeds.forEach((speed, index) => {
        expect(speed).toBeLessThanOrEqual(MAX_SPEED_MAX_MPS + TOLERANCE);
        expect(Math.abs(speed - (previousSpeeds[index] ?? 0))).toBeLessThanOrEqual(
          MAX_ACCEL_MPS2 * dtS + TOLERANCE,
        );
        moved += speed > 0 ? 1 : 0;
      });
      previous = parent.children.map((child) => child.position.clone());
      previousSpeeds = speeds;
    }
    expect(moved).toBeGreaterThan(100);
  });

  it('keeps the animals of a group apart from each other, resting or walking', async () => {
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 3, groupSize: 5 }],
      ),
    );
    await herd.whenLoaded();
    const MIN_WALKING_APART_M = 0.3;
    const MIN_RESTING_APART_M = 0.7;
    let closest = Number.POSITIVE_INFINITY;
    let closestAtRest = Number.POSITIVE_INFINITY;
    let previous = parent.children.map((child) => child.position.clone());
    for (let frame = 0; frame < 12_000; frame += 1) {
      herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
      const still = parent.children.map(
        (child, index) => child.position.distanceTo(previous[index] ?? child.position) < 1e-9,
      );
      for (const [index, first] of parent.children.entries()) {
        for (const [offset, second] of parent.children.slice(index + 1).entries()) {
          const apart = first.position.distanceTo(second.position);
          closest = Math.min(closest, apart);
          if (still[index] === true && still[index + 1 + offset] === true) {
            closestAtRest = Math.min(closestAtRest, apart);
          }
        }
      }
      previous = parent.children.map((child) => child.position.clone());
    }
    expect(closest).toBeGreaterThan(MIN_WALKING_APART_M);
    expect(closestAtRest).toBeGreaterThan(MIN_RESTING_APART_M);
  });

  it('plays a swimming signature at the water only, from the very first routine', async () => {
    const area = createEnclosureArea(SQUARE, GRID);
    if (area === null) {
      throw new Error('expected an area');
    }
    const enclosure = outlineEnclosure('enclosure-1', SQUARE, CAPYBARA);
    const water = placeInterestPoints(area, enclosure.id, true, 3).water;
    if (water === null) {
      throw new Error('expected a water point');
    }
    const { herd, parent } = setup();
    herd.syncAll(worldOf([enclosure], [{ speciesId: CAPYBARA, stars: 3, groupSize: 4 }]));
    await herd.whenLoaded();
    let swimming = 0;
    for (let frame = 0; frame < 18_000; frame += 1) {
      herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
      for (const child of parent.children) {
        if ((child.getObjectByName('body')?.scale.x ?? 0) > SIGNATURE_SCALE - 0.01) {
          swimming += 1;
          const away = Math.hypot(child.position.x - water.x, child.position.z - water.z);
          expect(away).toBeLessThan(APPROACH_RADIUS_M + 0.5);
        }
      }
    }
    expect(swimming).toBeGreaterThan(0);
  });

  it('keeps the animals of a group out of step with each other', async () => {
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: 5 }],
      ),
    );
    await herd.whenLoaded();
    const starts = positions(parent);
    expect(new Set(starts).size).toBe(5);
    run(herd, 90);
    expect(new Set(positions(parent)).size).toBe(5);
  });

  it('breathes out of step: each newcomer starts at its own point of the loop', async () => {
    const { herd, parent } = setup();
    const empty = outlineEnclosure('enclosure-1', SQUARE, null);
    const collection = [{ speciesId: CAPYBARA, stars: 1, groupSize: 5 }];
    herd.handleEvents(
      eventOf({ type: 'enclosureGroupChanged', enclosureId: empty.id, speciesId: CAPYBARA }),
      worldOf([{ ...empty, speciesId: CAPYBARA }], collection),
    );
    await herd.whenLoaded();
    // Newcomers hesitate, standing idle: their breathing is all there is to tell apart.
    run(herd, 1);
    const scales = parent.children.map((child) =>
      child.getObjectByName('body')?.scale.x.toFixed(4),
    );
    expect(new Set(scales).size).toBe(5);
  });

  it('is repeatable: two herds from the same state live the same life', async () => {
    const world = worldOf(
      [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
      [{ speciesId: CAPYBARA, stars: 3, groupSize: 3 }],
    );
    const lives: string[][] = [];
    for (let copy = 0; copy < 2; copy += 1) {
      const { herd, parent } = setup();
      herd.syncAll(world);
      await herd.whenLoaded();
      run(herd, 120);
      lives.push(positions(parent));
    }
    expect(lives[0]).toEqual(lives[1]);
  });

  it('spends its time at its enrichment points when the habitat has stars', async () => {
    const area = createEnclosureArea(SQUARE, GRID);
    if (area === null) {
      throw new Error('expected an area');
    }
    const enclosure = outlineEnclosure('enclosure-1', SQUARE, JAGUAR);
    const spots = placeInterestPoints(area, enclosure.id, false, 5).enrichment;
    expect(spots).toHaveLength(4);
    const REACHED_M = APPROACH_RADIUS_M + 0.3;
    const hour = (60 * 60 * 1000) / FRAME_MS;
    const framesAtSpots = async (stars: number): Promise<number> => {
      const { herd, parent } = setup();
      herd.syncAll(worldOf([enclosure], [{ speciesId: JAGUAR, stars, groupSize: 4 }]));
      await herd.whenLoaded();
      let frames = 0;
      for (let frame = 0; frame < hour; frame += 1) {
        herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
        for (const child of parent.children) {
          const near = spots.some(
            (spot) => Math.hypot(child.position.x - spot.x, child.position.z - spot.z) < REACHED_M,
          );
          frames += near ? 1 : 0;
        }
      }
      return frames;
    };
    // At one star the animals only pass by those places by chance.
    const rich = await framesAtSpots(5);
    const poor = await framesAtSpots(1);
    expect(rich).toBeGreaterThan(1.5 * poor);
  });
});

describe('arrival of a group', () => {
  it('shows the new group still at first, then exploring', async () => {
    const { herd, parent } = setup();
    const empty = outlineEnclosure('enclosure-1', SQUARE, null);
    const collection = [{ speciesId: CAPYBARA, stars: 1, groupSize: 3 }];
    herd.syncAll(worldOf([empty], collection));
    expect(parent.children).toEqual([]);

    const filled = { ...empty, speciesId: CAPYBARA };
    herd.handleEvents(
      eventOf({ type: 'enclosureGroupChanged', enclosureId: empty.id, speciesId: CAPYBARA }),
      worldOf([filled], collection),
    );
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(3);
    const start = positions(parent);
    // Every animal hesitates for at least a second and a half.
    run(herd, 1.4);
    expect(positions(parent)).toEqual(start);
    run(herd, 60);
    expect(positions(parent)).not.toEqual(start);
  });

  it('adds the new individuals of an arrival to the existing group', async () => {
    const { herd, parent } = setup();
    const enclosure = outlineEnclosure('enclosure-1', SQUARE, CAPYBARA);
    herd.syncAll(worldOf([enclosure], [{ speciesId: CAPYBARA, stars: 1, groupSize: 2 }]));
    await herd.whenLoaded();
    const before = [...parent.children];

    const grown = [{ speciesId: CAPYBARA, stars: 2, groupSize: 3 }];
    herd.handleEvents(
      eventOf({
        type: 'arrivalOpened',
        number: 5,
        bannerId: null,
        speciesId: CAPYBARA,
        rarity: 'common',
        source: 'draw',
        isNew: false,
        stars: 2,
        groupSize: 3,
        medalsEarned: 0,
      }),
      worldOf([enclosure], grown),
    );
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(3);
    expect(parent.children.slice(0, 2)).toEqual(before);
  });

  it('only touches the enclosure of the species that arrived', async () => {
    const { herd, parent } = setup();
    const world = worldOf(
      [
        outlineEnclosure('enclosure-1', SQUARE, CAPYBARA),
        outlineEnclosure('enclosure-2', L_SHAPE, JAGUAR),
      ],
      [
        { speciesId: CAPYBARA, stars: 1, groupSize: 2 },
        { speciesId: JAGUAR, stars: 1, groupSize: 2 },
      ],
    );
    herd.syncAll(world);
    await herd.whenLoaded();
    const before = [...parent.children];
    herd.handleEvents(
      eventOf({
        type: 'arrivalOpened',
        number: 6,
        bannerId: null,
        speciesId: JAGUAR,
        rarity: 'common',
        source: 'draw',
        isNew: false,
        stars: 1,
        groupSize: 3,
        medalsEarned: 0,
      }),
      worldOf(world.enclosures, [
        { speciesId: CAPYBARA, stars: 1, groupSize: 2 },
        { speciesId: JAGUAR, stars: 1, groupSize: 3 },
      ]),
    );
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(5);
    expect(parent.children.slice(0, 4)).toEqual(before);
  });
});

describe('enclosure events', () => {
  const collection = [
    { speciesId: CAPYBARA, stars: 1, groupSize: 2 },
    { speciesId: JAGUAR, stars: 1, groupSize: 2 },
  ];

  it('builds, moves, changes and removes a group as the enclosure does', async () => {
    const { herd, parent } = setup();
    const id: EnclosureId = unwrap(enclosureId('enclosure-1'));
    const built = outlineEnclosure('enclosure-1', SQUARE, CAPYBARA);
    herd.handleEvents(
      eventOf({
        type: 'enclosurePlaced',
        cause: 'command',
        enclosureId: id,
        speciesId: CAPYBARA,
      }),
      worldOf([built], collection),
    );
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(2);

    const moved = { ...built, outline: FAR_AWAY_SQUARE };
    herd.handleEvents(
      eventOf({ type: 'enclosureMoved', cause: 'command', enclosureId: id }),
      worldOf([moved], collection),
    );
    await herd.whenLoaded();
    const area = createEnclosureArea(FAR_AWAY_SQUARE, GRID);
    if (area === null) {
      throw new Error('expected an area');
    }
    expect(parent.children).toHaveLength(2);
    for (const child of parent.children) {
      expect(containsPoint(area, child.position.x, child.position.z)).toBe(true);
    }

    const changed = { ...moved, speciesId: JAGUAR };
    herd.handleEvents(
      eventOf({ type: 'enclosureGroupChanged', enclosureId: id, speciesId: JAGUAR }),
      worldOf([changed], collection),
    );
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(2);

    herd.handleEvents(
      eventOf({ type: 'enclosureGroupChanged', enclosureId: id, speciesId: null }),
      worldOf([{ ...changed, speciesId: null }], collection),
    );
    expect(parent.children).toEqual([]);

    herd.handleEvents(
      eventOf({ type: 'enclosureGroupChanged', enclosureId: id, speciesId: CAPYBARA }),
      worldOf([{ ...changed, speciesId: CAPYBARA }], collection),
    );
    await herd.whenLoaded();
    expect(parent.children).toHaveLength(2);
    herd.handleEvents(
      eventOf({ type: 'enclosureRemoved', enclosureId: id, returnedSpeciesId: CAPYBARA }),
      worldOf([], collection),
    );
    expect(parent.children).toEqual([]);
  });

  it('ignores events that are not about enclosures or arrivals', async () => {
    const { herd, parent } = setup();
    herd.syncAll(worldOf([outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)], collection));
    await herd.whenLoaded();
    const before = [...parent.children];
    herd.handleEvents(eventOf({ type: 'coinsAdded', amount: 5, total: 5 }), worldOf([], []));
    herd.handleEvents([], worldOf([], []));
    expect(parent.children).toEqual(before);
  });

  it('removes an animal whose enclosure vanished from the state', async () => {
    const { herd, parent } = setup();
    const built = outlineEnclosure('enclosure-1', SQUARE, CAPYBARA);
    herd.syncAll(worldOf([built], collection));
    await herd.whenLoaded();
    herd.handleEvents(
      eventOf({ type: 'enclosureMoved', cause: 'undo', enclosureId: built.id }),
      worldOf([], collection),
    );
    expect(parent.children).toEqual([]);
  });
});

describe('animals far from the camera', () => {
  const FAR_CAMERA: [number, number] = [FAR_DISTANCE_M * 10, 0];

  async function lonelyAnimal(): Promise<{
    herd: ReturnType<typeof createAnimalHerd>;
    breathing: () => number;
  }> {
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: 1 }],
      ),
    );
    await herd.whenLoaded();
    const breathing = (): number => parent.children[0]?.getObjectByName('body')?.scale.x ?? 0;
    return { herd, breathing };
  }

  it('animates a near animal at every image', async () => {
    const { herd, breathing } = await lonelyAnimal();
    expect(breathing()).toBe(1);
    herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
    expect(breathing()).toBeGreaterThan(1);
  });

  it('animates a far animal only once in a few images, with the time of all of them', async () => {
    const { herd, breathing } = await lonelyAnimal();
    const [cameraX, cameraZ] = FAR_CAMERA;
    for (let frame = 1; frame < FAR_UPDATE_EVERY_FRAMES; frame += 1) {
      herd.update(FRAME_MS, cameraX, cameraZ, NEAR_VIEW_M);
      expect(breathing()).toBe(1);
    }
    herd.update(FRAME_MS, cameraX, cameraZ, NEAR_VIEW_M);
    expect(breathing()).toBeGreaterThan(1);
  });

  it('counts a wide view as far, even for an animal at the centre of it', async () => {
    const { herd, breathing } = await lonelyAnimal();
    const WIDE_VIEW_M = FAR_DISTANCE_M * 2;
    for (let frame = 1; frame < FAR_UPDATE_EVERY_FRAMES; frame += 1) {
      herd.update(FRAME_MS, 0, 0, WIDE_VIEW_M);
      expect(breathing()).toBe(1);
    }
    herd.update(FRAME_MS, 0, 0, WIDE_VIEW_M);
    expect(breathing()).toBeGreaterThan(1);
  });

  it('keeps far animals spread over the images, even when they all turn far at once', async () => {
    const { herd, parent } = setup();
    const empty = outlineEnclosure('enclosure-1', SQUARE, null);
    const collection = [{ speciesId: CAPYBARA, stars: 1, groupSize: FAR_UPDATE_EVERY_FRAMES }];
    herd.handleEvents(
      eventOf({ type: 'enclosureGroupChanged', enclosureId: empty.id, speciesId: CAPYBARA }),
      worldOf([{ ...empty, speciesId: CAPYBARA }], collection),
    );
    await herd.whenLoaded();
    // They hesitate, idle, for a second and a half at least: only their breathing changes.
    for (let frame = 0; frame < 3; frame += 1) {
      herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
    }
    const breaths = (): number[] =>
      parent.children.map((child) => child.getObjectByName('body')?.scale.x ?? 0);
    let previous = breaths();
    for (let frame = 0; frame < 2 * FAR_UPDATE_EVERY_FRAMES; frame += 1) {
      herd.update(FRAME_MS, 1000, 0, NEAR_VIEW_M);
      const now = breaths();
      const updated = now.filter((value, index) => value !== previous[index]).length;
      expect(updated).toBe(1);
      previous = now;
    }
  });
});

describe('dispose', () => {
  it('removes every animal and frees the downloaded models', async () => {
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: 3 }],
      ),
    );
    await herd.whenLoaded();
    herd.dispose();
    expect(parent.children).toEqual([]);
    herd.update(FRAME_MS, 0, 0, NEAR_VIEW_M);
  });

  it('drops an animal whose model finishes loading afterwards', async () => {
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: 3 }],
      ),
    );
    const loaded = herd.whenLoaded();
    herd.dispose();
    await loaded;
    expect(parent.children).toEqual([]);
  });
});
