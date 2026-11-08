import {
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  Raycaster,
  Vector2,
  Vector3,
  type Texture,
} from 'three';
import { cellCenterX, cellCenterZ, logger, type Result, type VisitorId } from '@/shared';
import { MM_PER_CELL, type VisitorState } from '@/sim';
import { randomFloat, type RngState } from '@/sim/rng';
import { computeBlendedPoseMatrices } from './animation';
import { createInstancedCrowd, type GroupRenderData } from './instanced-crowd';
import { disposeVisitorObjects, loadVisitorSource } from './model-source';
import {
  type VisitorClip,
  type VisitorCrowd,
  type VisitorCrowdOptions,
  type VisitorModelProblem,
  type VisitorSource,
  type VisitorWorld,
} from './types';
import { pickViewingClip, visualRng } from './visual-seed';

const MS_PER_SECOND = 1000;
const STEP_MS = 100;
const CROSS_FADE_S = 0.35;
const VIEW_CLIP_DURATION_S = 4;
const MODEL_URLS = import.meta.glob<string>('../../../assets/models/visitors/*.glb', {
  query: '?url',
  import: 'default',
  eager: true,
});
async function defaultLoadSource(
  archetypeId: string,
): Promise<Result<VisitorSource, VisitorModelProblem>> {
  const url = MODEL_URLS[`../../../assets/models/visitors/${archetypeId}.glb`];
  return url === undefined
    ? { ok: false, error: { kind: 'missingFile', archetypeId } }
    : loadVisitorSource(archetypeId, url);
}
interface GroupState {
  readonly id: VisitorId;
  readonly rng: RngState;
  visitor: VisitorState;
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  targetX: number;
  targetZ: number;
  yaw: number;
  snapshotMs: number;
  interpolationMs: number;
  interpolationDurationMs: number;
  currentClip: VisitorClip;
  nextClip: VisitorClip;
  blend: number;
  phase: number;
  nextPhase: number;
  viewTimerS: number;
  viewClip: VisitorClip;
}

export function createVisitorCrowd(options: VisitorCrowdOptions): VisitorCrowd {
  const { parent, grid } = options;
  const loadSource = options.loadSource ?? defaultLoadSource;
  const sources = new Map<string, VisitorSource>();
  const attempted = new Set<string>();
  const states = new Map<VisitorId, GroupState>();
  const material = new MeshStandardMaterial({ color: 0xffffff });
  const crowd = createInstancedCrowd(parent, material);
  const pose: Matrix4[] = [];
  const groupMatrix = new Matrix4();
  const position = new Vector3();
  const rotation = new Quaternion();
  const scale = new Vector3();
  const up = new Vector3(0, 1, 0);
  const projected = new Vector3();
  const raycaster = new Raycaster();
  const mouse = new Vector2();
  const pickResult: { id: VisitorId | null; distance: number } = { id: null, distance: 0 };
  let palette: Texture | null = null;
  let world: VisitorWorld | null = null;
  let disposed = false;
  let layout: GroupRenderData[] = [];

  function adoptPalette(source: VisitorSource): void {
    if (palette === null && source.paletteTexture !== null) {
      palette = source.paletteTexture;
      material.map = palette;
      material.needsUpdate = true;
    }
    const duplicates = new Set<Texture>();
    source.root.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const original of Array.isArray(object.material) ? object.material : [object.material]) {
        if (
          original instanceof MeshStandardMaterial &&
          original.map !== null &&
          original.map !== palette
        ) {
          duplicates.add(original.map);
          original.map = palette;
        }
      }
    });
    for (const texture of duplicates) texture.dispose();
  }
  function rebuild(): void {
    crowd.sync(layout, sources);
    draw(0);
  }
  function tryLoad(archetypeId: string): void {
    if (attempted.has(archetypeId) || disposed) return;
    attempted.add(archetypeId);
    void loadSource(archetypeId)
      .then((result) => {
        if (disposed) {
          if (result.ok) disposeVisitorObjects(result.value.root);
          return;
        }
        if (!result.ok) {
          logger.warn('visitor model skipped', archetypeId, result.error);
          return;
        }
        const source = result.value;
        adoptPalette(source);
        sources.set(archetypeId, source);
        while (pose.length < source.nodes.length) pose.push(new Matrix4());
        rebuild();
      })
      .catch((error: unknown) => {
        if (!disposed) logger.warn('visitor model load failed', archetypeId, error);
      });
  }
  function createState(visitor: VisitorState, x: number, z: number): GroupState {
    const rng = visualRng(visitor.id);
    const phase = randomFloat(rng);
    const state: GroupState = {
      id: visitor.id,
      rng,
      visitor,
      x,
      z,
      fromX: x,
      fromZ: z,
      targetX: x,
      targetZ: z,
      yaw: 0,
      snapshotMs: visitor.updatedAtMs,
      interpolationMs: STEP_MS,
      interpolationDurationMs: STEP_MS,
      currentClip: 'stop',
      nextClip: 'stop',
      blend: 0,
      phase,
      nextPhase: phase,
      viewTimerS: VIEW_CLIP_DURATION_S,
      viewClip: pickViewingClip(rng),
    };
    states.set(visitor.id, state);
    return state;
  }
  function synchronize(nextWorld: VisitorWorld): void {
    if (disposed) return;
    world = nextWorld;
    let changed = layout.length !== world.visitors.list.length;
    for (let index = 0; index < world.visitors.list.length; index += 1) {
      const visitor = world.visitors.list[index];
      const previous = layout[index];
      if (visitor === undefined) continue;
      if (
        previous?.id !== visitor.id ||
        previous.archetypeId !== visitor.archetypeId ||
        previous.groupSize !== visitor.groupSize
      )
        changed = true;
      const progress = Math.min(1, Math.max(0, visitor.progressMm / MM_PER_CELL));
      const x =
        cellCenterX(grid, visitor.column) + (visitor.nextColumn - visitor.column) * progress;
      const z = cellCenterZ(grid, visitor.row) + (visitor.nextRow - visitor.row) * progress;
      const state = states.get(visitor.id) ?? createState(visitor, x, z);
      state.visitor = visitor;
      if (visitor.updatedAtMs !== state.snapshotMs || x !== state.targetX || z !== state.targetZ) {
        state.interpolationDurationMs = Math.max(STEP_MS, visitor.updatedAtMs - state.snapshotMs);
        state.interpolationMs = 0;
        state.snapshotMs = visitor.updatedAtMs;
        state.fromX = state.x;
        state.fromZ = state.z;
        state.targetX = x;
        state.targetZ = z;
      }
      const dx = visitor.nextColumn - visitor.column;
      const dz = visitor.nextRow - visitor.row;
      if (visitor.activity === 'walking' && (dx !== 0 || dz !== 0)) state.yaw = Math.atan2(dx, dz);
      else {
        state.x = x;
        state.z = z;
        state.fromX = x;
        state.fromZ = z;
        state.interpolationMs = state.interpolationDurationMs;
      }
      tryLoad(visitor.archetypeId);
    }
    if (changed) {
      layout = world.visitors.list.map((visitor) => ({
        id: visitor.id,
        archetypeId: visitor.archetypeId,
        groupSize: visitor.groupSize,
      }));
      const active = new Set(layout.map((group) => group.id));
      for (const id of states.keys()) if (!active.has(id)) states.delete(id);
      rebuild();
    }
  }
  function targetClip(state: GroupState, elapsedS: number): VisitorClip {
    switch (state.visitor.activity) {
      case 'walking':
        return state.visitor.nextColumn !== state.visitor.column ||
          state.visitor.nextRow !== state.visitor.row
          ? 'walk'
          : 'stop';
      case 'viewing':
        state.viewTimerS -= elapsedS;
        if (state.viewTimerS <= 0) {
          state.viewClip = pickViewingClip(state.rng);
          state.viewTimerS += VIEW_CLIP_DURATION_S;
        }
        return state.viewClip;
      case 'usingService':
        return state.visitor.goal.kind === 'service' && state.visitor.goal.need === 'rest'
          ? 'sit'
          : 'stop';
    }
  }
  function advanceGroup(state: GroupState, elapsedMs: number): void {
    const elapsedS = elapsedMs / MS_PER_SECOND;
    state.interpolationMs = Math.min(
      state.interpolationDurationMs,
      state.interpolationMs + elapsedMs,
    );
    const fraction = state.interpolationMs / state.interpolationDurationMs;
    state.x = state.fromX + (state.targetX - state.fromX) * fraction;
    state.z = state.fromZ + (state.targetZ - state.fromZ) * fraction;
    const target = targetClip(state, elapsedS);
    if (target !== state.nextClip) {
      if (target === state.currentClip) {
        const previousPhase = state.phase;
        state.currentClip = state.nextClip;
        state.phase = state.nextPhase;
        state.nextClip = target;
        state.nextPhase = previousPhase;
        state.blend = 1 - state.blend;
      } else {
        if (state.blend >= 0.5) {
          state.currentClip = state.nextClip;
          state.phase = state.nextPhase;
        }
        state.nextClip = target;
        state.nextPhase = target === 'sit' ? 0 : state.phase;
        state.blend = 0;
      }
    }
    const source = sources.get(state.visitor.archetypeId);
    if (source === undefined) return;
    state.phase = advancePhase(state.currentClip, state.phase, elapsedS, source);
    state.nextPhase = advancePhase(state.nextClip, state.nextPhase, elapsedS, source);
    if (state.currentClip !== state.nextClip) {
      state.blend = Math.min(1, state.blend + elapsedS / CROSS_FADE_S);
      if (state.blend === 1) {
        state.currentClip = state.nextClip;
        state.phase = state.nextPhase;
        state.blend = 0;
      }
    }
  }
  function draw(elapsedMs: number): void {
    for (const state of states.values()) advanceGroup(state, elapsedMs);
    let previousState: GroupState | undefined;
    for (const slot of crowd.slots) {
      const state = states.get(slot.visitorId);
      if (state === undefined) continue;
      if (state !== previousState) {
        computeBlendedPoseMatrices(
          slot.source,
          state.currentClip,
          state.nextClip,
          state.phase,
          state.nextPhase,
          state.blend,
          pose,
        );
        position.set(state.x, 0, state.z);
        rotation.setFromAxisAngle(up, state.yaw);
        scale.set(slot.width, slot.height, slot.width);
        groupMatrix.compose(position, rotation, scale);
        previousState = state;
      }
      crowd.writeSlot(slot, pose, groupMatrix);
    }
    crowd.markMatricesUpdated();
  }
  return {
    syncAll: synchronize,
    handleEvents(_events, nextWorld) {
      synchronize(nextWorld);
    },
    update(elapsedMs) {
      if (!disposed && world !== null)
        draw(Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0);
    },
    pick(camera, x, y, width, height) {
      if (disposed || width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height)
        return null;
      mouse.set((x / width) * 2 - 1, -(y / height) * 2 + 1);
      camera.updateWorldMatrix(true, false);
      raycaster.setFromCamera(mouse, camera);
      crowd.pick(raycaster, pickResult);
      return pickResult.id;
    },
    project(id, camera, width, height, out) {
      const state = states.get(id);
      if (
        disposed ||
        state === undefined ||
        !crowd.hasGroup(id) ||
        width <= 0 ||
        height <= 0 ||
        !parent.visible
      )
        return false;
      parent.updateWorldMatrix(true, false);
      camera.updateWorldMatrix(true, false);
      projected.set(state.x, 1.5, state.z).applyMatrix4(parent.matrixWorld).project(camera);
      if (
        !Number.isFinite(projected.x) ||
        !Number.isFinite(projected.y) ||
        !Number.isFinite(projected.z) ||
        Math.abs(projected.z) > 1 ||
        Math.abs(projected.x) > 1 ||
        Math.abs(projected.y) > 1
      )
        return false;
      out.x = ((projected.x + 1) * width) / 2;
      out.y = ((1 - projected.y) * height) / 2;
      return true;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      crowd.dispose();
      for (const source of sources.values()) disposeVisitorObjects(source.root, palette);
      sources.clear();
      states.clear();
      material.dispose();
      palette?.dispose();
      palette = null;
      world = null;
    },
    stats() {
      return crowd.stats();
    },
  };
}

function advancePhase(
  clip: VisitorClip,
  phase: number,
  elapsedS: number,
  source: VisitorSource,
): number {
  const next = phase + elapsedS / source.bakedClips[clip].duration;
  return clip === 'sit' ? Math.min(1, next) : next % 1;
}
