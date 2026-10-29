import {
  AnimationMixer,
  BufferGeometry,
  LoopRepeat,
  Material,
  Mesh,
  Texture,
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
      for (const value of Object.values(material)) {
        if (value instanceof Texture) {
          value.dispose();
        }
      }
      material.dispose();
    }
  });
}

/** Loads a .glb animal and starts its `initial` animation in a loop. */
export async function loadAnimalModel(
  url: string,
  initial: AnimalAnimation,
): Promise<Result<AnimalModel, MissingClip>> {
  const gltf = await new GLTFLoader().loadAsync(url);
  const root = gltf.scene;
  const clip = pickClip(gltf.animations, initial);
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
