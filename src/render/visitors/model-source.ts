import {
  AnimationMixer,
  LoopOnce,
  Mesh,
  MeshStandardMaterial,
  SkinnedMesh,
  type AnimationClip,
  type Material,
  type Object3D,
  type Texture,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { z } from 'zod';
import { err, ok, type Result } from '@/shared';
import { sampleCountFor } from './animation';
import {
  VISITOR_CLIPS,
  type BakedClip,
  type VisitorClip,
  type VisitorModelProblem,
  type VisitorNode,
  type VisitorPart,
  type VisitorSource,
} from './types';

const rootSchema = z.object({
  zooVisitor: z.object({
    version: z.literal(1),
    archetypeId: z.string(),
    memberCount: z.number().int().min(1).max(4),
  }),
});
const partSchema = z.object({
  zooPerson: z.number().int().min(0),
  zooTint: z.enum(['skin', 'hair', 'shirt', 'pants', 'none']),
});

export async function loadVisitorSource(
  archetypeId: string,
  url: string,
): Promise<Result<VisitorSource, VisitorModelProblem>> {
  try {
    const response = await fetch(url);
    if (!response.ok)
      return err({ kind: 'invalidGltf', archetypeId, reason: `HTTP ${String(response.status)}` });
    return await parseVisitorSource(archetypeId, await response.arrayBuffer());
  } catch (error: unknown) {
    return err({
      kind: 'invalidGltf',
      archetypeId,
      reason: error instanceof Error ? error.message : 'download failed',
    });
  }
}

export async function parseVisitorSource(
  archetypeId: string,
  buffer: ArrayBuffer,
): Promise<Result<VisitorSource, VisitorModelProblem>> {
  try {
    const gltf = await new GLTFLoader().parseAsync(buffer, '');
    const result = prepareVisitorSource(archetypeId, gltf.scene, gltf.animations);
    if (!result.ok) disposeVisitorObjects(gltf.scene);
    return result;
  } catch (error: unknown) {
    return err({
      kind: 'invalidGltf',
      archetypeId,
      reason: error instanceof Error ? error.message : 'GLB parsing failed',
    });
  }
}

export function prepareVisitorSource(
  archetypeId: string,
  scene: Object3D,
  animations: readonly AnimationClip[],
): Result<VisitorSource, VisitorModelProblem> {
  let root: Object3D | undefined;
  scene.traverse((object) => {
    const data = rootSchema.safeParse(object.userData);
    if (data.success && data.data.zooVisitor.archetypeId === archetypeId) root = object;
  });
  if (root === undefined) return err({ kind: 'missingRoot', archetypeId });
  const data = rootSchema.parse(root.userData).zooVisitor;
  const expectedMembers = expectedMemberCount(archetypeId);
  if (data.memberCount !== expectedMembers)
    return err({ kind: 'badExtras', archetypeId, reason: 'Incorrect member count.' });
  for (const name of VISITOR_CLIPS) {
    const clip = animations.find((candidate) => candidate.name === name);
    if (
      clip === undefined ||
      clip.tracks.length === 0 ||
      !Number.isFinite(clip.duration) ||
      clip.duration <= 0
    ) {
      return err({ kind: 'missingClip', archetypeId, clip: name });
    }
  }
  for (let person = 0; person < data.memberCount; person += 1) {
    if (root.getObjectByName(`p${String(person)}_root`) === undefined) {
      return err({ kind: 'missingPersonRoot', archetypeId, personIndex: person });
    }
  }
  const nodes: VisitorNode[] = [];
  const parts: VisitorPart[] = [];
  const names = new Set<string>();
  const invalid: string[] = [];
  function visit(object: Object3D, parentIndex: number): void {
    const index = nodes.length;
    nodes.push({ name: object.name, object, parentIndex, children: [] });
    if (names.has(object.name)) invalid.push(object.name);
    names.add(object.name);
    if (isVisitorMesh(object)) {
      const metadata = partSchema.safeParse(object.userData);
      if (
        object instanceof SkinnedMesh ||
        !metadata.success ||
        metadata.data.zooPerson >= data.memberCount ||
        !object.name.startsWith(`p${String(metadata.data.zooPerson)}_`)
      ) {
        invalid.push(object.name);
      } else {
        object.updateMatrix();
        parts.push({
          name: object.name,
          mesh: object,
          personIndex: metadata.data.zooPerson,
          tint: metadata.data.zooTint,
          meshNodeIndex: index,
          nodePath: [],
          bindLocalMatrix: object.matrix.toArray(),
        });
      }
    }
    for (const child of object.children) visit(child, index);
  }
  visit(root, -1);
  if (
    invalid.length > 0 ||
    parts.length === 0 ||
    Array.from({ length: data.memberCount }, (_, index) => index).some(
      (index) => !parts.some((part) => part.personIndex === index),
    )
  ) {
    return err({
      kind: 'badExtras',
      archetypeId,
      reason: 'Invalid visitor mesh metadata or names.',
    });
  }
  let paletteTexture: Texture | null = null;
  for (const part of parts) {
    const materials = Array.isArray(part.mesh.material) ? part.mesh.material : [part.mesh.material];
    for (const material of materials) {
      if (material instanceof MeshStandardMaterial && material.map !== null)
        paletteTexture = material.map;
    }
  }
  const bakedClips = bakeClips(root, nodes, animations);
  return ok({
    archetypeId,
    memberCount: data.memberCount,
    root,
    clips: animations,
    parts,
    nodes,
    bakedClips,
    paletteTexture,
  });
}

function expectedMemberCount(id: string): number {
  switch (id) {
    case 'stroller-family':
      return 4;
    case 'shoulder-ride':
    case 'couple':
    case 'retirees':
      return 2;
    case 'teen-photographer':
      return 1;
    default:
      return 0;
  }
}

function bakeClips(
  root: Object3D,
  nodes: readonly VisitorNode[],
  clips: readonly AnimationClip[],
): Readonly<Record<VisitorClip, BakedClip>> {
  const bind = nodes.map(({ object }) => ({
    position: object.position.clone(),
    quaternion: object.quaternion.clone(),
    scale: object.scale.clone(),
  }));
  const mixer = new AnimationMixer(root);
  function restore(): void {
    for (let index = 0; index < nodes.length; index += 1) {
      const node = nodes[index];
      const pose = bind[index];
      if (node !== undefined && pose !== undefined) {
        node.object.position.copy(pose.position);
        node.object.quaternion.copy(pose.quaternion);
        node.object.scale.copy(pose.scale);
        node.object.updateMatrix();
      }
    }
  }
  function bake(name: VisitorClip): BakedClip {
    const clip = clips.find((candidate) => candidate.name === name);
    if (clip === undefined) throw new Error('Validated visitor clip missing.');
    mixer.stopAllAction();
    restore();
    const action = mixer.clipAction(clip);
    action.reset().setLoop(LoopOnce, 1).play();
    action.clampWhenFinished = true;
    const sampleCount = sampleCountFor(clip.duration);
    const positions = nodes.map(() => new Float32Array(sampleCount * 3));
    const quaternions = nodes.map(() => new Float32Array(sampleCount * 4));
    const scales = nodes.map(() => new Float32Array(sampleCount * 3));
    for (let sample = 0; sample < sampleCount; sample += 1) {
      action.time = (sample / (sampleCount - 1)) * clip.duration;
      mixer.update(0);
      for (let index = 0; index < nodes.length; index += 1) {
        const object = nodes[index]?.object;
        const position = positions[index];
        const quaternion = quaternions[index];
        const scale = scales[index];
        if (
          object !== undefined &&
          position !== undefined &&
          quaternion !== undefined &&
          scale !== undefined
        ) {
          object.position.toArray(position, sample * 3);
          object.quaternion.toArray(quaternion, sample * 4);
          object.scale.toArray(scale, sample * 3);
        }
      }
    }
    return { name, duration: clip.duration, sampleCount, positions, quaternions, scales };
  }
  const baked = {
    walk: bake('walk'),
    stop: bake('stop'),
    look: bake('look'),
    point: bake('point'),
    photo: bake('photo'),
    sit: bake('sit'),
  };
  mixer.stopAllAction();
  mixer.uncacheRoot(root);
  restore();
  root.updateMatrixWorld(true);
  return baked;
}

export function disposeVisitorObjects(
  root: Object3D,
  preservedTexture: Texture | null = null,
): void {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  root.traverse((object) => {
    if (!isVisitorMesh(object)) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      if (
        material instanceof MeshStandardMaterial &&
        material.map !== null &&
        material.map !== preservedTexture
      )
        textures.add(material.map);
    }
  });
  for (const geometry of geometries) geometry.dispose();
  for (const material of materials) material.dispose();
  for (const texture of textures) texture.dispose();
}

function isVisitorMesh(object: Object3D): object is Mesh {
  return object instanceof Mesh;
}
