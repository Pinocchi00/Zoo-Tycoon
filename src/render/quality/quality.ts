export type QualityLevel = 'low' | 'medium' | 'high';

export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

/** Highest device pixel ratio ever rendered: beyond 2 the eye sees no difference, the GPU does. */
export const MAX_PIXEL_RATIO = 2;

export interface QualitySettings {
  /** Low phones skip shadows entirely: they are the most expensive effect of the scene. */
  readonly shadows: boolean;
  readonly shadowMapSize: number;
  /** Blur of shadow edges, in shadow-map texels: 1 is crisp, higher is soft. */
  readonly shadowRadius: number;
  readonly maxPixelRatio: number;
}

const SETTINGS: Readonly<Record<QualityLevel, QualitySettings>> = {
  low: { shadows: false, shadowMapSize: 0, shadowRadius: 0, maxPixelRatio: 1.5 },
  medium: { shadows: true, shadowMapSize: 1024, shadowRadius: 1, maxPixelRatio: MAX_PIXEL_RATIO },
  high: { shadows: true, shadowMapSize: 2048, shadowRadius: 4, maxPixelRatio: MAX_PIXEL_RATIO },
};

export function qualitySettings(level: QualityLevel): QualitySettings {
  return SETTINGS[level];
}

/** Reads a stored or typed level; anything unknown gives null. */
export function parseQualityLevel(text: string | null): QualityLevel | null {
  for (const level of QUALITY_LEVELS) {
    if (level === text) {
      return level;
    }
  }
  return null;
}

/** Frames ignored at the start of the test: shader compilation makes them slow on every device. */
export const BENCHMARK_WARMUP_FRAMES = 15;
/** Frames measured after the warm-up, a little under one second at 60 frames per second. */
export const BENCHMARK_SAMPLE_FRAMES = 45;

/** Median frame time, measured at high quality, below which high quality is kept (≈ 54 fps). */
export const HIGH_QUALITY_MAX_FRAME_MS = 18.5;
/** Median frame time below which medium quality should reach a steady 30 fps or better. */
export const MEDIUM_QUALITY_MAX_FRAME_MS = 30;

/**
 * Chooses a level from frame times measured while rendering at high quality.
 * The median ignores the odd hiccup (a notification, a garbage collection).
 */
export function pickQuality(frameTimesMs: ArrayLike<number>): QualityLevel {
  if (frameTimesMs.length === 0) {
    return 'medium';
  }
  const sorted = Array.from(frameTimesMs).sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median =
    sorted.length % 2 === 1
      ? (sorted[middle] ?? 0)
      : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2;
  if (median <= HIGH_QUALITY_MAX_FRAME_MS) {
    return 'high';
  }
  return median <= MEDIUM_QUALITY_MAX_FRAME_MS ? 'medium' : 'low';
}

/** Collects the frame times of the first-launch test without allocating per frame. */
export interface FrameSampler {
  readonly samples: Float64Array;
  seen: number;
}

export function createFrameSampler(): FrameSampler {
  return { samples: new Float64Array(BENCHMARK_SAMPLE_FRAMES), seen: 0 };
}

/** Records one frame; returns the chosen level once enough frames are measured, null before. */
export function recordFrame(sampler: FrameSampler, frameMs: number): QualityLevel | null {
  // The first frame after a start or a return from the background measures nothing.
  if (!(frameMs > 0)) {
    return null;
  }
  const index = sampler.seen - BENCHMARK_WARMUP_FRAMES;
  sampler.seen += 1;
  if (index < 0) {
    return null;
  }
  if (index < sampler.samples.length) {
    sampler.samples[index] = frameMs;
  }
  return index === sampler.samples.length - 1 ? pickQuality(sampler.samples) : null;
}
