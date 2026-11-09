import { describe, expect, it } from 'vitest';
import {
  cancelTap,
  createTapTracker,
  moveTap,
  pressTap,
  releaseTap,
  TAP_DISPLACEMENT_THRESHOLD_PX,
} from './tap-tracker';

const THRESHOLD = TAP_DISPLACEMENT_THRESHOLD_PX;
const JUST_UNDER = THRESHOLD - 1;
const JUST_OVER = THRESHOLD + 1;

function setup(thresholdPx?: number): ReturnType<typeof createTapTracker> {
  return createTapTracker(thresholdPx);
}

describe('pressTap', () => {
  it('starts a candidate with the primary button', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 200, true);
    expect(tracker.pointerId).toBe(1);
    expect(tracker.startX).toBe(100);
    expect(tracker.startY).toBe(200);
    expect(tracker.invalidated).toBe(false);
  });

  it('ignores a non-primary button when idle', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 200, false);
    expect(tracker.pointerId).toBe(-1);
    expect(tracker.invalidated).toBe(false);
  });

  it('invalidates the current candidate on a non-primary button', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 200, true);
    pressTap(tracker, 2, 50, 50, false);
    expect(tracker.pointerId).toBe(1);
    expect(tracker.invalidated).toBe(true);
  });

  it('invalidates the current candidate when a second primary pointer appears', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 200, true);
    pressTap(tracker, 2, 50, 50, true);
    expect(tracker.pointerId).toBe(1);
    expect(tracker.invalidated).toBe(true);
  });

  it('restarts at the new position when the same pointer presses again without release', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 200, true);
    pressTap(tracker, 1, 300, 400, true);
    expect(tracker.pointerId).toBe(1);
    expect(tracker.startX).toBe(300);
    expect(tracker.startY).toBe(400);
    expect(tracker.invalidated).toBe(false);
  });
});

describe('moveTap', () => {
  it('keeps the candidate alive just under the threshold', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    moveTap(tracker, 1, 100 + JUST_UNDER, 100);
    expect(tracker.invalidated).toBe(false);
  });

  it('invalidates once the threshold is exceeded', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    moveTap(tracker, 1, 100 + JUST_OVER, 100);
    expect(tracker.invalidated).toBe(true);
  });

  it('stays invalidated even if the pointer returns to the start', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    moveTap(tracker, 1, 100 + JUST_OVER, 100);
    moveTap(tracker, 1, 100, 100);
    expect(tracker.invalidated).toBe(true);
  });

  it('ignores moves from an untracked pointer', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    moveTap(tracker, 2, 500, 500);
    expect(tracker.invalidated).toBe(false);
  });
});

describe('releaseTap', () => {
  it('fires on a clean primary tap', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    expect(releaseTap(tracker, 1)).toBe(true);
    expect(tracker.pointerId).toBe(-1);
  });

  it('does not fire after the pointer moved too far', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    moveTap(tracker, 1, 100 + JUST_OVER, 100);
    expect(releaseTap(tracker, 1)).toBe(false);
  });

  it('does not fire for an unknown pointer', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    expect(releaseTap(tracker, 99)).toBe(false);
    expect(tracker.pointerId).toBe(1);
  });

  it('does not fire after multitouch', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    pressTap(tracker, 2, 200, 200, true);
    expect(releaseTap(tracker, 1)).toBe(false);
  });

  it('does not fire after cancel', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    cancelTap(tracker, 1);
    expect(releaseTap(tracker, 1)).toBe(false);
  });

  it('resets the tracker even when it does not fire', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    moveTap(tracker, 1, 100 + JUST_OVER, 100);
    releaseTap(tracker, 1);
    expect(tracker.pointerId).toBe(-1);
    expect(tracker.invalidated).toBe(false);
  });
});

describe('cancelTap', () => {
  it('cancels the current candidate', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    cancelTap(tracker, 1);
    expect(releaseTap(tracker, 1)).toBe(false);
  });

  it('ignores an unknown pointer', () => {
    const tracker = setup();
    pressTap(tracker, 1, 100, 100, true);
    cancelTap(tracker, 99);
    expect(tracker.pointerId).toBe(1);
  });
});

describe('custom threshold', () => {
  it('uses the provided threshold', () => {
    const tracker = setup(50);
    pressTap(tracker, 1, 100, 100, true);
    moveTap(tracker, 1, 140, 100);
    expect(tracker.invalidated).toBe(false);
    moveTap(tracker, 1, 160, 100);
    expect(tracker.invalidated).toBe(true);
  });
});

describe('overlapping multitouch gestures', () => {
  it('stays cancelled until every pointer has left, even if the first pointer leaves early', () => {
    const tracker = setup();
    pressTap(tracker, 1, 0, 0, true);
    pressTap(tracker, 2, 20, 0, true);
    expect(releaseTap(tracker, 1)).toBe(false);
    pressTap(tracker, 3, 40, 0, true);
    expect(releaseTap(tracker, 3)).toBe(false);
    expect(releaseTap(tracker, 2)).toBe(false);
    pressTap(tracker, 4, 0, 0, true);
    expect(releaseTap(tracker, 4)).toBe(true);
  });

  it('does not revive the first pointer when the other pointer loses capture', () => {
    const tracker = setup();
    pressTap(tracker, 1, 0, 0, true);
    pressTap(tracker, 2, 20, 0, true);
    cancelTap(tracker, 2);
    expect(releaseTap(tracker, 1)).toBe(false);
  });
});
