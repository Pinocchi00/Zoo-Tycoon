import { fileURLToPath } from 'node:url';
import { runnerImport } from 'vite';
import { Vector3 } from 'three';
import { ISO_YAW_RAD } from '../../src/render/camera/camera-rig';
import { applyCameraPose, createIsoCamera } from '../../src/render/camera/iso-camera';
import { t } from '../../src/i18n';
import type { GameData, loadGameContent } from '../../src/data';
import type { EventQueue } from '../../src/sim/events';
import type { GameState } from '../../src/sim/state';

interface ContentModule {
  loadGameContent: typeof loadGameContent;
}

interface SimulationModule {
  createEventQueue: () => EventQueue;
}

interface SaveModule {
  serialize: (state: GameState, writtenAtMs: number) => string;
}

interface DemoModule {
  buildVisitorDemo: (data: GameData, events: EventQueue) => GameState;
}

/** A valid saved park lets the production build exercise picking without a debug entry point. */
export async function visitorFixture(
  width: number,
  height: number,
): Promise<{ save: string; thought: string; tap: { x: number; y: number } }> {
  const runner = { resolve: { tsconfigPaths: true } };
  const [{ module: content }, { module: simulation }, { module: saves }, { module: demo }] =
    await Promise.all([
      runnerImport<ContentModule>(
        fileURLToPath(new URL('../../src/data/index.ts', import.meta.url)),
        runner,
      ),
      runnerImport<SimulationModule>(
        fileURLToPath(new URL('../../src/sim/index.ts', import.meta.url)),
        runner,
      ),
      runnerImport<SaveModule>(
        fileURLToPath(new URL('../../src/save/index.ts', import.meta.url)),
        runner,
      ),
      runnerImport<DemoModule>(
        fileURLToPath(new URL('../../src/app/dev-visitors-demo.ts', import.meta.url)),
        runner,
      ),
    ]);
  const data = content.loadGameContent();
  if (!data.ok) {
    throw new Error('Visitor fixture needs valid content.');
  }
  const state = demo.buildVisitorDemo(data.value, simulation.createEventQueue());
  const visitor = state.visitors.list.find((group) => group.archetypeId === 'teen-photographer');
  const enclosure = state.enclosures[0];
  if (visitor === undefined || enclosure === undefined) {
    throw new Error('Visitor fixture needs a photographer and an enclosure.');
  }
  state.visitors.list = [visitor];
  state.visitors.arrivalProgress = 0;
  visitor.column =
    data.value.terrain.entrance.column + Math.floor(data.value.terrain.entrance.width / 2);
  visitor.row = data.value.terrain.entrance.row + Math.floor(data.value.terrain.entrance.depth / 2);
  visitor.nextColumn = visitor.column;
  visitor.nextRow = visitor.row;
  visitor.progressMm = 0;
  visitor.activity = 'viewing';
  visitor.goal = { kind: 'enclosure', enclosureId: enclosure.id };
  visitor.waitMs = 60_000;
  visitor.missingNeeds = [];
  const camera = createIsoCamera();
  applyCameraPose(camera, { x: 0, z: 0, viewHeight: 40, yaw: ISO_YAW_RAD }, width / height);
  camera.updateMatrixWorld(true);
  // Relative to the entrance focus; aim inside the torso instead of sampling a coarse click grid.
  const point = new Vector3(
    visitor.column -
      data.value.terrain.entrance.column -
      (data.value.terrain.entrance.width - 1) / 2,
    0.9,
    visitor.row - data.value.terrain.entrance.row - (data.value.terrain.entrance.depth - 1) / 2,
  ).project(camera);
  return {
    save: saves.serialize(state, Date.now()),
    thought: t(data.value.visitorRules.thoughts.amazedKey),
    tap: { x: ((point.x + 1) * width) / 2, y: ((1 - point.y) * height) / 2 },
  };
}
