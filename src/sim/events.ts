export interface CoinsAddedEvent {
  readonly type: 'coinsAdded';
  readonly amount: number;
  /** Coin balance right after the addition. */
  readonly total: number;
}

/** What happened in the simulation; render, audio and ui react to these instead of diffing the state. */
export type GameEvent = CoinsAddedEvent;

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
