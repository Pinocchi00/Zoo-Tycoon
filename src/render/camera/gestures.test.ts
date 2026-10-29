import { describe, expect, it } from 'vitest';
import { createCameraRig, type CameraLimits, type CameraPose } from './camera-rig';
import {
  activePointerCount,
  angleDifference,
  createGestureTracker,
  movePointer,
  pressPointer,
  releasePointer,
  ROTATE_RAD_PER_PIXEL,
  wheelZoom,
} from './gestures';

const LIMITS: CameraLimits = {
  minViewHeight: 1,
  maxViewHeight: 100,
  halfWidth: 100,
  halfDepth: 100,
};
const VIEWPORT = { width: 400, height: 200 };
const START: CameraPose = { x: 0, z: 0, viewHeight: 20, yaw: 0 };

function setup(): {
  tracker: ReturnType<typeof createGestureTracker>;
  rig: ReturnType<typeof createCameraRig>;
} {
  return { tracker: createGestureTracker(), rig: createCameraRig(LIMITS, START) };
}

describe('angleDifference', () => {
  it.each([
    [0, 1, 1],
    [1, 0, -1],
    [3, -3, Math.PI * 2 - 6],
    [-3, 3, 6 - Math.PI * 2],
    [0, Math.PI, Math.PI],
    [0, -Math.PI, Math.PI],
    [0, 5 * Math.PI, Math.PI],
  ])('from %s to %s is %s', (from, to, expected) => {
    expect(angleDifference(from, to)).toBeCloseTo(expected, 12);
  });
});

describe('pressPointer and releasePointer', () => {
  it('tracks at most two pointers', () => {
    const { tracker } = setup();
    expect(pressPointer(tracker, 1, 0, 0, 'pan')).toBe(true);
    expect(pressPointer(tracker, 2, 0, 0, 'pan')).toBe(true);
    expect(pressPointer(tracker, 3, 0, 0, 'pan')).toBe(false);
    expect(activePointerCount(tracker)).toBe(2);
  });

  it('accepts the same pointer twice without counting it twice', () => {
    const { tracker } = setup();
    pressPointer(tracker, 1, 0, 0, 'pan');
    expect(pressPointer(tracker, 1, 5, 5, 'pan')).toBe(true);
    expect(activePointerCount(tracker)).toBe(1);
  });

  it('frees the slot on release and ignores unknown pointers', () => {
    const { tracker } = setup();
    pressPointer(tracker, 1, 0, 0, 'pan');
    releasePointer(tracker, 42);
    expect(activePointerCount(tracker)).toBe(1);
    releasePointer(tracker, 1);
    expect(activePointerCount(tracker)).toBe(0);
  });
});

describe('movePointer with one pointer', () => {
  it('pans the camera', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 100, 100, 'pan');
    movePointer(tracker, rig, 1, 110, 100, VIEWPORT);
    expect(rig.goal.x).toBeCloseTo(-1, 12);
  });

  it('turns the camera with the right button', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 100, 100, 'rotate');
    movePointer(tracker, rig, 1, 110, 100, VIEWPORT);
    expect(rig.goal.yaw).toBeCloseTo(-10 * ROTATE_RAD_PER_PIXEL, 12);
    expect(rig.goal.x).toBe(0);
  });

  it('ignores a pointer that was never pressed', () => {
    const { tracker, rig } = setup();
    movePointer(tracker, rig, 7, 300, 300, VIEWPORT);
    movePointer(tracker, rig, -1, 300, 300, VIEWPORT);
    expect(rig.goal).toEqual(START);
  });
});

describe('movePointer with two fingers', () => {
  it('zooms in when the fingers spread', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 150, 100, 'pan');
    pressPointer(tracker, 2, 250, 100, 'pan');
    movePointer(tracker, rig, 2, 350, 100, VIEWPORT);
    // Twice as far apart: twice as close.
    expect(rig.goal.viewHeight).toBeCloseTo(10, 9);
  });

  it('turns with the fingers', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 200, 50, 'pan');
    pressPointer(tracker, 2, 200, 150, 'pan');
    // Second finger swings a quarter turn around the first, clockwise on screen.
    movePointer(tracker, rig, 2, 100, 50, VIEWPORT);
    expect(rig.goal.yaw).toBeCloseTo(Math.PI / 2, 9);
  });

  it('ignores pinch and twist when the fingers are almost on top of each other', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 200, 100, 'pan');
    pressPointer(tracker, 2, 201, 100, 'pan');
    movePointer(tracker, rig, 2, 200, 101, VIEWPORT);
    expect(rig.goal.viewHeight).toBe(START.viewHeight);
    expect(rig.goal.yaw).toBe(0);
  });

  it('keeps panning with the remaining finger without a jump', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 100, 100, 'pan');
    pressPointer(tracker, 2, 300, 100, 'pan');
    releasePointer(tracker, 2);
    const before = rig.goal.x;
    movePointer(tracker, rig, 1, 100, 100, VIEWPORT);
    expect(rig.goal.x).toBe(before);
  });

  it('a mouse right button released mid-gesture falls back to panning', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 100, 100, 'rotate');
    releasePointer(tracker, 1);
    pressPointer(tracker, 2, 0, 0, 'pan');
    movePointer(tracker, rig, 2, 10, 0, VIEWPORT);
    expect(rig.goal.yaw).toBe(0);
    expect(tracker.dragMode).toBe('pan');
  });
});

describe('wheelZoom', () => {
  it('zooms in on scroll up and out on scroll down', () => {
    const { rig } = setup();
    wheelZoom(rig, -100, 200, 100, VIEWPORT);
    expect(rig.goal.viewHeight).toBeLessThan(START.viewHeight);
    const zoomedIn = rig.goal.viewHeight;
    wheelZoom(rig, 100, 200, 100, VIEWPORT);
    expect(rig.goal.viewHeight).toBeCloseTo(START.viewHeight, 9);
    expect(zoomedIn).toBeGreaterThan(0);
  });
});

describe('a pointer pressed again without a release', () => {
  it('starts again from its new position and mode', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 100, 100, 'rotate');
    // The release was lost; the same pointer comes down elsewhere with the left button.
    expect(pressPointer(tracker, 1, 300, 150, 'pan')).toBe(true);
    expect(activePointerCount(tracker)).toBe(1);
    movePointer(tracker, rig, 1, 310, 150, VIEWPORT);
    expect(rig.goal.yaw).toBe(0);
    expect(rig.goal.x).toBeCloseTo(-1, 12);
  });

  it('refreshes the two-finger reference, so the next move does not pinch', () => {
    const { tracker, rig } = setup();
    pressPointer(tracker, 1, 100, 100, 'pan');
    pressPointer(tracker, 2, 200, 100, 'pan');
    pressPointer(tracker, 2, 300, 100, 'pan');
    movePointer(tracker, rig, 2, 300, 100, VIEWPORT);
    expect(rig.goal.viewHeight).toBe(START.viewHeight);
  });
});
