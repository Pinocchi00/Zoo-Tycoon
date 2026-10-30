import { containsPoint, distanceToEdge, type EnclosureArea, type Point2 } from './enclosure-area';

/** Within this distance of the target the animal counts as arrived. */
export const ARRIVE_RADIUS_M = 0.2;
/** Starts slowing down this far from the target. */
const SLOW_RADIUS_M = 1.2;
/** Never creeps slower than this share of its top speed before arriving. */
const MIN_SPEED_RATIO = 0.2;
/** Animals closer than this push each other away. */
export const SEPARATION_RADIUS_M = 1.2;
/** The fence pushes back inside this distance. */
const EDGE_RANGE_M = 0.9;
const AVOID_GAIN = 2.5;
const TWO_PI = Math.PI * 2;

/** Moving state of one animal. Mutated in place, never replaced. */
export interface SteerBody {
  x: number;
  z: number;
  /** Rotation about the vertical axis; the animal faces (sin yaw, cos yaw). */
  yaw: number;
  /** Metres per second along the facing direction. */
  speed: number;
  /** True once the animal reached the target it was told to go to. */
  arrived: boolean;
}

/** What one individual can do: low limits keep every movement gentle. */
export interface SteerLimits {
  readonly maxSpeed: number;
  /** Metres per second, per second. */
  readonly maxAccel: number;
  /** Radians per second. */
  readonly maxTurnRate: number;
}

/** The surroundings of a body, reused from step to step. */
export interface SteerWorld {
  readonly area: EnclosureArea;
  /** Every body of the group, the steered one included. */
  readonly others: readonly SteerBody[];
  /** Scratch slot for the nearest point of the fence. */
  readonly scratch: Point2;
}

export function createSteerBody(x: number, z: number, yaw: number): SteerBody {
  return { x, z, yaw, speed: 0, arrived: false };
}

function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) {
    wrapped -= TWO_PI;
  }
  while (wrapped < -Math.PI) {
    wrapped += TWO_PI;
  }
  return wrapped;
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Smooth push away from neighbours and from the fence; writes the sum into the world scratch. */
function avoidance(body: SteerBody, world: SteerWorld, out: Point2): void {
  out.x = 0;
  out.z = 0;
  for (const other of world.others) {
    if (other === body) {
      continue;
    }
    const dx = body.x - other.x;
    const dz = body.z - other.z;
    const distance = Math.sqrt(dx * dx + dz * dz);
    if (distance > 0 && distance < SEPARATION_RADIUS_M) {
      const weight = (1 - distance / SEPARATION_RADIUS_M) / distance;
      out.x += dx * weight;
      out.z += dz * weight;
    }
  }
  const edge = world.scratch;
  const gap = distanceToEdge(world.area, body.x, body.z, edge);
  if (gap > 0 && gap < EDGE_RANGE_M) {
    const weight = (1 - gap / EDGE_RANGE_M) / gap;
    out.x += (body.x - edge.x) * weight;
    out.z += (body.z - edge.z) * weight;
  }
}

const PUSH: Point2 = { x: 0, z: 0 };

/** Replaces this step's turn by one towards the inside, still within the turn-rate cap. */
function turnInwards(
  body: SteerBody,
  limits: SteerLimits,
  world: SteerWorld,
  yawBefore: number,
  dtS: number,
): void {
  const edge = world.scratch;
  distanceToEdge(world.area, body.x, body.z, edge);
  const inward = Math.atan2(body.x - edge.x, body.z - edge.z);
  const error = wrapAngle(inward - yawBefore);
  body.yaw = wrapAngle(yawBefore + clamp(error, limits.maxTurnRate * dtS));
}

/**
 * Advances `body` by `dtS` seconds. While `moving`, it turns towards the target and walks to it,
 * slowing down on arrival and swerving round neighbours and fences; otherwise it slows to a stop.
 * Acceleration and turn rate are capped, so no speed or heading ever jumps. A step that would
 * leave the enclosure brakes at the maximum rate and turns towards the inside; if even the
 * braked step would leave, the animal stays put while it slows down. It never ends up outside.
 */
export function steerStep(
  body: SteerBody,
  limits: SteerLimits,
  world: SteerWorld,
  moving: boolean,
  targetX: number,
  targetZ: number,
  dtS: number,
): void {
  const yawBefore = body.yaw;
  const speedBefore = body.speed;
  let wantedSpeed = 0;
  let alignment = 1;
  if (moving) {
    const toX = targetX - body.x;
    const toZ = targetZ - body.z;
    const distance = Math.sqrt(toX * toX + toZ * toZ);
    body.arrived = distance <= ARRIVE_RADIUS_M;
    if (!body.arrived) {
      avoidance(body, world, PUSH);
      const wantedX = toX / distance + PUSH.x * AVOID_GAIN;
      const wantedZ = toZ / distance + PUSH.z * AVOID_GAIN;
      const error = wrapAngle(Math.atan2(wantedX, wantedZ) - body.yaw);
      const turn = clamp(error, limits.maxTurnRate * dtS);
      body.yaw = wrapAngle(body.yaw + turn);
      // Slow down while still turning, so the animal never skids sideways.
      alignment = Math.max(0, Math.cos(error - turn));
      const arriveRatio = Math.min(1, distance / SLOW_RADIUS_M);
      wantedSpeed = limits.maxSpeed * Math.max(MIN_SPEED_RATIO, arriveRatio);
    }
  }
  const change = clamp(wantedSpeed * alignment - body.speed, limits.maxAccel * dtS);
  body.speed = Math.max(0, body.speed + change);
  const nextX = body.x + Math.sin(body.yaw) * body.speed * dtS;
  const nextZ = body.z + Math.cos(body.yaw) * body.speed * dtS;
  if (containsPoint(world.area, nextX, nextZ)) {
    body.x = nextX;
    body.z = nextZ;
    return;
  }
  turnInwards(body, limits, world, yawBefore, dtS);
  body.speed = Math.max(0, speedBefore - limits.maxAccel * dtS);
  const brakedX = body.x + Math.sin(body.yaw) * body.speed * dtS;
  const brakedZ = body.z + Math.cos(body.yaw) * body.speed * dtS;
  if (containsPoint(world.area, brakedX, brakedZ)) {
    body.x = brakedX;
    body.z = brakedZ;
  }
}
