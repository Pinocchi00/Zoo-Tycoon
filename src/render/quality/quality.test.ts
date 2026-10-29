import { describe, expect, it } from 'vitest';
import {
  BENCHMARK_SAMPLE_FRAMES,
  BENCHMARK_WARMUP_FRAMES,
  createFrameSampler,
  HIGH_QUALITY_MAX_FRAME_MS,
  MAX_PIXEL_RATIO,
  MEDIUM_QUALITY_MAX_FRAME_MS,
  parseQualityLevel,
  pickQuality,
  QUALITY_LEVELS,
  qualitySettings,
  recordFrame,
  type QualityLevel,
} from './quality';

describe('qualitySettings', () => {
  it('cuts shadows on low and makes them softer as quality rises', () => {
    expect(qualitySettings('low').shadows).toBe(false);
    expect(qualitySettings('medium').shadows).toBe(true);
    expect(qualitySettings('high').shadowRadius).toBeGreaterThan(
      qualitySettings('medium').shadowRadius,
    );
    expect(qualitySettings('high').shadowMapSize).toBeGreaterThan(
      qualitySettings('medium').shadowMapSize,
    );
  });

  it.each(QUALITY_LEVELS)('never renders %s above the pixel ratio cap', (level) => {
    expect(qualitySettings(level).maxPixelRatio).toBeLessThanOrEqual(MAX_PIXEL_RATIO);
    expect(MAX_PIXEL_RATIO).toBe(2);
  });
});

describe('parseQualityLevel', () => {
  it.each(QUALITY_LEVELS)('reads %s', (level) => {
    expect(parseQualityLevel(level)).toBe(level);
  });

  it.each([null, '', 'HIGH', 'ultra', ' low'])('rejects %j', (text) => {
    expect(parseQualityLevel(text)).toBeNull();
  });
});

describe('pickQuality', () => {
  it.each<[number, QualityLevel]>([
    [8.3, 'high'],
    [16.7, 'high'],
    [HIGH_QUALITY_MAX_FRAME_MS, 'high'],
    [HIGH_QUALITY_MAX_FRAME_MS + 0.1, 'medium'],
    [MEDIUM_QUALITY_MAX_FRAME_MS, 'medium'],
    [MEDIUM_QUALITY_MAX_FRAME_MS + 0.1, 'low'],
    [100, 'low'],
  ])('a steady %s ms per frame gives %s', (frameMs, expected) => {
    expect(pickQuality(new Array<number>(9).fill(frameMs))).toBe(expected);
  });

  it('ignores a few slow hiccups', () => {
    expect(pickQuality([16, 16, 16, 16, 200, 300])).toBe('high');
  });

  it('takes the mean of the two middle values for an even count', () => {
    expect(pickQuality([16, 20, 30, 40])).toBe('medium');
    expect(pickQuality([10, 18, 19, 40])).toBe('high');
  });

  it('falls back to medium without any measure', () => {
    expect(pickQuality([])).toBe('medium');
  });
});

describe('recordFrame', () => {
  it('ignores the warm-up, then decides on the last sample', () => {
    const sampler = createFrameSampler();
    for (let frame = 0; frame < BENCHMARK_WARMUP_FRAMES; frame += 1) {
      expect(recordFrame(sampler, 500)).toBeNull();
    }
    for (let frame = 0; frame < BENCHMARK_SAMPLE_FRAMES - 1; frame += 1) {
      expect(recordFrame(sampler, 16)).toBeNull();
    }
    expect(recordFrame(sampler, 16)).toBe('high');
  });

  it('decides only once', () => {
    const sampler = createFrameSampler();
    const total = BENCHMARK_WARMUP_FRAMES + BENCHMARK_SAMPLE_FRAMES;
    let decisions = 0;
    for (let frame = 0; frame < total * 2; frame += 1) {
      if (recordFrame(sampler, 40) !== null) {
        decisions += 1;
      }
    }
    expect(decisions).toBe(1);
  });
});

describe('recordFrame with empty frames', () => {
  it.each([0, -5, Number.NaN])('does not count a frame of %s ms', (frameMs) => {
    const sampler = createFrameSampler();
    const total = BENCHMARK_WARMUP_FRAMES + BENCHMARK_SAMPLE_FRAMES;
    for (let frame = 0; frame < total - 1; frame += 1) {
      expect(recordFrame(sampler, 16)).toBeNull();
    }
    expect(recordFrame(sampler, frameMs)).toBeNull();
    expect(sampler.seen).toBe(total - 1);
    expect(recordFrame(sampler, 16)).toBe('high');
  });
});
