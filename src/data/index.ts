// Layer entry point: see AGENTS.md section 3.
import { GAME_CONTENT } from './content';
import { loadGameData, type DataError, type GameData } from './load';
import type { Result } from '../shared/result';

export { GAME_CONTENT } from './content';
export * from './load';
export * from './schemas/build';
export * from './schemas/common';
export * from './schemas/gacha';
export * from './schemas/park';
export * from './schemas/species';

/** Validates the content shipped with the game. Called once at startup by `app`. */
export function loadGameContent(): Result<GameData, readonly DataError[]> {
  return loadGameData(GAME_CONTENT);
}
