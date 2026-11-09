import type { VisitorId } from '@/shared';
import type { VisitorState } from '@/sim';

interface ThoughtPresentation {
  show: (text: string, x: number, y: number, closeLabel: string) => void;
  hide: () => void;
}

export interface VisitorSelectionOptions {
  readonly visitors: () => readonly VisitorState[];
  readonly thought: (visitor: VisitorState) => string;
  readonly closeLabel: () => string;
  readonly project: (id: VisitorId, out: { x: number; y: number }) => boolean;
  readonly bubble: ThoughtPresentation;
}

export interface VisitorSelection {
  tap: (id: VisitorId | null) => void;
  update: () => void;
  close: () => void;
  dispose: () => void;
}

/** Keeps a selected group and its translated thought together as the world and camera move. */
export function createVisitorSelection(options: VisitorSelectionOptions): VisitorSelection {
  const point = { x: 0, y: 0 };
  let selected: VisitorId | null = null;
  let shown = false;
  let disposed = false;
  let lastText = '';
  let lastCloseLabel = '';
  let lastX = Number.NaN;
  let lastY = Number.NaN;

  const close = (): void => {
    selected = null;
    if (shown) {
      options.bubble.hide();
      shown = false;
    }
  };

  const update = (): void => {
    if (disposed || selected === null) {
      return;
    }
    let found: VisitorState | undefined;
    for (const visitor of options.visitors()) {
      if (visitor.id === selected) {
        found = visitor;
        break;
      }
    }
    if (found === undefined || !options.project(selected, point)) {
      close();
      return;
    }
    const text = options.thought(found);
    const closeLabel = options.closeLabel();
    const x = Math.round(point.x);
    const y = Math.round(point.y);
    if (
      !shown ||
      text !== lastText ||
      closeLabel !== lastCloseLabel ||
      x !== lastX ||
      y !== lastY
    ) {
      options.bubble.show(text, x, y, closeLabel);
      shown = true;
      lastText = text;
      lastCloseLabel = closeLabel;
      lastX = x;
      lastY = y;
    }
  };

  return {
    tap: (id) => {
      if (disposed) {
        return;
      }
      if (id === null || id === selected) {
        close();
      } else {
        selected = id;
        update();
      }
    },
    update,
    close,
    dispose: () => {
      close();
      disposed = true;
    },
  };
}
