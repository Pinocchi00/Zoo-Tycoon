import { describe, expect, it, vi } from 'vitest';
import { bubblePosition, visitorThoughtBubbleVNode, type Rect, type BubbleEvent } from './bubble';

describe('visitorThoughtBubbleVNode', () => {
  it('renders text, a dialog role and an accessible close button', () => {
    const onClose = vi.fn();
    const vnode = visitorThoughtBubbleVNode('What a lovely penguin!', 'Close thought', onClose);

    expect(vnode.type).toBe('div');
    expect(vnode.props).toMatchObject({
      class: 'visitor-thought-bubble',
      role: 'dialog',
      'aria-label': 'What a lovely penguin!',
    });
    expect('aria-modal' in vnode.props).toBe(false);
  });

  it('calls onClose and stops propagation when the close button is clicked', () => {
    const onClose = vi.fn();
    const vnode = visitorThoughtBubbleVNode('Nice flamingo', 'Close', onClose);
    const children: unknown = vnode.props.children;
    const items: readonly unknown[] = Array.isArray(children) ? children : [children];
    const button = items.find(isCloseButton);
    expect(button).toBeDefined();
    if (button === undefined) {
      throw new Error('The close button must be present.');
    }

    const stopPropagation = vi.fn();
    const fakeEvent = { stopPropagation };
    button.props.onClick(fakeEvent);

    expect(onClose).toHaveBeenCalledOnce();
    expect(stopPropagation).toHaveBeenCalledOnce();
  });

  it('stops event propagation on the bubble shell', () => {
    const vnode = visitorThoughtBubbleVNode('Hello', 'Close', vi.fn());
    const stopPropagation = vi.fn();
    const fakeEvent = { stopPropagation };

    vnode.props.onPointerDown(fakeEvent);
    vnode.props.onPointerUp(fakeEvent);
    vnode.props.onClick(fakeEvent);

    expect(stopPropagation).toHaveBeenCalledTimes(3);
  });
});

describe('bubblePosition', () => {
  it('centers the bubble above the anchor', () => {
    const parent: Rect = { width: 400, height: 300 };
    const bubble: Rect = { width: 120, height: 50 };
    const position = bubblePosition(200, 150, parent, bubble);
    expect(position.left).toBe(140);
    expect(position.top).toBe(92);
  });

  it('clamps the bubble inside the viewport on the right edge', () => {
    const parent: Rect = { width: 400, height: 300 };
    const bubble: Rect = { width: 120, height: 50 };
    const position = bubblePosition(380, 150, parent, bubble);
    expect(position.left).toBe(280);
  });

  it('clamps the bubble inside the viewport on the top edge', () => {
    const parent: Rect = { width: 400, height: 300 };
    const bubble: Rect = { width: 120, height: 50 };
    const position = bubblePosition(60, 20, parent, bubble);
    expect(position.top).toBe(0);
  });

  it('keeps a zero-sized bubble at the anchor', () => {
    const parent: Rect = { width: 400, height: 300 };
    const bubble: Rect = { width: 0, height: 0 };
    const position = bubblePosition(100, 100, parent, bubble);
    expect(position.left).toBe(100);
    expect(position.top).toBe(92);
  });
});

interface CloseButton {
  readonly type: 'button';
  readonly props: { readonly onClick: (event: BubbleEvent) => void };
}

function isCloseButton(value: unknown): value is CloseButton {
  if (
    typeof value !== 'object' ||
    value === null ||
    !('type' in value) ||
    value.type !== 'button' ||
    !('props' in value) ||
    typeof value.props !== 'object' ||
    value.props === null
  ) {
    return false;
  }
  return 'onClick' in value.props && typeof value.props.onClick === 'function';
}
