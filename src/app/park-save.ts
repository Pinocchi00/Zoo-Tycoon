import type { SaveStorage } from '@/platform';
import { serialize, type SaveError } from '@/save';
import { logger } from '@/shared';
import { emit, type EventQueue, type GameState } from '@/sim';

/**
 * Played time between two automatic saves. Provisional: the GDD only asks for automatic saves.
 * Saving when the app leaves the screen is not enough alone: Android may kill it without warning.
 */
export const AUTOSAVE_INTERVAL_MS = 30_000;

export type ParkSaveStorage = SaveStorage<GameState, SaveError>;

/** The newest valid save, or a new park when there is none or none can be read. */
export async function loadOrCreatePark(
  saves: ParkSaveStorage,
  events: EventQueue,
  newPark: () => GameState,
): Promise<GameState> {
  const loaded = await saves.read();
  if (loaded.ok) {
    if (loaded.value.skippedCopies > 0) {
      emit(events, { type: 'saveRecovered', skippedCopies: loaded.value.skippedCopies });
    }
    return loaded.value.value;
  }
  if (loaded.error.kind !== 'noSave') {
    // The damaged copies stay on disk: SaveStorage removes them only after newer valid writes.
    logger.warn('No save could be loaded: starting a new park.', loaded.error);
  }
  return newPark();
}

export interface Autosaver {
  /** Counts played time and saves once AUTOSAVE_INTERVAL_MS has passed since the last save. */
  record: (playedMs: number) => void;
  /** Saves now, e.g. when the app leaves the screen. Resolves once this save is finished. */
  saveNow: () => Promise<void>;
}

async function writeAndReport(saves: ParkSaveStorage, text: string): Promise<void> {
  const written = await saves.write(text);
  if (!written.ok) {
    logger.warn('The park could not be saved.', written.error);
  } else if (written.value.cleanupFailure !== null) {
    logger.warn('Old save copies could not be removed.', written.value.cleanupFailure);
  }
}

/**
 * Saves `state` through `saves`, one write at a time. The text is taken when the save is asked
 * for, so a write that waits its turn still holds the park as it was at that moment.
 */
export function createAutosaver(
  saves: ParkSaveStorage,
  state: GameState,
  clockMs: () => number,
): Autosaver {
  let sincePreviousSaveMs = 0;
  let queue = Promise.resolve();

  const saveNow = (): Promise<void> => {
    sincePreviousSaveMs = 0;
    let text: string;
    try {
      text = serialize(state, clockMs());
    } catch (error) {
      // A bug, but saving must never stop the game: it is logged and the next save tries again.
      logger.error('The park could not be serialized.', error);
      return queue;
    }
    queue = queue
      .then(() => writeAndReport(saves, text))
      // Without this, one unexpected failure would leave the queue rejected and block every later save.
      .catch((error: unknown) => {
        logger.error('Unexpected failure while saving the park.', error);
      });
    return queue;
  };

  return {
    record: (playedMs) => {
      sincePreviousSaveMs += playedMs;
      if (sincePreviousSaveMs >= AUTOSAVE_INTERVAL_MS) {
        void saveNow();
      }
    },
    saveNow,
  };
}
