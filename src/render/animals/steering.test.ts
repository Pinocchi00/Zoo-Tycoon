import { describe, expect, it } from 'vitest';
import { createGridSize } from '@/shared';
import type { GridPoint } from '@/sim';
import {
  approachPoint,
  containsPoint,
  createEnclosureArea,
  type EnclosureArea,
} from './enclosure-area';
import {
  ARRIVE_RADIUS_M,
  SEPARATION_RADIUS_M,
  createSteerBody,
  steerStep,
  type SteerBody,
  type SteerLimits,
  type SteerWorld,
} from './steering';

const GRID = createGridSize(40, 30);
const STEP_S = 0.1;
const LIMITS: SteerLimits = { maxSpeed: 0.7, maxAccel: 0.5, maxTurnRate: 1.5 };
const EPSILON = 1e-9;

const ROOM: readonly GridPoint[] = [
  { x: 10, y: 10 },
  { x: 22, y: 10 },
  { x: 22, y: 20 },
  { x: 10, y: 20 },
];

function areaOf(outline: readonly GridPoint[]): EnclosureArea {
  const area = createEnclosureArea(outline, GRID);
  if (area === null) {
    throw new Error('expected an area');
  }
  return area;
}

function worldOf(area: EnclosureArea, bodies: readonly SteerBody[]): SteerWorld {
  return { area, others: bodies, scratch: { x: 0, z: 0 } };
}

/** Reads the flag through a call, so that the compiler does not assume it never changes. */
function hasArrived(body: SteerBody): boolean {
  return body.arrived;
}

/** The room spans x in [-10, 2] and z in [-5, 5]; its centre is (-4, 0). */
const CENTRE = { x: -4, z: 0 };

describe('steerStep', () => {
  it('walks to the target, slows down and arrives', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(CENTRE.x, CENTRE.z, 0);
    const world = worldOf(area, [body]);
    const target = { x: CENTRE.x + 3, z: CENTRE.z + 2 };
    let steps = 0;
    while (!body.arrived && steps < 600) {
      steerStep(body, LIMITS, world, true, target.x, target.z, STEP_S);
      steps += 1;
    }
    expect(body.arrived).toBe(true);
    expect(Math.hypot(body.x - target.x, body.z - target.z)).toBeLessThanOrEqual(ARRIVE_RADIUS_M);

    for (let index = 0; index < 100; index += 1) {
      steerStep(body, LIMITS, world, false, target.x, target.z, STEP_S);
    }
    expect(body.speed).toBe(0);
  });

  it('never exceeds its limits: speed, acceleration and turn rate', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(CENTRE.x, CENTRE.z, 0);
    const world = worldOf(area, [body]);
    const targets = [
      { x: -8, z: -3 },
      { x: 0, z: 3 },
      { x: -8, z: 3 },
    ];
    let previousSpeed = 0;
    let previousYaw = body.yaw;
    for (const target of targets) {
      body.arrived = false;
      let steps = 0;
      do {
        steerStep(body, LIMITS, world, true, target.x, target.z, STEP_S);
        expect(body.speed).toBeLessThanOrEqual(LIMITS.maxSpeed + EPSILON);
        expect(Math.abs(body.speed - previousSpeed)).toBeLessThanOrEqual(
          LIMITS.maxAccel * STEP_S + EPSILON,
        );
        let turned = Math.abs(body.yaw - previousYaw);
        turned = Math.min(turned, 2 * Math.PI - turned);
        expect(turned).toBeLessThanOrEqual(LIMITS.maxTurnRate * STEP_S + EPSILON);
        previousSpeed = body.speed;
        previousYaw = body.yaw;
        steps += 1;
      } while (!hasArrived(body) && steps < 400);
      expect(body.arrived).toBe(true);
    }
  });

  it('turns to face the target before it gathers speed', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(CENTRE.x, CENTRE.z, 0);
    const world = worldOf(area, [body]);
    // The target lies behind the animal (it faces +z, the target is at -z).
    steerStep(body, LIMITS, world, true, CENTRE.x, CENTRE.z - 4, STEP_S);
    expect(body.speed).toBe(0);
    expect(Math.abs(body.yaw)).toBeGreaterThan(0);
  });

  it('keeps animals of a group apart', () => {
    const area = areaOf(ROOM);
    const walker = createSteerBody(CENTRE.x - 3, CENTRE.z, Math.PI / 2);
    const sleeper = createSteerBody(CENTRE.x, CENTRE.z + 0.1, 0);
    const world = worldOf(area, [walker, sleeper]);
    let closest = Number.POSITIVE_INFINITY;
    for (let step = 0; step < 500 && !walker.arrived; step += 1) {
      steerStep(walker, LIMITS, world, true, CENTRE.x + 3, CENTRE.z, STEP_S);
      closest = Math.min(closest, Math.hypot(walker.x - sleeper.x, walker.z - sleeper.z));
    }
    expect(walker.arrived).toBe(true);
    // A straight line would pass through the sleeper: the walker swerves round it.
    expect(closest).toBeGreaterThan(0.25);
    expect(closest).toBeLessThan(SEPARATION_RADIUS_M);
  });

  it('is pushed away from the fence it runs along', () => {
    const area = areaOf(ROOM);
    // Starts 0.3 m from the west fence (x = -10), walks north along it.
    const body = createSteerBody(-9.7, 3, Math.PI);
    const world = worldOf(area, [body]);
    for (let step = 0; step < 60; step += 1) {
      steerStep(body, LIMITS, world, true, -9.7, -4, STEP_S);
    }
    expect(body.x).toBeGreaterThan(-9.7);
  });

  it('can never end up outside, even when sent through a wall', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(1.5, 0, Math.PI / 2);
    const world = worldOf(area, [body]);
    for (let step = 0; step < 400; step += 1) {
      steerStep(body, LIMITS, world, true, 30, 0, STEP_S);
      expect(containsPoint(area, body.x, body.z)).toBe(true);
    }
  });

  it('brakes progressively and turns inwards when sent through a wall', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(1.7, 0, Math.PI / 2);
    body.speed = LIMITS.maxSpeed;
    const world = worldOf(area, [body]);
    let previousSpeed = body.speed;
    let previousYaw = body.yaw;
    let slowed = false;
    for (let step = 0; step < 200; step += 1) {
      steerStep(body, LIMITS, world, true, 30, 0, STEP_S);
      expect(containsPoint(area, body.x, body.z)).toBe(true);
      expect(Math.abs(body.speed - previousSpeed)).toBeLessThanOrEqual(
        LIMITS.maxAccel * STEP_S + EPSILON,
      );
      const turned = Math.abs(body.yaw - previousYaw);
      expect(Math.min(turned, 2 * Math.PI - turned)).toBeLessThanOrEqual(
        LIMITS.maxTurnRate * STEP_S + EPSILON,
      );
      slowed = slowed || body.speed < LIMITS.maxSpeed;
      previousSpeed = body.speed;
      previousYaw = body.yaw;
    }
    expect(slowed).toBe(true);
  });

  it('glides along the fence instead of stopping when its step would leave', () => {
    const area = areaOf(ROOM);
    // Against the west fence (x = -10), heading north-west at full speed.
    const body = createSteerBody(-9.97, 0, (-3 * Math.PI) / 4);
    body.speed = LIMITS.maxSpeed;
    steerStep(body, LIMITS, worldOf(area, [body]), true, -30, -30, STEP_S);
    expect(containsPoint(area, body.x, body.z)).toBe(true);
    expect(body.z).toBeLessThan(-0.02);
    expect(body.speed).toBeCloseTo(LIMITS.maxSpeed - LIMITS.maxAccel * STEP_S);
  });

  it('lets two animals sent to the same interest point both arrive, at places of their own', () => {
    const area = areaOf(ROOM);
    const spot = { x: -4, z: 0 };
    const first = createSteerBody(-8, -3, 0);
    const second = createSteerBody(-8, 3, 0);
    const targetA = { x: first.x, z: first.z };
    const targetB = { x: second.x, z: second.z };
    const crowd = [first, targetA, second, targetB];
    expect(approachPoint(area, spot, 0, first, crowd, targetA)).toBe(true);
    expect(approachPoint(area, spot, 2.4, second, crowd, targetB)).toBe(true);
    const world = worldOf(area, [first, second]);
    for (let step = 0; step < 1000 && !(first.arrived && second.arrived); step += 1) {
      steerStep(first, LIMITS, world, !first.arrived, targetA.x, targetA.z, STEP_S);
      steerStep(second, LIMITS, world, !second.arrived, targetB.x, targetB.z, STEP_S);
    }
    expect(first.arrived).toBe(true);
    expect(second.arrived).toBe(true);
    expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThan(0.7);
  });

  it('does nothing while idle and stopped', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(CENTRE.x, CENTRE.z, 1);
    steerStep(body, LIMITS, worldOf(area, [body]), false, 0, 0, STEP_S);
    expect(body).toEqual({ x: CENTRE.x, z: CENTRE.z, yaw: 1, speed: 0, arrived: false });
  });
});
