import { BASIS_POINTS_TOTAL, RARITIES, type Rarity } from '../../data/schemas/common';
import type { GachaRules } from '../../data/schemas/gacha';
import type { Species } from '../../data/schemas/species';
import type { SpeciesId } from '../../shared/brand';
import type { WeightedEntry } from '../rng';

/** Tiers that have a guarantee, from the most to the least frequent. */
export const PITY_RARITIES = ['rare', 'veryRare', 'iconic'] as const;
export type PityRarity = (typeof PITY_RARITIES)[number];

/** Arrivals since the last result of this tier or a rarer one. Shared by every banner. */
export type ArrivalsSince = Record<PityRarity, number>;

/** Species of each tier, in the order of the data files so that draws stay deterministic. */
export type SpeciesPools = Readonly<Record<Rarity, readonly SpeciesId[]>>;

export type RarityRates = Readonly<Record<Rarity, number>>;

/** Everything a draw needs, computed once from the game data. */
export interface GachaTables {
  readonly rules: GachaRules;
  readonly pools: SpeciesPools;
  /** Base rates in basis points once empty tiers have handed their rate over. */
  readonly appliedRates: RarityRates;
}

export function rarityRank(rarity: Rarity): number {
  return RARITIES.indexOf(rarity);
}

export function isAtLeast(rarity: Rarity, floor: Rarity): boolean {
  return rarityRank(rarity) >= rarityRank(floor);
}

export function speciesPools(species: ReadonlyMap<SpeciesId, Species>): SpeciesPools {
  const pools: Record<Rarity, SpeciesId[]> = {
    common: [],
    uncommon: [],
    rare: [],
    veryRare: [],
    iconic: [],
  };
  for (const entry of species.values()) {
    pools[entry.rarity].push(entry.id);
  }
  return pools;
}

/**
 * The tier that stands in for `rarity`: itself if it has species, else the nearest non-empty
 * tier below it, else (only when every tier below is empty) the nearest one above it.
 */
export function standInTier(rarity: Rarity, pools: SpeciesPools): Rarity | undefined {
  const rank = rarityRank(rarity);
  for (let index = rank; index >= 0; index -= 1) {
    const candidate = RARITIES[index];
    if (candidate !== undefined && pools[candidate].length > 0) {
      return candidate;
    }
  }
  for (let index = rank + 1; index < RARITIES.length; index += 1) {
    const candidate = RARITIES[index];
    if (candidate !== undefined && pools[candidate].length > 0) {
      return candidate;
    }
  }
  return undefined;
}

/** The rates really used, as shown on the rates screen: an empty tier's rate moves down a tier. */
export function appliedRarityRates(rules: GachaRules, pools: SpeciesPools): RarityRates {
  const rates: Record<Rarity, number> = { common: 0, uncommon: 0, rare: 0, veryRare: 0, iconic: 0 };
  for (const rarity of RARITIES) {
    const target = standInTier(rarity, pools);
    if (target !== undefined) {
      rates[target] += rules.rarityRatesBp[rarity];
    }
  }
  return rates;
}

export function createGachaTables(
  rules: GachaRules,
  species: ReadonlyMap<SpeciesId, Species>,
): GachaTables {
  const pools = speciesPools(species);
  return { rules, pools, appliedRates: appliedRarityRates(rules, pools) };
}

export function hasAnySpecies(pools: SpeciesPools): boolean {
  return RARITIES.some((rarity) => pools[rarity].length > 0);
}

/** A guarantee only means something if a tier at or above it has species; else it sleeps. */
export function isGuaranteeActive(tier: PityRarity, pools: SpeciesPools): boolean {
  return RARITIES.some((rarity) => isAtLeast(rarity, tier) && pools[rarity].length > 0);
}

/** The rarest guarantee due on this arrival, if any. */
export function dueGuarantee(tables: GachaTables, since: ArrivalsSince): PityRarity | undefined {
  for (let index = PITY_RARITIES.length - 1; index >= 0; index -= 1) {
    const tier = PITY_RARITIES[index];
    if (
      tier !== undefined &&
      isGuaranteeActive(tier, tables.pools) &&
      since[tier] + 1 >= tables.rules.pity[tier].guaranteedAt
    ) {
      return tier;
    }
  }
  return undefined;
}

/**
 * Iconic chance in basis points for this arrival. From the soft pity start it rises in a straight
 * line, so that it would reach 100 % on the guaranteed arrival: no extra tuning value is needed.
 */
export function iconicChanceBp(tables: GachaTables, since: ArrivalsSince): number {
  const base = tables.appliedRates.iconic;
  const { softPityStartArrival, guaranteedAt } = tables.rules.pity.iconic;
  const arrival = since.iconic + 1;
  if (!isGuaranteeActive('iconic', tables.pools) || arrival < softPityStartArrival) {
    return base;
  }
  if (arrival >= guaranteedAt) {
    return BASIS_POINTS_TOTAL;
  }
  const stepsIn = arrival - softPityStartArrival + 1;
  const rampLength = guaranteedAt - softPityStartArrival + 1;
  return base + Math.floor(((BASIS_POINTS_TOTAL - base) * stepsIn) / rampLength);
}

/**
 * Integer weight of each tier for this arrival. With a raised iconic chance, the other tiers share
 * what is left in proportion to their applied rates; weights stay exact integers (below 2^32).
 * Tiers below a due guarantee get weight zero.
 */
export function tierWeights(
  tables: GachaTables,
  since: ArrivalsSince,
): readonly WeightedEntry<Rarity>[] {
  const rates = tables.appliedRates;
  const iconicBp = iconicChanceBp(tables, since);
  const raised = iconicBp !== rates.iconic && rates.iconic < BASIS_POINTS_TOTAL;
  const weightOf = (rarity: Rarity): number => {
    if (!raised) {
      return rates[rarity];
    }
    return rarity === 'iconic'
      ? iconicBp * (BASIS_POINTS_TOTAL - rates.iconic)
      : rates[rarity] * (BASIS_POINTS_TOTAL - iconicBp);
  };
  const floor = dueGuarantee(tables, since);
  const entries = RARITIES.map((rarity) => ({
    value: rarity,
    weight: floor === undefined || isAtLeast(rarity, floor) ? weightOf(rarity) : 0,
  }));
  if (floor !== undefined && entries.every((entry) => entry.weight === 0)) {
    // Tiers above the guarantee have species but a zero rate: share the guarantee evenly.
    return RARITIES.map((rarity) => ({
      value: rarity,
      weight: isAtLeast(rarity, floor) && tables.pools[rarity].length > 0 ? 1 : 0,
    }));
  }
  return entries;
}
