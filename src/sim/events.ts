export interface CoinsAddedEvent {
  readonly type: 'coinsAdded';
  readonly amount: number;
  /** Coin balance right after the addition. */
  readonly total: number;
}

/**
 * The main save was damaged and an older copy was loaded instead.
 * Emitted by app after loading, so that ui can tell the player gently.
 */
export interface SaveRecoveredEvent {
  readonly type: 'saveRecovered';
  /** Newer copies that could not be read and were skipped. */
  readonly skippedCopies: number;
}

/** What happened in the simulation; render, audio and ui react to these instead of diffing the state. */
export type GameEvent = CoinsAddedEvent | SaveRecoveredEvent;

/** Events waiting for the reader. Kept outside GameState so that they never end up in a save. */
export interface EventQueue {
  pending: GameEvent[];
}

const NO_EVENTS: readonly GameEvent[] = [];

export function createEventQueue(): EventQueue {
  return { pending: [] };
}

export function emit(queue: EventQueue, event: GameEvent): void {
  queue.pending.push(event);
}

/** Hands every pending event to the reader and empties the queue; called once per frame. */
export function drain(queue: EventQueue): readonly GameEvent[] {
  if (queue.pending.length === 0) {
    // Most frames have no event: answer without allocating.
    return NO_EVENTS;
  }
  const events = queue.pending;
  queue.pending = [];
  return events;
}
