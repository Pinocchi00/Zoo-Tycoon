import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { ISO_PITCH_RAD } from './camera-rig';
import { applyCameraPose, createIsoCamera } from './iso-camera';

describe('applyCameraPose', () => {
  it('frames the visible height and the screen aspect', () => {
    const camera = createIsoCamera();
    applyCameraPose(camera, { x: 0, z: 0, viewHeight: 20, yaw: 0 }, 2);
    expect(camera.top).toBe(10);
    expect(camera.bottom).toBe(-10);
    expect(camera.right).toBe(20);
    expect(camera.left).toBe(-20);
  });

  it('looks down at the target from the isometric tilt and the given heading', () => {
    const camera = createIsoCamera();
    applyCameraPose(camera, { x: 3, z: -4, viewHeight: 20, yaw: Math.PI / 2 }, 1);
    const offset = camera.position.clone().sub(new Vector3(3, 0, -4));
    expect(Math.atan2(offset.y, Math.hypot(offset.x, offset.z))).toBeCloseTo(ISO_PITCH_RAD, 9);
    // Heading π/2 puts the camera on the +X side of the target.
    expect(offset.x).toBeGreaterThan(0);
    expect(offset.z).toBeCloseTo(0, 9);
    const forward = camera.getWorldDirection(new Vector3());
    expect(forward.dot(offset.normalize())).toBeCloseTo(-1, 9);
  });
});
