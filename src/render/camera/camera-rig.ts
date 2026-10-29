/**
 * Camera state as plain numbers, free of Three.js so that it can be tested alone.
 * Input moves the `goal` pose; `current` glides towards it every frame, which keeps
 * every movement smooth however abrupt the fingers are.
 */

/** True isometric tilt: the angle whose tangent is 1/√2 (about 35.26°). */
export const ISO_PITCH_RAD = Math.atan(1 / Math.SQRT2);
/** Classic isometric heading: the park's diagonal faces the player. */
export const ISO_YAW_RAD = Math.PI / 4;

const SIN_PITCH = Math.sin(ISO_PITCH_RAD);
const FULL_TURN_RAD = Math.PI * 2;

/** How long the camera takes to cover about 63 % of the way to its goal. */
export const CAMERA_DAMPING_MS = 110;

export interface CameraPose {
  /** Point of the ground the camera looks at. */
  x: number;
  z: number;
  /** Height of the visible area, in metres: smaller means zoomed in. */
  viewHeight: number;
  /** Heading around the vertical axis, in radians. */
  yaw: number;
}

export interface CameraLimits {
  readonly minViewHeight: number;
  readonly maxViewHeight: number;
  /** The look-at point stays within ±halfWidth on X and ±halfDepth on Z. */
  readonly halfWidth: number;
  readonly halfDepth: number;
}

export interface CameraRig {
  readonly current: CameraPose;
  readonly goal: CameraPose;
  readonly limits: CameraLimits;
}

export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function createCameraRig(limits: CameraLimits, start: Readonly<CameraPose>): CameraRig {
  if (limits.minViewHeight <= 0 || limits.minViewHeight > limits.maxViewHeight) {
    throw new RangeError('Camera limits need 0 < minViewHeight <= maxViewHeight.');
  }
  const rig: CameraRig = { current: { ...start }, goal: { ...start }, limits };
  clampGoal(rig);
  Object.assign(rig.current, rig.goal);
  return rig;
}

function clampGoal(rig: CameraRig): void {
  const { goal, limits } = rig;
  goal.viewHeight = clamp(goal.viewHeight, limits.minViewHeight, limits.maxViewHeight);
  goal.x = clamp(goal.x, -limits.halfWidth, limits.halfWidth);
  goal.z = clamp(goal.z, -limits.halfDepth, limits.halfDepth);
}

/**
 * Moves the goal by an offset given in the camera's own frame: `right` metres to the right
 * of the screen and `up` metres towards the top of the screen, measured on the ground.
 */
function moveGoalOnGround(rig: CameraRig, right: number, up: number): void {
  const { goal } = rig;
  const cos = Math.cos(goal.yaw);
  const sin = Math.sin(goal.yaw);
  // Screen right on the ground is (cos, -sin); screen up is (-sin, -cos).
  goal.x += right * cos - up * sin;
  goal.z += -right * sin - up * cos;
}

/** Ground metres covered by one screen pixel, horizontally. */
function metresPerPixel(rig: CameraRig, viewportHeight: number): number {
  return rig.goal.viewHeight / Math.max(1, viewportHeight);
}

/** Drags the ground: the point under the finger follows the finger. */
export function panByPixels(
  rig: CameraRig,
  deltaX: number,
  deltaY: number,
  viewportHeight: number,
): void {
  const scale = metresPerPixel(rig, viewportHeight);
  // A screen pixel upwards spans more ground than sideways because the ground is tilted.
  moveGoalOnGround(rig, -deltaX * scale, (deltaY * scale) / SIN_PITCH);
  clampGoal(rig);
}

/**
 * Zooms by `factor` (above 1 zooms in) while keeping the ground point under the
 * pixel (x, y) in place, like a map.
 */
export function zoomAtPixel(
  rig: CameraRig,
  factor: number,
  x: number,
  y: number,
  viewport: ViewportSize,
): void {
  if (!(factor > 0) || !Number.isFinite(factor)) {
    return;
  }
  const { goal, limits } = rig;
  const scale = metresPerPixel(rig, viewport.height);
  const right = (x - viewport.width / 2) * scale;
  const up = ((viewport.height / 2 - y) * scale) / SIN_PITCH;
  const before = goal.viewHeight;
  goal.viewHeight = clamp(before / factor, limits.minViewHeight, limits.maxViewHeight);
  const shrink = 1 - goal.viewHeight / before;
  moveGoalOnGround(rig, right * shrink, up * shrink);
  clampGoal(rig);
}

/** Turns the view around the look-at point. */
export function rotateBy(rig: CameraRig, radians: number): void {
  if (Number.isFinite(radians)) {
    rig.goal.yaw += radians;
  }
}

/** Glides the current pose towards the goal; `elapsedMs` is the time since the last frame. */
export function updateCameraRig(rig: CameraRig, elapsedMs: number): void {
  const { current, goal } = rig;
  const blend = 1 - Math.exp(-Math.max(0, elapsedMs) / CAMERA_DAMPING_MS);
  current.x += (goal.x - current.x) * blend;
  current.z += (goal.z - current.z) * blend;
  current.viewHeight += (goal.viewHeight - current.viewHeight) * blend;
  current.yaw += (goal.yaw - current.yaw) * blend;
  // Unwrap both together so that the angle never grows without bound nor jumps.
  const turns = Math.trunc(goal.yaw / FULL_TURN_RAD);
  if (turns !== 0) {
    goal.yaw -= turns * FULL_TURN_RAD;
    current.yaw -= turns * FULL_TURN_RAD;
  }
}
