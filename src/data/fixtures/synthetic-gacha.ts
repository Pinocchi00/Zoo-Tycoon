import { banners } from '../content/banners';
import { biomes } from '../content/biomes';
import { enclosureSizes } from '../content/enclosure-sizes';
import { gachaRules } from '../content/gacha-rules';
import { habitatElements } from '../content/habitat-elements';
import { capybara } from '../content/species/capybara';
import type { RawGameData } from '../load';
import { RARITIES, type Rarity } from '../schemas/common';
import type { SpeciesInput } from '../schemas/species';

/** Species per rarity tier: two, so that the draw inside a tier is tested too. */
const SPECIES_PER_TIER = 2;

function syntheticSpecies(rarity: Rarity, index: number): SpeciesInput {
  return { ...capybara, id: `synthetic-${rarity.toLowerCase()}-${String(index)}`, rarity };
}

/**
 * Test-only content with every rarity tier filled, for the full gacha engine (task 1.3).
 * The real slice has no iconic species; this set has two species in each of the five tiers.
 */
export const SYNTHETIC_GACHA_CONTENT: RawGameData = {
  gachaRules,
  enclosureSizes,
  banners,
  biomes,
  habitatElements,
  species: RARITIES.flatMap((rarity) =>
    Array.from({ length: SPECIES_PER_TIER }, (_unused, index) => syntheticSpecies(rarity, index)),
  ),
  buildings: [],
  decor: [],
  visitorArchetypes: [],
};
