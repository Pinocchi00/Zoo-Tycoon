import { Matrix4, Quaternion, Vector3 } from 'three';
import type { BakedClip, VisitorClip, VisitorSource } from './types';

const SAMPLE_RATE = 30;
/** A 0.35 m chibi leg swinging through 18° covers about 0.43 m per full cycle. */
export const WALK_CYCLE_DISTANCE_M = 0.45;
/** One brief 100 ms simulation boundary pause must not select the stop pose. */
export const MIN_WALK_STOP_MS = 300;
/** Limits turns to one full revolution per second, avoiding instantaneous corner snaps. */
export const MAX_YAW_RAD_PER_SECOND = Math.PI * 2;
/** A 0.4 s critically damped spring gives a broad turn without oscillation. */
export const YAW_SMOOTH_TIME_S = 0.4;
/** Caps turns at 135°/s so even a reversal takes a visibly unhurried path. */
export const MAX_SMOOTH_YAW_RAD_PER_SECOND = Math.PI * 0.75;
const ANGLE_SETTLE_TOLERANCE_RAD = 0.0001;
const ANGULAR_VELOCITY_SETTLE_TOLERANCE = 0.0001;
const positionA = new Vector3();
const positionB = new Vector3();
const quaternionA = new Quaternion();
const quaternionB = new Quaternion();
const targetQuaternion = new Quaternion();
const scaleA = new Vector3();
const scaleB = new Vector3();
const local = new Matrix4();

export function walkingClipForStationaryTime(stationaryMs: number): 'walk' | 'stop' {
  return stationaryMs >= MIN_WALK_STOP_MS ? 'stop' : 'walk';
}

export function advanceWalkPhase(phase: number, distanceM: number): number {
  return (phase + distanceM / WALK_CYCLE_DISTANCE_M) % 1;
}

/** Turns along the shortest angular path, clamping the turn to one frame's limit. */
export function turnTowards(current: number, target: number, elapsedMs: number): number {
  const difference = Math.atan2(Math.sin(target - current), Math.cos(target - current));
  const maxRadians = (MAX_YAW_RAD_PER_SECOND * Math.max(0, elapsedMs)) / 1000;
  const change = Math.max(-maxRadians, Math.min(maxRadians, difference));
  return current + change;
}

export interface AngularSpringState {
  yaw: number;
  targetYaw: number;
  yawVelocity: number;
}

/** Advances a critically damped angular spring along the shortest path without overshoot. */
export function advanceAngularSpring(state: AngularSpringState, elapsedMs: number): void {
  const elapsedS = Math.max(0, elapsedMs) / 1000;
  if (elapsedS === 0) return;

  const difference = Math.atan2(
    Math.sin(state.targetYaw - state.yaw),
    Math.cos(state.targetYaw - state.yaw),
  );
  if (
    Math.abs(difference) <= ANGLE_SETTLE_TOLERANCE_RAD &&
    Math.abs(state.yawVelocity) <= ANGULAR_VELOCITY_SETTLE_TOLERANCE
  ) {
    state.yaw = state.targetYaw;
    state.yawVelocity = 0;
    return;
  }

  const target = state.yaw + difference;
  // Stronger damping preserves incoming velocity while braking before a close target.
  // With omega >= velocity / difference, the analytical error cannot cross zero.
  const omega = Math.max(
    2 / YAW_SMOOTH_TIME_S,
    difference === 0 ? 0 : state.yawVelocity / difference,
  );
  const error = state.yaw - target;
  const springTerm = state.yawVelocity + omega * error;
  const decay = Math.exp(-omega * elapsedS);
  const requestedYaw = target + (error + springTerm * elapsedS) * decay;
  const requestedVelocity = (state.yawVelocity - omega * springTerm * elapsedS) * decay;
  const yawChange = requestedYaw - state.yaw;
  const maximumChange = MAX_SMOOTH_YAW_RAD_PER_SECOND * elapsedS;

  if (Math.abs(yawChange) > maximumChange) {
    state.yaw += Math.sign(yawChange) * maximumChange;
    state.yawVelocity = Math.sign(yawChange) * MAX_SMOOTH_YAW_RAD_PER_SECOND;
  } else {
    state.yaw = requestedYaw;
    state.yawVelocity = Math.max(
      -MAX_SMOOTH_YAW_RAD_PER_SECOND,
      Math.min(MAX_SMOOTH_YAW_RAD_PER_SECOND, requestedVelocity),
    );
  }
}

export function sampleNodeLocal(
  clip: BakedClip,
  nodeIndex: number,
  phase: number,
  position: Vector3,
  quaternion: Quaternion,
  scale: Vector3,
): void {
  const positions = clip.positions[nodeIndex];
  const quaternions = clip.quaternions[nodeIndex];
  const scales = clip.scales[nodeIndex];
  if (positions === undefined || quaternions === undefined || scales === undefined) {
    throw new Error('Missing baked visitor node.');
  }
  const normalized = clip.name === 'sit' ? Math.min(1, Math.max(0, phase)) : ((phase % 1) + 1) % 1;
  const sample = normalized * (clip.sampleCount - 1);
  const first = Math.floor(sample);
  const second = Math.min(first + 1, clip.sampleCount - 1);
  const blend = sample - first;
  const p = first * 3;
  const q = first * 4;
  const nextP = second * 3;
  const nextQ = second * 4;
  // Write directly to the outputs so sampling the next pose cannot overwrite the previous pose.
  position.set(
    (positions[p] ?? 0) * (1 - blend) + (positions[nextP] ?? 0) * blend,
    (positions[p + 1] ?? 0) * (1 - blend) + (positions[nextP + 1] ?? 0) * blend,
    (positions[p + 2] ?? 0) * (1 - blend) + (positions[nextP + 2] ?? 0) * blend,
  );
  quaternion.set(
    quaternions[q] ?? 0,
    quaternions[q + 1] ?? 0,
    quaternions[q + 2] ?? 0,
    quaternions[q + 3] ?? 1,
  );
  targetQuaternion.set(
    quaternions[nextQ] ?? 0,
    quaternions[nextQ + 1] ?? 0,
    quaternions[nextQ + 2] ?? 0,
    quaternions[nextQ + 3] ?? 1,
  );
  quaternion.slerp(targetQuaternion, blend);
  scale.set(
    (scales[p] ?? 1) * (1 - blend) + (scales[nextP] ?? 1) * blend,
    (scales[p + 1] ?? 1) * (1 - blend) + (scales[nextP + 1] ?? 1) * blend,
    (scales[p + 2] ?? 1) * (1 - blend) + (scales[nextP + 2] ?? 1) * blend,
  );
}

export function computePoseMatrices(
  source: VisitorSource,
  clip: VisitorClip,
  phase: number,
  out: readonly Matrix4[],
): void {
  computeBlendedPoseMatrices(source, clip, clip, phase, phase, 0, out);
}

export function computeBlendedPoseMatrices(
  source: VisitorSource,
  currentClip: VisitorClip,
  nextClip: VisitorClip,
  currentPhase: number,
  nextPhase: number,
  blend: number,
  out: readonly Matrix4[],
  memberPhases?: readonly number[],
): void {
  for (let index = 0; index < source.nodes.length; index += 1) {
    const node = source.nodes[index];
    const matrix = out[index];
    if (node === undefined || matrix === undefined) {
      throw new Error('Visitor pose matrices must be preallocated.');
    }
    sampleNodeLocal(
      source.bakedClips[currentClip],
      index,
      currentPhase + (currentClip === 'walk' ? (memberPhases?.[node.personIndex] ?? 0) : 0),
      positionA,
      quaternionA,
      scaleA,
    );
    if (blend > 0) {
      sampleNodeLocal(
        source.bakedClips[nextClip],
        index,
        nextPhase + (nextClip === 'walk' ? (memberPhases?.[node.personIndex] ?? 0) : 0),
        positionB,
        quaternionB,
        scaleB,
      );
      positionA.lerp(positionB, blend);
      quaternionA.slerp(quaternionB, blend);
      scaleA.lerp(scaleB, blend);
    }
    local.compose(positionA, quaternionA, scaleA);
    const parent = out[node.parentIndex];
    if (node.parentIndex < 0) matrix.copy(local);
    else if (parent !== undefined) matrix.multiplyMatrices(parent, local);
    else throw new Error('Visitor node order is invalid.');
  }
}

export function sampleCountFor(duration: number): number {
  return Math.max(2, Math.ceil(duration * SAMPLE_RATE) + 1);
}
