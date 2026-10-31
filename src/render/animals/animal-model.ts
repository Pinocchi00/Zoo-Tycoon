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
import { createGestures, type GazeInput } from './gestures';

const MS_PER_SECOND = 1000;
/** Short enough to feel responsive, long enough to hide the change of pose. */
export const CROSS_FADE_S = 0.4;

/** Clips every animal model carries (checked by npm run assets:check). */
export const REQUIRED_CLIPS = ['idle', 'walk', 'sleep', 'eat'] as const;
export type RequiredClip = (typeof REQUIRED_CLIPS)[number];

/** What the behaviour can ask for: the required clips plus the species' signature clip. */
export type AnimalAnimation = RequiredClip | 'signature';

export interface MissingClip {
  readonly kind: 'missingClip';
  readonly name: RequiredClip;
}

/**
 * A model carries one signature clip beyond the required ones. Other clips, which Blender may
 * add later, are ignored; they never make a model refused.
 */
export interface BadSignature {
  readonly kind: 'badSignature';
  /** The clips found beyond the required ones: none, or several that could be the signature. */
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

/** Names of the signature clips of the species (D-024). */
export const SIGNATURE_CLIPS = ['swim', 'stretch', 'trunk', 'root'] as const;

function isSignatureName(name: string): boolean {
  return SIGNATURE_CLIPS.some((known) => known === name);
}

/**
 * The signature is the clip that is neither required nor unknown, so data needs no field for it:
 * the only extra clip, or when a model has several, the only one with a signature name. Any
 * other clip is left alone, so that new animations do not break existing models.
 */
export function findSignatureClip(
  clips: readonly AnimationClip[],
): Result<AnimationClip, BadSignature> {
  const extra = clips.filter((clip) => !isRequiredClip(clip.name));
  const [only, ...others] = extra;
  if (only !== undefined && others.length === 0) {
    return ok(only);
  }
  const named = extra.filter((clip) => isSignatureName(clip.name));
  const [signature, ...rivals] = named;
  if (signature === undefined || rivals.length > 0) {
    return err({ kind: 'badSignature', clips: extra.map((clip) => clip.name) });
  }
  return ok(signature);
}

/** Walking clips are played at a speed that follows the real speed, so feet do not slide. */
export const WALK_REFERENCE_SPEED_MPS = 0.6;
/** A very slow walk plays very slowly; the animal stops rather than glide on legs that do not move. */
const WALK_SCALE_MIN = 0.1;
const WALK_SCALE_MAX = 1.6;

/** Speed at which the swim clip plays at its natural rate (a slow, relaxed swim). */
export const SWIM_REFERENCE_SPEED_MPS = 0.3;

/** Playback speed of the swim clip for a swimmer going at `speedMps`. */
export function swimClipScale(speedMps: number): number {
  return Math.max(WALK_SCALE_MIN, Math.min(WALK_SCALE_MAX, speedMps / SWIM_REFERENCE_SPEED_MPS));
}

/**
 * Playback speed of the walk clip for an animal moving at `speedMps`, given the speed over the
 * ground that the clip covers at its natural rate (`walkSpeedMps` of the model).
 */
export function walkClipScale(
  speedMps: number,
  naturalSpeedMps: number = WALK_REFERENCE_SPEED_MPS,
): number {
  return Math.max(WALK_SCALE_MIN, Math.min(WALK_SCALE_MAX, speedMps / naturalSpeedMps));
}

/** Largest turn between two keys of a rotation track, in radians. */
function largestSwing(values: ArrayLike<number>): number {
  const keys = Math.floor(values.length / 4);
  let largest = 0;
  for (let first = 0; first < keys; first += 1) {
    for (let second = first + 1; second < keys; second += 1) {
      const dot = Math.abs(
        (values[first * 4] ?? 0) * (values[second * 4] ?? 0) +
          (values[first * 4 + 1] ?? 0) * (values[second * 4 + 1] ?? 0) +
          (values[first * 4 + 2] ?? 0) * (values[second * 4 + 2] ?? 0) +
          (values[first * 4 + 3] ?? 0) * (values[second * 4 + 3] ?? 0),
      );
      largest = Math.max(largest, 2 * Math.acos(Math.min(1, dot)));
    }
  }
  return largest;
}

/** Metres of stride an animal pivoting on the spot is credited with, to pace its walk clip. */
const PIVOT_STRIDE_M = 0.4;
/** Above this speed (m/s) the turning no longer adds to the pace of the feet. */
const PIVOT_FADE_SPEED_MPS = 0.2;

/**
 * The pace the feet must keep, as a speed: that of the body, or when it hardly moves and turns on
 * the spot, a stride a turn needs. The turn counts for less as the body goes faster.
 */
export function walkPace(speedMps: number, turnRateRadS: number): number {
  const pivot = turnRateRadS * PIVOT_STRIDE_M * Math.max(0, 1 - speedMps / PIVOT_FADE_SPEED_MPS);
  return Math.max(speedMps, pivot);
}

/** Speeds over the ground that a model can walk at without sliding are within these. */
const NATURAL_SPEED_MIN_MPS = 0.15;
const NATURAL_SPEED_MAX_MPS = 2.5;
/** Over a cycle a foot is on the ground for half of it and travels back by 2 hip heights times sin(swing): 4 times, a second. */
const STRIDE_FACTOR = 4;

/**
 * The speed over the ground at which the walk clip of a model moves its feet at the pace of the
 * ground: in a cycle each foot is on the ground for half of it and travels back by twice the
 * height of the hip times the sine of the swing, which is half the largest turn of a leg.
 * Falls back to the reference speed for a model without legs to measure.
 */
export function naturalWalkSpeed(root: Object3D, walk: AnimationClip): number {
  const leg = walk.tracks.find((track) => track.name === 'leg_fl.quaternion');
  const hip = root.getObjectByName('leg_fl');
  if (leg === undefined || hip === undefined || walk.duration <= 0) {
    return WALK_REFERENCE_SPEED_MPS;
  }
  root.updateWorldMatrix(true, true);
  const hipHeight = hip.getWorldPosition(new Vector3()).y;
  const speed =
    (STRIDE_FACTOR * hipHeight * Math.sin(largestSwing(leg.values) / 2)) / walk.duration;
  return Number.isFinite(speed) && speed >= NATURAL_SPEED_MIN_MPS && speed <= NATURAL_SPEED_MAX_MPS
    ? speed
    : WALK_REFERENCE_SPEED_MPS;
}

/** The head looks about this much less while the animal eats. */
const EATING_LOOK_CUT = 0.7;

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
  /** Speed over the ground at which the walk clip plays at its natural rate (see `naturalWalkSpeed`). */
  readonly walkSpeedMps: number;
  /** Where the neighbours are: the head may look their way. Written by the herd. */
  readonly gaze: GazeInput;
  /** How much the animal looks about, from 0 (head still) to 1; see `attentionOf`. */
  setAttention: (attention: number) => void;
  /** Speed of the walk clip, see `walkClipScale`. */
  setWalkScale: (scale: number) => void;
  /** Speed of the signature clip: a swim follows the real speed of the swimmer. */
  setSignatureScale: (scale: number) => void;
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

/** Longest horizontal side of the box of a model, in metres: nose to tail. */
export function animalLength(root: Object3D): number {
  const size = new Box3().setFromObject(root).getSize(new Vector3());
  return Math.max(size.x, size.z);
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
  const gestures = createGestures(root, look.seed);
  const gaze: GazeInput = gestures?.gaze ?? { hasNeighbour: false, yaw: 0 };
  const playing = ANIMATIONS.map((name) => ({
    name,
    action: actions[name],
    needs: needs[name],
  }));
  prepareMeshes(root);
  const lengthM = animalLength(root);
  const walkSpeedMps = naturalWalkSpeed(root, actions.walk.getClip());
  mixer.timeScale = look.timeScale;
  actions.idle.time = look.startPhase * idleDurationS;
  // Every clip plays all the time; the model sets how much of each shows. The weights are its
  // own, not the mixer's fades, so that asking for another clip while a fade is still going on
  // goes on from where the weights are, instead of starting the fade over and making a pop.
  const weights: Record<AnimalAnimation, number> = {
    idle: 1,
    walk: 0,
    sleep: 0,
    eat: 0,
    signature: 0,
  };
  for (const { name, action } of playing) {
    action.weight = weights[name];
    action.play();
  }
  let current: AnimalAnimation = 'idle';
  return ok({
    root,
    signatureName,
    lengthM,
    walkSpeedMps,
    gaze,
    setAttention: (attention) => {
      if (gestures !== null) {
        gestures.drive.attention = attention;
      }
    },
    setWalkScale: (scale) => {
      actions.walk.timeScale = scale;
    },
    setSignatureScale: (scale) => {
      actions.signature.timeScale = scale;
    },
    play: (animation) => {
      if (animation === current) {
        return;
      }
      // A clip that is not showing at all starts from a point of its loop of its own.
      const next = actions[animation];
      if (weights[animation] <= 0) {
        next.time = randomFloat(rng) * next.getClip().duration;
      }
      current = animation;
    },
    setTimeScale: (scale) => {
      mixer.timeScale = scale;
    },
    update: (elapsedMs) => {
      const elapsedS = elapsedMs / MS_PER_SECOND;
      life?.undo();
      gestures?.undo();
      // The wanted clip gains weight, the others lose it, at the pace of the cross-fade; the
      // weights are kept adding up to one.
      const fade = elapsedS / CROSS_FADE_S;
      let total = 0;
      for (const { name } of playing) {
        const goal = name === current ? 1 : 0;
        const weight = weights[name];
        weights[name] =
          goal > weight ? Math.min(goal, weight + fade) : Math.max(goal, weight - fade);
        total += weights[name];
      }
      let breathing = 0;
      let blinking = 0;
      let sleeping = 0;
      let eating = 0;
      let walking = 0;
      for (const { name, action, needs: clip } of playing) {
        const weight = total > 0 ? weights[name] / total : name === current ? 1 : 0;
        weights[name] = weight;
        action.weight = weight;
        breathing += clip.breath ? weight : 0;
        blinking += clip.blink ? weight : 0;
        sleeping += name === 'sleep' ? weight : 0;
        eating += name === 'eat' ? weight : 0;
        walking += name === 'walk' ? weight : 0;
      }
      mixer.update(elapsedS);
      if (life === null && gestures === null) {
        return;
      }
      const share = 1;
      const layerS = elapsedS * mixer.timeScale;
      life?.apply(layerS, breathing * share, blinking * share);
      if (gestures !== null) {
        gestures.drive.awake = 1 - sleeping * share;
        gestures.drive.lookScale = (1 - sleeping * share) * (1 - EATING_LOOK_CUT * eating * share);
        gestures.drive.walking = walking * share;
        gestures.apply(layerS);
      }
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
