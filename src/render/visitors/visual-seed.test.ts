import { expect, it } from 'vitest';
import { randomFloat } from '@/sim/rng';
import {
  MAX_VISITOR_OFFSET_M,
  memberPhaseOffset,
  seedFromId,
  visitorVisualOffset,
  visualRng,
} from './visual-seed';

it('keeps member phases in [0, 1) when signed mixing would produce a negative remainder', () => {
  const id = 'visitor-10';
  expect(seedFromId(id) | 0).toBeLessThan(0);
  const signedMix = Math.imul(1, 0x9e37_79b9);
  const base = randomFloat(visualRng(id));
  expect((base + signedMix / 0x1_0000_0000) % 1).toBeLessThan(0);

  for (let member = 0; member < 4; member += 1) {
    const phase = memberPhaseOffset(visualRng(id), member);
    expect(phase).toBeGreaterThanOrEqual(0);
    expect(phase).toBeLessThan(1);
    expect(memberPhaseOffset(visualRng(id), member)).toBe(phase);
  }
});

it('keeps each stable visitor offset inside the spreading disk and varies it by seed', () => {
  const first = visitorVisualOffset('visitor-1');
  const repeated = visitorVisualOffset('visitor-1');
  const second = visitorVisualOffset('visitor-2');

  expect(first).toEqual(repeated);
  expect(Math.hypot(first.x, first.z)).toBeLessThanOrEqual(MAX_VISITOR_OFFSET_M);
  expect(first).not.toEqual(second);
});
