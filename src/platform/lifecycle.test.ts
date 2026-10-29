import { describe, expect, it } from 'vitest';
import { onForegroundChange, type VisibilitySource } from './lifecycle';

function fakeDocument(): VisibilitySource & { setHidden: (hidden: boolean) => void } {
  const listeners = new Set<() => void>();
  const source = {
    hidden: false,
    addEventListener: (_type: 'visibilitychange', listener: () => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: 'visibilitychange', listener: () => void) => {
      listeners.delete(listener);
    },
    setHidden: (hidden: boolean) => {
      source.hidden = hidden;
      for (const listener of listeners) {
        listener();
      }
    },
  };
  return source;
}

describe('onForegroundChange', () => {
  it('reports leaving and coming back to the foreground', () => {
    const source = fakeDocument();
    const changes: boolean[] = [];
    onForegroundChange((foreground) => changes.push(foreground), source);
    source.setHidden(true);
    source.setHidden(false);
    expect(changes).toEqual([false, true]);
  });

  it('stops reporting once unsubscribed', () => {
    const source = fakeDocument();
    const changes: boolean[] = [];
    const stop = onForegroundChange((foreground) => changes.push(foreground), source);
    stop();
    source.setHidden(true);
    expect(changes).toEqual([]);
  });
});
