import { describe, expect, it, vi } from 'vitest';
import {
  applyPointerCancel,
  applyPointerDown,
  applyPointerMove,
  applyPointerUp,
  attachCameraControls,
  dragModeFor,
  MAX_WHEEL_STEP_PX,
  wheelPixels,
  type PointerEventLike,
} from './controls';
import { createCameraRig, type CameraLimits, type CameraPose } from './camera-rig';
import { createGestureTracker } from './gestures';
import { createTapTracker } from './tap-tracker';

const LIMITS: CameraLimits = {
  minViewHeight: 1,
  maxViewHeight: 100,
  halfWidth: 100,
  halfDepth: 100,
};
const VIEWPORT = { width: 400, height: 200 };
const START: CameraPose = { x: 0, z: 0, viewHeight: 20, yaw: 0 };

class FakePointerEvent implements PointerEventLike {
  defaultPrevented = false;

  constructor(
    readonly pointerId: number,
    readonly button: number,
    readonly pointerType: string,
    readonly offsetX: number,
    readonly offsetY: number,
  ) {}

  preventDefault(): void {
    this.defaultPrevented = true;
  }
}

describe('dragModeFor', () => {
  it.each(['touch', 'pen'])('always pans with a %s', (pointerType) => {
    expect(dragModeFor(pointerType, 0)).toBe('pan');
    expect(dragModeFor(pointerType, 2)).toBe('pan');
  });

  it('pans with the left button and turns with the right one', () => {
    expect(dragModeFor('mouse', 0)).toBe('pan');
    expect(dragModeFor('mouse', 2)).toBe('rotate');
  });

  it.each([1, 3, 4])('ignores mouse button %s', (button) => {
    expect(dragModeFor('mouse', button)).toBeNull();
  });
});

describe('wheelPixels', () => {
  it('keeps pixel deltas as they are', () => {
    expect(wheelPixels(-120, 0, 800)).toBe(-120);
  });

  it('converts lines and pages to pixels', () => {
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(0.25, 2, 800)).toBe(200);
  });

  it('bounds a single event in both directions', () => {
    expect(wheelPixels(5, 2, 800)).toBe(MAX_WHEEL_STEP_PX);
    expect(wheelPixels(-10_000, 0, 800)).toBe(-MAX_WHEEL_STEP_PX);
  });
});

describe('applyPointerDown', () => {
  it('starts tracking with the primary button and tells the caller to prevent default', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const event = new FakePointerEvent(1, 0, 'touch', 100, 100);
    expect(applyPointerDown(event, tracker, tap, () => true)).toBe(true);
  });

  it('ignores a non-primary mouse button', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const event = new FakePointerEvent(1, 1, 'mouse', 100, 100);
    expect(applyPointerDown(event, tracker, tap, () => true)).toBe(false);
  });

  it('does nothing when capture fails', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const event = new FakePointerEvent(1, 0, 'touch', 100, 100);
    expect(applyPointerDown(event, tracker, tap, () => false)).toBe(false);
  });
});

describe('applyPointerUp tap detection', () => {
  it('fires onTap for a clean primary tap', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const onTap = vi.fn();
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerUp(new FakePointerEvent(1, 0, 'touch', 100, 100), tracker, tap, onTap);
    expect(onTap).toHaveBeenCalledExactlyOnceWith(100, 100);
  });

  it('does not fire onTap after movement beyond the threshold', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const onTap = vi.fn();
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerMove(
      new FakePointerEvent(1, -1, 'touch', 120, 100),
      tracker,
      tap,
      createCameraRig(LIMITS, START),
      VIEWPORT,
    );
    applyPointerUp(new FakePointerEvent(1, 0, 'touch', 120, 100), tracker, tap, onTap);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('does not fire onTap after a second pointer joins', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const onTap = vi.fn();
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerDown(new FakePointerEvent(2, 0, 'touch', 200, 100), tracker, tap, () => true);
    applyPointerUp(new FakePointerEvent(1, 0, 'touch', 100, 100), tracker, tap, onTap);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('does not fire onTap after cancel', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const onTap = vi.fn();
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerCancel(new FakePointerEvent(1, -1, 'touch', 100, 100), tracker, tap);
    applyPointerUp(new FakePointerEvent(1, 0, 'touch', 100, 100), tracker, tap, onTap);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('does not double-fire onTap if pointerup is followed by lost capture', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const onTap = vi.fn();
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerUp(new FakePointerEvent(1, 0, 'touch', 100, 100), tracker, tap, onTap);
    applyPointerCancel(new FakePointerEvent(1, -1, 'touch', 100, 100), tracker, tap);
    expect(onTap).toHaveBeenCalledTimes(1);
  });
});

describe('applyPointerMove', () => {
  it('pans the camera while tracking a candidate tap', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const rig = createCameraRig(LIMITS, START);
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerMove(new FakePointerEvent(1, -1, 'touch', 110, 100), tracker, tap, rig, VIEWPORT);
    expect(rig.goal.x).not.toBe(0);
  });

  it('pinches with two fingers', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const rig = createCameraRig(LIMITS, START);
    pressDown(tracker, tap, 1, 150, 100, 'touch');
    pressDown(tracker, tap, 2, 250, 100, 'touch');
    applyPointerMove(new FakePointerEvent(2, -1, 'touch', 350, 100), tracker, tap, rig, VIEWPORT);
    expect(rig.goal.viewHeight).toBeLessThan(START.viewHeight);
  });
});

describe('tap release coordinates', () => {
  it('rejects a distant release even when a final pointermove was not delivered', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const onTap = vi.fn();
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerUp(new FakePointerEvent(1, 0, 'touch', 140, 100), tracker, tap, onTap);
    expect(onTap).not.toHaveBeenCalled();
  });

  it('invalidates the current tap even if capture of a second finger fails', () => {
    const tracker = createGestureTracker();
    const tap = createTapTracker();
    const onTap = vi.fn();
    pressDown(tracker, tap, 1, 100, 100, 'touch');
    applyPointerDown(new FakePointerEvent(2, 0, 'touch', 200, 100), tracker, tap, () => false);
    applyPointerUp(new FakePointerEvent(1, 0, 'touch', 100, 100), tracker, tap, onTap);
    expect(onTap).not.toHaveBeenCalled();
  });
});

describe('attachCameraControls', () => {
  it('is exported as a function', () => {
    expect(typeof attachCameraControls).toBe('function');
  });
});

function pressDown(
  tracker: ReturnType<typeof createGestureTracker>,
  tap: ReturnType<typeof createTapTracker>,
  pointerId: number,
  x: number,
  y: number,
  pointerType: string,
): void {
  applyPointerDown(new FakePointerEvent(pointerId, 0, pointerType, x, y), tracker, tap, () => true);
}
