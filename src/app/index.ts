import './style.css';
import { DEFAULT_LOCALE, t } from '@/i18n';
import { onForegroundChange, openBrowserTextStore, type TextStore } from '@/platform';
import {
  createFrameSampler,
  createParkView,
  parseQualityLevel,
  recordFrame,
  type FrameSampler,
  type QualityLevel,
} from '@/render';
import { logger } from '@/shared';
import { advance, createEventQueue, createGameState, drain } from '@/sim';
import type { FpsCounter } from './dev-fps';
import { createGameLoop, type FrameScheduler } from './game-loop';

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

/** Until saves are wired in, every launch opens a new empty park. */
function newParkSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 0;
}

async function main(): Promise<void> {
  document.documentElement.lang = DEFAULT_LOCALE;
  document.title = t('app.title');
  const root = findRoot();
  const canvas = document.createElement('canvas');
  root.append(canvas);

  const { store } = await openBrowserTextStore();
  const forced = parseQualityLevel(
    new URLSearchParams(window.location.search).get(QUALITY_QUERY_PARAMETER),
  );
  if (forced !== null) {
    storeQuality(store, forced);
  }
  const known = forced ?? (await readStoredQuality(store));
  let sampler: FrameSampler | null = known === null ? createFrameSampler() : null;

  const view = createParkView(canvas, known ?? BENCHMARK_LEVEL);
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

  const state = createGameState(newParkSeed());
  const events = createEventQueue();

  const loop = createGameLoop(browserScheduler, (frameMs, simulationMs) => {
    advance(state, simulationMs, events);
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
    }
  });
  if (!document.hidden) {
    loop.start();
  }
}

void main();
