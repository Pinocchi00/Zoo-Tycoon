import { describe, expect, it } from 'vitest';
import type { AnimalAnimation } from './animal-model';
import {
  RESTART_COOLDOWN_MS,
  WALK_HOLD_MS,
  nextMoving,
  promoteToLegs,
  settleClip,
  showClip,
  tickClipClock,
  type ClipState,
} from './clip-choice';

const STEP_MS = 100;

function still(shown: AnimalAnimation): ClipState {
  return { shown, stillMs: 0, restMs: 0, clipAgeMs: 0 };
}

/** One image of an animal that wants to walk: the order of the herd (promote, then settle). */
function image(
  state: ClipState,
  options: { intent: boolean; moving: boolean; behaviourClip: AnimalAnimation },
): AnimalAnimation {
  tickClipClock(state, STEP_MS);
  promoteToLegs(state, options.intent, 'walk');
  const clip = settleClip(state, { ...options, swimming: false, elapsedMs: STEP_MS });
  showClip(state, clip);
  return state.shown;
}

describe('nextMoving', () => {
  it('keeps counting a body as moving until it is nearly still: no flicker round one threshold', () => {
    let moving = false;
    let changes = 0;
    // A speed that wavers between 0.025 and 0.035 m/s, round the old single threshold of 0.03.
    for (let step = 0; step < 100; step += 1) {
      const next = nextMoving(moving, step % 2 === 0 ? 0.025 : 0.035, 0);
      changes += next === moving ? 0 : 1;
      moving = next;
    }
    expect(changes).toBe(0);
    expect(nextMoving(false, 0.05, 0)).toBe(true);
    expect(nextMoving(true, 0.03, 0)).toBe(true);
    expect(nextMoving(true, 0.01, 0)).toBe(false);
    expect(nextMoving(false, 0, 0.3)).toBe(true);
    expect(nextMoving(true, 0, 0.15)).toBe(true);
  });
});

describe('the clip of an animal that wants to walk but cannot', () => {
  it('walks a moment, puts the walk down, waits, and only then shows it again', () => {
    const state = still('walk');
    const shown: AnimalAnimation[] = [];
    for (let frame = 0; frame < 40; frame += 1) {
      shown.push(image(state, { intent: true, moving: false, behaviourClip: 'walk' }));
    }
    const firstIdle = shown.indexOf('idle');
    // It holds the walk for at most half a second...
    expect(firstIdle * STEP_MS).toBeLessThanOrEqual(WALK_HOLD_MS + STEP_MS);
    expect(firstIdle).toBeGreaterThan(0);
    // ... stays down for the whole of the wait, however much it wants to go ...
    const waitFrames = Math.floor(RESTART_COOLDOWN_MS / STEP_MS);
    expect(shown.slice(firstIdle, firstIdle + waitFrames - 1)).toEqual(
      Array(waitFrames - 1).fill('idle'),
    );
    // ... then shows it again.
    expect(shown[firstIdle + waitFrames + 1]).toBe('walk');
  });

  it('does not start a walk clip that nothing asks for', () => {
    const state = still('idle');
    for (let frame = 0; frame < 20; frame += 1) {
      expect(image(state, { intent: false, moving: false, behaviourClip: 'idle' })).toBe('idle');
    }
  });

  it('walks as soon as it moves, whatever it is doing, and holds the walk after it stops', () => {
    const state = still('eat');
    expect(image(state, { intent: false, moving: true, behaviourClip: 'eat' })).toBe('walk');
    const held: AnimalAnimation[] = [];
    for (let frame = 0; frame < 8; frame += 1) {
      held.push(image(state, { intent: false, moving: false, behaviourClip: 'eat' }));
    }
    expect(held.slice(0, 3)).toEqual(['walk', 'walk', 'walk']);
    expect(held.at(-1)).toBe('eat');
  });
});
