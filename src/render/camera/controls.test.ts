import { describe, expect, it } from 'vitest';
import { dragModeFor, MAX_WHEEL_STEP_PX, wheelPixels } from './controls';

describe('dragModeFor', () => {
  it.each(['touch', 'pen'])('always pans with a %s', (pointerType) => {
    expect(dragModeFor(pointerType, 0)).toBe('pan');
    expect(dragModeFor(pointerType, 2)).toBe('pan');
  });

  it('pans with the left button and turns with the right one', () => {
    expect(dragModeFor('mouse', 0)).toBe('pan');
    expect(dragModeFor('mouse', 2)).toBe('rotate');
  });

  it.each([1, 3, 4])('ignores mouse button %s', (button) => {
    expect(dragModeFor('mouse', button)).toBeNull();
  });
});

describe('wheelPixels', () => {
  it('keeps pixel deltas as they are', () => {
    expect(wheelPixels(-120, 0, 800)).toBe(-120);
  });

  it('converts lines and pages to pixels', () => {
    expect(wheelPixels(3, 1, 800)).toBe(48);
    expect(wheelPixels(0.25, 2, 800)).toBe(200);
  });

  it('bounds a single event in both directions', () => {
    expect(wheelPixels(5, 2, 800)).toBe(MAX_WHEEL_STEP_PX);
    expect(wheelPixels(-10_000, 0, 800)).toBe(-MAX_WHEEL_STEP_PX);
  });
});
