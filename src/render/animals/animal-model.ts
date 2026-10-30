import {
  AnimationMixer,
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

/** Per-individual variation, so that two animals never breathe in step. */
export interface AnimalLook {
  /** Where in the idle loop the animal starts, from 0 to 1. */
  readonly startPhase: number;
  /** Playback speed of every clip, close to 1. */
  readonly timeScale: number;
}

export interface AnimalModel {
  readonly root: Object3D;
  /** Name of the signature clip (`swim`, `stretch`, `trunk`, `root`). */
  readonly signatureName: string;
  /** Fades to `animation`; does nothing when it is already the one playing. */
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
  const { actions, idleDurationS, signatureName } = created.value;
  prepareMeshes(root);
  mixer.timeScale = look.timeScale;
  actions.idle.time = look.startPhase * idleDurationS;
  actions.idle.play();
  let current: AnimalAnimation = 'idle';
  return ok({
    root,
    signatureName,
    play: (animation) => {
      if (animation === current) {
        return;
      }
      const next = actions[animation];
      next.reset().play();
      actions[current].crossFadeTo(next, CROSS_FADE_S, false);
      current = animation;
    },
    setTimeScale: (scale) => {
      mixer.timeScale = scale;
    },
    update: (elapsedMs) => {
      mixer.update(elapsedMs / MS_PER_SECOND);
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
