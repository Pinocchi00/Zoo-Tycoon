import { describe, expect, it } from 'vitest';
import { RARITIES, type Rarity } from '../../data/schemas/common';
import type { SpeciesId } from '../../shared/brand';
import { createLogger } from '../../shared/logger';
import { createRng } from '../rng';
import { drawArrival, recordArrivalRarity } from './draw';
import { createGachaTables, PITY_RARITIES, type ArrivalsSince, type PityRarity } from './rates';
import { syntheticGameData } from './test-support';

const ARRIVALS = 1_000_000;
const SEED = 20_261_029;
/** 0.1 percentage point, as a fraction. */
const TOLERANCE = 0.001;
const TEST_TIMEOUT_MS = 120_000;

/** The GDD's rates and guarantees, written again here so the engine is checked against them. */
const BASE_RATES: Readonly<Record<Rarity, number>> = {
  common: 0.55,
  uncommon: 0.27,
  rare: 0.12,
  veryRare: 0.05,
  iconic: 0.01,
};
const GUARANTEED_AT: Readonly<Record<PityRarity, number>> = { rare: 10, veryRare: 40, iconic: 90 };
const SOFT_PITY_START = 70;

type Tally = Record<Rarity, number>;

function emptyTally(): Tally {
  return { common: 0, uncommon: 0, rare: 0, veryRare: 0, iconic: 0 };
}

function rank(rarity: Rarity): number {
  return RARITIES.indexOf(rarity);
}

/** Arrival number since the last result of `tier` or rarer, for each guarantee. */
type Gaps = Record<PityRarity, number>;

/**
 * The published rules (docs/decisions.md, D-020): iconic chance rising in a straight line from the
 * 70th arrival, then the rarest due guarantee.
 */
function expectedProbabilities(gaps: Gaps): Tally {
  const iconicArrival = gaps.iconic + 1;
  if (iconicArrival >= GUARANTEED_AT.iconic) {
    return { ...emptyTally(), iconic: 1 };
  }
  const iconicBp =
    iconicArrival >= SOFT_PITY_START
      ? 100 + Math.floor((9900 * (iconicArrival - SOFT_PITY_START + 1)) / 21)
      : 100;
  const iconic = iconicBp / 10_000;
  const probabilities = emptyTally();
  for (const rarity of RARITIES) {
    probabilities[rarity] =
      rarity === 'iconic' ? iconic : (BASE_RATES[rarity] * (1 - iconic)) / (1 - BASE_RATES.iconic);
  }
  let floor: Rarity | undefined;
  if (gaps.veryRare + 1 >= GUARANTEED_AT.veryRare) {
    floor = 'veryRare';
  } else if (gaps.rare + 1 >= GUARANTEED_AT.rare) {
    floor = 'rare';
  }
  if (floor === undefined) {
    return probabilities;
  }
  const floorRank = rank(floor);
  let kept = 0;
  for (const rarity of RARITIES) {
    if (rank(rarity) < floorRank) {
      probabilities[rarity] = 0;
    }
    kept += probabilities[rarity];
  }
  for (const rarity of RARITIES) {
    probabilities[rarity] /= kept;
  }
  return probabilities;
}

function percent(fraction: number): string {
  return `${(fraction * 100).toFixed(3)} %`;
}

describe('gacha statistics', () => {
  it(
    'keeps every rate within 0.1 point and every guarantee over a million arrivals',
    () => {
      const data = syntheticGameData();
      const tables = createGachaTables(data.gachaRules, data.species);
      const rng = createRng(SEED);
      const since: ArrivalsSince = { rare: 0, veryRare: 0, iconic: 0 };
      const gaps: Gaps = { rare: 0, veryRare: 0, iconic: 0 };
      const observed = emptyTally();
      const expected = emptyTally();
      const freeObserved = emptyTally();
      let freeArrivals = 0;
      const bySpecies = new Map<SpeciesId, number>();
      const violations: string[] = [];

      for (let arrival = 1; arrival <= ARRIVALS; arrival += 1) {
        const probabilities = expectedProbabilities(gaps);
        for (const rarity of RARITIES) {
          expected[rarity] += probabilities[rarity];
        }
        const isFree =
          gaps.rare + 1 < GUARANTEED_AT.rare &&
          gaps.veryRare + 1 < GUARANTEED_AT.veryRare &&
          gaps.iconic + 1 < SOFT_PITY_START;

        const result = drawArrival(tables, since, rng);
        recordArrivalRarity(tables, since, result.rarity);

        observed[result.rarity] += 1;
        bySpecies.set(result.speciesId, (bySpecies.get(result.speciesId) ?? 0) + 1);
        if (isFree) {
          freeObserved[result.rarity] += 1;
          freeArrivals += 1;
        }
        for (const tier of PITY_RARITIES) {
          gaps[tier] = rank(result.rarity) >= rank(tier) ? 0 : gaps[tier] + 1;
          if (gaps[tier] >= GUARANTEED_AT[tier]) {
            violations.push(`${tier} missed at arrival ${String(arrival)}`);
          }
        }
        if (data.species.get(result.speciesId)?.rarity !== result.rarity) {
          violations.push(`species of the wrong tier at arrival ${String(arrival)}`);
        }
      }

      const lines = [`${String(ARRIVALS)} arrivals, seed ${String(SEED)}`];
      for (const rarity of RARITIES) {
        const free = freeObserved[rarity] / freeArrivals;
        const all = observed[rarity] / ARRIVALS;
        const target = expected[rarity] / ARRIVALS;
        lines.push(
          `${rarity.padEnd(9)} free ${percent(free)} (base ${percent(BASE_RATES[rarity])})` +
            `  overall ${percent(all)} (expected ${percent(target)})`,
        );
        expect(Math.abs(free - BASE_RATES[rarity])).toBeLessThan(TOLERANCE);
        expect(Math.abs(all - target)).toBeLessThan(TOLERANCE);
      }
      for (const species of data.species.values()) {
        const share = (bySpecies.get(species.id) ?? 0) / ARRIVALS;
        const target = expected[species.rarity] / tables.pools[species.rarity].length / ARRIVALS;
        expect(Math.abs(share - target)).toBeLessThan(TOLERANCE);
      }
      lines.push(
        `free arrivals ${String(freeArrivals)}, guarantee violations ${String(violations.length)}`,
      );
      createLogger(true).info(`gacha statistics\n${lines.join('\n')}`);

      expect(violations).toEqual([]);
    },
    TEST_TIMEOUT_MS,
  );
});
