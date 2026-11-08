import { render } from 'preact';
import type * as Preact from 'preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVisitorThoughtBubble } from './bubble';

vi.mock('preact', async (importOriginal) => {
  const original = await importOriginal<typeof Preact>();
  return { ...original, render: vi.fn() };
});

class ElementStub {
  className = '';
  firstElementChild: ElementStub | null = null;
  style = { transform: '' };
  getBoundingClientRect = vi.fn(() => ({ width: 120, height: 50 }));
  appendChild = vi.fn();
  remove = vi.fn();
}

describe('visitor bubble layout cache', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it('moves with transforms without rendering or reading geometry again until content or size changes', () => {
    const parent = new ElementStub();
    parent.getBoundingClientRect.mockReturnValue({ width: 400, height: 300 });
    const container = new ElementStub();
    const root = new ElementStub();
    let resize = (): void => undefined;
    const disconnect = vi.fn();
    class ObserverStub {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = vi.fn();
      disconnect = disconnect;
    }
    vi.stubGlobal('HTMLElement', ElementStub);
    vi.stubGlobal('document', {
      createElement: vi.fn().mockReturnValueOnce(parent).mockReturnValue(container),
    });
    vi.stubGlobal('ResizeObserver', ObserverStub);
    vi.mocked(render).mockImplementation((vnode) => {
      container.firstElementChild = vnode === null ? null : root;
    });
    const bubble = createVisitorThoughtBubble(document.createElement('div'), vi.fn());
    bubble.show('Hello', 200, 150, 'Close');
    expect(root.style.transform).toBe('translate(140px, 92px)');
    bubble.show('Hello', 380, 200, 'Close');
    expect(root.style.transform).toBe('translate(280px, 142px)');
    expect(parent.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(root.getBoundingClientRect).toHaveBeenCalledOnce();
    expect(render).toHaveBeenCalledOnce();
    bubble.show('A different thought', 200, 150, 'Close');
    expect(root.getBoundingClientRect).toHaveBeenCalledTimes(2);
    resize();
    bubble.show('A different thought', 200, 150, 'Close');
    expect(parent.getBoundingClientRect).toHaveBeenCalledTimes(2);
    expect(root.getBoundingClientRect).toHaveBeenCalledTimes(3);
    bubble.hide();
    bubble.show('A different thought', 200, 150, 'Close');
    expect(root.getBoundingClientRect).toHaveBeenCalledTimes(4);
    bubble.dispose();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(container.remove).toHaveBeenCalledOnce();
    bubble.show('Ignored', 0, 0, 'Close');
    expect(root.getBoundingClientRect).toHaveBeenCalledTimes(4);
  });
});
