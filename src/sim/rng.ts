/**
 * Seeded pseudo-random generator: xoshiro128** seeded by splitmix32.
 * The state lives inside the game state so that a save restores the exact same future draws.
 * Every function mutates the given state in place.
 */
export type RngState = [number, number, number, number];

const UINT32_RANGE = 0x1_0000_0000;
const MAX_UINT32 = 0xffff_ffff;
const SPLITMIX32_INCREMENT = 0x9e37_79b9;

function rotateLeft(value: number, shift: number): number {
  return ((value << shift) | (value >>> (32 - shift))) >>> 0;
}

function isUint32(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= MAX_UINT32;
}

/** Spreads a 32-bit seed over the 128-bit state, so that close seeds give unrelated sequences. */
export function createRng(seed: number): RngState {
  if (!isUint32(seed)) {
    throw new RangeError(`Seed must be an unsigned 32-bit integer, got ${String(seed)}.`);
  }
  let counter = seed;
  const next = (): number => {
    counter = (counter + SPLITMIX32_INCREMENT) >>> 0;
    let mixed = counter ^ (counter >>> 16);
    mixed = Math.imul(mixed, 0x21f0_aaad);
    mixed ^= mixed >>> 15;
    mixed = Math.imul(mixed, 0x735a_2d97);
    return (mixed ^ (mixed >>> 15)) >>> 0;
  };
  // splitmix32 is a bijection of a moving counter, so the four words can never all be zero.
  return [next(), next(), next(), next()];
}

/** Next raw draw, uniform over [0, 2^32). */
export function nextUint32(rng: RngState): number {
  const [s0, s1, s2, s3] = rng;
  const result = Math.imul(rotateLeft(Math.imul(s1, 5) >>> 0, 7), 9) >>> 0;
  const shifted = (s1 << 9) >>> 0;
  const t2 = (s2 ^ s0) >>> 0;
  const t3 = (s3 ^ s1) >>> 0;
  rng[1] = (s1 ^ t2) >>> 0;
  rng[0] = (s0 ^ t3) >>> 0;
  rng[2] = (t2 ^ shifted) >>> 0;
  rng[3] = rotateLeft(t3, 11);
  return result;
}

/** Uniform integer in [min, max], both included, without modulo bias. */
export function randomInt(rng: RngState, min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max) || min > max) {
    throw new RangeError(`Invalid integer range [${String(min)}, ${String(max)}].`);
  }
  const span = max - min + 1;
  if (span > UINT32_RANGE) {
    throw new RangeError(`Integer range is wider than 2^32: [${String(min)}, ${String(max)}].`);
  }
  // Draws above the last full multiple of `span` would favour small values: reject them.
  const limit = UINT32_RANGE - (UINT32_RANGE % span);
  let draw = nextUint32(rng);
  while (draw >= limit) {
    draw = nextUint32(rng);
  }
  return min + (draw % span);
}

/** Uniform float in [0, 1). */
export function randomFloat(rng: RngState): number {
  return nextUint32(rng) / UINT32_RANGE;
}

export interface WeightedEntry<T> {
  readonly value: T;
  /** Non-negative integer; an entry with weight 0 is never picked. */
  readonly weight: number;
}

/** Picks one value with a probability proportional to its integer weight. */
export function weightedPick<T>(rng: RngState, entries: readonly WeightedEntry<T>[]): T {
  return selectByWeight(entries, randomInt(rng, 0, totalWeight(entries) - 1));
}

/** Sum of the weights, after checking that they can be drawn from. */
export function totalWeight(entries: readonly WeightedEntry<unknown>[]): number {
  let total = 0;
  for (const entry of entries) {
    if (!Number.isSafeInteger(entry.weight) || entry.weight < 0) {
      throw new RangeError(`Weights must be non-negative integers, got ${String(entry.weight)}.`);
    }
    total += entry.weight;
  }
  if (total === 0 || total > UINT32_RANGE) {
    throw new RangeError(`Total weight must be in [1, 2^32], got ${String(total)}.`);
  }
  return total;
}

/**
 * The value whose weight slice contains `position`, a uniform integer in [0, total weight).
 * Kept apart from the draw so that the mapping can be checked exhaustively.
 */
export function selectByWeight<T>(entries: readonly WeightedEntry<T>[], position: number): T {
  let remaining = position;
  for (const entry of entries) {
    if (remaining < entry.weight) {
      return entry.value;
    }
    remaining -= entry.weight;
  }
  throw new RangeError(`Position ${String(position)} is outside the total weight.`);
}

/** Returns a shuffled copy (Fisher-Yates): every order is equally likely. */
export function shuffle<T>(rng: RngState, items: readonly T[]): T[] {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const other = randomInt(rng, 0, index);
    const current = result[index];
    const swapped = result[other];
    if (current === undefined || swapped === undefined) {
      throw new Error('shuffle: index out of bounds.');
    }
    result[index] = swapped;
    result[other] = current;
  }
  return result;
}
