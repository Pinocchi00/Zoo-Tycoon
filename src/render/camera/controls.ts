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
/** Height of one "line" when a wheel reports lines instead of pixels (Firefox). */
const WHEEL_LINE_PX = 16;

function dragModeFor(event: PointerEvent): DragMode | null {
  if (event.pointerType !== 'mouse' || event.button === PRIMARY_BUTTON) {
    return 'pan';
  }
  return event.button === SECONDARY_BUTTON ? 'rotate' : null;
}

function wheelPixels(event: WheelEvent, viewport: ViewportSize): number {
  switch (event.deltaMode) {
    case WheelEvent.DOM_DELTA_LINE:
      return event.deltaY * WHEEL_LINE_PX;
    case WheelEvent.DOM_DELTA_PAGE:
      return event.deltaY * viewport.height;
    default:
      return event.deltaY;
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
    const mode = dragModeFor(event);
    if (mode === null) {
      return;
    }
    if (pressPointer(tracker, event.pointerId, event.offsetX, event.offsetY, mode)) {
      element.setPointerCapture(event.pointerId);
      event.preventDefault();
    }
  };
  const onPointerMove = (event: PointerEvent): void => {
    movePointer(tracker, rig, event.pointerId, event.offsetX, event.offsetY, viewport);
  };
  const onPointerEnd = (event: PointerEvent): void => {
    releasePointer(tracker, event.pointerId);
  };
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault();
    wheelZoom(rig, wheelPixels(event, viewport), event.offsetX, event.offsetY, viewport);
  };
  const onContextMenu = (event: Event): void => {
    event.preventDefault();
  };

  element.addEventListener('pointerdown', onPointerDown);
  element.addEventListener('pointermove', onPointerMove);
  element.addEventListener('pointerup', onPointerEnd);
  element.addEventListener('pointercancel', onPointerEnd);
  element.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('contextmenu', onContextMenu);

  return () => {
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerEnd);
    element.removeEventListener('pointercancel', onPointerEnd);
    element.removeEventListener('wheel', onWheel);
    element.removeEventListener('contextmenu', onContextMenu);
  };
}
