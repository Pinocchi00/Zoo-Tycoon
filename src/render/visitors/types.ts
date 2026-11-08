import type { AnimationClip, Camera, Mesh, Object3D, Texture } from 'three';
import type { GridSize, Result, VisitorId } from '@/shared';
import type { GameEvent, VisitorState } from '@/sim';

/** The subset of the simulation world the crowd reads. */
export interface VisitorWorld {
  readonly visitors: { readonly list: readonly VisitorState[] };
}

/** Visitor animations baked from the glTF clips. */
export type VisitorClip = 'walk' | 'stop' | 'look' | 'point' | 'photo' | 'sit';

export const VISITOR_CLIPS: readonly VisitorClip[] = [
  'walk',
  'stop',
  'look',
  'point',
  'photo',
  'sit',
];

/** Public stats returned by {@link VisitorCrowd.stats}. */
export interface VisitorCrowdStats {
  people: number;
  groups: number;
  drawCalls: number;
}

/** Public API exposed by `src/render/visitors/index.ts`. */
export interface VisitorCrowd {
  syncAll(world: VisitorWorld): void;
  handleEvents(events: readonly GameEvent[], world: VisitorWorld): void;
  update(elapsedMs: number): void;
  pick(camera: Camera, x: number, y: number, width: number, height: number): VisitorId | null;
  project(
    id: VisitorId,
    camera: Camera,
    width: number,
    height: number,
    out: { x: number; y: number },
  ): boolean;
  dispose(): void;
  stats(): VisitorCrowdStats;
}

/** Options accepted by {@link createVisitorCrowd}. */
export interface VisitorCrowdOptions {
  readonly parent: Object3D;
  readonly grid: GridSize;
  /**
   * Optional source loader, mainly for tests. Defaults to loading
   * `assets/models/visitors/*.glb` via Vite's `import.meta.glob`.
   */
  readonly loadSource?: (
    archetypeId: string,
  ) => Promise<Result<VisitorSource, VisitorModelProblem>>;
}

/** A tint category authored on a mesh. */
export type VisitorTint = 'skin' | 'hair' | 'shirt' | 'pants' | 'none';

export const VISITOR_TINTS: readonly VisitorTint[] = ['skin', 'hair', 'shirt', 'pants', 'none'];

/** One renderable piece of a visitor prototype. */
export interface VisitorPart {
  /** Name of the source mesh; also the InstancedMesh name. */
  readonly name: string;
  readonly mesh: Mesh;
  readonly personIndex: number;
  readonly tint: VisitorTint;
  /** Index of this mesh in {@link VisitorSource.nodes}. */
  readonly meshNodeIndex: number;
  /** Names from the visitor root down to this mesh's parent, not including the mesh itself. */
  readonly nodePath: readonly string[];
  /** Mesh local matrix in the bind pose, before any clip is applied. */
  readonly bindLocalMatrix: Matrix4AsArray;
}

/** Flattened 4x4 matrix stored as 16 floats. */
export type Matrix4AsArray = readonly number[];

/** A visitor archetype that has been loaded and validated. */
export interface VisitorSource {
  readonly archetypeId: string;
  readonly memberCount: number;
  readonly root: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly parts: readonly VisitorPart[];
  /** Node hierarchy in depth-first order; index 0 is the visitor root. */
  readonly nodes: readonly VisitorNode[];
  /** Baked poses for every clip and every node. */
  readonly bakedClips: Readonly<Record<VisitorClip, BakedClip>>;
  /** Texture extracted from the model's palette material. */
  readonly paletteTexture: Texture | null;
}

/** One node in the prototype hierarchy. */
export interface VisitorNode {
  readonly name: string;
  readonly object: Object3D;
  readonly parentIndex: number;
  readonly children: readonly number[];
}

/** Sampled local transform data for one animation clip. */
export interface BakedClip {
  readonly name: VisitorClip;
  readonly duration: number;
  readonly sampleCount: number;
  /** Per node, per sample: local position XYZ. */
  readonly positions: readonly Float32Array[];
  /** Per node, per sample: local quaternion XYZW. */
  readonly quaternions: readonly Float32Array[];
  /** Per node, per sample: local scale XYZ. */
  readonly scales: readonly Float32Array[];
}

/** Expected asset errors returned by the loader. */
export type VisitorModelProblem =
  | { readonly kind: 'missingFile'; readonly archetypeId: string }
  | { readonly kind: 'invalidGltf'; readonly archetypeId: string; readonly reason: string }
  | { readonly kind: 'missingRoot'; readonly archetypeId: string }
  | { readonly kind: 'badExtras'; readonly archetypeId: string; readonly reason: string }
  | { readonly kind: 'missingClip'; readonly archetypeId: string; readonly clip: VisitorClip }
  | {
      readonly kind: 'missingPersonRoot';
      readonly archetypeId: string;
      readonly personIndex: number;
    };

/** Internal state for one displayed group. */
export interface GroupRenderState {
  readonly id: VisitorId;
  readonly archetypeId: string;
  /** Current interpolated transform of the group root. */
  x: number;
  z: number;
  yaw: number;
  currentClip: VisitorClip;
  nextClip: VisitorClip;
  blend: number;
  /** Master phase of the group animation, wraps around each clip's duration. */
  phase: number;
  /** Stable visual seed derived from the visitor id. */
  visualSeed: number;
  /** Seconds allocated to the current transition. */
  transitionSeconds: number;
}
