import type { Rarity } from '../../data/schemas/common';
import type { SpeciesId } from '../../shared/brand';
import { randomInt, weightedPick, type RngState } from '../rng';
import {
  isAtLeast,
  isGuaranteeActive,
  PITY_RARITIES,
  tierWeights,
  type ArrivalsSince,
  type GachaTables,
} from './rates';

export interface DrawResult {
  readonly rarity: Rarity;
  readonly speciesId: SpeciesId;
}

/** Picks one species uniformly inside a tier that has species. */
export function pickInTier(tables: GachaTables, rarity: Rarity, rng: RngState): SpeciesId {
  const pool = tables.pools[rarity];
  const picked = pool[randomInt(rng, 0, pool.length - 1)];
  if (picked === undefined) {
    throw new Error(`pickInTier: tier ${rarity} has no species.`);
  }
  return picked;
}

/** One arrival: tier first (guarantees and rising chance included), then species in the tier. */
export function drawArrival(tables: GachaTables, since: ArrivalsSince, rng: RngState): DrawResult {
  const rarity = weightedPick(rng, tierWeights(tables, since));
  return { rarity, speciesId: pickInTier(tables, rarity, rng) };
}

/**
 * Moves the guarantee counters after an arrival of `rarity`. A sleeping guarantee keeps its
 * counter frozen, so that adding content later never hands out an instant guarantee.
 */
export function recordArrivalRarity(
  tables: GachaTables,
  since: ArrivalsSince,
  rarity: Rarity,
): void {
  for (const tier of PITY_RARITIES) {
    if (!isGuaranteeActive(tier, tables.pools)) {
      continue;
    }
    since[tier] = isAtLeast(rarity, tier) ? 0 : since[tier] + 1;
  }
}
