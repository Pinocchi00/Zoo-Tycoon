import {
  AnimationMixer,
  Box3,
  Vector3,
  BufferGeometry,
  LoopRepeat,
  Material,
  Mesh,
  MeshStandardMaterial,
  type AnimationAction,
  type AnimationClip,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { err, ok, type Result } from '@/shared';
import { createRng, randomFloat } from '@/sim';
import { clipNeeds, createBodyLife, type ClipNeeds } from './body-life';

const MS_PER_SECOND = 1000;
/** Short enough to feel responsive, long enough to hide the change of pose. */
const CROSS_FADE_S = 0.4;

/** Clips every animal model carries (checked by npm run assets:check). */
export const REQUIRED_CLIPS = ['idle', 'walk', 'sleep', 'eat'] as const;
export type RequiredClip = (typeof REQUIRED_CLIPS)[number];

/** What the behaviour can ask for: the required clips plus the species' signature clip. */
export type AnimalAnimation = RequiredClip | 'signature';

export interface MissingClip {
  readonly kind: 'missingClip';
  readonly name: RequiredClip;
}

/** A model must carry exactly one clip beyond the required ones: its signature. */
export interface BadSignature {
  readonly kind: 'badSignature';
  /** The clips found beyond the required ones: none, or more than one. */
  readonly clips: readonly string[];
}

export type AnimalModelProblem = MissingClip | BadSignature;

function isRequiredClip(name: string): boolean {
  return REQUIRED_CLIPS.some((required) => required === name);
}

export function pickClip(
  clips: readonly AnimationClip[],
  name: RequiredClip,
): Result<AnimationClip, MissingClip> {
  const clip = clips.find((candidate) => candidate.name === name);
  return clip === undefined ? err({ kind: 'missingClip', name }) : ok(clip);
}

/** The signature is the one clip that is not required, so data needs no field for it. */
export function findSignatureClip(
  clips: readonly AnimationClip[],
): Result<AnimationClip, BadSignature> {
  const extra = clips.filter((clip) => !isRequiredClip(clip.name));
  const [only, ...others] = extra;
  if (only === undefined || others.length > 0) {
    return err({ kind: 'badSignature', clips: extra.map((clip) => clip.name) });
  }
  return ok(only);
}

const ANIMATIONS: readonly AnimalAnimation[] = ['idle', 'walk', 'sleep', 'eat', 'signature'];

/** Per-individual variation, so that two animals never breathe in step. */
export interface AnimalLook {
  /** Where in the idle loop the animal starts, from 0 to 1. */
  readonly startPhase: number;
  /** Playback speed of every clip, close to 1. */
  readonly timeScale: number;
  /** Unsigned 32-bit seed of this animal's own visual randomness (blinks, clip phases). */
  readonly seed: number;
}

export interface AnimalModel {
  readonly root: Object3D;
  /** Name of the signature clip (`swim`, `stretch`, `trunk`, `root`). */
  readonly signatureName: string;
  /** Longest horizontal side of the model's box, in metres: its size on screen follows from it. */
  readonly lengthM: number;
  /** Fades to `animation`, from a random point of its loop; nothing if it is already playing. */
  play: (animation: AnimalAnimation) => void;
  setTimeScale: (scale: number) => void;
  /** Advances the playing animations by `elapsedMs`. */
  update: (elapsedMs: number) => void;
  dispose: () => void;
}

function isMaterial(value: unknown): value is Material {
  return value instanceof Material;
}

function materialsOf(material: unknown): Material[] {
  const entries: unknown[] = Array.isArray(material) ? material : [material];
  return entries.filter(isMaterial);
}

function prepareMeshes(root: Object3D): void {
  root.traverse((object) => {
    if (object instanceof Mesh) {
      object.castShadow = true;
      object.receiveShadow = true;
    }
  });
}

function disposeModel(root: Object3D): void {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) {
      return;
    }
    const geometry: unknown = object.geometry;
    if (geometry instanceof BufferGeometry) {
      geometry.dispose();
    }
    for (const material of materialsOf(object.material)) {
      // Animal models carry a single texture: the palette, as the base colour map.
      if (material instanceof MeshStandardMaterial) {
        material.map?.dispose();
      }
      material.dispose();
    }
  });
}

/** The parts of a loaded glTF that an animal needs. */
export interface AnimalSource {
  readonly scene: Object3D;
  readonly animations: readonly AnimationClip[];
}

/** An individual of the same species: own skeleton, but geometry and materials are shared. */
export function cloneAnimalSource(source: AnimalSource): AnimalSource {
  return { scene: cloneSkinned(source.scene), animations: source.animations };
}

/** Frees the GPU resources of a source; its clones must not be used afterwards. */
export function disposeAnimalSource(source: AnimalSource): void {
  disposeModel(source.scene);
}

export interface AnimalModelOptions {
  /** True for a clone: geometry and materials belong to the shared source, not to this model. */
  readonly sharedResources: boolean;
}

interface Playback {
  readonly actions: Readonly<Record<AnimalAnimation, AnimationAction>>;
  readonly needs: Readonly<Record<AnimalAnimation, ClipNeeds>>;
  readonly idleDurationS: number;
  readonly signatureName: string;
}

function createPlayback(
  mixer: AnimationMixer,
  clips: readonly AnimationClip[],
): Result<Playback, AnimalModelProblem> {
  const idle = pickClip(clips, 'idle');
  if (!idle.ok) {
    return idle;
  }
  const walk = pickClip(clips, 'walk');
  if (!walk.ok) {
    return walk;
  }
  const sleep = pickClip(clips, 'sleep');
  if (!sleep.ok) {
    return sleep;
  }
  const eat = pickClip(clips, 'eat');
  if (!eat.ok) {
    return eat;
  }
  const signature = findSignatureClip(clips);
  if (!signature.ok) {
    return signature;
  }
  const actionFor = (clip: AnimationClip): AnimationAction =>
    mixer.clipAction(clip).setLoop(LoopRepeat, Infinity);
  return ok({
    actions: {
      idle: actionFor(idle.value),
      walk: actionFor(walk.value),
      sleep: actionFor(sleep.value),
      eat: actionFor(eat.value),
      signature: actionFor(signature.value),
    },
    needs: {
      idle: clipNeeds(idle.value),
      walk: clipNeeds(walk.value),
      sleep: clipNeeds(sleep.value),
      eat: clipNeeds(eat.value),
      signature: clipNeeds(signature.value),
    },
    idleDurationS: idle.value.duration,
    signatureName: signature.value.name,
  });
}

/**
 * Builds an animal from loaded glTF data. It starts idle, at `look.startPhase` of the loop.
 * A refused model is freed unless its resources are shared.
 */
export function createAnimalModel(
  source: AnimalSource,
  look: AnimalLook,
  options: AnimalModelOptions = { sharedResources: false },
): Result<AnimalModel, AnimalModelProblem> {
  const root = source.scene;
  const mixer = new AnimationMixer(root);
  const created = createPlayback(mixer, source.animations);
  if (!created.ok) {
    mixer.uncacheRoot(root);
    if (!options.sharedResources) {
      disposeModel(root);
    }
    return created;
  }
  const { actions, needs, idleDurationS, signatureName } = created.value;
  const rng = createRng(look.seed);
  const life = createBodyLife(root, look.seed);
  const playing = ANIMATIONS.map((name) => ({ action: actions[name], needs: needs[name] }));
  prepareMeshes(root);
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  const lengthM = Math.max(size.x, size.z);
  mixer.timeScale = look.timeScale;
  actions.idle.time = look.startPhase * idleDurationS;
  actions.idle.play();
  let current: AnimalAnimation = 'idle';
  return ok({
    root,
    signatureName,
    lengthM,
    play: (animation) => {
      if (animation === current) {
        return;
      }
      // Before a clip binds a bone for the first time, which would keep the layer's addition as its rest value.
      life?.undo();
      const next = actions[animation];
      next.reset();
      next.time = randomFloat(rng) * next.getClip().duration;
      next.play();
      actions[current].crossFadeTo(next, CROSS_FADE_S, false);
      current = animation;
    },
    setTimeScale: (scale) => {
      mixer.timeScale = scale;
    },
    update: (elapsedMs) => {
      const elapsedS = elapsedMs / MS_PER_SECOND;
      life?.undo();
      mixer.update(elapsedS);
      if (life === null) {
        return;
      }
      let total = 0;
      let breathing = 0;
      let blinking = 0;
      for (const { action, needs: clip } of playing) {
        if (action.isRunning()) {
          const weight = action.getEffectiveWeight();
          total += weight;
          breathing += clip.breath ? weight : 0;
          blinking += clip.blink ? weight : 0;
        }
      }
      const scale = total > 0 ? 1 / total : 0;
      life.apply(elapsedS * mixer.timeScale, breathing * scale, blinking * scale);
    },
    dispose: () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      root.removeFromParent();
      if (!options.sharedResources) {
        disposeModel(root);
      }
    },
  });
}

/** Decodes a .glb animal. */
export async function parseAnimalSource(glb: ArrayBuffer): Promise<AnimalSource> {
  const gltf = await new GLTFLoader().parseAsync(glb, '');
  return { scene: gltf.scene, animations: gltf.animations };
}

/** Downloads and decodes a .glb animal. Network failures reject. */
export async function loadAnimalSource(url: string): Promise<AnimalSource> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url} (HTTP ${String(response.status)}).`);
  }
  return parseAnimalSource(await response.arrayBuffer());
}
