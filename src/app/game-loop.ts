/** Longest frame accepted: after a freeze, the world resumes gently instead of leaping ahead. */
export const MAX_FRAME_MS = 250;

/** The browser's frame scheduler, injectable so that tests can drive the loop by hand. */
export interface FrameScheduler {
  request: (callback: (timestampMs: number) => void) => number;
  cancel: (handle: number) => void;
}

/**
 * Called once per displayed frame. `frameMs` is the real elapsed time, for animation;
 * `simulationMs` is a whole number of milliseconds, ready for `advance`.
 */
export type FrameHandler = (frameMs: number, simulationMs: number) => void;

export interface GameLoop {
  start: () => void;
  stop: () => void;
  isRunning: () => boolean;
}

export function createGameLoop(scheduler: FrameScheduler, onFrame: FrameHandler): GameLoop {
  let handle: number | null = null;
  let previousMs: number | null = null;
  // The simulation takes whole milliseconds; the fractions are kept here so none is lost.
  let fractionMs = 0;

  const tick = (timestampMs: number): void => {
    handle = scheduler.request(tick);
    const frameMs =
      previousMs === null ? 0 : Math.min(MAX_FRAME_MS, Math.max(0, timestampMs - previousMs));
    previousMs = timestampMs;
    const totalMs = fractionMs + frameMs;
    const simulationMs = Math.floor(totalMs);
    fractionMs = totalMs - simulationMs;
    onFrame(frameMs, simulationMs);
  };

  return {
    start: () => {
      if (handle !== null) {
        return;
      }
      // The first frame after a pause only takes a timestamp: time spent hidden is not played.
      previousMs = null;
      handle = scheduler.request(tick);
    },
    stop: () => {
      if (handle === null) {
        return;
      }
      scheduler.cancel(handle);
      handle = null;
    },
    isRunning: () => handle !== null,
  };
}
