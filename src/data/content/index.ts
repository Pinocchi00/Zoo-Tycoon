import type { RawGameData } from '../load';
import { banners } from './banners';
import { biomes } from './biomes';
import { enclosureSizes } from './enclosure-sizes';
import { gachaRules } from './gacha-rules';
import { habitatElements } from './habitat-elements';
import { buildings, decor, visitorArchetypes } from './park';
import { species } from './species';

/** All the content of the game, as written. Validate it with `loadGameData`. */
export const GAME_CONTENT: RawGameData = {
  gachaRules,
  enclosureSizes,
  banners,
  biomes,
  habitatElements,
  species,
  buildings,
  decor,
  visitorArchetypes,
};
