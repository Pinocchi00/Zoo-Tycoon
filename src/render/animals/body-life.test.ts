import { AnimationClip, Bone, Group, VectorKeyframeTrack, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { createAnimalModel, type AnimalAnimation, type AnimalLook } from './animal-model';
import { clipNeeds, createBodyLife } from './body-life';

const LOOP_S = 4;
const FRAME_S = 1 / 60;
const FRAME_MS = FRAME_S * 1000;
const BREATH_MAX = 1.03;

function track(name: string, from: number[], to: number[]): VectorKeyframeTrack {
  // Out and back, so that the loop has no seam.
  return new VectorKeyframeTrack(name, [0, LOOP_S / 2, LOOP_S], [...from, ...to, ...from]);
}

const BREATHING = track('chest.scale', [1, 1, 1], [1.03, 1, 1.03]);
const HELD_CHEST = track('chest.scale', [1, 1, 1], [1, 1, 1]);
const BLINKING = track('eyes.scale', [1, 1, 1], [1, 0.1, 1]);
const OPEN_EYES = track('eyes.scale', [1, 1, 1], [1, 1, 1]);
const CLOSED_EYES = track('eyes.scale', [1, 0.1, 1], [1, 0.1, 1]);

function clip(name: string, ...tracks: VectorKeyframeTrack[]): AnimationClip {
  return new AnimationClip(name, LOOP_S, tracks);
}

function skeleton(): { root: Group; chest: Object3D; eyes: Object3D } {
  const root = new Group();
  const chest = new Bone();
  chest.name = 'chest';
  const eyes = new Bone();
  eyes.name = 'eyes';
  root.add(chest, eyes);
  return { root, chest, eyes };
}

describe('clipNeeds', () => {
  it('leaves breathing and blinking to the clips that carry none', () => {
    expect(clipNeeds(clip('idle', BREATHING, BLINKING))).toEqual({ breath: false, blink: false });
    expect(clipNeeds(clip('walk', HELD_CHEST, OPEN_EYES))).toEqual({ breath: true, blink: true });
    expect(clipNeeds(clip('stretch'))).toEqual({ breath: true, blink: true });
  });

  it('does not make a sleeper blink: its eyes are closed', () => {
    expect(clipNeeds(clip('sleep', BREATHING, CLOSED_EYES))).toEqual({
      breath: false,
      blink: false,
    });
  });
});

describe('createBodyLife', () => {
  it('has nothing to do for a model without chest and eyes', () => {
    expect(createBodyLife(new Group(), 1)).toBeNull();
  });

  it('adds and takes back its own share, so the bones never drift', () => {
    const { root, chest, eyes } = skeleton();
    const life = createBodyLife(root, 1);
    if (life === null) {
      throw new Error('expected a layer');
    }
    let tallest = 1;
    let narrowest = 1;
    for (let frame = 0; frame < 60 * 60; frame += 1) {
      life.undo();
      life.apply(FRAME_S, 1, 1);
      tallest = Math.max(tallest, chest.scale.x);
      narrowest = Math.min(narrowest, eyes.scale.y);
      expect(chest.scale.x).toBeLessThanOrEqual(BREATH_MAX);
      expect(chest.scale.y).toBe(1);
      expect(eyes.scale.y).toBeLessThanOrEqual(1);
    }
    expect(tallest).toBeGreaterThan(1.02);
    expect(narrowest).toBeLessThan(0.2);
    life.undo();
    expect(chest.scale.x).toBeCloseTo(1, 12);
    expect(eyes.scale.y).toBeCloseTo(1, 12);
  });

  it('does nothing for a share of zero', () => {
    const { root, chest, eyes } = skeleton();
    const life = createBodyLife(root, 1);
    life?.undo();
    for (let frame = 0; frame < 600; frame += 1) {
      life?.apply(FRAME_S, 0, 0);
    }
    expect(chest.scale.x).toBe(1);
    expect(eyes.scale.y).toBe(1);
  });

  it('blinks at a rhythm of its own for each individual', () => {
    const firstBlink = (seed: number): number => {
      const { root, eyes } = skeleton();
      const life = createBodyLife(root, seed);
      for (let frame = 0; frame < 60 * 30; frame += 1) {
        life?.undo();
        life?.apply(FRAME_S, 1, 1);
        if (eyes.scale.y < 0.9) {
          return frame;
        }
      }
      return -1;
    };
    const firsts = [1, 2, 3, 4, 5, 6].map(firstBlink);
    expect(firsts.every((frame) => frame > 0)).toBe(true);
    expect(new Set(firsts).size).toBeGreaterThan(3);
  });
});

describe('an animal model that walks, eats and sleeps', () => {
  const LOOK: AnimalLook = { startPhase: 0, timeScale: 1, seed: 9 };

  function animal(): {
    chest: Object3D;
    eyes: Object3D;
    play: (name: AnimalAnimation) => void;
    update: (ms: number) => void;
  } {
    const { root, chest, eyes } = skeleton();
    const created = createAnimalModel(
      {
        scene: root,
        animations: [
          clip('idle', BREATHING, BLINKING),
          clip('walk', HELD_CHEST, OPEN_EYES),
          clip('sleep', BREATHING, CLOSED_EYES),
          clip('eat', HELD_CHEST, OPEN_EYES),
          clip('stretch', HELD_CHEST, OPEN_EYES),
        ],
      },
      LOOK,
    );
    if (!created.ok) {
      throw new Error('expected a model');
    }
    return { chest, eyes, play: created.value.play, update: created.value.update };
  }

  it('keeps breathing and blinking while walking, which has no such tracks', () => {
    const { chest, eyes, play, update } = animal();
    play('walk');
    update(1000);
    let widest = 1;
    let narrowest = 1;
    for (let frame = 0; frame < 60 * 20; frame += 1) {
      update(FRAME_MS);
      widest = Math.max(widest, chest.scale.x);
      narrowest = Math.min(narrowest, eyes.scale.y);
    }
    expect(widest).toBeGreaterThan(1.02);
    expect(narrowest).toBeLessThan(0.3);
  });

  it('never jumps when fading between clips with and without their own breathing', () => {
    const { chest, eyes, play, update } = animal();
    const MAX_CHEST_JUMP = 0.01;
    // A blink closes the eyes by 0.9 in half of 0.24 s, at most 0.2 per image at 60 images per second.
    const MAX_EYES_JUMP = 0.25;
    let previousChest = chest.scale.x;
    let previousEyes = eyes.scale.y;
    const sequence: readonly AnimalAnimation[] = [
      'walk',
      'idle',
      'eat',
      'sleep',
      'idle',
      'signature',
      'walk',
    ];
    for (const name of sequence) {
      play(name);
      for (let frame = 0; frame < 60 * 3; frame += 1) {
        update(FRAME_MS);
        expect(Math.abs(chest.scale.x - previousChest)).toBeLessThan(MAX_CHEST_JUMP);
        expect(Math.abs(eyes.scale.y - previousEyes)).toBeLessThan(MAX_EYES_JUMP);
        previousChest = chest.scale.x;
        previousEyes = eyes.scale.y;
      }
    }
  });

  it('keeps the eyes shut while asleep', () => {
    const { eyes, play, update } = animal();
    play('sleep');
    update(2000);
    for (let frame = 0; frame < 60 * 20; frame += 1) {
      update(FRAME_MS);
      expect(eyes.scale.y).toBeCloseTo(0.1);
    }
  });

  it('never drifts when no clip animates the bones at all', () => {
    const { root, chest } = skeleton();
    const created = createAnimalModel(
      { scene: root, animations: ['idle', 'walk', 'sleep', 'eat', 'swim'].map((n) => clip(n)) },
      LOOK,
    );
    if (!created.ok) {
      throw new Error('expected a model');
    }
    for (let frame = 0; frame < 60 * 60; frame += 1) {
      created.value.update(FRAME_MS);
      expect(chest.scale.x).toBeLessThanOrEqual(BREATH_MAX);
      expect(chest.scale.x).toBeGreaterThanOrEqual(1);
    }
  });

  it('never drifts when clips without chest and eye tracks follow one another again and again', () => {
    const { root, chest, eyes } = skeleton();
    const created = createAnimalModel(
      {
        scene: root,
        animations: [
          clip('idle', BREATHING, BLINKING),
          clip('walk'),
          clip('sleep', BREATHING, CLOSED_EYES),
          clip('eat'),
          clip('stretch'),
        ],
      },
      LOOK,
    );
    if (!created.ok) {
      throw new Error('expected a model');
    }
    const sequence: readonly AnimalAnimation[] = ['walk', 'idle', 'eat', 'sleep', 'signature'];
    for (let round = 0; round < 40; round += 1) {
      for (const name of sequence) {
        created.value.play(name);
        for (let frame = 0; frame < 45; frame += 1) {
          created.value.update(FRAME_MS);
          expect(chest.scale.x).toBeGreaterThanOrEqual(1 - 1e-9);
          expect(chest.scale.x).toBeLessThanOrEqual(BREATH_MAX + 1e-9);
          expect(eyes.scale.y).toBeGreaterThanOrEqual(0.1 - 1e-9);
          expect(eyes.scale.y).toBeLessThanOrEqual(1 + 1e-9);
        }
      }
    }
  });
});
