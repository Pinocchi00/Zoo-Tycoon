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
import {
  advanceWalkPhase,
  advanceAngularSpring,
  computeBlendedPoseMatrices,
  MIN_WALK_STOP_MS,
  walkingClipForStationaryTime,
} from './animation';
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
import { memberPhaseOffset, pickViewingClip, visitorVisualOffset, visualRng } from './visual-seed';

const MS_PER_SECOND = 1000;
const STEP_MS = 100;
const CROSS_FADE_S = 0.35;
const VIEW_CLIP_DURATION_S = 4;
const MOVEMENT_EPSILON_M = 0.0001;
/** Half a metre matches the approximate shoulder width of the visitor models. */
const STOPPING_PLACE_SPACING_M = 0.5;
/** Softens arrival at and departure from a reserved stopping place. */
const STOPPING_PLACE_TIME_CONSTANT_S = 0.25;
const STOPPING_PLACE_SLOTS_PER_RING = 8;
const STAGGERED_RING_PHASE = 0.5;
const TWO_PI = Math.PI * 2;
const compareVisitorIds = (left: GroupState, right: GroupState): number =>
  left.id < right.id ? -1 : left.id > right.id ? 1 : 0;

function sortGroupStatesInPlace(states: (GroupState | undefined)[], length: number): void {
  let start = Math.floor(length / 2) - 1;
  while (start >= 0) {
    siftGroupStates(states, start, length);
    start -= 1;
  }
  let end = length - 1;
  while (end > 0) {
    const first = states[0];
    const last = states[end];
    if (first === undefined || last === undefined)
      throw new Error('Candidate buffer is incomplete.');
    states[0] = last;
    states[end] = first;
    siftGroupStates(states, 0, end);
    end -= 1;
  }
}

function siftGroupStates(
  states: (GroupState | undefined)[],
  initialRoot: number,
  end: number,
): void {
  let root = initialRoot;
  while (root * 2 + 1 < end) {
    let childIndex = root * 2 + 1;
    const left = states[childIndex];
    if (left === undefined) throw new Error('Candidate buffer is incomplete.');
    const rightIndex = childIndex + 1;
    const right = states[rightIndex];
    if (rightIndex < end && right === undefined) throw new Error('Candidate buffer is incomplete.');
    if (rightIndex < end && right !== undefined && compareVisitorIds(left, right) < 0)
      childIndex = rightIndex;
    const parent = states[root];
    const child = states[childIndex];
    if (parent === undefined || child === undefined)
      throw new Error('Candidate buffer is incomplete.');
    if (compareVisitorIds(parent, child) >= 0) return;
    states[root] = child;
    states[childIndex] = parent;
    root = childIndex;
  }
}

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
  activeIndex: number;
  readonly rng: RngState;
  readonly memberPhases: number[];
  readonly visualOffset: { readonly x: number; readonly z: number };
  visitor: VisitorState;
  activity: VisitorState['activity'];
  x: number;
  z: number;
  fromX: number;
  fromZ: number;
  targetX: number;
  targetZ: number;
  yaw: number;
  targetYaw: number;
  yawVelocity: number;
  parkedCell: number | null;
  parkedSlot: number;
  stoppingOffsetX: number;
  stoppingOffsetZ: number;
  targetStoppingOffsetX: number;
  targetStoppingOffsetZ: number;
  stationaryMs: number;
  hasMoved: boolean;
  previousPhaseX: number;
  previousPhaseZ: number;
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
  const activeStates: GroupState[] = [];
  const parkingCandidates: (GroupState | undefined)[] = [];
  const stoppedCellHeads = new Int32Array(grid.rows * grid.columns);
  let nextStoppedByState = new Int32Array(0);
  let parkingCandidateCount = 0;
  const stoppingPlace = { x: 0, z: 0 };
  const material = new MeshStandardMaterial({ color: 0xffffff });
  const crowd = createInstancedCrowd(parent, material, options.quality);
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
  let parkingNeedsReconcile = false;

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
    const initialYaw =
      visitor.activity === 'walking'
        ? Math.atan2(visitor.nextColumn - visitor.column, visitor.nextRow - visitor.row)
        : 0;
    const state: GroupState = {
      id: visitor.id,
      activeIndex: activeStates.length,
      rng,
      memberPhases: [],
      visualOffset: visitorVisualOffset(visitor.id),
      visitor,
      activity: visitor.activity,
      x,
      z,
      fromX: x,
      fromZ: z,
      targetX: x,
      targetZ: z,
      yaw: initialYaw,
      targetYaw: initialYaw,
      yawVelocity: 0,
      parkedCell: null,
      parkedSlot: -1,
      stoppingOffsetX: 0,
      stoppingOffsetZ: 0,
      targetStoppingOffsetX: 0,
      targetStoppingOffsetZ: 0,
      stationaryMs: 0,
      hasMoved: false,
      previousPhaseX: x,
      previousPhaseZ: z,
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
    activeStates.push(state);
    return state;
  }
  function shouldHaveStoppingPlace(state: GroupState): boolean {
    return (
      state.visitor.activity !== 'walking' ||
      (state.hasMoved
        ? state.stationaryMs >= MIN_WALK_STOP_MS
        : state.visitor.nextColumn === state.visitor.column &&
          state.visitor.nextRow === state.visitor.row)
    );
  }
  function reconcileStoppingPlaces(): void {
    stoppedCellHeads.fill(-1);
    parkingCandidateCount = 0;
    let index = 0;
    while (index < activeStates.length) {
      const state = activeStates[index];
      index += 1;
      if (state === undefined) continue;
      const cell = state.visitor.row * grid.columns + state.visitor.column;
      const needsPlace = shouldHaveStoppingPlace(state);
      if (!needsPlace || (state.parkedCell !== null && state.parkedCell !== cell)) {
        state.parkedCell = null;
        state.parkedSlot = -1;
        state.targetStoppingOffsetX = 0;
        state.targetStoppingOffsetZ = 0;
      }
      if (needsPlace) {
        if (state.parkedCell === null) {
          parkingCandidates[parkingCandidateCount] = state;
          parkingCandidateCount += 1;
        } else if (cell >= 0 && cell < stoppedCellHeads.length) {
          nextStoppedByState[state.activeIndex] = stoppedCellHeads[cell] ?? -1;
          stoppedCellHeads[cell] = state.activeIndex;
        }
      }
    }
    sortGroupStatesInPlace(parkingCandidates, parkingCandidateCount);
    index = 0;
    while (index < parkingCandidateCount) {
      const state = parkingCandidates[index];
      index += 1;
      if (state === undefined) continue;
      const cell = state.visitor.row * grid.columns + state.visitor.column;
      if (cell < 0 || cell >= stoppedCellHeads.length) continue;
      let slot = 0;
      let foundPlace = false;
      while (!foundPlace) {
        let occupied = false;
        setStoppingPlaceOffset(slot, stoppingPlace);
        const candidateX = cellCenterX(grid, state.visitor.column) + stoppingPlace.x;
        const candidateZ = cellCenterZ(grid, state.visitor.row) + stoppingPlace.z;
        let otherIndex = stoppedCellHeads[cell] ?? -1;
        while (otherIndex >= 0) {
          const other = activeStates[otherIndex];
          if (other === undefined) break;
          const nextIndex = nextStoppedByState[otherIndex] ?? -1;
          if (other === state || other.parkedCell !== cell) {
            otherIndex = nextIndex;
            continue;
          }
          if (other.parkedSlot === slot) {
            occupied = true;
            slot += 1;
            break;
          }
          const otherX = other.targetX + other.visualOffset.x + other.targetStoppingOffsetX;
          const otherZ = other.targetZ + other.visualOffset.z + other.targetStoppingOffsetZ;
          if (Math.hypot(candidateX - otherX, candidateZ - otherZ) < STOPPING_PLACE_SPACING_M) {
            occupied = true;
            slot += 1;
            break;
          }
          otherIndex = nextIndex;
        }
        foundPlace = !occupied;
      }
      setStoppingPlaceOffset(slot, stoppingPlace);
      state.parkedCell = cell;
      state.parkedSlot = slot;
      state.targetStoppingOffsetX =
        slot === 0
          ? 0
          : cellCenterX(grid, state.visitor.column) +
            stoppingPlace.x -
            state.targetX -
            state.visualOffset.x;
      state.targetStoppingOffsetZ =
        slot === 0
          ? 0
          : cellCenterZ(grid, state.visitor.row) +
            stoppingPlace.z -
            state.targetZ -
            state.visualOffset.z;
      nextStoppedByState[state.activeIndex] = stoppedCellHeads[cell] ?? -1;
      stoppedCellHeads[cell] = state.activeIndex;
    }
    index = 0;
    while (index < parkingCandidateCount) {
      parkingCandidates[index] = undefined;
      index += 1;
    }
    parkingNeedsReconcile = false;
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
      if (state.activity === 'walking' && visitor.activity !== 'walking')
        state.targetYaw = state.yaw;
      if (state.activity !== visitor.activity && visitor.activity === 'walking')
        state.stationaryMs = 0;
      while (state.memberPhases.length < visitor.groupSize) {
        const member = state.memberPhases.length;
        state.memberPhases.push(memberPhaseOffset(visualRng(visitor.id), member));
      }
      state.visitor = visitor;
      state.activity = visitor.activity;
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
      if (visitor.activity === 'walking' && (dx !== 0 || dz !== 0))
        state.targetYaw = Math.atan2(dx, dz);
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
      let readIndex = 0;
      let writeIndex = 0;
      while (readIndex < activeStates.length) {
        const state = activeStates[readIndex];
        readIndex += 1;
        if (state === undefined || !active.has(state.id)) continue;
        state.activeIndex = writeIndex;
        activeStates[writeIndex] = state;
        writeIndex += 1;
      }
      activeStates.length = writeIndex;
      rebuild();
    }
    if (nextStoppedByState.length < activeStates.length)
      nextStoppedByState = new Int32Array(activeStates.length);
    if (parkingCandidates.length < activeStates.length)
      parkingCandidates.length = activeStates.length;
    parkingNeedsReconcile = true;
    reconcileStoppingPlaces();
  }
  function targetClip(state: GroupState, elapsedS: number): VisitorClip {
    switch (state.visitor.activity) {
      case 'walking':
        return state.hasMoved ? walkingClipForStationaryTime(state.stationaryMs) : 'stop';
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
    const wasStoppedWalking = shouldHaveStoppingPlace(state);
    state.interpolationMs = Math.min(
      state.interpolationDurationMs,
      state.interpolationMs + elapsedMs,
    );
    const fraction = state.interpolationMs / state.interpolationDurationMs;
    state.x = state.fromX + (state.targetX - state.fromX) * fraction;
    state.z = state.fromZ + (state.targetZ - state.fromZ) * fraction;
    const distanceMoved = Math.hypot(
      state.x - state.previousPhaseX,
      state.z - state.previousPhaseZ,
    );
    state.previousPhaseX = state.x;
    state.previousPhaseZ = state.z;
    if (distanceMoved > MOVEMENT_EPSILON_M) {
      state.hasMoved = true;
      state.stationaryMs = 0;
    } else state.stationaryMs += elapsedMs;
    const isStoppedWalking = shouldHaveStoppingPlace(state);
    if (wasStoppedWalking !== isStoppedWalking) parkingNeedsReconcile = true;
    const stoppingBlend = 1 - Math.exp(-elapsedS / STOPPING_PLACE_TIME_CONSTANT_S);
    state.stoppingOffsetX += (state.targetStoppingOffsetX - state.stoppingOffsetX) * stoppingBlend;
    state.stoppingOffsetZ += (state.targetStoppingOffsetZ - state.stoppingOffsetZ) * stoppingBlend;
    advanceAngularSpring(state, elapsedMs);
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
    state.phase = advancePhase(state.currentClip, state.phase, elapsedS, distanceMoved, source);
    state.nextPhase = advancePhase(
      state.nextClip,
      state.nextPhase,
      elapsedS,
      distanceMoved,
      source,
    );
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
    let stateIndex = 0;
    while (stateIndex < activeStates.length) {
      const state = activeStates[stateIndex];
      stateIndex += 1;
      if (state !== undefined) advanceGroup(state, elapsedMs);
    }
    if (parkingNeedsReconcile) reconcileStoppingPlaces();
    let previousState: GroupState | undefined;
    let slotIndex = 0;
    while (slotIndex < crowd.slots.length) {
      const slot = crowd.slots[slotIndex];
      slotIndex += 1;
      if (slot === undefined) continue;
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
          state.memberPhases,
        );
        position.set(
          state.x + state.visualOffset.x + state.stoppingOffsetX,
          0,
          state.z + state.visualOffset.z + state.stoppingOffsetZ,
        );
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
    setQuality(level) {
      crowd.setQuality(level);
    },
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
      projected
        .set(
          state.x + state.visualOffset.x + state.stoppingOffsetX,
          1.5,
          state.z + state.visualOffset.z + state.stoppingOffsetZ,
        )
        .applyMatrix4(parent.matrixWorld)
        .project(camera);
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
      activeStates.length = 0;
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
  distanceMoved: number,
  source: VisitorSource,
): number {
  if (clip === 'walk') return advanceWalkPhase(phase, distanceMoved);
  const next = phase + elapsedS / source.bakedClips[clip].duration;
  return clip === 'sit' ? Math.min(1, next) : next % 1;
}

function setStoppingPlaceOffset(slot: number, out: { x: number; z: number }): void {
  if (slot === 0) {
    out.x = 0;
    out.z = 0;
    return;
  }
  let ring = 1;
  let remaining = slot - 1;
  while (remaining >= ring * STOPPING_PLACE_SLOTS_PER_RING) {
    remaining -= ring * STOPPING_PLACE_SLOTS_PER_RING;
    ring += 1;
  }
  const slotsInRing = ring * STOPPING_PLACE_SLOTS_PER_RING;
  const radius = (STOPPING_PLACE_SPACING_M * ring) / (2 * Math.sin(Math.PI / slotsInRing));
  const angularOffset = ring % 2 === 0 ? STAGGERED_RING_PHASE : 0;
  const angle = ((remaining + angularOffset) * TWO_PI) / slotsInRing;
  out.x = Math.sin(angle) * radius;
  out.z = Math.cos(angle) * radius;
}
