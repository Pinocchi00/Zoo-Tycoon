import { describe, expect, it } from 'vitest';
import {
  CAMERA_DAMPING_MS,
  createCameraRig,
  ISO_PITCH_RAD,
  panByPixels,
  rotateBy,
  updateCameraRig,
  zoomAtPixel,
  type CameraLimits,
  type CameraPose,
} from './camera-rig';

const LIMITS: CameraLimits = { minViewHeight: 5, maxViewHeight: 50, halfWidth: 20, halfDepth: 10 };
const VIEWPORT = { width: 400, height: 200 };
/** Heading 0: screen right is +X and screen up is -Z, which keeps expectations readable. */
const FACING_NORTH: CameraPose = { x: 0, z: 0, viewHeight: 20, yaw: 0 };

function settle(rig: ReturnType<typeof createCameraRig>): void {
  for (let frame = 0; frame < 200; frame += 1) {
    updateCameraRig(rig, 16);
  }
}

describe('createCameraRig', () => {
  it('uses the true isometric tilt', () => {
    expect(Math.tan(ISO_PITCH_RAD)).toBeCloseTo(1 / Math.SQRT2, 12);
  });

  it('refuses impossible zoom limits', () => {
    expect(() => createCameraRig({ ...LIMITS, minViewHeight: 0 }, FACING_NORTH)).toThrow(
      RangeError,
    );
    expect(() => createCameraRig({ ...LIMITS, minViewHeight: 60 }, FACING_NORTH)).toThrow(
      RangeError,
    );
  });

  it('brings a start pose outside the limits back inside, without gliding', () => {
    const rig = createCameraRig(LIMITS, { x: 99, z: -99, viewHeight: 999, yaw: 0 });
    expect(rig.current).toEqual({ x: 20, z: -10, viewHeight: 50, yaw: 0 });
    expect(rig.goal).toEqual(rig.current);
    expect(rig.goal).not.toBe(rig.current);
  });
});

describe('panByPixels', () => {
  it('moves the ground with the finger', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    // 10 px at 20 m for 200 px: 1 m. Dragging right shows what lies to the left.
    panByPixels(rig, 10, 0, VIEWPORT.height);
    expect(rig.goal.x).toBeCloseTo(-1, 12);
    expect(rig.goal.z).toBeCloseTo(0, 12);
  });

  it('covers more ground vertically because the ground is tilted', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    panByPixels(rig, 0, 5, VIEWPORT.height);
    expect(rig.goal.z).toBeCloseTo(-0.5 / Math.sin(ISO_PITCH_RAD), 12);
  });

  it('follows the heading', () => {
    const rig = createCameraRig(LIMITS, { ...FACING_NORTH, yaw: Math.PI / 2 });
    panByPixels(rig, 10, 0, VIEWPORT.height);
    expect(rig.goal.x).toBeCloseTo(0, 12);
    expect(rig.goal.z).toBeCloseTo(1, 12);
  });

  it('never leaves the park', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    panByPixels(rig, -100_000, 100_000, VIEWPORT.height);
    expect(rig.goal.x).toBe(LIMITS.halfWidth);
    expect(rig.goal.z).toBe(-LIMITS.halfDepth);
  });

  it('only moves the goal: the camera glides there', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    panByPixels(rig, 10, 0, VIEWPORT.height);
    expect(rig.current.x).toBe(0);
  });
});

describe('zoomAtPixel', () => {
  it('zooms in by the factor at the centre without moving', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    zoomAtPixel(rig, 2, VIEWPORT.width / 2, VIEWPORT.height / 2, VIEWPORT);
    expect(rig.goal.viewHeight).toBe(10);
    expect(rig.goal.x).toBeCloseTo(0, 12);
    expect(rig.goal.z).toBeCloseTo(0, 12);
  });

  it('keeps the ground point under the cursor in place', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    // 100 px right of centre at 0.1 m/px: the point is 10 m right of the target.
    zoomAtPixel(rig, 2, 300, 100, VIEWPORT);
    // At 0.05 m/px the same pixel is 5 m right: the target moved 5 m towards it.
    expect(rig.goal.x).toBeCloseTo(5, 12);
  });

  it('stays within the zoom limits', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    zoomAtPixel(rig, 1000, 0, 0, VIEWPORT);
    expect(rig.goal.viewHeight).toBe(LIMITS.minViewHeight);
    zoomAtPixel(rig, 0.0001, 0, 0, VIEWPORT);
    expect(rig.goal.viewHeight).toBe(LIMITS.maxViewHeight);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])('ignores a factor of %s', (factor) => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    zoomAtPixel(rig, factor, 10, 10, VIEWPORT);
    expect(rig.goal).toEqual(FACING_NORTH);
  });
});

describe('updateCameraRig', () => {
  it('covers about 63 % of the way in one damping time', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    rig.goal.x = 10;
    updateCameraRig(rig, CAMERA_DAMPING_MS);
    expect(rig.current.x).toBeCloseTo(10 * (1 - Math.exp(-1)), 12);
  });

  it('does not depend on how the time is split into frames', () => {
    const smooth = createCameraRig(LIMITS, FACING_NORTH);
    const choppy = createCameraRig(LIMITS, FACING_NORTH);
    smooth.goal.viewHeight = 40;
    choppy.goal.viewHeight = 40;
    for (let frame = 0; frame < 6; frame += 1) {
      updateCameraRig(smooth, 16);
    }
    updateCameraRig(choppy, 48);
    updateCameraRig(choppy, 48);
    expect(smooth.current.viewHeight).toBeCloseTo(choppy.current.viewHeight, 9);
  });

  it('never moves on a zero or negative frame time', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    rig.goal.x = 10;
    updateCameraRig(rig, 0);
    updateCameraRig(rig, -50);
    expect(rig.current.x).toBe(0);
  });

  it('reaches the goal without overshooting', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    rig.goal.x = 10;
    let previous = 0;
    for (let frame = 0; frame < 200; frame += 1) {
      updateCameraRig(rig, 16);
      expect(rig.current.x).toBeGreaterThanOrEqual(previous);
      expect(rig.current.x).toBeLessThanOrEqual(10);
      previous = rig.current.x;
    }
    expect(rig.current.x).toBeCloseTo(10, 9);
  });

  it('keeps the heading small after many turns, without a visible jump', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    for (let turn = 0; turn < 50; turn += 1) {
      rotateBy(rig, 1);
      settle(rig);
    }
    expect(Math.abs(rig.goal.yaw)).toBeLessThan(Math.PI * 2);
    const expected = 50 % (Math.PI * 2);
    expect(Math.cos(rig.current.yaw)).toBeCloseTo(Math.cos(expected), 9);
    expect(Math.sin(rig.current.yaw)).toBeCloseTo(Math.sin(expected), 9);
  });
});

describe('rotateBy', () => {
  it('ignores a non-finite angle', () => {
    const rig = createCameraRig(LIMITS, FACING_NORTH);
    rotateBy(rig, Number.NaN);
    rotateBy(rig, Number.POSITIVE_INFINITY);
    expect(rig.goal.yaw).toBe(0);
  });
});
