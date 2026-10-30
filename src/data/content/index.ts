import type { RawGameData } from '../load';
import { banners } from './banners';
import { biomes } from './biomes';
import { buildRules, pathSurfaces } from './build-rules';
import { economyRules } from './economy';
import { enclosureSizes } from './enclosure-sizes';
import { gachaRules } from './gacha-rules';
import { habitatElements } from './habitat-elements';
import { buildings, decor, visitorArchetypes } from './park';
import { species } from './species';
import { terrain } from './terrain';
import { visitorRules } from './visitor-rules';

/** All the content of the game, as written. Validate it with `loadGameData`. */
export const GAME_CONTENT: RawGameData = {
  gachaRules,
  enclosureSizes,
  terrain,
  buildRules,
  pathSurfaces,
  banners,
  biomes,
  habitatElements,
  species,
  buildings,
  decor,
  visitorArchetypes,
  visitorRules,
  economyRules,
};
