import type { CameraRig, ViewportSize } from './camera-rig';
import {
  createGestureTracker,
  movePointer,
  pressPointer,
  releasePointer,
  wheelZoom,
  type DragMode,
} from './gestures';

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

/**
 * Lets touch and mouse move the camera: drag to pan, pinch or wheel to zoom,
 * two-finger twist or right-button drag to turn. Returns a function that removes the listeners.
 */
export function attachCameraControls(
  element: HTMLElement,
  rig: CameraRig,
  viewport: ViewportSize,
): () => void {
  const tracker = createGestureTracker();

  const onPointerDown = (event: PointerEvent): void => {
    const mode = dragModeFor(event.pointerType, event.button);
    if (mode === null || !tryCapture(element, event.pointerId)) {
      return;
    }
    if (pressPointer(tracker, event.pointerId, event.offsetX, event.offsetY, mode)) {
      event.preventDefault();
    } else {
      element.releasePointerCapture(event.pointerId);
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    movePointer(tracker, rig, event.pointerId, event.offsetX, event.offsetY, viewport);
  };
  // Without capture the canvas no longer hears this pointer's release: forget it now.
  const onPointerEnd = (event: PointerEvent): void => {
    releasePointer(tracker, event.pointerId);
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
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('lostpointercapture', onPointerEnd);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('contextmenu', onContextMenu);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerEnd);
    element.removeEventListener('pointercancel', onPointerEnd);
    element.removeEventListener('lostpointercapture', onPointerEnd);
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('contextmenu', onContextMenu);
  };
}
