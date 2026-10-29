import { OrthographicCamera, Vector3 } from 'three';
import { ISO_PITCH_RAD, type CameraPose } from './camera-rig';

/** Distance from the look-at point: only the direction matters for an orthographic view. */
const CAMERA_DISTANCE_M = 120;
const NEAR_M = 1;
const FAR_M = 260;

const COS_PITCH = Math.cos(ISO_PITCH_RAD);
const SIN_PITCH = Math.sin(ISO_PITCH_RAD);

export function createIsoCamera(): OrthographicCamera {
  return new OrthographicCamera(-1, 1, 1, -1, NEAR_M, FAR_M);
}

const lookAtTarget = new Vector3();

/** Copies `pose` into the camera; called every frame, so it allocates nothing. */
export function applyCameraPose(
  camera: OrthographicCamera,
  pose: Readonly<CameraPose>,
  aspect: number,
): void {
  const halfHeight = pose.viewHeight / 2;
  const halfWidth = halfHeight * aspect;
  camera.left = -halfWidth;
  camera.right = halfWidth;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.updateProjectionMatrix();

  const horizontal = CAMERA_DISTANCE_M * COS_PITCH;
  camera.position.set(
    pose.x + horizontal * Math.sin(pose.yaw),
    CAMERA_DISTANCE_M * SIN_PITCH,
    pose.z + horizontal * Math.cos(pose.yaw),
  );
  lookAtTarget.set(pose.x, 0, pose.z);
  camera.lookAt(lookAtTarget);
}
