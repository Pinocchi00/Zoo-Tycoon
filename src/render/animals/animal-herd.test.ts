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
import type { EnclosureState, FocusArea, GameEvent, GridPoint } from '@/sim';
import { walkClipScale, type AnimalSource } from './animal-model';
import type { Activity } from './behaviour';
import {
  MAX_ACCEL_MPS2,
  MAX_SPEED_MAX_MPS,
  HIDDEN_UPDATE_EVERY_FRAMES,
  SMALL_ON_SCREEN_PX,
  SMALL_UPDATE_EVERY_FRAMES,
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
const MODEL_LENGTH_M = 1.18;
const VIEWPORT_PX = 600;
/** Pixels per metre of a view `height` metres tall on a viewport of 600 pixels. */
function scaleAt(viewHeightM: number): number {
  return VIEWPORT_PX / viewHeightM;
}
/** Close enough for any animal to be big on screen. */
const CLOSE_SCALE = scaleAt(6);
const ALL_VISIBLE: FocusArea = {
  minColumn: 0,
  minRow: 0,
  maxColumn: GRID.columns - 1,
  maxRow: GRID.rows - 1,
};
const NOTHING_VISIBLE: FocusArea = { minColumn: 1, minRow: 1, maxColumn: 0, maxRow: 0 };
const SIGNATURE_SCALE = 3;
/** Sleeping moves the body this far along z: a mark no other clip leaves. */
const SLEEP_MARK_M = 2;
/** The walk clip slides the body along x, this many metres a second at a clip speed of 1. */
const WALK_SLIDE_PER_S = 1;
/** Eating lifts the body by this much: a mark no other clip leaves. */
const EAT_LIFT_M = 1;
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

/** Each clip leaves its own mark on the body, so that each is visible alone. */
function fakeSource(signature: string): AnimalSource {
  const mesh = new Mesh(new BoxGeometry(0.5, 0.7, MODEL_LENGTH_M), new MeshStandardMaterial());
  mesh.name = 'body';
  const scene = new Group();
  scene.add(mesh);
  // The signature scales the body to a value no other clip reaches, so it can be spotted.
  const signatureClip = new AnimationClip(signature, CLIP_LENGTH_S, [
    new VectorKeyframeTrack('body.scale', [0, CLIP_LENGTH_S], Array(6).fill(SIGNATURE_SCALE)),
  ]);
  const walkClip = new AnimationClip('walk', CLIP_LENGTH_S, [
    new VectorKeyframeTrack(
      'body.position',
      [0, CLIP_LENGTH_S],
      [0, 0, 0, WALK_SLIDE_PER_S * CLIP_LENGTH_S, 0, 0],
    ),
  ]);
  const sleepClip = new AnimationClip('sleep', CLIP_LENGTH_S, [
    new VectorKeyframeTrack(
      'body.position',
      [0, CLIP_LENGTH_S],
      [0, 0, SLEEP_MARK_M, 0, 0, SLEEP_MARK_M],
    ),
  ]);
  const eatClip = new AnimationClip('eat', CLIP_LENGTH_S, [
    new VectorKeyframeTrack(
      'body.position',
      [0, CLIP_LENGTH_S],
      [0, EAT_LIFT_M, 0, 0, EAT_LIFT_M, 0],
    ),
  ]);
  const idle = new AnimationClip('idle', CLIP_LENGTH_S, [
    new VectorKeyframeTrack('body.scale', [0, CLIP_LENGTH_S], [1, 1, 1, 2, 2, 2]),
  ]);
  return {
    scene,
    animations: [idle, walkClip, sleepClip, eatClip, signatureClip],
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

function run(herd: ReturnType<typeof createAnimalHerd>, seconds: number): void {
  for (let elapsed = 0; elapsed < seconds * 1000; elapsed += FRAME_MS) {
    herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
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
    herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
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
      herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
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
      herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
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
      herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
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
    // The ring where animals stand around a point, the middle being left to the element.
    const RING_MIN_M = 0.6;
    const RING_MAX_M = 1.2;
    const hour = (60 * 60 * 1000) / FRAME_MS;
    const framesAtSpots = async (stars: number): Promise<number> => {
      const { herd, parent } = setup();
      herd.syncAll(worldOf([enclosure], [{ speciesId: JAGUAR, stars, groupSize: 4 }]));
      await herd.whenLoaded();
      let frames = 0;
      for (let frame = 0; frame < hour; frame += 1) {
        herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
        for (const child of parent.children) {
          // Fully eating (body lifted) or playing (body scaled): marks no other clip leaves.
          const body = child.getObjectByName('body');
          const busy =
            (body?.scale.x ?? 0) > SIGNATURE_SCALE - 0.1 ||
            (body?.position.y ?? 0) > EAT_LIFT_M - 0.1;
          const onRing = spots.some((spot) => {
            const away = Math.hypot(child.position.x - spot.x, child.position.z - spot.z);
            return away >= RING_MIN_M && away <= RING_MAX_M;
          });
          frames += busy && onRing ? 1 : 0;
        }
      }
      return frames;
    };
    // At one star the animals only happen to eat or play near those places.
    const rich = await framesAtSpots(5);
    const poor = await framesAtSpots(1);
    expect(rich).toBeGreaterThan(3 * poor);
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

describe('animation rate by size on screen', () => {
  async function group(size: number): Promise<{
    herd: ReturnType<typeof createAnimalHerd>;
    parent: Group;
    breaths: () => number[];
  }> {
    const { herd, parent } = setup();
    const empty = outlineEnclosure('enclosure-1', SQUARE, null);
    herd.handleEvents(
      eventOf({ type: 'enclosureGroupChanged', enclosureId: empty.id, speciesId: CAPYBARA }),
      worldOf(
        [{ ...empty, speciesId: CAPYBARA }],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: size }],
      ),
    );
    await herd.whenLoaded();
    const breaths = (): number[] =>
      parent.children.map((child) => child.getObjectByName('body')?.scale.x ?? 0);
    return { herd, parent, breaths };
  }

  /** Newcomers hesitate, standing idle, for a second and a half at least: only their breathing changes. */
  function updatedPerImage(
    before: number[],
    herd: ReturnType<typeof createAnimalHerd>,
    scale: number,
    visible: FocusArea,
    breaths: () => number[],
  ): number {
    herd.update(FRAME_MS, scale, visible);
    const now = breaths();
    return now.filter((value, index) => value !== before[index]).length;
  }

  it('advances every animal at every image in the starting view and at a medium zoom', async () => {
    const MEDIUM_VIEW_M = 30;
    const START_VIEW_M = 40;
    for (const view of [MEDIUM_VIEW_M, START_VIEW_M]) {
      expect(MODEL_LENGTH_M * scaleAt(view)).toBeGreaterThanOrEqual(SMALL_ON_SCREEN_PX);
      const { herd, breaths } = await group(4);
      let previous = breaths();
      for (let frame = 0; frame < 6; frame += 1) {
        expect(updatedPerImage(previous, herd, scaleAt(view), ALL_VISIBLE, breaths)).toBe(4);
        previous = breaths();
      }
    }
  });

  it('advances the animation of tiny animals one image out of two, spread over the images', async () => {
    const WIDEST_VIEW_M = 72;
    expect(MODEL_LENGTH_M * scaleAt(WIDEST_VIEW_M)).toBeLessThan(SMALL_ON_SCREEN_PX);
    const { herd, breaths } = await group(4);
    let previous = breaths();
    for (let frame = 0; frame < 6; frame += 1) {
      const updated = updatedPerImage(previous, herd, scaleAt(WIDEST_VIEW_M), ALL_VISIBLE, breaths);
      expect(updated).toBe(4 / SMALL_UPDATE_EVERY_FRAMES);
      previous = breaths();
    }
  });

  it('keeps the spread when animals turn small after being big', async () => {
    const { herd, breaths } = await group(4);
    herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
    herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
    let previous = breaths();
    const updated = updatedPerImage(previous, herd, scaleAt(72), ALL_VISIBLE, breaths);
    expect(updated).toBe(2);
    previous = breaths();
    expect(updatedPerImage(previous, herd, scaleAt(72), ALL_VISIBLE, breaths)).toBe(2);
  });

  it('advances the animation of animals out of the visible area still less often', async () => {
    const { herd, breaths } = await group(4);
    let previous = breaths();
    for (let frame = 0; frame < 2 * HIDDEN_UPDATE_EVERY_FRAMES; frame += 1) {
      expect(updatedPerImage(previous, herd, CLOSE_SCALE, NOTHING_VISIBLE, breaths)).toBe(1);
      previous = breaths();
    }
  });

  it('moves a tiny or hidden animal exactly as a near one, at every image and without a jump', async () => {
    const world = worldOf(
      [outlineEnclosure('enclosure-1', SQUARE, CAPYBARA)],
      [{ speciesId: CAPYBARA, stars: 3, groupSize: 4 }],
    );
    const lives = new Map<string, string[][]>();
    const viewings: [string, number, FocusArea][] = [
      ['close', CLOSE_SCALE, ALL_VISIBLE],
      ['tiny', scaleAt(72), ALL_VISIBLE],
      ['hidden', CLOSE_SCALE, NOTHING_VISIBLE],
    ];
    for (const [name, scale, visible] of viewings) {
      const { herd, parent } = setup();
      herd.syncAll(world);
      await herd.whenLoaded();
      const dtS = FRAME_MS / 1000;
      let previous = parent.children.map((child) => child.position.clone());
      const trace: string[][] = [];
      for (let frame = 0; frame < 1500; frame += 1) {
        herd.update(FRAME_MS, scale, visible);
        parent.children.forEach((child, index) => {
          const moved = child.position.distanceTo(previous[index] ?? child.position);
          expect(moved / dtS).toBeLessThanOrEqual(MAX_SPEED_MAX_MPS + 1e-6);
        });
        previous = parent.children.map((child) => child.position.clone());
        trace.push(positions(parent));
      }
      lives.set(name, trace);
    }
    expect(lives.get('tiny')).toEqual(lives.get('close'));
    expect(lives.get('hidden')).toEqual(lives.get('close'));
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
    herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
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

describe('life of a big group', () => {
  const BIG_FIELD: readonly GridPoint[] = [
    { x: 3, y: 3 },
    { x: 33, y: 3 },
    { x: 33, y: 25 },
    { x: 3, y: 25 },
  ];
  const TWO_HOURS_FRAMES = (2 * 60 * 60 * 1000) / FRAME_MS;

  interface Sample {
    readonly activities: readonly Activity[];
    readonly x: readonly number[];
    readonly z: readonly number[];
    readonly yaw: readonly number[];
    readonly bodyX: readonly number[];
  }

  async function liveForTwoHours(
    size: number,
    onFrame: (sample: Sample, frame: number) => void,
  ): Promise<void> {
    const { herd, parent } = setup();
    herd.syncAll(
      worldOf(
        [outlineEnclosure('enclosure-1', BIG_FIELD, CAPYBARA)],
        [{ speciesId: CAPYBARA, stars: 1, groupSize: size }],
      ),
    );
    await herd.whenLoaded();
    for (let frame = 0; frame < TWO_HOURS_FRAMES; frame += 1) {
      herd.update(FRAME_MS, CLOSE_SCALE, ALL_VISIBLE);
      const children = parent.children;
      onFrame(
        {
          activities: herd.activities(),
          x: children.map((child) => child.position.x),
          z: children.map((child) => child.position.z),
          yaw: children.map((child) => child.rotation.y),
          bodyX: children.map((child) => child.getObjectByName('body')?.position.x ?? 0),
        },
        frame,
      );
    }
  }

  function distance(sample: Sample, first: number, second: number): number {
    return Math.hypot(
      (sample.x[first] ?? 0) - (sample.x[second] ?? 0),
      (sample.z[first] ?? 0) - (sample.z[second] ?? 0),
    );
  }

  function nearestOther(sample: Sample, index: number, accept: (other: number) => boolean): number {
    let best = Number.POSITIVE_INFINITY;
    for (let other = 0; other < sample.x.length; other += 1) {
      if (other !== index && accept(other)) {
        best = Math.min(best, distance(sample, index, other));
      }
    }
    return best;
  }

  it('shows every kind of gesture and encounter over time', async () => {
    const seen = new Set<Activity>();
    await liveForTwoHours(5, (sample) => {
      for (const activity of sample.activities) {
        seen.add(activity);
      }
    });
    for (const activity of [
      'walk',
      'rest',
      'eat',
      'sleep',
      'lookAround',
      'wayPause',
      'wayInspect',
      'followWalk',
      'sleeperWalk',
      'salute',
    ] as const) {
      expect(seen.has(activity), activity).toBe(true);
    }
  });

  it('lies down next to a sleeping neighbour, in contact but never overlapping', async () => {
    const MIN_APART_M = 0.7;
    const CONTACT_M = 1.7;
    let previous: readonly Activity[] = [];
    let joined = 0;
    let inContact = 0;
    let closest = Number.POSITIVE_INFINITY;
    await liveForTwoHours(5, (sample) => {
      sample.activities.forEach((activity, index) => {
        const sleepers = (other: number): boolean => sample.activities[other] === 'sleep';
        if (activity === 'sleep') {
          closest = Math.min(closest, nearestOther(sample, index, sleepers));
        }
        if (activity === 'sleep' && previous[index] !== 'sleep' && previous[index] !== undefined) {
          const apart = nearestOther(sample, index, sleepers);
          if (Number.isFinite(apart)) {
            joined += 1;
            inContact += apart <= CONTACT_M ? 1 : 0;
          }
        }
      });
      previous = sample.activities;
    });
    expect(joined).toBeGreaterThan(5);
    // Left to chance, a sleeper would land within contact of another in a few cases out of a hundred.
    expect(inContact / joined).toBeGreaterThan(0.35);
    expect(closest).toBeGreaterThan(MIN_APART_M);
  });

  it('follows a walker and ends up close to it', async () => {
    let previous: readonly Activity[] = [];
    const before: number[] = [];
    const after: number[] = [];
    const walking =
      (sample: Sample) =>
      (other: number): boolean =>
        sample.activities[other] === 'walk' || sample.activities[other] === 'followWalk';
    let lastSample: Sample | null = null;
    await liveForTwoHours(5, (sample) => {
      sample.activities.forEach((activity, index) => {
        if (activity === 'followWalk' && previous[index] !== 'followWalk') {
          before.push(nearestOther(sample, index, walking(sample)));
        }
        if (previous[index] === 'followWalk' && activity !== 'followWalk') {
          after.push(nearestOther(sample, index, () => true));
        }
      });
      previous = sample.activities;
      lastSample = sample;
    });
    expect(lastSample).not.toBeNull();
    expect(after.length).toBeGreaterThan(5);
    const finite = before.filter(Number.isFinite);
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(after)).toBeLessThan(mean(finite));
  });

  it('brings back an animal that strayed from the group', async () => {
    let previous: readonly Activity[] = [];
    const before: number[] = [];
    const after: number[] = [];
    const centreDistance = (sample: Sample, index: number): number => {
      let sumX = 0;
      let sumZ = 0;
      let count = 0;
      sample.x.forEach((x, other) => {
        if (other !== index) {
          sumX += x;
          sumZ += sample.z[other] ?? 0;
          count += 1;
        }
      });
      return Math.hypot(
        sumX / count - (sample.x[index] ?? 0),
        sumZ / count - (sample.z[index] ?? 0),
      );
    };
    await liveForTwoHours(4, (sample) => {
      sample.activities.forEach((activity, index) => {
        if (activity === 'regroupWalk' && previous[index] !== 'regroupWalk') {
          before.push(centreDistance(sample, index));
        }
        if (previous[index] === 'regroupWalk' && activity !== 'regroupWalk') {
          after.push(centreDistance(sample, index));
        }
      });
      previous = sample.activities;
    });
    expect(before.length).toBeGreaterThan(3);
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(Math.min(...before)).toBeGreaterThan(6);
    expect(mean(after)).toBeLessThan(mean(before) - 2);
  });

  it('turns two greeting neighbours towards each other', async () => {
    const starts = new Map<number, number>();
    const first: number[] = [];
    const last: number[] = [];
    let previous: readonly Activity[] = [];
    const error = (sample: Sample, index: number): number => {
      const partner = sample.activities.reduce((best, _activity, other) => {
        if (other === index) {
          return best;
        }
        return best < 0 || distance(sample, index, other) < distance(sample, index, best)
          ? other
          : best;
      }, -1);
      const wanted = Math.atan2(
        (sample.x[partner] ?? 0) - (sample.x[index] ?? 0),
        (sample.z[partner] ?? 0) - (sample.z[index] ?? 0),
      );
      const turn = Math.abs((sample.yaw[index] ?? 0) - wanted) % (2 * Math.PI);
      return Math.min(turn, 2 * Math.PI - turn);
    };
    await liveForTwoHours(5, (sample, frame) => {
      sample.activities.forEach((activity, index) => {
        if (activity === 'salute' && previous[index] !== 'salute') {
          starts.set(index, frame);
          first.push(error(sample, index));
        }
        if (previous[index] === 'salute' && activity !== 'salute' && starts.has(index)) {
          last.push(error(sample, index));
        }
      });
      previous = sample.activities;
    });
    expect(first.length).toBeGreaterThan(5);
    const mean = (values: number[]): number =>
      values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean(last)).toBeLessThan(mean(first));
    expect(mean(last)).toBeLessThan(1);
  });

  it('walks at a stroll or at a decided pace, with the walk clip at the matching speed', async () => {
    const SLOW_MPS = 0.38;
    const FAST_MPS = 0.6;
    const dtS = FRAME_MS / 1000;
    let slow = 0;
    let fast = 0;
    let checked = 0;
    let matching = 0;
    let previous: Sample | null = null;
    const walkingFor: number[] = [];
    await liveForTwoHours(4, (sample) => {
      sample.activities.forEach((activity, index) => {
        const speed = previous
          ? Math.hypot(
              (sample.x[index] ?? 0) - (previous.x[index] ?? 0),
              (sample.z[index] ?? 0) - (previous.z[index] ?? 0),
            ) / dtS
          : 0;
        walkingFor[index] = activity === 'walk' ? (walkingFor[index] ?? 0) + 1 : 0;
        if (activity === 'walk' && speed > 0.1) {
          slow += speed < SLOW_MPS ? 1 : 0;
          fast += speed > FAST_MPS ? 1 : 0;
        }
        // Long after the cross-fade, the clip advances at the scale chosen for the speed.
        if (previous && (walkingFor[index] ?? 0) > 30 && speed > 0.1) {
          const slid = ((sample.bodyX[index] ?? 0) - (previous.bodyX[index] ?? 0)) / dtS;
          if (slid > 0) {
            checked += 1;
            const expected = walkClipScale(speed);
            matching += Math.abs(slid / WALK_SLIDE_PER_S - expected) < 0.25 ? 1 : 0;
          }
        }
      });
      previous = sample;
    });
    expect(slow).toBeGreaterThan(500);
    expect(fast).toBeGreaterThan(500);
    expect(checked).toBeGreaterThan(500);
    expect(matching / checked).toBeGreaterThan(0.9);
  });
});
