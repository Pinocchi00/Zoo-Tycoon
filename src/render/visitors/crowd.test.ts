import {
  Color,
  Group,
  InstancedMesh,
  Matrix4,
  NumberKeyframeTrack,
  OrthographicCamera,
  PerspectiveCamera,
  type Object3D,
} from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ok, type Result } from '@/shared';
import type { VisitorState } from '@/sim';
import { createVisitorCrowd } from './crowd';
import { createInstancedCrowd } from './instanced-crowd';
import { MAX_SMOOTH_YAW_RAD_PER_SECOND } from './animation';
import { prototype, source, unwrap, visitor } from './test-fixtures';
import { isShadowCastingPiece, prepareVisitorSource } from './model-source';
import type { VisitorCrowd, VisitorModelProblem, VisitorSource } from './types';

const grid = { columns: 3, rows: 3 };
function camera(): OrthographicCamera {
  const view = new OrthographicCamera(-3, 3, 3, -3, 0.1, 100);
  view.position.set(0, 1, 10);
  view.lookAt(0, 1, 0);
  view.updateMatrixWorld(true);
  return view;
}
function topDownCamera(): OrthographicCamera {
  const view = new OrthographicCamera(-5, 5, 5, -5, 0.1, 100);
  view.position.set(0, 10, 0);
  view.up.set(0, 0, -1);
  view.lookAt(0, 0, 0);
  view.updateMatrixWorld(true);
  return view;
}
function mesh(parent: Group, name: string): InstancedMesh {
  const object = parent.getObjectByName(name);
  if (object === undefined || !isInstancedMesh(object))
    throw new Error('Missing loaded instance mesh.');
  return object;
}
function isInstancedMesh(object: Object3D): object is InstancedMesh {
  return object instanceof InstancedMesh;
}
function matrixOf(object: InstancedMesh, index = 0): Matrix4 {
  const matrix = new Matrix4();
  object.getMatrixAt(index, matrix);
  return matrix;
}
function yawOf(object: InstancedMesh): number {
  const matrix = matrixOf(object);
  return Math.atan2(-matrix.elements[2], matrix.elements[0]);
}
function screenPosition(
  crowd: VisitorCrowd,
  id: VisitorState['id'],
  view: OrthographicCamera,
): { x: number; y: number } {
  const out = { x: 0, y: 0 };
  if (!crowd.project(id, view, 1000, 1000, out)) throw new Error('Visitor projection failed.');
  return out;
}
async function loaded(
  list: VisitorState[],
  suppliedModels: readonly VisitorSource[] = [],
): Promise<{
  crowd: VisitorCrowd;
  parent: Group;
  world: { visitors: { list: VisitorState[] } };
  models: Map<string, VisitorSource>;
  loadSource: (id: string) => Promise<Result<VisitorSource, VisitorModelProblem>>;
}> {
  const parent = new Group();
  const models = new Map(suppliedModels.map((model) => [model.archetypeId, model]));
  for (const item of list)
    if (!models.has(item.archetypeId)) {
      const members =
        item.archetypeId === 'stroller-family'
          ? 4
          : item.archetypeId === 'teen-photographer'
            ? 1
            : 2;
      models.set(item.archetypeId, source(item.archetypeId, members, true));
    }
  const loadSource = vi.fn((id: string): Promise<Result<VisitorSource, VisitorModelProblem>> => {
    const model = models.get(id);
    if (model === undefined) throw new Error('Fixture missing.');
    return Promise.resolve(ok(model));
  });
  const crowd = createVisitorCrowd({ parent, grid, loadSource });
  const world = { visitors: { list } };
  crowd.syncAll(world);
  await vi.waitFor(() => {
    expect(crowd.stats().groups).toBe(list.length);
  });
  return { crowd, parent, loadSource, world, models };
}

describe('instanced visitor runtime', () => {
  it.each([1, 5, 20])(
    'assigns separate deterministic stopping places to %i visitors',
    async (count) => {
      const list = Array.from({ length: count }, (_, index) => {
        const item = visitor(index + 1, 'teen-photographer', 1);
        item.activity = 'viewing';
        return item;
      });
      const { crowd, parent } = await loaded(list);
      crowd.update(5000);
      const view = topDownCamera();
      const positions = list.map((item) => screenPosition(crowd, item.id, view));
      for (let first = 0; first < positions.length; first += 1) {
        for (let second = first + 1; second < positions.length; second += 1) {
          const a = positions[first];
          const b = positions[second];
          if (a === undefined || b === undefined) throw new Error('Missing visitor position.');
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(50 - 1e-4);
        }
      }
      expect(crowd.stats().groups).toBe(count);
      expect(parent.children.length).toBeGreaterThan(0);
      crowd.dispose();
    },
  );
  it('assigns distinct stopping places to 200 visitors on one cell without per-reconcile array allocations', async () => {
    const list = Array.from({ length: 200 }, (_, index) => {
      const item = visitor(index + 1, 'teen-photographer', 1);
      item.nextColumn = 2;
      return item;
    });
    const { crowd, world } = await loaded(list);
    const view = new OrthographicCamera(-100, 100, 100, -100, 0.1, 100);
    view.position.set(0, 10, 0);
    view.up.set(0, 0, -1);
    view.lookAt(0, 0, 0);
    view.updateMatrixWorld(true);
    const mapped = vi.spyOn(Array.prototype, 'map');
    const filtered = vi.spyOn(Array.prototype, 'filter');
    const sliced = vi.spyOn(Array.prototype, 'slice');
    const pushed = vi.spyOn(Array.prototype, 'push');
    try {
      for (const item of list) {
        item.progressMm = 100;
        item.updatedAtMs = 100;
      }
      crowd.syncAll(world);
      crowd.update(100);
      for (const item of list) {
        item.progressMm = 0;
        item.nextColumn = item.column;
        item.updatedAtMs = 200;
      }
      crowd.syncAll(world);
      crowd.update(100);
      crowd.update(100);
      crowd.update(200);
      crowd.update(5000);
    } finally {
      mapped.mockRestore();
      filtered.mockRestore();
      sliced.mockRestore();
      pushed.mockRestore();
    }
    expect(mapped).not.toHaveBeenCalled();
    expect(filtered).not.toHaveBeenCalled();
    expect(sliced).not.toHaveBeenCalled();
    expect(pushed).not.toHaveBeenCalled();

    const positions = list.map((item) => screenPosition(crowd, item.id, view));
    for (let first = 0; first < positions.length; first += 1) {
      for (let second = first + 1; second < positions.length; second += 1) {
        const a = positions[first];
        const b = positions[second];
        if (a === undefined || b === undefined) throw new Error('Missing visitor position.');
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(2.5 - 1e-4);
      }
    }
    crowd.dispose();
  });
  it('assigns places deterministically and keeps existing places when groups join or leave', async () => {
    async function positionsFor(
      order: readonly number[],
    ): Promise<Map<number, { x: number; y: number }>> {
      const list = order.map((number) => {
        const item = visitor(number, 'teen-photographer', 1);
        item.activity = 'viewing';
        return item;
      });
      const { crowd } = await loaded(list);
      crowd.update(5000);
      const view = topDownCamera();
      const positions = new Map<number, { x: number; y: number }>();
      list.forEach((item) =>
        positions.set(Number(item.id.slice(-1)), screenPosition(crowd, item.id, view)),
      );
      crowd.dispose();
      return positions;
    }
    const forward = await positionsFor([1, 2]);
    const reversed = await positionsFor([2, 1]);
    expect(forward.get(1)).toEqual(reversed.get(1));
    expect(forward.get(2)).toEqual(reversed.get(2));

    const first = visitor(1, 'teen-photographer', 1);
    const second = visitor(2, 'teen-photographer', 1);
    first.activity = 'viewing';
    second.activity = 'viewing';
    const { crowd, world } = await loaded([first, second]);
    crowd.update(5000);
    const view = topDownCamera();
    const firstPlace = screenPosition(crowd, first.id, view);
    const secondPlace = screenPosition(crowd, second.id, view);
    const newcomer = visitor(3, 'teen-photographer', 1);
    newcomer.activity = 'viewing';
    world.visitors.list.push(newcomer);
    crowd.syncAll(world);
    crowd.update(0);
    expect(screenPosition(crowd, first.id, view)).toEqual(firstPlace);
    expect(screenPosition(crowd, second.id, view)).toEqual(secondPlace);

    world.visitors.list.splice(1, 2);
    crowd.syncAll(world);
    crowd.update(0);
    expect(screenPosition(crowd, first.id, view)).toEqual(firstPlace);
    const replacement = visitor(4, 'teen-photographer', 1);
    replacement.activity = 'viewing';
    world.visitors.list.splice(1, 0, replacement);
    crowd.syncAll(world);
    crowd.update(5000);
    const reusedPlace = screenPosition(crowd, replacement.id, view);
    expect(reusedPlace.x).toBeCloseTo(secondPlace.x, 5);
    expect(reusedPlace.y).toBeCloseTo(secondPlace.y, 5);
    crowd.dispose();
  });
  it('eases into and out of a stopping place without a position jump', async () => {
    const anchor = visitor(1, 'teen-photographer', 1);
    const item = visitor(2, 'teen-photographer', 1);
    anchor.activity = 'viewing';
    item.activity = 'viewing';
    const { crowd, world } = await loaded([anchor]);
    world.visitors.list.push(item);
    crowd.syncAll(world);
    const view = topDownCamera();
    const beforeArrival = screenPosition(crowd, item.id, view);
    crowd.update(50);
    const arriving = screenPosition(crowd, item.id, view);
    expect(Math.hypot(arriving.x - beforeArrival.x, arriving.y - beforeArrival.y)).toBeLessThan(20);
    crowd.update(5000);
    const stopped = screenPosition(crowd, item.id, view);

    item.activity = 'walking';
    item.nextColumn = 2;
    item.updatedAtMs = 100;
    crowd.handleEvents([], world);
    crowd.update(50);
    const departing = screenPosition(crowd, item.id, view);
    expect(Math.hypot(departing.x - stopped.x, departing.y - stopped.y)).toBeLessThan(20);
    crowd.dispose();
  });
  it('keeps walking pauses below the stop threshold and resets the dwell on movement', async () => {
    const fixture = prototype('teen-photographer', 1);
    for (const clip of fixture.clips) {
      const value = clip.name === 'walk' ? 0 : clip.name === 'stop' ? 0.6 : 0.2;
      clip.tracks.push(new NumberKeyframeTrack('p0_arm_pivot.rotation[x]', [0, 1], [value, value]));
    }
    const model = unwrap(prepareVisitorSource('teen-photographer', fixture.root, fixture.clips));
    const item = visitor(1, 'teen-photographer', 1);
    item.nextColumn = 2;
    const { crowd, parent, world } = await loaded([item], [model]);
    const arm = mesh(parent, 'teen-photographer:p0_arm');

    for (let step = 1; step <= 4; step += 1) {
      item.progressMm = step * 100;
      item.updatedAtMs = step * 100;
      crowd.handleEvents([], world);
      crowd.update(100);
    }
    const walkingPose = matrixOf(arm).elements;
    item.updatedAtMs = 500;
    crowd.handleEvents([], world);
    crowd.update(100);
    expect(matrixOf(arm).elements).toEqual(walkingPose);

    crowd.update(201);
    crowd.update(149);
    const stoppedPose = matrixOf(arm).elements;
    expect(stoppedPose).not.toEqual(walkingPose);

    for (let step = 5; step <= 8; step += 1) {
      item.progressMm = step * 100;
      item.updatedAtMs = step * 100;
      crowd.handleEvents([], world);
      crowd.update(100);
    }
    const resumedWalkingPose = matrixOf(arm).elements;
    item.updatedAtMs = 900;
    crowd.handleEvents([], world);
    crowd.update(100);
    expect(matrixOf(arm).elements).toEqual(resumedWalkingPose);
    crowd.dispose();
  });
  it('smoothly springs crowd orientation and initializes a walking visitor facing its route', async () => {
    const item = visitor(1, 'teen-photographer', 1);
    item.nextRow = 2;
    const { crowd, parent, world } = await loaded([item]);
    const arm = mesh(parent, 'teen-photographer:p0_arm');
    expect(yawOf(arm)).toBeCloseTo(0);

    item.nextColumn = 2;
    item.nextRow = 1;
    item.updatedAtMs = 100;
    crowd.handleEvents([], world);
    crowd.update(100);
    const turned = yawOf(arm);
    expect(turned).toBeGreaterThan(0);
    expect(turned).toBeLessThan(Math.PI / 2);
    expect(turned).toBeLessThanOrEqual((MAX_SMOOTH_YAW_RAD_PER_SECOND * 100) / 1000);
    crowd.dispose();

    const facing = visitor(2, 'teen-photographer', 1);
    facing.nextColumn = 2;
    const appearing = await loaded([facing]);
    expect(yawOf(mesh(appearing.parent, 'teen-photographer:p0_arm'))).toBeCloseTo(Math.PI / 2);
    appearing.crowd.dispose();
  });
  it.each([
    ['p0_body_mesh', true],
    ['p3_head_mesh', true],
    ['p12_body_mesh', true],
    ['p0_arm_mesh', false],
    ['p0_hair_mesh', false],
    ['p0_body', false],
    ['p_body_mesh', false],
    ['couple:p0_body_mesh', false],
    ['p0_head_mesh_extra', false],
    ['', false],
  ] as const)('classifies medium-quality shadow piece %s as %s', (name, expected) => {
    expect(isShadowCastingPiece(name)).toBe(expected);
  });
  it('counts exactly 100 people across five archetypes without cross-archetype ghosts', async () => {
    const list: VisitorState[] = [];
    for (let cycle = 0; cycle < 9; cycle += 1) {
      for (const [id, size] of [
        ['stroller-family', 4],
        ['shoulder-ride', 2],
        ['couple', 2],
        ['teen-photographer', 1],
        ['retirees', 2],
      ] as const) {
        list.push(visitor(list.length + 1, id, size));
      }
    }
    list.push(visitor(46, 'teen-photographer', 1));
    const { crowd, parent, loadSource } = await loaded(list);
    expect(crowd.stats()).toEqual({ people: 100, groups: 46, drawCalls: 22 });
    expect(mesh(parent, 'couple:p0_arm').count).toBe(9);
    expect(mesh(parent, 'teen-photographer:p0_arm').count).toBe(10);
    expect(mesh(parent, 'stroller-family:p3_arm').count).toBe(9);
    expect(loadSource).toHaveBeenCalledTimes(5);
    const materials = new Set(parent.children.filter(isInstancedMesh).map((item) => item.material));
    expect(materials.size).toBe(1);
    crowd.dispose();
  });
  it('hides optional members and preserves slots and appearance when another group leaves', () => {
    const parent = new Group();
    const model = source('stroller-family', 4);
    const material = model.parts[0]?.mesh.material;
    if (material === undefined || Array.isArray(material))
      throw new Error('Fixture material missing.');
    const pool = createInstancedCrowd(parent, material);
    const first = visitor(1, 'stroller-family', 3);
    const second = visitor(2, 'stroller-family', 4);
    const sources = new Map([[model.archetypeId, model]]);
    pool.sync(
      [first, second].map((item) => ({
        id: item.id,
        archetypeId: item.archetypeId,
        groupSize: item.groupSize,
      })),
      sources,
    );
    const slot = pool.slots.find((item) => item.visitorId === second.id && item.personIndex === 0);
    if (slot === undefined) throw new Error('Missing slot.');
    const color = slot.colors.shirt;
    expect(pool.stats().people).toBe(7);
    expect(mesh(parent, 'stroller-family:p3_arm').count).toBe(1);
    pool.sync(
      [{ id: second.id, archetypeId: second.archetypeId, groupSize: second.groupSize }],
      sources,
    );
    expect(pool.slots[0]).toBe(slot);
    expect(pool.slots[0]?.colors.shirt).toBe(color);
    expect(pool.stats().people).toBe(4);
    pool.dispose();
  });
  it('deduplicates pending loads, including repeated errors and missing files', async () => {
    let complete: ((value: Result<VisitorSource, VisitorModelProblem>) => void) | undefined;
    const pending = new Promise<Result<VisitorSource, VisitorModelProblem>>((resolve) => {
      complete = resolve;
    });
    const loader = vi.fn(() => pending);
    const crowd = createVisitorCrowd({ parent: new Group(), grid, loadSource: loader });
    const world = { visitors: { list: [visitor(), visitor(2)] } };
    crowd.syncAll(world);
    crowd.syncAll(world);
    crowd.handleEvents([], world);
    expect(loader).toHaveBeenCalledTimes(1);
    if (complete === undefined) throw new Error('Missing resolver.');
    complete({ ok: false, error: { kind: 'missingFile', archetypeId: 'couple' } });
    await pending;
    await Promise.resolve();
    crowd.syncAll(world);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(crowd.stats().people).toBe(0);
    expect(crowd.project(visitor().id, camera(), 400, 400, { x: 0, y: 0 })).toBe(false);
    crowd.dispose();
  });
  it('disposes successful responses arriving after disposal and tolerates rejected loads', async () => {
    const parent = new Group();
    const model = source();
    const geometry = model.parts[0]?.mesh.geometry;
    if (geometry === undefined) throw new Error('Fixture geometry missing.');
    const released = vi.spyOn(geometry, 'dispose');
    const crowd = createVisitorCrowd({
      parent,
      grid,
      loadSource: () => Promise.resolve(ok(model)),
    });
    crowd.syncAll({ visitors: { list: [visitor()] } });
    crowd.dispose();
    await vi.waitFor(() => {
      expect(released).toHaveBeenCalledOnce();
    });
    expect(parent.children).toHaveLength(0);
    crowd.syncAll({ visitors: { list: [visitor()] } });
    crowd.update(100);
    expect(crowd.stats().people).toBe(0);
    const loader = vi.fn((): Promise<Result<VisitorSource, VisitorModelProblem>> => {
      return Promise.reject(new Error('test rejection'));
    });
    const rejected = createVisitorCrowd({ parent, grid, loadSource: loader });
    const world = { visitors: { list: [visitor()] } };
    rejected.syncAll(world);
    await Promise.resolve();
    await Promise.resolve();
    rejected.syncAll(world);
    expect(loader).toHaveBeenCalledOnce();
    expect(rejected.stats().people).toBe(0);
    rejected.dispose();
  });
  it('keeps independent stable phases, real proportions and tint choices without allocating frame resources', async () => {
    const a = visitor(1);
    const b = visitor(2);
    a.nextColumn = 2;
    b.nextColumn = 2;
    const { crowd, parent, world } = await loaded([a, b]);
    crowd.update(400);
    const object = mesh(parent, 'couple:p0_arm');
    expect(matrixOf(object, 0).elements).not.toEqual(matrixOf(object, 1).elements);
    const before = matrixOf(object, 1).elements;
    const clone = vi.spyOn(Matrix4.prototype, 'clone');
    const colors = vi.spyOn(object, 'setColorAt');
    crowd.update(0);
    expect(clone).not.toHaveBeenCalled();
    expect(colors).not.toHaveBeenCalled();
    clone.mockRestore();
    colors.mockRestore();
    world.visitors.list.splice(0, 1);
    crowd.handleEvents([], world);
    expect(matrixOf(object, 0).elements).toEqual(before);
    const color = new Color();
    object.getColorAt(0, color);
    expect(color.getHex()).not.toBe(0xffffff);
    crowd.dispose();
  });
  it('interpolates simulation steps and stops translation immediately during a stop fade', async () => {
    const item = visitor(1, 'teen-photographer', 1);
    item.nextColumn = 2;
    const { crowd, world } = await loaded([item]);
    const out = { x: 0, y: 0 };
    const view = camera();
    crowd.project(item.id, view, 600, 600, out);
    const initialX = out.x;
    item.progressMm = 100;
    item.updatedAtMs = 100;
    crowd.handleEvents([], world);
    crowd.update(50);
    crowd.project(item.id, view, 600, 600, out);
    expect(out.x - initialX).toBeCloseTo(5);
    crowd.update(50);
    crowd.project(item.id, view, 600, 600, out);
    expect(out.x - initialX).toBeCloseTo(10);
    item.activity = 'usingService';
    item.goal = { kind: 'service', need: 'comfort' };
    item.column = 2;
    item.nextColumn = 2;
    item.progressMm = 0;
    item.updatedAtMs = 200;
    crowd.handleEvents([], world);
    crowd.project(item.id, view, 600, 600, out);
    expect(out.x - initialX).toBeCloseTo(10);
    crowd.update(50);
    crowd.project(item.id, view, 600, 600, out);
    expect(out.x - initialX).toBeCloseTo(55);
    crowd.update(50);
    crowd.project(item.id, view, 600, 600, out);
    expect(out.x - initialX).toBeCloseTo(100);
    const stoppedX = out.x;
    crowd.update(50);
    crowd.project(item.id, view, 600, 600, out);
    expect(out.x).toBe(stoppedX);
    crowd.dispose();
  });
  it('keeps the drawn position continuous when a walking visitor crosses a cell edge', async () => {
    const item = visitor(1, 'teen-photographer', 1);
    item.nextColumn = 2;
    item.progressMm = 900;
    const { crowd, world } = await loaded([item]);
    const out = { x: 0, y: 0 };
    const view = camera();
    crowd.project(item.id, view, 600, 600, out);
    const beforeEdge = out.x;

    item.column = 2;
    item.nextColumn = 2;
    item.progressMm = 0;
    item.updatedAtMs = 100;
    crowd.handleEvents([], world);
    crowd.update(100);
    crowd.project(item.id, view, 600, 600, out);

    expect(Math.abs(out.x - beforeEdge)).toBeLessThanOrEqual(11);
    crowd.dispose();
  });
  it('keeps instance matrix buffers and avoids map values and array iterators across frames, including after setQuality', async () => {
    const item = visitor();
    const { crowd, parent, world } = await loaded([item, visitor(2)]);
    world.visitors.list.splice(1, 1);
    crowd.syncAll(world);
    const object = mesh(parent, 'couple:p0_arm');
    const matrices = object.instanceMatrix;
    const matrixArray = matrices.array;
    const view = camera();
    const out = { x: 0, y: 0 };
    const values = vi.spyOn(Map.prototype, 'values');
    const iterators = vi.spyOn(Array.prototype, Symbol.iterator);
    let valueCalls: number;
    let iteratorCalls: number;
    try {
      for (let qualityIndex = 0; qualityIndex < 3; qualityIndex += 1) {
        if (qualityIndex === 1) crowd.setQuality('medium');
        if (qualityIndex === 2) crowd.setQuality('high');
        for (let frame = 0; frame < 3; frame += 1) {
          crowd.update(100);
          crowd.pick(view, 200, 200, 400, 400);
          crowd.project(item.id, view, 400, 400, out);
          if (object.instanceMatrix !== matrices || object.instanceMatrix.array !== matrixArray)
            throw new Error('Instance matrix buffers were reallocated.');
        }
      }
      valueCalls = values.mock.calls.length;
      iteratorCalls = iterators.mock.calls.length;
    } finally {
      values.mockRestore();
      iterators.mockRestore();
    }
    expect(valueCalls).toBe(0);
    expect(iteratorCalls).toBe(0);
    expect(object.instanceMatrix).toBe(matrices);
    expect(object.instanceMatrix.array).toBe(matrixArray);
    expect(crowd.stats().people).toBe(2);
    crowd.dispose();
  });
  it('offsets walking members independently and repeats the same pose for the same group id', async () => {
    async function walkingGroup(): ReturnType<typeof loaded> {
      const fixture = prototype();
      const walk = fixture.clips.find((clip) => clip.name === 'walk');
      if (walk === undefined) throw new Error('Missing walking fixture.');
      walk.tracks.push(new NumberKeyframeTrack('p1_arm_pivot.rotation[z]', [0, 0.5, 1], [0, 1, 0]));
      const item = visitor();
      item.nextRow = 2;
      const result = await loaded(
        [item],
        [unwrap(prepareVisitorSource('couple', fixture.root, fixture.clips))],
      );
      result.crowd.update(400);
      return result;
    }
    const first = await walkingGroup();
    const second = await walkingGroup();
    const a = matrixOf(mesh(first.parent, 'couple:p0_arm'));
    const b = matrixOf(mesh(first.parent, 'couple:p1_arm'));
    // Ignore formation translation: different rotations prove the members walk out of phase.
    expect(a.elements.slice(0, 12)).not.toEqual(b.elements.slice(0, 12));
    expect(matrixOf(mesh(second.parent, 'couple:p0_arm')).elements).toEqual(a.elements);
    expect(matrixOf(mesh(second.parent, 'couple:p1_arm')).elements).toEqual(b.elements);
    first.crowd.dispose();
    second.crowd.dispose();
  });
  it('picks visible persons only and clears picking/projection on removal, hiding and disposal', async () => {
    const item = visitor(1, 'teen-photographer', 1);
    const { crowd, parent, world } = await loaded([item]);
    const view = camera();
    expect(crowd.pick(view, 200, 200, 400, 400)).toBe(item.id);
    parent.visible = false;
    expect(crowd.pick(view, 200, 200, 400, 400)).toBeNull();
    expect(crowd.project(item.id, view, 400, 400, { x: 0, y: 0 })).toBe(false);
    parent.visible = true;
    const out = { x: 0, y: 0 };
    expect(crowd.project(item.id, view, 400, 400, out)).toBe(true);
    const behind = new PerspectiveCamera(50, 1, 0.1, 100);
    behind.position.set(0, 1, 10);
    expect(crowd.project(item.id, behind, 400, 400, out)).toBe(true);
    behind.rotation.y = Math.PI;
    expect(crowd.project(item.id, behind, 400, 400, out)).toBe(false);
    world.visitors.list.length = 0;
    crowd.handleEvents([], world);
    expect(crowd.pick(view, 200, 200, 400, 400)).toBeNull();
    expect(crowd.project(item.id, view, 400, 400, out)).toBe(false);
    expect(crowd.stats()).toEqual({ people: 0, groups: 0, drawCalls: 0 });
    crowd.dispose();
    crowd.dispose();
    expect(parent.children).toHaveLength(0);
  });
  it('uses sitting only for rest services', async () => {
    const poses: number[][] = [];
    for (const need of ['rest', 'comfort', 'foodDrink'] as const) {
      const item = visitor();
      item.activity = 'usingService';
      item.goal = { kind: 'service', need };
      const { crowd, parent } = await loaded([item]);
      crowd.update(400);
      poses.push(matrixOf(mesh(parent, 'couple:p0_leg')).elements);
      crowd.dispose();
    }
    expect(poses[0]).not.toEqual(poses[1]);
    expect(poses[1]).toEqual(poses[2]);
  });
  it('starts sitting from the beginning, holds the final pose and fades back to walking', async () => {
    const fixture = prototype('teen-photographer', 1);
    const stop = fixture.clips.find((clip) => clip.name === 'stop');
    if (stop === undefined) throw new Error('Missing fixture stop clip.');
    stop.tracks = [new NumberKeyframeTrack('p0_leg_pivot.rotation[x]', [0, 1], [0, 0])];
    const model = unwrap(prepareVisitorSource('teen-photographer', fixture.root, fixture.clips));
    const item = visitor(1, 'teen-photographer', 1);
    const { crowd, parent, world } = await loaded([item], [model]);
    const leg = mesh(parent, 'teen-photographer:p0_leg');
    const standing = matrixOf(leg);
    item.activity = 'usingService';
    item.goal = { kind: 'service', need: 'rest' };
    crowd.handleEvents([], world);
    crowd.update(0);
    expect(matrixOf(leg).elements).toEqual(standing.elements);
    crowd.update(100);
    const entering = matrixOf(leg);
    const height = Math.hypot(entering.elements[1], entering.elements[5], entering.elements[9]);
    expect(entering.elements[5] / height).toBeCloseTo(Math.cos(0.1 * (0.1 / 0.35)), 5);
    crowd.update(900);
    const seated = matrixOf(leg);
    expect(seated.elements[5] / height).toBeCloseTo(Math.cos(1), 5);
    for (const elapsed of [1000, 2250, 4000]) {
      crowd.update(elapsed);
      expect(matrixOf(leg).elements).toEqual(seated.elements);
    }
    item.activity = 'walking';
    item.nextRow = 2;
    crowd.handleEvents([], world);
    crowd.update(0);
    expect(matrixOf(leg).elements).toEqual(seated.elements);
    crowd.update(1);
    const fading = matrixOf(leg);
    expect(
      Math.max(
        ...fading.elements.map((value, index) => Math.abs(value - (seated.elements[index] ?? 0))),
      ),
    ).toBeLessThan(0.01);
    crowd.update(349);
    expect(matrixOf(leg).elements).not.toEqual(seated.elements);
    crowd.dispose();
  });
  it('keeps a never-moved visitor on the stop clip from creation', async () => {
    const fixture = prototype('teen-photographer', 1);
    const stop = fixture.clips.find((clip) => clip.name === 'stop');
    if (stop === undefined) throw new Error('Missing fixture stop clip.');
    stop.tracks = [new NumberKeyframeTrack('p0_leg_pivot.rotation[x]', [0, 1], [0, 0])];
    const model = unwrap(prepareVisitorSource('teen-photographer', fixture.root, fixture.clips));
    const { crowd, parent } = await loaded([visitor(1, 'teen-photographer', 1)], [model]);
    const leg = mesh(parent, 'teen-photographer:p0_leg');
    const stopped = matrixOf(leg);

    crowd.update(100);
    expect(matrixOf(leg).elements).toEqual(stopped.elements);
    crowd.update(200);
    expect(matrixOf(leg).elements).toEqual(stopped.elements);

    crowd.dispose();
  });
  it('keeps a carried child attached to the animated parent through walk, sit and walk', async () => {
    const fixture = prototype('shoulder-ride', 2);
    const support = fixture.root.getObjectByName('p0_arm_pivot');
    const child = fixture.root.getObjectByName('p1_root');
    if (support === undefined || child === undefined)
      throw new Error('Missing fixture attachment.');
    support.add(child);
    child.position.set(0, 0.5, 0);
    const model = unwrap(prepareVisitorSource('shoulder-ride', fixture.root, fixture.clips));
    const item = visitor(1, 'shoulder-ride');
    item.nextRow = 2;
    const { crowd, parent, world } = await loaded([item], [model]);
    const adult = mesh(parent, 'shoulder-ride:p0_arm');
    const carried = mesh(parent, 'shoulder-ride:p1_arm');
    function verifyAttachment(): void {
      const relative = matrixOf(adult).invert().multiply(matrixOf(carried));
      const expected = new Matrix4().makeTranslation(0, 0.5, 0);
      relative.elements.forEach((value, index) => {
        expect(value).toBeCloseTo(expected.elements[index] ?? 0, 5);
      });
    }
    for (const elapsed of [0, 100, 250, 1000]) {
      crowd.update(elapsed);
      verifyAttachment();
    }
    item.activity = 'usingService';
    item.goal = { kind: 'service', need: 'rest' };
    item.nextRow = item.row;
    crowd.handleEvents([], world);
    for (const elapsed of [100, 250, 1000, 2000]) {
      crowd.update(elapsed);
      verifyAttachment();
    }
    item.activity = 'walking';
    item.nextRow = 2;
    crowd.handleEvents([], world);
    for (const elapsed of [0, 100, 250, 1000]) {
      crowd.update(elapsed);
      verifyAttachment();
    }
    crowd.dispose();
  });
  it('releases duplicate palettes once and preserves the shared palette until disposal', async () => {
    const first = source('couple', 2, true);
    const second = source('retirees', 2, true);
    const shared = first.paletteTexture;
    const duplicate = second.paletteTexture;
    if (shared === null || duplicate === null) throw new Error('Missing fixture textures.');
    const sharedDisposed = vi.spyOn(shared, 'dispose');
    const duplicateDisposed = vi.spyOn(duplicate, 'dispose');
    const parent = new Group();
    const crowd = createVisitorCrowd({
      parent,
      grid,
      loadSource: (id) => Promise.resolve(ok(id === 'couple' ? first : second)),
    });
    crowd.syncAll({ visitors: { list: [visitor(), visitor(2, 'retirees')] } });
    await vi.waitFor(() => {
      expect(crowd.stats().groups).toBe(2);
    });
    expect(duplicateDisposed).toHaveBeenCalledOnce();
    expect(sharedDisposed).not.toHaveBeenCalled();
    const original = first.parts[0]?.mesh.material;
    const runtime = mesh(parent, 'couple:p0_arm').material;
    const sourceMaterialDisposed =
      original !== undefined && !Array.isArray(original)
        ? vi.spyOn(original, 'dispose')
        : undefined;
    const runtimeMaterialDisposed = !Array.isArray(runtime)
      ? vi.spyOn(runtime, 'dispose')
      : undefined;
    crowd.dispose();
    expect(sharedDisposed).toHaveBeenCalledOnce();
    expect(duplicateDisposed).toHaveBeenCalledOnce();
    expect(sourceMaterialDisposed).toHaveBeenCalledOnce();
    expect(runtimeMaterialDisposed).toHaveBeenCalledOnce();
  });
});
