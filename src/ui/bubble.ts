import { h, render, type VNode } from 'preact';
import './bubble.css';

export interface VisitorThoughtBubble {
  show(text: string, x: number, y: number, closeLabel: string): void;
  hide(): void;
  dispose(): void;
}

export interface Rect {
  readonly width: number;
  readonly height: number;
}

export interface BubbleEvent {
  stopPropagation(): void;
}

interface BubbleShellProps {
  readonly class: string;
  readonly role: 'dialog';
  readonly 'aria-label': string;
  readonly onPointerDown: (event: BubbleEvent) => void;
  readonly onPointerUp: (event: BubbleEvent) => void;
  readonly onClick: (event: BubbleEvent) => void;
}

const ARROW_OFFSET_PX = 8;

function stopPropagation(event: BubbleEvent): void {
  event.stopPropagation();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * Computes bubble position so it sits above the anchor and stays inside the viewport.
 * Returns CSS pixel coordinates for `left` and `top`.
 */
export function bubblePosition(
  x: number,
  y: number,
  parentRect: Rect,
  bubbleRect: Rect,
): { left: number; top: number } {
  let left = x - bubbleRect.width / 2;
  let top = y - bubbleRect.height - ARROW_OFFSET_PX;

  left = clamp(left, 0, Math.max(0, parentRect.width - bubbleRect.width));
  top = clamp(top, 0, Math.max(0, parentRect.height - bubbleRect.height));

  return { left, top };
}

/** Pure vnode builder: the only place that decides the bubble structure and accessibility. */
export function visitorThoughtBubbleVNode(
  text: string,
  closeLabel: string,
  onClose: () => void,
): VNode<BubbleShellProps> {
  return h<BubbleShellProps>(
    'div',
    {
      class: 'visitor-thought-bubble',
      role: 'dialog',
      'aria-label': text,
      onPointerDown: stopPropagation,
      onPointerUp: stopPropagation,
      onClick: stopPropagation,
    },
    h('p', { class: 'visitor-thought-bubble__text' }, text),
    h(
      'button',
      {
        class: 'visitor-thought-bubble__close',
        type: 'button',
        'aria-label': closeLabel,
        onClick: (event: BubbleEvent) => {
          stopPropagation(event);
          onClose();
        },
      },
      h('span', { 'aria-hidden': true }, '×'),
    ),
  );
}

export function createVisitorThoughtBubble(
  parent: HTMLElement,
  onClose: () => void,
): VisitorThoughtBubble {
  const container = document.createElement('div');
  container.className = 'visitor-thought-bubble-host';
  parent.appendChild(container);

  let disposed = false;
  let previousText: string | null = null;
  let previousCloseLabel: string | null = null;
  let parentRect: Rect | null = null;
  let bubbleRect: Rect | null = null;
  const observer = new ResizeObserver(() => {
    parentRect = null;
    bubbleRect = null;
  });
  observer.observe(parent);

  const hide = (): void => {
    if (disposed) {
      return;
    }
    render(null, container);
    previousText = null;
    previousCloseLabel = null;
    bubbleRect = null;
  };

  const show = (text: string, x: number, y: number, closeLabel: string): void => {
    if (disposed) {
      return;
    }
    if (text !== previousText || closeLabel !== previousCloseLabel) {
      render(visitorThoughtBubbleVNode(text, closeLabel, onClose), container);
      previousText = text;
      previousCloseLabel = closeLabel;
      bubbleRect = null;
    }

    const root = container.firstElementChild;
    if (root instanceof HTMLElement) {
      parentRect ??= parent.getBoundingClientRect();
      bubbleRect ??= root.getBoundingClientRect();
      const position = bubblePosition(x, y, parentRect, bubbleRect);
      root.style.transform = `translate(${String(position.left)}px, ${String(position.top)}px)`;
    }
  };

  const dispose = (): void => {
    hide();
    observer.disconnect();
    container.remove();
    disposed = true;
  };

  return { show, hide, dispose };
}
