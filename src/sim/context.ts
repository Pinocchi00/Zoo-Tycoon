import type { GameData } from '../data/load';
import { createPathCache, type PathCache } from './visitors/path-cache';

/**
 * Cells the camera looks at, both corners included. Visitors outside are updated less often;
 * app sets it every frame, like a command, and the simulation never guesses it. Mutable, so that
 * app can refill one object every frame instead of allocating.
 */
export interface FocusArea {
  minColumn: number;
  minRow: number;
  maxColumn: number;
  maxRow: number;
}

/**
 * What a step needs besides the state: the game data, the camera's focus and caches derived
 * from the state. Kept outside GameState so that the state stays plain, saveable JSON; the
 * caches never change a result, only how fast it is computed.
 */
export interface SimContext {
  readonly data: GameData;
  /** Null: every visitor at full rate (economy simulator, offline catch-up, tests). */
  focus: FocusArea | null;
  readonly paths: PathCache;
}

export function createSimContext(data: GameData): SimContext {
  return { data, focus: null, paths: createPathCache() };
}
