import { expect, it } from 'vitest';
import { randomFloat } from '@/sim/rng';
import { memberPhaseOffset, seedFromId, visualRng } from './visual-seed';

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
