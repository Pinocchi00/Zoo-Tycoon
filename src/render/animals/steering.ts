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
/**
 * The pushes away from fences and neighbours never outweigh the pull of the target: a target close
 * to a fence or to a neighbour must stay reachable, or the animal would circle round it.
 */
const MAX_AVOID_PULL = 0.9;
/** Below this speed an animal turning is pivoting on the spot, which it does more gently. */
const PIVOT_SPEED_MPS = 0.1;
const PIVOT_TURN_SHARE = 0.6;
/**
 * The heading follows the wanted direction like a spring (turn rate = error times this, per
 * second) whose rate may change by at most this share of the top turn rate each second, so that a
 * wanted direction that flips from one image to the next (a neighbour on one side, the target on
 * the other) moves the animal by a hair instead of shaking it.
 */
const TURN_GAIN_PER_S = 4;
const TURN_ACCEL_SHARE_PER_S = 3;
/** The animal starts braking when a neighbour is nearer than its stopping distance plus this. */
const BRAKE_LOOKAHEAD_M = 0.5;
/** It aims to stop this far (free space between bodies) short of the neighbour in its way. */
const STOP_MARGIN_M = 0.3;
/** ... and this far (from the centre of its body) short of the fence. */
const FENCE_STOP_MARGIN_M = 0.15;
/** Neighbours further apart than the two reaches and this cannot touch within a step. */
const REACH_MARGIN_M = 0.5;
/** Rounds of halving to find the farthest free part of a step. */
const BISECTION_STEPS = 7;
/**
 * A walk slower than this is not a walk: an animal that can only creep, held back by a neighbour
 * or the fence, stops instead (its feet could not keep up with so slow a body).
 */
const MIN_WALK_SPEED_MPS = 0.06;
/** A step or a turn may not bring the body nearer than this to a neighbour's (unless it is already). */
const KEEP_CLEAR_M = 0.15;
const TWO_PI = Math.PI * 2;

/**
 * An animal is a capsule: a segment along its body with a radius, so that a long animal is not
 * taken for a round one. The radius is this share of the length.
 */
export const BODY_RADIUS_RATIO = 0.17;
const SEGMENT_EPSILON = 1e-9;

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
  /** Radians per second: the heading changes gradually, so it cannot flicker left and right. */
  turnRate: number;
  /** Nose to tail, in metres; zero for a point. */
  readonly lengthM: number;
  /** Radius of the capsule that stands for the body. */
  readonly radius: number;
  /** Half the length of the segment along the body, nose-side and tail-side from the centre. */
  readonly halfSpan: number;
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
  /** The neighbour the animal is going to be next to: it brakes for the others, not for this one. */
  goal: SteerBody | null;
}

export function createSteerBody(x: number, z: number, yaw: number, lengthM = 0): SteerBody {
  const radius = lengthM * BODY_RADIUS_RATIO;
  return {
    x,
    z,
    yaw,
    speed: 0,
    arrived: false,
    turnRate: 0,
    lengthM,
    radius,
    halfSpan: Math.max(0, lengthM / 2 - radius),
  };
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

/** Distance between the segments p1-q1 and p2-q2 (no allocation). */
function segmentsDistance(
  p1x: number,
  p1z: number,
  q1x: number,
  q1z: number,
  p2x: number,
  p2z: number,
  q2x: number,
  q2z: number,
): number {
  const d1x = q1x - p1x;
  const d1z = q1z - p1z;
  const d2x = q2x - p2x;
  const d2z = q2z - p2z;
  const rx = p1x - p2x;
  const rz = p1z - p2z;
  const a = d1x * d1x + d1z * d1z;
  const e = d2x * d2x + d2z * d2z;
  const f = d2x * rx + d2z * rz;
  let s = 0;
  let t = 0;
  if (a <= SEGMENT_EPSILON && e <= SEGMENT_EPSILON) {
    return Math.hypot(rx, rz);
  }
  if (a <= SEGMENT_EPSILON) {
    t = clamp01(f / e);
  } else {
    const c = d1x * rx + d1z * rz;
    if (e <= SEGMENT_EPSILON) {
      s = clamp01(-c / a);
    } else {
      const b = d1x * d2x + d1z * d2z;
      const denominator = a * e - b * b;
      s = denominator > SEGMENT_EPSILON ? clamp01((b * f - c * e) / denominator) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  return Math.hypot(rx + d1x * s - d2x * t, rz + d1z * s - d2z * t);
}

/** Free space between two capsules: negative when they overlap. `a` is taken at the given pose. */
function gapAt(a: SteerBody, x: number, z: number, yaw: number, b: SteerBody): number {
  const ax = Math.sin(yaw) * a.halfSpan;
  const az = Math.cos(yaw) * a.halfSpan;
  const bx = Math.sin(b.yaw) * b.halfSpan;
  const bz = Math.cos(b.yaw) * b.halfSpan;
  return (
    segmentsDistance(x - ax, z - az, x + ax, z + az, b.x - bx, b.z - bz, b.x + bx, b.z + bz) -
    a.radius -
    b.radius
  );
}

/** Free space between the bodies of two animals, nose to tail: negative when they overlap. */
export function capsuleGap(a: SteerBody, b: SteerBody): number {
  return gapAt(a, a.x, a.z, a.yaw, b);
}

export function wrapAngle(angle: number): number {
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

/** How far from its centre a body reaches: half its length. */
function reach(body: SteerBody): number {
  return body.halfSpan + body.radius;
}

/**
 * Whether the body may take the given pose without running into a neighbour: a pose is refused
 * when it overlaps a neighbour more than the present one does. Neighbours too far to touch it
 * within `marginM` are skipped without any geometry.
 */
function clearToMove(
  body: SteerBody,
  x: number,
  z: number,
  yaw: number,
  others: readonly SteerBody[],
  marginM = REACH_MARGIN_M,
  minGapM = 0,
  skip: SteerBody | null = null,
): boolean {
  const own = reach(body);
  for (const other of others) {
    if (other === body || other === skip) {
      continue;
    }
    const range = own + reach(other) + marginM;
    const dx = other.x - x;
    const dz = other.z - z;
    if (dx * dx + dz * dz > range * range) {
      continue;
    }
    const next = gapAt(body, x, z, yaw, other);
    if (next < minGapM && next < gapAt(body, body.x, body.z, body.yaw, other)) {
      return false;
    }
  }
  return true;
}

/** How far ahead (up to `lookM`) the body can go before it would run into a neighbour. */
function freeAhead(
  body: SteerBody,
  others: readonly SteerBody[],
  lookM: number,
  goal: SteerBody | null,
): number {
  const sx = Math.sin(body.yaw);
  const sz = Math.cos(body.yaw);
  const margin = lookM + REACH_MARGIN_M;
  if (
    clearToMove(
      body,
      body.x + sx * lookM,
      body.z + sz * lookM,
      body.yaw,
      others,
      margin,
      KEEP_CLEAR_M,
      goal,
    )
  ) {
    return lookM;
  }
  let near = 0;
  let far = lookM;
  for (let round = 0; round < BISECTION_STEPS; round += 1) {
    const middle = (near + far) / 2;
    if (
      clearToMove(
        body,
        body.x + sx * middle,
        body.z + sz * middle,
        body.yaw,
        others,
        margin,
        KEEP_CLEAR_M,
        goal,
      )
    ) {
      near = middle;
    } else {
      far = middle;
    }
  }
  return near;
}

/** How far ahead (up to `lookM`) the centre of the body stays inside the enclosure. */
function freeToFenceAhead(body: SteerBody, area: EnclosureArea, lookM: number): number {
  const sx = Math.sin(body.yaw);
  const sz = Math.cos(body.yaw);
  if (containsPoint(area, body.x + sx * lookM, body.z + sz * lookM)) {
    return lookM;
  }
  let near = 0;
  let far = lookM;
  for (let round = 0; round < BISECTION_STEPS; round += 1) {
    const middle = (near + far) / 2;
    if (containsPoint(area, body.x + sx * middle, body.z + sz * middle)) {
      near = middle;
    } else {
      far = middle;
    }
  }
  return near;
}

/** The speed from which the animal can stop `marginM` short of an obstacle `freeM` ahead. */
function brakingSpeed(freeM: number, marginM: number, maxAccel: number): number {
  return Math.sqrt(2 * maxAccel * Math.max(0, freeM - marginM));
}

/** Whether the body, moved by `fraction` of the step, is still inside and clear of neighbours. */
function admissible(
  body: SteerBody,
  world: SteerWorld,
  fraction: number,
  stepX: number,
  stepZ: number,
): boolean {
  const x = body.x + stepX * fraction;
  const z = body.z + stepZ * fraction;
  return (
    containsPoint(world.area, x, z) &&
    clearToMove(body, x, z, body.yaw, world.others, REACH_MARGIN_M, KEEP_CLEAR_M)
  );
}

/** The largest fraction of the step (0 to 1) that stays inside and clear of neighbours. */
function largestStep(body: SteerBody, world: SteerWorld, stepX: number, stepZ: number): number {
  if (admissible(body, world, 1, stepX, stepZ)) {
    return 1;
  }
  let near = 0;
  let far = 1;
  for (let round = 0; round < BISECTION_STEPS; round += 1) {
    const middle = (near + far) / 2;
    if (admissible(body, world, middle, stepX, stepZ)) {
      near = middle;
    } else {
      far = middle;
    }
  }
  return near;
}

/** Smooth push away from neighbours and from the fence; writes the sum into `out`. */
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
    // The free space is at least the distance between centres less the two reaches: skip far ones.
    if (distance > reach(body) + reach(other) + SEPARATION_RADIUS_M) {
      continue;
    }
    // From the free space between the two bodies, nose to tail, not between their centres.
    const gap = Math.max(0, capsuleGap(body, other));
    if (distance > 0 && gap < SEPARATION_RADIUS_M) {
      const weight = (1 - gap / SEPARATION_RADIUS_M) / distance;
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
  const pull = Math.hypot(out.x, out.z) * AVOID_GAIN;
  if (pull > MAX_AVOID_PULL) {
    out.x *= MAX_AVOID_PULL / pull;
    out.z *= MAX_AVOID_PULL / pull;
  }
}

const PUSH: Point2 = { x: 0, z: 0 };

/**
 * Turns a standing animal towards `headingRad`, no faster than `rateRadS`. With `others`, a
 * turn that would swing its body into a neighbour is not made.
 */
export function turnToward(
  body: SteerBody,
  rateRadS: number,
  headingRad: number,
  dtS: number,
  others: readonly SteerBody[],
): void {
  const error = wrapAngle(headingRad - body.yaw);
  const yaw = wrapAngle(body.yaw + clamp(error, rateRadS * dtS));
  if (clearToMove(body, body.x, body.z, yaw, others, REACH_MARGIN_M, KEEP_CLEAR_M)) {
    body.turnRate = wrapAngle(yaw - body.yaw) / dtS;
    body.yaw = yaw;
  } else {
    body.turnRate = 0;
  }
}

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
  const yaw = wrapAngle(yawBefore + clamp(error, limits.maxTurnRate * dtS));
  // Turning away from the fence must not swing the body into a neighbour either.
  body.yaw = yawBefore;
  body.turnRate = 0;
  if (clearToMove(body, body.x, body.z, yaw, world.others, REACH_MARGIN_M, KEEP_CLEAR_M)) {
    body.turnRate = wrapAngle(yaw - yawBefore) / dtS;
    body.yaw = yaw;
  }
}

/**
 * Advances `body` by `dtS` seconds. While `moving`, it turns towards the target and walks to it,
 * slowing down on arrival and swerving round neighbours and fences; otherwise it slows to a stop.
 * Acceleration and turn rate are capped, so no speed or heading ever jumps. A step that would
 * leave the enclosure brakes at the maximum rate and turns towards the inside; if even the
 * braked step would leave, only its part along the fence is kept, and the animal stays put when
 * that would leave too. It never ends up outside. A step or a turn that would drive its body into
 * a neighbour's is not made: the animal brakes instead.
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
  if (!moving) {
    body.turnRate = 0;
  }
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
      const pivot = body.speed < PIVOT_SPEED_MPS ? PIVOT_TURN_SHARE : 1;
      const rateLimit = limits.maxTurnRate * pivot;
      const wantedRate = clamp(error * TURN_GAIN_PER_S, rateLimit);
      const rateStep = limits.maxTurnRate * TURN_ACCEL_SHARE_PER_S * dtS;
      body.turnRate = clamp(body.turnRate + clamp(wantedRate - body.turnRate, rateStep), rateLimit);
      const turn = body.turnRate * dtS;
      const yaw = wrapAngle(body.yaw + turn);
      if (clearToMove(body, body.x, body.z, yaw, world.others, REACH_MARGIN_M, KEEP_CLEAR_M)) {
        body.yaw = yaw;
      } else {
        body.turnRate = 0;
      }
      // Slow down while still turning, so the animal never skids sideways.
      alignment = Math.max(0, Math.cos(error - turn));
      const arriveRatio = Math.min(1, distance / SLOW_RADIUS_M);
      wantedSpeed = limits.maxSpeed * Math.max(MIN_SPEED_RATIO, arriveRatio);
      // A neighbour or the fence in the way: brake in time to stop short of it, at the usual
      // rate. Only the way to the target counts: what lies beyond it does not matter.
      // Looked at from a distance that does not depend on the present speed, so that the speed
      // wanted is a smooth function of the free space and braking cannot switch on and off.
      const look = Math.min(
        distance,
        (limits.maxSpeed * limits.maxSpeed) / (2 * limits.maxAccel) + BRAKE_LOOKAHEAD_M,
      );
      const freeToAnimal = freeAhead(body, world.others, look, world.goal);
      if (freeToAnimal < look) {
        wantedSpeed = Math.min(
          wantedSpeed,
          brakingSpeed(freeToAnimal, STOP_MARGIN_M, limits.maxAccel),
        );
      }
      // Far from the fence (nearer to nothing than the way looked at): nothing to look for.
      const freeToFence =
        distanceToEdge(world.area, body.x, body.z, world.scratch) > look
          ? look
          : freeToFenceAhead(body, world.area, look);
      if (freeToFence < look) {
        wantedSpeed = Math.min(
          wantedSpeed,
          brakingSpeed(freeToFence, FENCE_STOP_MARGIN_M, limits.maxAccel),
        );
      }
    }
  }
  if (wantedSpeed < MIN_WALK_SPEED_MPS) {
    wantedSpeed = 0;
  }
  const change = clamp(wantedSpeed * alignment - body.speed, limits.maxAccel * dtS);
  body.speed = Math.max(0, body.speed + change);
  const stepX = Math.sin(body.yaw) * body.speed * dtS;
  const stepZ = Math.cos(body.yaw) * body.speed * dtS;
  if (containsPoint(world.area, body.x + stepX, body.z + stepZ)) {
    // Only a neighbour can be in the way: go as far as is free, and be as fast as that.
    const fraction = largestStep(body, world, stepX, stepZ);
    body.x += stepX * fraction;
    body.z += stepZ * fraction;
    body.speed *= fraction;
    return;
  }
  turnInwards(body, limits, world, yawBefore, dtS);
  body.speed = Math.max(0, speedBefore - limits.maxAccel * dtS);
  const brakedX = Math.sin(body.yaw) * body.speed * dtS;
  const brakedZ = Math.cos(body.yaw) * body.speed * dtS;
  const fraction = largestStep(body, world, brakedX, brakedZ);
  if (fraction > 0) {
    body.x += brakedX * fraction;
    body.z += brakedZ * fraction;
    // As fast as the step it really took.
    body.speed *= fraction;
    return;
  }
  slideAlongFence(body, world, brakedX, brakedZ);
}

/** Keeps only the part of the step that runs along the fence, so the animal glides, not stops. */
function slideAlongFence(body: SteerBody, world: SteerWorld, stepX: number, stepZ: number): void {
  const edge = world.scratch;
  const inwardX = body.x - edge.x;
  const inwardZ = body.z - edge.z;
  const length = Math.sqrt(inwardX * inwardX + inwardZ * inwardZ);
  if (length === 0) {
    return;
  }
  const into = (stepX * inwardX + stepZ * inwardZ) / length;
  const slideX = into < 0 ? stepX - (into * inwardX) / length : stepX;
  const slideZ = into < 0 ? stepZ - (into * inwardZ) / length : stepZ;
  const fraction = largestStep(body, world, slideX, slideZ);
  body.x += slideX * fraction;
  body.z += slideZ * fraction;
  body.speed *= fraction;
}
