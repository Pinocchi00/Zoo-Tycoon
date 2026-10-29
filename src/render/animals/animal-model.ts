import {
  AnimationMixer,
  BufferGeometry,
  LoopRepeat,
  Material,
  Mesh,
  MeshStandardMaterial,
  type AnimationClip,
  type Object3D,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { err, ok, type Result } from '@/shared';

const MS_PER_SECOND = 1000;

/** Animations every animal model carries (checked by npm run assets:check). */
export type AnimalAnimation = 'idle' | 'walk';

export interface MissingClip {
  readonly kind: 'missingClip';
  readonly name: AnimalAnimation;
}

export function pickClip(
  clips: readonly AnimationClip[],
  name: AnimalAnimation,
): Result<AnimationClip, MissingClip> {
  const clip = clips.find((candidate) => candidate.name === name);
  return clip === undefined ? err({ kind: 'missingClip', name }) : ok(clip);
}

export interface AnimalModel {
  readonly root: Object3D;
  /** Advances the playing animation by `elapsedMs`. */
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

/** Builds an animal from loaded glTF data and starts its `initial` animation in a loop. */
export function createAnimalModel(
  source: AnimalSource,
  initial: AnimalAnimation,
): Result<AnimalModel, MissingClip> {
  const root = source.scene;
  const clip = pickClip(source.animations, initial);
  if (!clip.ok) {
    disposeModel(root);
    return clip;
  }
  prepareMeshes(root);
  const mixer = new AnimationMixer(root);
  mixer.clipAction(clip.value).setLoop(LoopRepeat, Infinity).play();
  return ok({
    root,
    update: (elapsedMs) => {
      mixer.update(elapsedMs / MS_PER_SECOND);
    },
    dispose: () => {
      mixer.stopAllAction();
      mixer.uncacheRoot(root);
      root.removeFromParent();
      disposeModel(root);
    },
  });
}

/** Decodes a .glb animal and starts its `initial` animation in a loop. */
export async function parseAnimalModel(
  glb: ArrayBuffer,
  initial: AnimalAnimation,
): Promise<Result<AnimalModel, MissingClip>> {
  return createAnimalModel(await new GLTFLoader().parseAsync(glb, ''), initial);
}

/** Downloads, decodes and animates a .glb animal. Network failures reject. */
export async function loadAnimalModel(
  url: string,
  initial: AnimalAnimation,
): Promise<Result<AnimalModel, MissingClip>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Could not download ${url} (HTTP ${String(response.status)}).`);
  }
  return parseAnimalModel(await response.arrayBuffer(), initial);
}
