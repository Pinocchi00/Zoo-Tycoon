import { GAME_CONTENT } from '../../data/content';
import { SYNTHETIC_GACHA_CONTENT } from '../../data/fixtures/synthetic-gacha';
import { formatDataErrors, loadGameData, type GameData, type RawGameData } from '../../data/load';
import { bannerId, speciesId, type BannerId, type SpeciesId } from '../../shared/brand';

/** Shared by the gacha and save tests only: game code never loads data this way. */
function load(raw: RawGameData): GameData {
  const loaded = loadGameData(raw);
  if (!loaded.ok) {
    throw new Error(formatDataErrors(loaded.error));
  }
  return loaded.value;
}

/** The real slice content: no iconic species, a single very rare (the jaguar). */
export function sliceGameData(): GameData {
  return load(GAME_CONTENT);
}

/** Two species in each of the five tiers, for the full engine. */
export function syntheticGameData(): GameData {
  return load(SYNTHETIC_GACHA_CONTENT);
}

export function testSpeciesId(raw: string): SpeciesId {
  const id = speciesId(raw);
  if (!id.ok) {
    throw new Error(id.error);
  }
  return id.value;
}

export function testBannerId(raw: string): BannerId {
  const id = bannerId(raw);
  if (!id.ok) {
    throw new Error(id.error);
  }
  return id.value;
}
