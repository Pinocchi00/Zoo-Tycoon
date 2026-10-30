import { Group } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { err, ok, type Result } from '@/shared';
import type { AnimalModel, AnimalModelProblem } from './animal-model';
import { createAnimalSlot, type AnimalSlotProblem } from './animal-slot';

const PLACEMENT = { x: 3, z: -2, yawRad: 1 };

function fakeModel(): AnimalModel & { updates: number[]; disposed: number } {
  const root = new Group();
  const updates: number[] = [];
  const model = {
    root,
    signatureName: 'swim',
    updates,
    disposed: 0,
    play: () => undefined,
    setTimeScale: () => undefined,
    update: (elapsedMs: number) => {
      model.updates.push(elapsedMs);
    },
    dispose: () => {
      model.disposed += 1;
      root.removeFromParent();
    },
  };
  return model;
}

function deferred(): {
  promise: Promise<Result<AnimalModel, AnimalModelProblem>>;
  resolve: (value: Result<AnimalModel, AnimalModelProblem>) => void;
  reject: (error: unknown) => void;
} {
  let resolve: (value: Result<AnimalModel, AnimalModelProblem>) => void = () => undefined;
  let reject: (error: unknown) => void = () => undefined;
  const promise = new Promise<Result<AnimalModel, AnimalModelProblem>>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('createAnimalSlot', () => {
  it('stays empty while loading, then shows and animates the animal in place', async () => {
    const parent = new Group();
    const model = fakeModel();
    const pending = deferred();
    const onProblem = vi.fn<(problem: AnimalSlotProblem) => void>();
    const slot = createAnimalSlot(parent, pending.promise, PLACEMENT, onProblem);

    slot.update(16);
    expect(parent.children).toEqual([]);

    pending.resolve(ok(model));
    await slot.ready;
    expect(parent.children).toEqual([model.root]);
    expect(slot.model()).toBe(model);
    expect(model.root.position.toArray()).toEqual([3, 0, -2]);
    expect(model.root.rotation.y).toBe(1);

    slot.update(33);
    expect(model.updates).toEqual([33]);
    expect(onProblem).not.toHaveBeenCalled();

    slot.dispose();
    expect(model.disposed).toBe(1);
    expect(parent.children).toEqual([]);
    expect(slot.model()).toBeUndefined();
    slot.update(16);
    expect(model.updates).toEqual([33]);
  });

  it('frees a model that finishes loading after the slot was disposed', async () => {
    const parent = new Group();
    const model = fakeModel();
    const pending = deferred();
    const slot = createAnimalSlot(parent, pending.promise, PLACEMENT, vi.fn());

    slot.dispose();
    pending.resolve(ok(model));
    await slot.ready;
    expect(model.disposed).toBe(1);
    expect(parent.children).toEqual([]);
  });

  it('reports a model that cannot be used', async () => {
    const parent = new Group();
    const onProblem = vi.fn<(problem: AnimalSlotProblem) => void>();
    const slot = createAnimalSlot(
      parent,
      Promise.resolve(err({ kind: 'missingClip', name: 'idle' })),
      PLACEMENT,
      onProblem,
    );
    await slot.ready;
    expect(onProblem).toHaveBeenCalledWith({
      kind: 'invalidModel',
      problem: { kind: 'missingClip', name: 'idle' },
    });
    expect(parent.children).toEqual([]);
  });

  it('reports a failed load without rejecting', async () => {
    const parent = new Group();
    const onProblem = vi.fn<(problem: AnimalSlotProblem) => void>();
    const failure = new Error('404');
    const pending = deferred();
    const slot = createAnimalSlot(parent, pending.promise, PLACEMENT, onProblem);
    pending.reject(failure);
    await expect(slot.ready).resolves.toBeUndefined();
    expect(onProblem).toHaveBeenCalledWith({ kind: 'loadFailed', error: failure });
    slot.update(16);
    slot.dispose();
  });
});
