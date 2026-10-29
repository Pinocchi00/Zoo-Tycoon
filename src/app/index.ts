import './style.css';
import { formatDataErrors, loadGameContent, type GameData } from '@/data';
import { DEFAULT_LOCALE, t } from '@/i18n';
import {
  createSaveStorage,
  onForegroundChange,
  openPlatformTextStore,
  type OpenedPlatformStore,
  type TextStore,
} from '@/platform';
import {
  createFrameSampler,
  createParkView,
  parseQualityLevel,
  recordFrame,
  type FrameSampler,
  type QualityLevel,
} from '@/render';
import { logger } from '@/shared';
import { deserialize } from '@/save';
import { advance, createEventQueue, createSimContext, drain, type FocusArea } from '@/sim';
import type { FpsCounter } from './dev-fps';
import { entranceFocus, terrainGrid } from './entrance-focus';
import { createGameLoop, type FrameScheduler } from './game-loop';
import { createAutosaver, loadOrCreatePark } from './park-save';

const QUALITY_STORAGE_KEY = 'settings.quality';
/** `?quality=low|medium|high` forces a level, and keeps it, until an options screen exists. */
const QUALITY_QUERY_PARAMETER = 'quality';
/** The first-launch test draws at the best level, to measure what it costs on this device. */
const BENCHMARK_LEVEL: QualityLevel = 'high';

const browserScheduler: FrameScheduler = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => {
    cancelAnimationFrame(handle);
  },
};

function findRoot(): HTMLElement {
  const root = document.getElementById('app');
  if (root === null) {
    throw new Error('index.html must contain an element with id "app".');
  }
  return root;
}

async function readStoredQuality(store: TextStore): Promise<QualityLevel | null> {
  try {
    return parseQualityLevel(await store.get(QUALITY_STORAGE_KEY));
  } catch (error) {
    // Unreadable storage only costs a new quality test, never the game.
    logger.warn('Could not read the quality setting.', error);
    return null;
  }
}

function storeQuality(store: TextStore, level: QualityLevel): void {
  store.set(QUALITY_STORAGE_KEY, level).catch((error: unknown) => {
    logger.warn('Could not save the quality setting.', error);
  });
}

/** Only for a new park: from then on, all randomness comes from the seeded generator in the save. */
function newParkSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

function logStorage(opened: OpenedPlatformStore): void {
  if (opened.nativeFailure !== null) {
    logger.warn(`App files unavailable: ${opened.nativeFailure}`);
  }
  if (opened.indexedDbFailure !== null) {
    logger.warn(`IndexedDB unavailable: ${opened.indexedDbFailure}`);
  }
  if (opened.kind === 'memory') {
    // To be shown to the player once the interface exists.
    logger.warn('No storage available: the park will not be saved.');
  }
}

/** Broken content is a bug of the build, never something the player can fix: stop loudly. */
function requireGameData(): GameData {
  const loaded = loadGameContent();
  if (!loaded.ok) {
    throw new Error(`Invalid game data:
${formatDataErrors(loaded.error)}`);
  }
  return loaded.value;
}

async function main(): Promise<void> {
  const data = requireGameData();
  logger.info(`Game data loaded: ${String(data.species.size)} species.`);
  document.documentElement.lang = DEFAULT_LOCALE;
  document.title = t('app.title');
  const root = findRoot();
  const canvas = document.createElement('canvas');
  root.append(canvas);

  const opened = await openPlatformTextStore();
  logStorage(opened);
  const { store } = opened;
  const forced = parseQualityLevel(
    new URLSearchParams(window.location.search).get(QUALITY_QUERY_PARAMETER),
  );
  if (forced !== null) {
    storeQuality(store, forced);
  }
  const known = forced ?? (await readStoredQuality(store));
  let sampler: FrameSampler | null = known === null ? createFrameSampler() : null;

  const view = createParkView(
    canvas,
    known ?? BENCHMARK_LEVEL,
    terrainGrid(data.terrain),
    entranceFocus(data.terrain),
  );
  const resize = (): void => {
    view.resize(root.clientWidth, root.clientHeight);
  };
  resize();
  new ResizeObserver(resize).observe(root);

  let fps: FpsCounter | null = null;
  if (import.meta.env.DEV) {
    const { createFpsCounter } = await import('./dev-fps');
    fps = createFpsCounter(root);
  }

  const events = createEventQueue();
  const context = createSimContext(data);
  const focus: FocusArea = { minColumn: 0, minRow: 0, maxColumn: 0, maxRow: 0 };
  context.focus = focus;
  const saves = createSaveStorage(store, deserialize);
  const state = await loadOrCreatePark(saves, events, newParkSeed);
  const autosaver = createAutosaver(saves, state, () => Date.now());

  const loop = createGameLoop(browserScheduler, (frameMs, simulationMs) => {
    view.writeFocusArea(focus);
    advance(state, simulationMs, context, events);
    autosaver.record(simulationMs);
    // Nothing listens to the simulation yet; draining keeps the queue from growing.
    drain(events);
    view.frame(frameMs);
    fps?.record(frameMs);
    if (sampler !== null) {
      const chosen = recordFrame(sampler, frameMs);
      if (chosen !== null) {
        sampler = null;
        view.setQuality(chosen);
        storeQuality(store, chosen);
        logger.info(`Quality test chose "${chosen}".`);
      }
    }
  });

  onForegroundChange((foreground) => {
    if (foreground) {
      loop.start();
    } else {
      loop.stop();
      void autosaver.saveNow();
    }
  });
  if (!document.hidden) {
    loop.start();
  }
}

void main();
