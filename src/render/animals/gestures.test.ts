import { Bone, Group, Quaternion, Vector3, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import {
  EAR_FLICK_RAD,
  HEAD_MAX_PITCH_RAD,
  HEAD_MAX_YAW_RAD,
  TAIL_SWAT_RAD,
  TAIL_SWAY_RAD,
  TRUNK_PITCH_RAD,
  TRUNK_YAW_RAD,
  createGestures,
  type Gestures,
} from './gestures';

const FRAME_S = 1 / 60;
const HOUR_FRAMES = 60 * 60 * 60;
const EPSILON = 1e-6;
/** A rest pose that is not the identity, as in the real models. */
const REST = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.3);

function skeleton(names: readonly string[]): { root: Group; bones: Map<string, Object3D> } {
  const root = new Group();
  const bones = new Map<string, Object3D>();
  for (const name of names) {
    const bone = new Bone();
    bone.name = name;
    bone.quaternion.copy(REST);
    root.add(bone);
    bones.set(name, bone);
  }
  return { root, bones };
}

const ALL_BONES = ['head', 'ear_l', 'ear_r', 'tail', 'trunk'] as const;

function boneAngle(bones: Map<string, Object3D>, name: string): number {
  return bones.get(name)?.quaternion.angleTo(REST) ?? Number.NaN;
}

/** The turn about the bone's own up axis, worked out from the quaternion relative to rest. */
function turnAbout(bone: Object3D | undefined): number {
  if (bone === undefined) {
    return Number.NaN;
  }
  const local = REST.clone().invert().multiply(bone.quaternion);
  return 2 * Math.atan2(local.z, local.w);
}

function layerFor(
  seed: number,
  names: readonly string[] = ALL_BONES,
): {
  gestures: Gestures;
  bones: Map<string, Object3D>;
} {
  const { root, bones } = skeleton(names);
  const gestures = createGestures(root, seed);
  if (gestures === null) {
    throw new Error('expected a layer');
  }
  return { gestures, bones };
}

function step(gestures: Gestures): void {
  gestures.undo();
  gestures.apply(FRAME_S);
}

describe('createGestures', () => {
  it('has nothing to do for a model without any of the bones', () => {
    expect(createGestures(new Group(), 1)).toBeNull();
    expect(createGestures(skeleton(['spine', 'chest']).root, 1)).toBeNull();
  });

  it('works with the bones it finds and ignores the others', () => {
    for (const names of [['head'], ['ear_l', 'ear_r'], ['tail'], ['head', 'ear_l']]) {
      const { gestures, bones } = layerFor(2, names);
      let moved = 0;
      for (let frame = 0; frame < 60 * 120; frame += 1) {
        step(gestures);
        moved += [...bones.keys()].some((name) => boneAngle(bones, name) > 0.01) ? 1 : 0;
      }
      expect(moved).toBeGreaterThan(0);
    }
  });
});

describe('gestures over an hour', () => {
  const peaks = new Map<string, number>();

  it('stay within their bounds and are all there', () => {
    const { gestures, bones } = layerFor(7);
    for (const name of ALL_BONES) {
      peaks.set(name, 0);
    }
    let headTurn = 0;
    for (let frame = 0; frame < HOUR_FRAMES; frame += 1) {
      step(gestures);
      for (const name of ALL_BONES) {
        peaks.set(name, Math.max(peaks.get(name) ?? 0, boneAngle(bones, name)));
      }
      headTurn = Math.max(headTurn, Math.abs(turnAbout(bones.get('head'))));
    }
    const margin = 1.001;
    expect(peaks.get('head')).toBeLessThanOrEqual((HEAD_MAX_YAW_RAD + HEAD_MAX_PITCH_RAD) * margin);
    expect(peaks.get('ear_l')).toBeLessThanOrEqual(EAR_FLICK_RAD * margin);
    expect(peaks.get('ear_r')).toBeLessThanOrEqual(EAR_FLICK_RAD * margin);
    expect(peaks.get('tail')).toBeLessThanOrEqual((TAIL_SWAY_RAD + TAIL_SWAT_RAD) * margin);
    expect(peaks.get('trunk')).toBeLessThanOrEqual((TRUNK_YAW_RAD + TRUNK_PITCH_RAD) * margin);
    expect(headTurn).toBeLessThanOrEqual(HEAD_MAX_YAW_RAD * margin);
    // Every gesture is really there.
    expect(peaks.get('head')).toBeGreaterThan(0.3);
    expect(peaks.get('ear_l')).toBeGreaterThan(EAR_FLICK_RAD * 0.9);
    expect(peaks.get('ear_r')).toBeGreaterThan(EAR_FLICK_RAD * 0.9);
    expect(peaks.get('tail')).toBeGreaterThan(TAIL_SWAY_RAD);
    expect(peaks.get('trunk')).toBeGreaterThan(0.2);
  });

  it('leave no drift in the bones: taking them back restores the rest pose', () => {
    const { gestures, bones } = layerFor(11);
    for (let frame = 0; frame < HOUR_FRAMES; frame += 1) {
      step(gestures);
    }
    gestures.undo();
    for (const name of ALL_BONES) {
      expect(boneAngle(bones, name), name).toBeLessThan(EPSILON);
    }
  });

  it('never move the head faster than its top speed', () => {
    const { gestures, bones } = layerFor(5);
    const MAX_RATE_RAD_S = 1.3;
    let previous = turnAbout(bones.get('head'));
    for (let frame = 0; frame < 60 * 60 * 10; frame += 1) {
      step(gestures);
      const turn = turnAbout(bones.get('head'));
      expect(Math.abs(turn - previous) / FRAME_S).toBeLessThan(MAX_RATE_RAD_S);
      previous = turn;
    }
  });
});

describe('individuals', () => {
  it('do not gesture in step: other seeds give other head, ear and tail movements', () => {
    const traces = [1, 2, 3].map((seed) => {
      const { gestures, bones } = layerFor(seed);
      const trace: string[] = [];
      for (let frame = 0; frame < 60 * 120; frame += 1) {
        step(gestures);
        if (frame % 30 === 0) {
          trace.push(
            ['head', 'ear_l', 'tail'].map((name) => boneAngle(bones, name).toFixed(3)).join(','),
          );
        }
      }
      return trace.join(';');
    });
    expect(new Set(traces).size).toBe(3);
  });

  it('flick the left and right ears on their own', () => {
    const { gestures, bones } = layerFor(4);
    let together = 0;
    let left = 0;
    let right = 0;
    for (let frame = 0; frame < 60 * 60 * 20; frame += 1) {
      step(gestures);
      const isLeft = boneAngle(bones, 'ear_l') > 0.05;
      const isRight = boneAngle(bones, 'ear_r') > 0.05;
      left += isLeft ? 1 : 0;
      right += isRight ? 1 : 0;
      together += isLeft && isRight ? 1 : 0;
    }
    expect(left).toBeGreaterThan(100);
    expect(right).toBeGreaterThan(100);
    expect(together).toBeLessThan(Math.min(left, right) / 2);
  });

  it('are repeatable: same seed, same gestures', () => {
    const traces = [0, 1].map(() => {
      const { gestures, bones } = layerFor(9);
      let sum = 0;
      for (let frame = 0; frame < 60 * 600; frame += 1) {
        step(gestures);
        sum += boneAngle(bones, 'head') + boneAngle(bones, 'tail') + boneAngle(bones, 'ear_r');
      }
      return sum;
    });
    expect(traces[0]).toBe(traces[1]);
  });
});

describe('attention, sleep and neighbours', () => {
  function meanHeadTurn(attention: number): number {
    const { gestures, bones } = layerFor(6);
    gestures.drive.attention = attention;
    let sum = 0;
    const frames = 60 * 60 * 30;
    for (let frame = 0; frame < frames; frame += 1) {
      step(gestures);
      sum += Math.abs(turnAbout(bones.get('head')));
    }
    return sum / frames;
  }

  it('turns the head more when looking around than when not paying attention', () => {
    expect(meanHeadTurn(1)).toBeGreaterThan(meanHeadTurn(0) * 1.2);
  });

  it('settles the head, the ears, the tail and the trunk when asleep', () => {
    const { gestures, bones } = layerFor(3);
    for (let frame = 0; frame < 60 * 60; frame += 1) {
      step(gestures);
    }
    gestures.drive.awake = 0;
    gestures.drive.lookScale = 0;
    for (let frame = 0; frame < 60 * 10; frame += 1) {
      step(gestures);
    }
    let headPeak = 0;
    let trunkPeak = 0;
    let earPeak = 0;
    let tailPeak = 0;
    for (let frame = 0; frame < 60 * 60 * 10; frame += 1) {
      step(gestures);
      headPeak = Math.max(headPeak, boneAngle(bones, 'head'));
      trunkPeak = Math.max(trunkPeak, boneAngle(bones, 'trunk'));
      earPeak = Math.max(earPeak, boneAngle(bones, 'ear_l'));
      tailPeak = Math.max(tailPeak, boneAngle(bones, 'tail'));
    }
    expect(headPeak).toBeLessThan(0.01);
    expect(trunkPeak).toBeLessThan(0.01);
    expect(earPeak).toBeLessThanOrEqual(EAR_FLICK_RAD * 0.25);
    expect(tailPeak).toBeLessThanOrEqual((TAIL_SWAY_RAD + TAIL_SWAT_RAD) * 0.25);
  });

  it('keeps the trunk still while walking', () => {
    const { gestures, bones } = layerFor(3);
    gestures.drive.walking = 1;
    for (let frame = 0; frame < 60 * 600; frame += 1) {
      step(gestures);
      expect(boneAngle(bones, 'trunk')).toBeLessThan(0.01);
    }
  });

  it('sometimes looks towards a neighbour, within the limits of the head', () => {
    const { gestures, bones } = layerFor(8);
    gestures.gaze.hasNeighbour = true;
    gestures.gaze.yaw = 0.5;
    gestures.drive.attention = 1;
    let towards = 0;
    for (let frame = 0; frame < 60 * 60 * 20; frame += 1) {
      step(gestures);
      towards += Math.abs(turnAbout(bones.get('head')) - 0.5) < 0.05 ? 1 : 0;
    }
    expect(towards).toBeGreaterThan(60);

    gestures.gaze.yaw = 3;
    for (let frame = 0; frame < 60 * 60 * 5; frame += 1) {
      step(gestures);
      expect(Math.abs(turnAbout(bones.get('head')))).toBeLessThanOrEqual(HEAD_MAX_YAW_RAD * 1.001);
    }
  });
});
