import { AnimationClip } from 'three';
import { describe, expect, it } from 'vitest';
import { pickClip } from './animal-model';

describe('pickClip', () => {
  const idle = new AnimationClip('idle', 4, []);
  const walk = new AnimationClip('walk', 1, []);

  it('finds a clip by name', () => {
    expect(pickClip([walk, idle], 'idle')).toEqual({ ok: true, value: idle });
  });

  it('reports a missing clip instead of throwing', () => {
    expect(pickClip([walk], 'idle')).toEqual({
      ok: false,
      error: { kind: 'missingClip', name: 'idle' },
    });
    expect(pickClip([], 'walk').ok).toBe(false);
  });
});
