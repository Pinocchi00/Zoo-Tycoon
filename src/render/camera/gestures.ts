import {
  panByPixels,
  rotateBy,
  zoomAtPixel,
  type CameraRig,
  type ViewportSize,
} from './camera-rig';

/** What a single pointer does when it drags: fingers and the left button pan, the right button turns. */
export type DragMode = 'pan' | 'rotate';

/** Radians turned per pixel of right-button drag. */
export const ROTATE_RAD_PER_PIXEL = 0.006;
/** Zoom speed of the mouse wheel, per pixel of scroll. */
export const WHEEL_ZOOM_PER_PIXEL = 0.0015;
/** Two fingers closer than this give no reliable pinch or twist. */
const MIN_PINCH_DISTANCE_PX = 8;

const MAX_POINTERS = 2;
const NO_POINTER = -1;

interface TrackedPointer {
  id: number;
  x: number;
  y: number;
}

/** Follows up to two pointers. Mutated in place: event handlers allocate nothing. */
export interface GestureTracker {
  readonly pointers: readonly [TrackedPointer, TrackedPointer];
  dragMode: DragMode;
  /** Reference values of the two-finger gesture, refreshed at each move. */
  pairDistance: number;
  pairAngle: number;
  pairMidX: number;
  pairMidY: number;
}

export function createGestureTracker(): GestureTracker {
  return {
    pointers: [
      { id: NO_POINTER, x: 0, y: 0 },
      { id: NO_POINTER, x: 0, y: 0 },
    ],
    dragMode: 'pan',
    pairDistance: 0,
    pairAngle: 0,
    pairMidX: 0,
    pairMidY: 0,
  };
}

/** Number of pointers currently pressed. */
export function activePointerCount(tracker: GestureTracker): number {
  let count = 0;
  for (const pointer of tracker.pointers) {
    if (pointer.id !== NO_POINTER) {
      count += 1;
    }
  }
  return count;
}

/** Shortest signed difference from angle `from` to angle `to`, in (-π, π]. */
export function angleDifference(from: number, to: number): number {
  const turn = Math.PI * 2;
  let difference = (to - from) % turn;
  if (difference > Math.PI) {
    difference -= turn;
  } else if (difference <= -Math.PI) {
    difference += turn;
  }
  return difference;
}

function findPointer(tracker: GestureTracker, id: number): TrackedPointer | undefined {
  for (const pointer of tracker.pointers) {
    if (pointer.id === id) {
      return pointer;
    }
  }
  return undefined;
}

function capturePair(tracker: GestureTracker): void {
  const [first, second] = tracker.pointers;
  const dx = second.x - first.x;
  const dy = second.y - first.y;
  tracker.pairDistance = Math.hypot(dx, dy);
  tracker.pairAngle = Math.atan2(dy, dx);
  tracker.pairMidX = (first.x + second.x) / 2;
  tracker.pairMidY = (first.y + second.y) / 2;
}

/** Starts tracking a pointer. Returns false when two pointers are already down. */
export function pressPointer(
  tracker: GestureTracker,
  id: number,
  x: number,
  y: number,
  mode: DragMode,
): boolean {
  if (findPointer(tracker, id) !== undefined) {
    return true;
  }
  const free = findPointer(tracker, NO_POINTER);
  if (free === undefined) {
    return false;
  }
  free.id = id;
  free.x = x;
  free.y = y;
  if (activePointerCount(tracker) === MAX_POINTERS) {
    capturePair(tracker);
  } else {
    tracker.dragMode = mode;
  }
  return true;
}

/** Stops tracking a pointer; the remaining finger, if any, keeps panning without a jump. */
export function releasePointer(tracker: GestureTracker, id: number): void {
  const pointer = findPointer(tracker, id);
  if (pointer !== undefined) {
    pointer.id = NO_POINTER;
    tracker.dragMode = 'pan';
  }
}

function moveSingle(
  tracker: GestureTracker,
  rig: CameraRig,
  dx: number,
  dy: number,
  viewport: ViewportSize,
): void {
  switch (tracker.dragMode) {
    case 'pan':
      panByPixels(rig, dx, dy, viewport.height);
      return;
    case 'rotate':
      // Dragging right pulls the near ground to the right, which turns the camera the other way.
      rotateBy(rig, -dx * ROTATE_RAD_PER_PIXEL);
      return;
  }
}

function movePair(tracker: GestureTracker, rig: CameraRig, viewport: ViewportSize): void {
  const previousDistance = tracker.pairDistance;
  const previousAngle = tracker.pairAngle;
  const previousMidX = tracker.pairMidX;
  const previousMidY = tracker.pairMidY;
  capturePair(tracker);
  panByPixels(
    rig,
    tracker.pairMidX - previousMidX,
    tracker.pairMidY - previousMidY,
    viewport.height,
  );
  if (previousDistance < MIN_PINCH_DISTANCE_PX || tracker.pairDistance < MIN_PINCH_DISTANCE_PX) {
    return;
  }
  zoomAtPixel(
    rig,
    tracker.pairDistance / previousDistance,
    tracker.pairMidX,
    tracker.pairMidY,
    viewport,
  );
  // The ground turns with the fingers.
  rotateBy(rig, angleDifference(previousAngle, tracker.pairAngle));
}

/** Applies a pointer move to the camera: drag, or pinch, twist and drag with two fingers. */
export function movePointer(
  tracker: GestureTracker,
  rig: CameraRig,
  id: number,
  x: number,
  y: number,
  viewport: ViewportSize,
): void {
  const pointer = findPointer(tracker, id);
  if (pointer === undefined || id === NO_POINTER) {
    return;
  }
  const dx = x - pointer.x;
  const dy = y - pointer.y;
  pointer.x = x;
  pointer.y = y;
  if (activePointerCount(tracker) === MAX_POINTERS) {
    movePair(tracker, rig, viewport);
  } else {
    moveSingle(tracker, rig, dx, dy, viewport);
  }
}

/** Mouse wheel: scrolling up (negative delta) zooms in towards the cursor. */
export function wheelZoom(
  rig: CameraRig,
  deltaPixels: number,
  x: number,
  y: number,
  viewport: ViewportSize,
): void {
  zoomAtPixel(rig, Math.exp(-deltaPixels * WHEEL_ZOOM_PER_PIXEL), x, y, viewport);
}
