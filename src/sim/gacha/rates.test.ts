import { describe, expect, it } from 'vitest';
import type { Rarity } from '../../data/schemas/common';
import {
  appliedRarityRates,
  createGachaTables,
  dueGuarantee,
  iconicChanceBp,
  isGuaranteeActive,
  standInTier,
  tierWeights,
  type ArrivalsSince,
  type GachaTables,
  type SpeciesPools,
} from './rates';
import { sliceGameData, syntheticGameData, testSpeciesId } from './test-support';

const synthetic = syntheticGameData();
const slice = sliceGameData();
const fullTables = createGachaTables(synthetic.gachaRules, synthetic.species);

function since(rare: number, veryRare: number, iconic: number): ArrivalsSince {
  return { rare, veryRare, iconic };
}

function pools(filled: readonly Rarity[]): SpeciesPools {
  const one = [testSpeciesId('some-species')];
  return {
    common: filled.includes('common') ? one : [],
    uncommon: filled.includes('uncommon') ? one : [],
    rare: filled.includes('rare') ? one : [],
    veryRare: filled.includes('veryRare') ? one : [],
    iconic: filled.includes('iconic') ? one : [],
  };
}

function tablesWith(filled: readonly Rarity[]): GachaTables {
  const speciesPools = pools(filled);
  return {
    rules: synthetic.gachaRules,
    pools: speciesPools,
    appliedRates: appliedRarityRates(synthetic.gachaRules, speciesPools),
  };
}

function weights(tables: GachaTables, counters: ArrivalsSince): Record<Rarity, number> {
  const result: Record<Rarity, number> = {
    common: 0,
    uncommon: 0,
    rare: 0,
    veryRare: 0,
    iconic: 0,
  };
  for (const entry of tierWeights(tables, counters)) {
    result[entry.value] = entry.weight;
  }
  return result;
}

describe('applied rates', () => {
  it('are the GDD rates when every tier has species', () => {
    expect(fullTables.appliedRates).toEqual({
      common: 5500,
      uncommon: 2700,
      rare: 1200,
      veryRare: 500,
      iconic: 100,
    });
  });

  it('move an empty tier to the nearest non-empty tier below: the slice shows 6 % very rare', () => {
    const tables = createGachaTables(slice.gachaRules, slice.species);
    expect(tables.pools.iconic).toEqual([]);
    expect(tables.appliedRates).toEqual({
      common: 5500,
      uncommon: 2700,
      rare: 1200,
      veryRare: 600,
      iconic: 0,
    });
  });

  it('skip several empty tiers and go up only when nothing is below', () => {
    expect(tablesWith(['common', 'iconic']).appliedRates).toEqual({
      common: 9900,
      uncommon: 0,
      rare: 0,
      veryRare: 0,
      iconic: 100,
    });
    expect(tablesWith(['rare']).appliedRates.rare).toBe(10_000);
    expect(standInTier('common', pools(['uncommon', 'veryRare']))).toBe('uncommon');
    expect(standInTier('iconic', pools([]))).toBeUndefined();
  });
});

describe('guarantees', () => {
  it('sleep when no tier at or above them has species', () => {
    const slicePools = pools(['common', 'veryRare']);
    expect(isGuaranteeActive('rare', slicePools)).toBe(true);
    expect(isGuaranteeActive('veryRare', slicePools)).toBe(true);
    expect(isGuaranteeActive('iconic', slicePools)).toBe(false);
  });

  it('pick the rarest one due', () => {
    expect(dueGuarantee(fullTables, since(8, 38, 88))).toBeUndefined();
    expect(dueGuarantee(fullTables, since(9, 38, 88))).toBe('rare');
    expect(dueGuarantee(fullTables, since(9, 39, 88))).toBe('veryRare');
    expect(dueGuarantee(fullTables, since(9, 39, 89))).toBe('iconic');
  });

  it('never fire for a sleeping tier', () => {
    expect(dueGuarantee(tablesWith(['common', 'veryRare']), since(0, 0, 500))).toBeUndefined();
  });
});

describe('iconic chance', () => {
  it('stays at its rate before the 70th arrival', () => {
    expect(iconicChanceBp(fullTables, since(0, 0, 0))).toBe(100);
    expect(iconicChanceBp(fullTables, since(0, 0, 68))).toBe(100);
  });

  it('rises in a straight line from the 70th to 100 % on the 90th', () => {
    const byArrival = [70, 75, 80, 89, 90].map((arrival) =>
      iconicChanceBp(fullTables, since(0, 0, arrival - 1)),
    );
    expect(byArrival).toEqual([571, 2928, 5285, 9528, 10_000]);
    let previous = 0;
    for (let arrival = 70; arrival <= 90; arrival += 1) {
      const chance = iconicChanceBp(fullTables, since(0, 0, arrival - 1));
      expect(chance).toBeGreaterThan(previous);
      previous = chance;
    }
  });

  it('does not rise when the iconic tier is empty', () => {
    expect(iconicChanceBp(tablesWith(['common', 'veryRare']), since(0, 0, 80))).toBe(0);
  });
});

describe('tier weights', () => {
  it('are the applied rates on a free arrival', () => {
    expect(weights(fullTables, since(0, 0, 0))).toEqual(fullTables.appliedRates);
  });

  it('share what the rising iconic chance leaves in proportion to the rates', () => {
    const raised = weights(fullTables, since(0, 0, 74));
    const total = Object.values(raised).reduce((sum, weight) => sum + weight, 0);
    expect(total).toBe(10_000 * 9900);
    expect(raised.iconic / total).toBeCloseTo(0.2928, 10);
    expect(raised.common / raised.uncommon).toBeCloseTo(5500 / 2700, 10);
  });

  it('drop the tiers below a due guarantee', () => {
    expect(weights(fullTables, since(9, 0, 0))).toEqual({
      common: 0,
      uncommon: 0,
      rare: 1200,
      veryRare: 500,
      iconic: 100,
    });
    expect(weights(fullTables, since(9, 39, 0))).toEqual({
      common: 0,
      uncommon: 0,
      rare: 0,
      veryRare: 500,
      iconic: 100,
    });
    expect(weights(fullTables, since(0, 0, 89)).iconic).toBeGreaterThan(0);
    expect(weights(fullTables, since(0, 0, 89)).common).toBe(0);
  });

  it('share a guarantee evenly when the tiers above it have species but a zero rate', () => {
    const rules = {
      ...synthetic.gachaRules,
      rarityRatesBp: { common: 10_000, uncommon: 0, rare: 0, veryRare: 0, iconic: 0 },
    };
    const tables = createGachaTables(rules, synthetic.species);
    expect(weights(tables, since(9, 0, 0))).toEqual({
      common: 0,
      uncommon: 0,
      rare: 1,
      veryRare: 1,
      iconic: 1,
    });
  });
});
