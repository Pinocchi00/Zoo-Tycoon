/** Displacement above which a single-pointer gesture is no longer a tap. */
export const TAP_DISPLACEMENT_THRESHOLD_PX = 10;

const NO_POINTER = -1;

/**
 * Pure state machine for a single primary-pointer tap.
 * No DOM types: coordinates are provided by the caller.
 */
export interface TapTracker {
  readonly activePointers: Set<number>;
  pointerId: number;
  startX: number;
  startY: number;
  thresholdSquared: number;
  invalidated: boolean;
}

export function createTapTracker(thresholdPx?: number): TapTracker {
  return {
    activePointers: new Set(),
    pointerId: NO_POINTER,
    startX: 0,
    startY: 0,
    thresholdSquared: (thresholdPx ?? TAP_DISPLACEMENT_THRESHOLD_PX) ** 2,
    invalidated: false,
  };
}

function reset(tracker: TapTracker): void {
  tracker.pointerId = NO_POINTER;
  tracker.invalidated = false;
}

/**
 * Records a pointer press. Only the primary button can start a tap;
 * a second pointer, or a non-primary button while a candidate exists,
 * permanently invalidates the current gesture.
 */
export function pressTap(
  tracker: TapTracker,
  pointerId: number,
  x: number,
  y: number,
  isPrimaryButton: boolean,
): void {
  tracker.activePointers.add(pointerId);
  if (!isPrimaryButton) {
    if (tracker.pointerId !== NO_POINTER) {
      tracker.invalidated = true;
    }
    return;
  }
  if (tracker.activePointers.size > 1) {
    tracker.invalidated = true;
    return;
  }
  tracker.pointerId = pointerId;
  tracker.startX = x;
  tracker.startY = y;
  tracker.invalidated = false;
}

/**
 * Updates the candidate position. Once the displacement threshold is crossed,
 * the gesture stays invalidated even if the pointer returns to its start.
 */
export function moveTap(tracker: TapTracker, pointerId: number, x: number, y: number): void {
  if (tracker.pointerId !== pointerId || tracker.invalidated) {
    return;
  }
  const dx = x - tracker.startX;
  const dy = y - tracker.startY;
  if (dx * dx + dy * dy > tracker.thresholdSquared) {
    tracker.invalidated = true;
  }
}

/**
 * Releases the pointer. Returns true if the gesture was a clean primary tap.
 * The tracker is always reset, so a later `lostpointercapture` cannot fire again.
 */
export function releaseTap(tracker: TapTracker, pointerId: number): boolean {
  tracker.activePointers.delete(pointerId);
  if (tracker.pointerId !== pointerId) {
    if (tracker.activePointers.size === 0) {
      reset(tracker);
    }
    return false;
  }
  const wasTap = !tracker.invalidated && tracker.activePointers.size === 0;
  if (tracker.activePointers.size === 0) {
    reset(tracker);
  } else {
    tracker.pointerId = NO_POINTER;
    tracker.invalidated = true;
  }
  return wasTap;
}

/** Cancels the candidate without firing a tap. */
export function cancelTap(tracker: TapTracker, pointerId: number): void {
  if (!tracker.activePointers.delete(pointerId)) {
    return;
  }
  tracker.invalidated = true;
  if (tracker.pointerId === pointerId) {
    tracker.pointerId = NO_POINTER;
  }
  if (tracker.activePointers.size === 0) {
    reset(tracker);
  }
}
