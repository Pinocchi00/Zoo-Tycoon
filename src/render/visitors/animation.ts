import { Matrix4, Quaternion, Vector3 } from 'three';
import type { BakedClip, VisitorClip, VisitorSource } from './types';

const SAMPLE_RATE = 30;
const positionA = new Vector3();
const positionB = new Vector3();
const quaternionA = new Quaternion();
const quaternionB = new Quaternion();
const targetQuaternion = new Quaternion();
const scaleA = new Vector3();
const scaleB = new Vector3();
const local = new Matrix4();

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
