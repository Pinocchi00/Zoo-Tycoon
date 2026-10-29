import { describe, expect, it } from 'vitest';
import {
  createRng,
  nextUint32,
  randomFloat,
  randomInt,
  selectByWeight,
  shuffle,
  totalWeight,
  weightedPick,
  type RngState,
} from './rng';

const DRAWS = 1_000_000;
/** 0.1 percentage point, as a fraction. */
const TOLERANCE = 0.001;
/** Headroom for the 1,000,000-draw tests when the machine is busy (coverage, dev server, CI). */
const HEAVY_STATISTICAL_TEST_TIMEOUT_MS = 30_000;

function draws(rng: RngState, count: number): number[] {
  return Array.from({ length: count }, () => nextUint32(rng));
}

describe('nextUint32', () => {
  it('matches the xoshiro128** reference output for state [1, 2, 3, 4]', () => {
    // Reference values from the rand_xoshiro test suite.
    expect(draws([1, 2, 3, 4], 10)).toEqual([
      11520, 0, 5927040, 70819200, 2031721883, 1637235492, 1287239034, 3734860849, 3729100597,
      4258142804,
    ]);
  });

  it('only returns unsigned 32-bit integers', () => {
    const rng = createRng(7);
    for (const value of draws(rng, 10_000)) {
      expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
    }
    expect(rng.every((word) => Number.isInteger(word) && word >= 0 && word < 2 ** 32)).toBe(true);
  });
});

describe('createRng', () => {
  it('gives the same sequence for the same seed', () => {
    expect(draws(createRng(42), 1000)).toEqual(draws(createRng(42), 1000));
  });

  it('gives different sequences for neighbouring seeds', () => {
    expect(draws(createRng(42), 10)).not.toEqual(draws(createRng(43), 10));
  });

  it('keeps a stable seeding, so old saves and tests stay reproducible', () => {
    expect(createRng(0)).toEqual(createRng(0));
    expect(createRng(42)).toMatchInlineSnapshot(`
      [
        551831576,
        144025891,
        322543647,
        3034809370,
      ]
    `);
  });

  it('accepts the extreme seeds and never produces an all-zero state', () => {
    for (const seed of [0, 1, 0xffff_ffff]) {
      expect(createRng(seed).some((word) => word !== 0)).toBe(true);
    }
  });

  it.each([-1, 1.5, 2 ** 32, Number.NaN])('rejects the invalid seed %s', (seed) => {
    expect(() => createRng(seed)).toThrow(RangeError);
  });
});

describe('randomInt', () => {
  it(
    'is uniform over 1,000,000 draws, each value within 0.1 point',
    () => {
      const rng = createRng(2024);
      const buckets = new Array<number>(10).fill(0);
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const value = randomInt(rng, 0, 9);
        buckets[value] = (buckets[value] ?? 0) + 1;
      }
      for (const count of buckets) {
        expect(Math.abs(count / DRAWS - 0.1)).toBeLessThan(TOLERANCE);
      }
    },
    HEAVY_STATISTICAL_TEST_TIMEOUT_MS,
  );

  it('rejects biased draws when the range does not divide 2^32', () => {
    // Over 3 × 2^30 values, a quarter of the raw draws must be rejected. Without rejection,
    // the first third of the range would come out half of the time instead of a third.
    const third = 2 ** 30;
    const rng = createRng(17);
    const thirds = [0, 0, 0];
    const rounds = 300_000;
    for (let draw = 0; draw < rounds; draw += 1) {
      const slice = Math.floor(randomInt(rng, 0, 3 * third - 1) / third);
      thirds[slice] = (thirds[slice] ?? 0) + 1;
    }
    for (const count of thirds) {
      expect(Math.abs(count / rounds - 1 / 3)).toBeLessThan(0.005);
    }
  });

  it('stays within its bounds, both included', () => {
    const rng = createRng(3);
    const seen = new Set<number>();
    for (let draw = 0; draw < 10_000; draw += 1) {
      const value = randomInt(rng, -2, 2);
      expect(value).toBeGreaterThanOrEqual(-2);
      expect(value).toBeLessThanOrEqual(2);
      seen.add(value);
    }
    expect([...seen].sort((a, b) => a - b)).toEqual([-2, -1, 0, 1, 2]);
  });

  it('returns the only possible value of a single-value range', () => {
    expect(randomInt(createRng(1), 5, 5)).toBe(5);
  });

  it('supports the full 32-bit range', () => {
    const value = randomInt(createRng(1), 0, 2 ** 32 - 1);
    expect(Number.isInteger(value) && value >= 0 && value < 2 ** 32).toBe(true);
  });

  it.each([
    [2, 1],
    [0.5, 3],
    [0, Number.POSITIVE_INFINITY],
    [0, 2 ** 32],
  ])('rejects the invalid range [%s, %s]', (min, max) => {
    expect(() => randomInt(createRng(1), min, max)).toThrow(RangeError);
  });
});

describe('randomFloat', () => {
  it(
    'is uniform in [0, 1) over 1,000,000 draws',
    () => {
      const rng = createRng(99);
      const buckets = new Array<number>(10).fill(0);
      // Counted rather than asserted per draw: a million expect() calls dominate the runtime.
      let outOfRange = 0;
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const value = randomFloat(rng);
        if (!(value >= 0 && value < 1)) {
          outOfRange += 1;
        }
        const bucket = Math.floor(value * 10);
        buckets[bucket] = (buckets[bucket] ?? 0) + 1;
      }
      expect(outOfRange).toBe(0);
      for (const count of buckets) {
        expect(Math.abs(count / DRAWS - 0.1)).toBeLessThan(TOLERANCE);
      }
    },
    HEAVY_STATISTICAL_TEST_TIMEOUT_MS,
  );
});

describe('weightedPick', () => {
  it(
    'follows integer weights within 0.1 point over 1,000,000 draws',
    () => {
      const entries = [
        { value: 'common', weight: 6000 },
        { value: 'uncommon', weight: 3000 },
        { value: 'rare', weight: 900 },
        { value: 'legendary', weight: 100 },
        { value: 'never', weight: 0 },
      ] as const;
      const total = 10_000;
      const rng = createRng(1);
      const counts = new Map<string, number>();
      for (let draw = 0; draw < DRAWS; draw += 1) {
        const value = weightedPick(rng, entries);
        counts.set(value, (counts.get(value) ?? 0) + 1);
      }
      for (const entry of entries) {
        const share = (counts.get(entry.value) ?? 0) / DRAWS;
        expect(Math.abs(share - entry.weight / total)).toBeLessThan(TOLERANCE);
      }
      expect(counts.has('never')).toBe(false);
    },
    HEAVY_STATISTICAL_TEST_TIMEOUT_MS,
  );

  it('maps every position to an entry exactly as many times as its weight', () => {
    const entries = [
      { value: 'a', weight: 3 },
      { value: 'skipped', weight: 0 },
      { value: 'b', weight: 1 },
      { value: 'c', weight: 6 },
    ];
    const total = totalWeight(entries);
    const counts = new Map<string, number>();
    for (let position = 0; position < total; position += 1) {
      const value = selectByWeight(entries, position);
      counts.set(value, (counts.get(value) ?? 0) + 1);
    }
    expect(total).toBe(10);
    expect(Object.fromEntries(counts)).toEqual({ a: 3, b: 1, c: 6 });
    expect(() => selectByWeight(entries, total)).toThrow(RangeError);
  });

  it('always returns the only entry with a weight', () => {
    const rng = createRng(1);
    const entries = [
      { value: 'a', weight: 0 },
      { value: 'b', weight: 3 },
    ];
    for (let draw = 0; draw < 100; draw += 1) {
      expect(weightedPick(rng, entries)).toBe('b');
    }
  });

  it.each([
    ['an empty list', []],
    ['only zero weights', [{ value: 'a', weight: 0 }]],
    ['a negative weight', [{ value: 'a', weight: -1 }]],
    ['a fractional weight', [{ value: 'a', weight: 0.5 }]],
    ['a total above 2^32', [{ value: 'a', weight: 2 ** 32 + 1 }]],
  ])('rejects %s', (_name, entries) => {
    expect(() => weightedPick(createRng(1), entries)).toThrow(RangeError);
  });
});

describe('shuffle', () => {
  it('keeps every item exactly once and leaves the input untouched', () => {
    const items = Array.from({ length: 50 }, (_, index) => index);
    const shuffled = shuffle(createRng(5), items);
    expect(shuffled).not.toEqual(items);
    expect([...shuffled].sort((a, b) => a - b)).toEqual(items);
    expect(items).toEqual(Array.from({ length: 50 }, (_, index) => index));
  });

  it('is reproducible for the same seed', () => {
    const items = ['a', 'b', 'c', 'd', 'e', 'f'];
    expect(shuffle(createRng(8), items)).toEqual(shuffle(createRng(8), items));
  });

  it('handles empty and single-item lists', () => {
    expect(shuffle(createRng(1), [])).toEqual([]);
    expect(shuffle(createRng(1), ['only'])).toEqual(['only']);
  });

  it('gives every order of three items the same chance', () => {
    const rng = createRng(11);
    const counts = new Map<string, number>();
    const rounds = 600_000;
    for (let round = 0; round < rounds; round += 1) {
      const key = shuffle(rng, ['a', 'b', 'c']).join('');
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    expect(counts.size).toBe(6);
    for (const count of counts.values()) {
      expect(Math.abs(count / rounds - 1 / 6)).toBeLessThan(TOLERANCE * 2);
    }
  });
});
