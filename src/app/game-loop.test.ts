import { describe, expect, it } from 'vitest';
import { createGameLoop, MAX_FRAME_MS, type FrameScheduler } from './game-loop';

/** A scheduler driven by hand: `fire(t)` runs the pending frame at timestamp t. */
function manualScheduler(): FrameScheduler & {
  fire: (timestampMs: number) => void;
  pending: () => boolean;
} {
  let next: ((timestampMs: number) => void) | null = null;
  let handle = 0;
  return {
    request: (callback) => {
      next = callback;
      handle += 1;
      return handle;
    },
    cancel: () => {
      next = null;
    },
    fire: (timestampMs) => {
      const callback = next;
      next = null;
      if (callback === null) {
        throw new Error('No frame was requested.');
      }
      callback(timestampMs);
    },
    pending: () => next !== null,
  };
}

function recordingLoop(): {
  scheduler: ReturnType<typeof manualScheduler>;
  loop: ReturnType<typeof createGameLoop>;
  frames: [number, number][];
} {
  const scheduler = manualScheduler();
  const frames: [number, number][] = [];
  const loop = createGameLoop(scheduler, (frameMs, simulationMs) => {
    frames.push([frameMs, simulationMs]);
  });
  return { scheduler, loop, frames };
}

describe('createGameLoop', () => {
  it('starts with a zero-length frame, then measures real time', () => {
    const { scheduler, loop, frames } = recordingLoop();
    loop.start();
    scheduler.fire(1000);
    scheduler.fire(1016);
    expect(frames).toEqual([
      [0, 0],
      [16, 16],
    ]);
  });

  it('hands whole milliseconds to the simulation without losing the fractions', () => {
    const { scheduler, loop, frames } = recordingLoop();
    loop.start();
    let timestamp = 0;
    scheduler.fire(timestamp);
    for (let frame = 0; frame < 60; frame += 1) {
      timestamp += 1000 / 60;
      scheduler.fire(timestamp);
    }
    const simulated = frames.reduce((sum, [, simulationMs]) => sum + simulationMs, 0);
    expect(frames.every(([, simulationMs]) => Number.isSafeInteger(simulationMs))).toBe(true);
    expect(simulated).toBeGreaterThanOrEqual(999);
    expect(simulated).toBeLessThanOrEqual(1000);
  });

  it('caps a long freeze', () => {
    const { scheduler, loop, frames } = recordingLoop();
    loop.start();
    scheduler.fire(0);
    scheduler.fire(10_000);
    expect(frames[1]).toEqual([MAX_FRAME_MS, MAX_FRAME_MS]);
  });

  it('treats a timestamp going backwards as no time at all', () => {
    const { scheduler, loop, frames } = recordingLoop();
    loop.start();
    scheduler.fire(500);
    scheduler.fire(400);
    expect(frames[1]).toEqual([0, 0]);
  });

  it('does not play the time spent stopped', () => {
    const { scheduler, loop, frames } = recordingLoop();
    loop.start();
    scheduler.fire(0);
    scheduler.fire(16);
    loop.stop();
    expect(loop.isRunning()).toBe(false);
    expect(scheduler.pending()).toBe(false);
    loop.start();
    scheduler.fire(60_000);
    scheduler.fire(60_016);
    expect(frames.slice(2)).toEqual([
      [0, 0],
      [16, 16],
    ]);
  });

  it('ignores a second start and a second stop', () => {
    const { scheduler, loop, frames } = recordingLoop();
    loop.stop();
    loop.start();
    loop.start();
    scheduler.fire(0);
    expect(frames).toHaveLength(1);
    expect(loop.isRunning()).toBe(true);
    loop.stop();
    loop.stop();
    expect(loop.isRunning()).toBe(false);
  });
});
