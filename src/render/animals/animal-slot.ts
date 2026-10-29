import type { Object3D } from 'three';
import type { Result } from '@/shared';
import type { AnimalModel, MissingClip } from './animal-model';

export interface AnimalPlacement {
  readonly x: number;
  readonly z: number;
  readonly yawRad: number;
}

/** Why an animal could not be shown; the caller decides how to report it. */
export type AnimalSlotProblem =
  | { readonly kind: 'missingClip'; readonly clip: MissingClip['name'] }
  | { readonly kind: 'loadFailed'; readonly error: unknown };

export interface AnimalSlot {
  /** Settles once the model is shown, refused or abandoned; never rejects. */
  readonly ready: Promise<void>;
  update: (elapsedMs: number) => void;
  dispose: () => void;
}

/**
 * Shows one animal under `parent` as soon as its model has loaded.
 * Until then, and if loading fails, the slot stays empty and costs nothing.
 */
export function createAnimalSlot(
  parent: Object3D,
  load: Promise<Result<AnimalModel, MissingClip>>,
  placement: AnimalPlacement,
  onProblem: (problem: AnimalSlotProblem) => void,
): AnimalSlot {
  let model: AnimalModel | undefined;
  let disposed = false;

  const ready = load.then(
    (loaded) => {
      if (!loaded.ok) {
        onProblem({ kind: 'missingClip', clip: loaded.error.name });
        return;
      }
      if (disposed) {
        loaded.value.dispose();
        return;
      }
      loaded.value.root.position.set(placement.x, 0, placement.z);
      loaded.value.root.rotation.y = placement.yawRad;
      parent.add(loaded.value.root);
      model = loaded.value;
    },
    (error: unknown) => {
      onProblem({ kind: 'loadFailed', error });
    },
  );

  return {
    ready,
    update: (elapsedMs) => {
      model?.update(elapsedMs);
    },
    dispose: () => {
      disposed = true;
      model?.dispose();
      model = undefined;
    },
  };
}
