import { cellCenterX, cellCenterZ, gridDepth, gridWidth, type GridSize } from '@/shared';
import { createRng, outlineCells, randomInt, type GridPoint, type RngState } from '@/sim';

/** A point on the ground, in metres. The same shape serves as the output slot of many helpers. */
export interface Point2 {
  x: number;
  z: number;
}

/** An enclosure seen as ground the animals may walk on. */
export interface EnclosureArea {
  /** Corners of the outline in world metres. */
  readonly cornersX: readonly number[];
  readonly cornersZ: readonly number[];
  /** Resting places, all at least `INTERIOR_MARGIN_M` from every edge. */
  readonly interior: readonly Point2[];
}

/** Animals keep this far from the fence when they pick where to stand. */
export const INTERIOR_MARGIN_M = 0.5;
/** A straight walk may pass this close to the fence. */
export const PATH_MARGIN_M = 0.2;
/** Resting places are sampled on a quarter-cell lattice around each cell centre. */
const LATTICE_OFFSETS_M: readonly number[] = [-0.25, 0.25];
const SAMPLE_ATTEMPTS = 12;
/** Fallback walks shorter than this are not worth starting. */
const FALLBACK_MIN_TRIP_M = 0.8;
/** Points of interest keep this far from each other when the enclosure is big enough. */
const POI_SPACING_M = 1.8;
const POI_ATTEMPTS = 24;
/** Stars 2 to 5 each add one enrichment element. */
const MAX_ENRICHMENT_POINTS = 4;
const FNV_OFFSET = 0x811c_9dc5;
const FNV_PRIME = 0x0100_0193;

function worldX(grid: GridSize, cornerX: number): number {
  return cornerX - gridWidth(grid) / 2;
}

function worldZ(grid: GridSize, cornerY: number): number {
  return cornerY - gridDepth(grid) / 2;
}

/** Even-odd rule on the world-space outline. */
export function containsPoint(area: EnclosureArea, x: number, z: number): boolean {
  const { cornersX, cornersZ } = area;
  let inside = false;
  let previous = cornersX.length - 1;
  for (let index = 0; index < cornersX.length; index += 1) {
    const ax = cornersX[index] ?? 0;
    const az = cornersZ[index] ?? 0;
    const bx = cornersX[previous] ?? 0;
    const bz = cornersZ[previous] ?? 0;
    if (az > z !== bz > z && x < ((bx - ax) * (z - az)) / (bz - az) + ax) {
      inside = !inside;
    }
    previous = index;
  }
  return inside;
}

const EDGE_SCRATCH: Point2 = { x: 0, z: 0 };
const SCRATCH: Point2 = { x: 0, z: 0 };

/** Writes into `out` the point of segment a-b closest to p; returns the distance. */
function closestOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  out: Point2,
): number {
  const sx = bx - ax;
  const sz = bz - az;
  const lengthSquared = sx * sx + sz * sz;
  const along =
    lengthSquared === 0
      ? 0
      : Math.max(0, Math.min(1, ((px - ax) * sx + (pz - az) * sz) / lengthSquared));
  out.x = ax + sx * along;
  out.z = az + sz * along;
  return Math.sqrt((px - out.x) ** 2 + (pz - out.z) ** 2);
}

/** Writes into `nearest` the point of the fence closest to (x, z); returns the distance to it. */
export function distanceToEdge(area: EnclosureArea, x: number, z: number, nearest: Point2): number {
  const { cornersX, cornersZ } = area;
  const candidate = EDGE_SCRATCH;
  let best = Number.POSITIVE_INFINITY;
  let previous = cornersX.length - 1;
  for (let index = 0; index < cornersX.length; index += 1) {
    const distance = closestOnSegment(
      x,
      z,
      cornersX[previous] ?? 0,
      cornersZ[previous] ?? 0,
      cornersX[index] ?? 0,
      cornersZ[index] ?? 0,
      candidate,
    );
    if (distance < best) {
      best = distance;
      nearest.x = candidate.x;
      nearest.z = candidate.z;
    }
    previous = index;
  }
  return best;
}

function side(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  return Math.sign((bx - ax) * (pz - az) - (bz - az) * (px - ax));
}

function onSegment(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  px: number,
  pz: number,
): boolean {
  return (
    Math.min(ax, bx) <= px &&
    px <= Math.max(ax, bx) &&
    Math.min(az, bz) <= pz &&
    pz <= Math.max(az, bz)
  );
}

/** Closed segments: touching counts as crossing. */
function segmentsTouch(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  cx: number,
  cz: number,
  dx: number,
  dz: number,
): boolean {
  const d1 = side(cx, cz, dx, dz, ax, az);
  const d2 = side(cx, cz, dx, dz, bx, bz);
  const d3 = side(ax, az, bx, bz, cx, cz);
  const d4 = side(ax, az, bx, bz, dx, dz);
  if (d1 !== d2 && d3 !== d4) {
    return true;
  }
  return (
    (d1 === 0 && onSegment(cx, cz, dx, dz, ax, az)) ||
    (d2 === 0 && onSegment(cx, cz, dx, dz, bx, bz)) ||
    (d3 === 0 && onSegment(ax, az, bx, bz, cx, cz)) ||
    (d4 === 0 && onSegment(ax, az, bx, bz, dx, dz))
  );
}

/**
 * True when walking straight from a to b never gets closer than `margin` to the fence. Both ends
 * must be inside: a path that stays clear of every edge cannot leave the enclosure, even a
 * non-convex one such as an L.
 */
export function segmentStaysInside(
  area: EnclosureArea,
  ax: number,
  az: number,
  bx: number,
  bz: number,
  margin: number,
): boolean {
  if (!containsPoint(area, ax, az) || !containsPoint(area, bx, bz)) {
    return false;
  }
  const { cornersX, cornersZ } = area;
  let previous = cornersX.length - 1;
  for (let index = 0; index < cornersX.length; index += 1) {
    const ex = cornersX[previous] ?? 0;
    const ez = cornersZ[previous] ?? 0;
    const fx = cornersX[index] ?? 0;
    const fz = cornersZ[index] ?? 0;
    previous = index;
    if (segmentsTouch(ax, az, bx, bz, ex, ez, fx, fz)) {
      return false;
    }
    const nearest = Math.min(
      closestOnSegment(ax, az, ex, ez, fx, fz, SCRATCH),
      closestOnSegment(bx, bz, ex, ez, fx, fz, SCRATCH),
      closestOnSegment(ex, ez, ax, az, bx, bz, SCRATCH),
      closestOnSegment(fx, fz, ax, az, bx, bz, SCRATCH),
    );
    if (nearest < margin) {
      return false;
    }
  }
  return true;
}

/**
 * The walkable ground of an enclosure, from its outline. The resting places are taken from the
 * cells `outlineCells` gives (the same ones the simulation counts), kept away from the fence.
 * Returns null when the enclosure is too thin to hold an animal.
 */
export function createEnclosureArea(
  outline: readonly GridPoint[],
  grid: GridSize,
): EnclosureArea | null {
  const cornersX = outline.map((point) => worldX(grid, point.x));
  const cornersZ = outline.map((point) => worldZ(grid, point.y));
  const cells = outlineCells(outline, grid.columns);
  const bare: EnclosureArea = { cornersX, cornersZ, interior: [] };
  const interior: Point2[] = [];
  const nearest: Point2 = { x: 0, z: 0 };
  for (const cell of cells) {
    const centreX = cellCenterX(grid, cell % grid.columns);
    const centreZ = cellCenterZ(grid, Math.floor(cell / grid.columns));
    for (const offsetX of LATTICE_OFFSETS_M) {
      for (const offsetZ of LATTICE_OFFSETS_M) {
        const x = centreX + offsetX;
        const z = centreZ + offsetZ;
        if (containsPoint(bare, x, z) && distanceToEdge(bare, x, z, nearest) >= INTERIOR_MARGIN_M) {
          interior.push({ x, z });
        }
      }
    }
  }
  return interior.length === 0 ? null : { cornersX, cornersZ, interior };
}

/**
 * Picks where an animal at (fromX, fromZ) walks next, writing it into `out`. The walk is a
 * straight line that stays inside the enclosure and is between `minTripM` and `maxTripM` long;
 * if no such walk is found, any visible spot not too close will do. False when there is none.
 */
export function pickDestination(
  area: EnclosureArea,
  rng: RngState,
  from: Point2,
  minTripM: number,
  maxTripM: number,
  out: Point2,
): boolean {
  const count = area.interior.length;
  for (let attempt = 0; attempt < SAMPLE_ATTEMPTS; attempt += 1) {
    const spot = area.interior[randomInt(rng, 0, count - 1)];
    if (spot === undefined) {
      return false;
    }
    const distance = Math.hypot(spot.x - from.x, spot.z - from.z);
    if (
      distance >= minTripM &&
      distance <= maxTripM &&
      segmentStaysInside(area, from.x, from.z, spot.x, spot.z, PATH_MARGIN_M)
    ) {
      out.x = spot.x;
      out.z = spot.z;
      return true;
    }
  }
  const first = randomInt(rng, 0, count - 1);
  for (let step = 0; step < count; step += 1) {
    const spot = area.interior[(first + step) % count];
    if (
      spot !== undefined &&
      Math.hypot(spot.x - from.x, spot.z - from.z) >= FALLBACK_MIN_TRIP_M &&
      segmentStaysInside(area, from.x, from.z, spot.x, spot.z, PATH_MARGIN_M)
    ) {
      out.x = spot.x;
      out.z = spot.z;
      return true;
    }
  }
  return false;
}

/** Where the habitat elements stand inside an enclosure. */
export interface InterestPoints {
  /** The pond or river, when the species has water. */
  readonly water: Point2 | null;
  /** One point per star above the first, so none at one star. */
  readonly enrichment: readonly Point2[];
}

/** A stable 32-bit number from an id, to seed the placement (FNV-1a). */
export function hashText(text: string): number {
  let hash = FNV_OFFSET;
  for (let index = 0; index < text.length; index += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(index), FNV_PRIME) >>> 0;
  }
  return hash;
}

function pickSpot(area: EnclosureArea, rng: RngState, taken: readonly Point2[]): Point2 {
  let candidate: Point2 = { x: 0, z: 0 };
  for (let attempt = 0; attempt < POI_ATTEMPTS; attempt += 1) {
    const spot = area.interior[randomInt(rng, 0, area.interior.length - 1)];
    if (spot === undefined) {
      break;
    }
    candidate = { x: spot.x, z: spot.z };
    if (taken.every((other) => Math.hypot(other.x - spot.x, other.z - spot.z) >= POI_SPACING_M)) {
      return candidate;
    }
  }
  return candidate;
}

/**
 * Places the water and the enrichment elements of an enclosure. The result depends only on the
 * outline, the enclosure id, whether the species has water and the stars, so the same spots come
 * back every time, and a higher star level keeps the spots it already had and adds one.
 * Task 1.10 draws the habitat element models: it must call this function so that they stand
 * exactly where the animals go to use them.
 */
export function placeInterestPoints(
  area: EnclosureArea,
  enclosureId: string,
  hasWater: boolean,
  stars: number,
): InterestPoints {
  const rng = createRng(hashText(enclosureId));
  const taken: Point2[] = [];
  let water: Point2 | null = null;
  if (hasWater) {
    water = pickSpot(area, rng, taken);
    taken.push(water);
  }
  const enrichment: Point2[] = [];
  const count = Math.max(0, Math.min(stars - 1, MAX_ENRICHMENT_POINTS));
  for (let index = 0; index < count; index += 1) {
    const spot = pickSpot(area, rng, taken);
    taken.push(spot);
    enrichment.push(spot);
  }
  return { water, enrichment };
}
