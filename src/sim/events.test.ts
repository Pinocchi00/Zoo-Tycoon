import { describe, expect, it } from 'vitest';
import { createEventQueue, drain, emit, type GameEvent } from './events';

const FIRST: GameEvent = { type: 'coinsAdded', amount: 5, total: 5 };
const SECOND: GameEvent = { type: 'coinsAdded', amount: 3, total: 8 };

describe('event queue', () => {
  it('hands events to the reader in emission order, then is empty', () => {
    const queue = createEventQueue();
    emit(queue, FIRST);
    emit(queue, SECOND);

    expect(drain(queue)).toEqual([FIRST, SECOND]);
    expect(drain(queue)).toEqual([]);
  });

  it('does not let a drained list change with later events', () => {
    const queue = createEventQueue();
    emit(queue, FIRST);
    const drained = drain(queue);
    emit(queue, SECOND);

    expect(drained).toEqual([FIRST]);
    expect(drain(queue)).toEqual([SECOND]);
  });

  it('returns the same empty list on quiet frames, without allocating', () => {
    const queue = createEventQueue();
    expect(drain(queue)).toBe(drain(queue));
  });
});
