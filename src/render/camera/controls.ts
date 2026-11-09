import type { CameraRig, ViewportSize } from './camera-rig';
import {
  createGestureTracker,
  movePointer,
  pressPointer,
  releasePointer,
  wheelZoom,
  type DragMode,
} from './gestures';
import { cancelTap, createTapTracker, moveTap, pressTap, releaseTap } from './tap-tracker';

const PRIMARY_BUTTON = 0;
const SECONDARY_BUTTON = 2;
/** Values of `WheelEvent.deltaMode`, spelled out so that this file also loads outside a browser. */
const DELTA_MODE_LINE = 1;
const DELTA_MODE_PAGE = 2;
/** Height of one "line" when a wheel reports lines instead of pixels (Firefox). */
const WHEEL_LINE_PX = 16;
/** One wheel event never scrolls more than this: a page-sized jump would zoom to a limit at once. */
export const MAX_WHEEL_STEP_PX = 400;

/** Fingers and pens always pan; on a mouse, left pans, right turns, other buttons do nothing. */
export function dragModeFor(pointerType: string, button: number): DragMode | null {
  if (pointerType !== 'mouse' || button === PRIMARY_BUTTON) {
    return 'pan';
  }
  return button === SECONDARY_BUTTON ? 'rotate' : null;
}

/** Wheel scroll converted to pixels and bounded per event. */
export function wheelPixels(deltaY: number, deltaMode: number, viewportHeight: number): number {
  let pixels = deltaY;
  if (deltaMode === DELTA_MODE_LINE) {
    pixels = deltaY * WHEEL_LINE_PX;
  } else if (deltaMode === DELTA_MODE_PAGE) {
    pixels = deltaY * viewportHeight;
  }
  return Math.min(MAX_WHEEL_STEP_PX, Math.max(-MAX_WHEEL_STEP_PX, pixels));
}

/** Pointer capture fails when the pointer is already gone; such a pointer must not be tracked. */
function tryCapture(element: HTMLElement, pointerId: number): boolean {
  try {
    element.setPointerCapture(pointerId);
    return true;
  } catch (error) {
    if (error instanceof DOMException) {
      return false;
    }
    throw error;
  }
}

/** Subset of `PointerEvent` used by the control handlers; keeps tests free of DOM types. */
export interface PointerEventLike {
  readonly pointerId: number;
  readonly button: number;
  readonly pointerType: string;
  readonly offsetX: number;
  readonly offsetY: number;
  preventDefault(): void;
}

/**
 * Handles a pointer down: starts the camera gesture and a tap candidate.
 * Returns whether the event should be cancelled (`preventDefault`).
 */
export function applyPointerDown(
  event: PointerEventLike,
  tracker: ReturnType<typeof createGestureTracker>,
  tap: ReturnType<typeof createTapTracker>,
  tryCapture: () => boolean,
): boolean {
  const mode = dragModeFor(event.pointerType, event.button);
  pressTap(tap, event.pointerId, event.offsetX, event.offsetY, event.button === PRIMARY_BUTTON);
  if (mode === null || !tryCapture()) {
    cancelTap(tap, event.pointerId);
    return false;
  }
  if (pressPointer(tracker, event.pointerId, event.offsetX, event.offsetY, mode)) {
    return true;
  }
  cancelTap(tap, event.pointerId);
  return false;
}

/** Handles a pointer move: updates the camera gesture and checks the tap threshold. */
export function applyPointerMove(
  event: PointerEventLike,
  tracker: ReturnType<typeof createGestureTracker>,
  tap: ReturnType<typeof createTapTracker>,
  rig: CameraRig,
  viewport: ViewportSize,
): void {
  movePointer(tracker, rig, event.pointerId, event.offsetX, event.offsetY, viewport);
  moveTap(tap, event.pointerId, event.offsetX, event.offsetY);
}

/** Handles a pointer up: fires a clean tap and releases the gesture. */
export function applyPointerUp(
  event: PointerEventLike,
  tracker: ReturnType<typeof createGestureTracker>,
  tap: ReturnType<typeof createTapTracker>,
  onTap?: (x: number, y: number) => void,
): void {
  moveTap(tap, event.pointerId, event.offsetX, event.offsetY);
  if (releaseTap(tap, event.pointerId) && onTap !== undefined) {
    onTap(event.offsetX, event.offsetY);
  }
  releasePointer(tracker, event.pointerId);
}

/** Handles a cancelled pointer or lost capture: invalidates the tap and forgets the pointer. */
export function applyPointerCancel(
  event: PointerEventLike,
  tracker: ReturnType<typeof createGestureTracker>,
  tap: ReturnType<typeof createTapTracker>,
): void {
  cancelTap(tap, event.pointerId);
  releasePointer(tracker, event.pointerId);
}

/**
 * Lets touch and mouse move the camera: drag to pan, pinch or wheel to zoom,
 * two-finger twist or right-button drag to turn. A clean primary-pointer tap
 * on the canvas is reported through `onTap`. Returns a function that removes the listeners.
 */
export function attachCameraControls(
  element: HTMLElement,
  rig: CameraRig,
  viewport: ViewportSize,
  onTap?: (x: number, y: number) => void,
): () => void {
  const tracker = createGestureTracker();
  const tap = createTapTracker();

  const onPointerDown = (event: PointerEvent): void => {
    const accepted = applyPointerDown(event, tracker, tap, () => {
      return tryCapture(element, event.pointerId);
    });
    if (accepted) {
      event.preventDefault();
    } else if (element.hasPointerCapture(event.pointerId)) {
      element.releasePointerCapture(event.pointerId);
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    applyPointerMove(event, tracker, tap, rig, viewport);
  };
  const onPointerUp = (event: PointerEvent): void => {
    applyPointerUp(event, tracker, tap, onTap);
  };
  const onPointerCancel = (event: PointerEvent): void => {
    applyPointerCancel(event, tracker, tap);
  };
  // If capture is lost after a natural pointerup, the tap tracker is already idle: no double callback.
  const onLostPointerCapture = (event: PointerEvent): void => {
    applyPointerCancel(event, tracker, tap);
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    const pixels = wheelPixels(event.deltaY, event.deltaMode, viewport.height);
    wheelZoom(rig, pixels, event.offsetX, event.offsetY, viewport);
  };
  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerUp);
  element.addEventListener('pointercancel', onPointerCancel);
  element.addEventListener('lostpointercapture', onLostPointerCapture);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('contextmenu', onContextMenu);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    element.removeEventListener('lostpointercapture', onLostPointerCapture);
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('contextmenu', onContextMenu);
  };
}
