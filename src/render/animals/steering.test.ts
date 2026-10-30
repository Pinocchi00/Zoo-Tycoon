import { describe, expect, it } from 'vitest';
import { createGridSize } from '@/shared';
import type { GridPoint } from '@/sim';
import {
  APPROACH_RADIUS_M,
  approachPoint,
  clearanceFor,
  containsPoint,
  createEnclosureArea,
  type EnclosureArea,
} from './enclosure-area';
import {
  ARRIVE_RADIUS_M,
  SEPARATION_RADIUS_M,
  capsuleGap,
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

  it('brakes progressively before the fence', () => {
    const area = areaOf(ROOM);
    // The east fence is at x = 2. 1.1 m from it is room enough to stop from full speed.
    const body = createSteerBody(0.9, 0, Math.PI / 2);
    body.speed = LIMITS.maxSpeed;
    const world = worldOf(area, [body]);
    let previousRealised = LIMITS.maxSpeed;
    let slowed = false;
    for (let step = 0; step < 200; step += 1) {
      const x = body.x;
      const z = body.z;
      steerStep(body, LIMITS, world, true, 30, 0, STEP_S);
      expect(containsPoint(area, body.x, body.z)).toBe(true);
      // The speed it really gets, step by step: it only ever drops at the usual rate.
      const realised = Math.hypot(body.x - x, body.z - z) / STEP_S;
      expect(Math.abs(realised - previousRealised)).toBeLessThanOrEqual(
        LIMITS.maxAccel * STEP_S + EPSILON,
      );
      slowed = slowed || realised < LIMITS.maxSpeed;
      previousRealised = realised;
    }
    expect(slowed).toBe(true);
    // It stops short of the fence (0.1 m for the centre of its body), and stays there.
    expect(body.x).toBeLessThanOrEqual(2 - 0.1);
    expect(previousRealised).toBeLessThan(0.01);
  });

  it('glides along the fence when it is too late to stop, turning inwards and never jumping back up', () => {
    const area = areaOf(ROOM);
    // Against the west fence (x = -10), heading north-west at full speed: no room to stop.
    const start = (-3 * Math.PI) / 4;
    const inward = Math.PI / 2;
    const body = createSteerBody(-9.97, 0, start);
    body.speed = LIMITS.maxSpeed;
    const world = worldOf(area, [body]);
    const angleTo = (yaw: number, target: number): number => {
      const turn = Math.abs(yaw - target) % (2 * Math.PI);
      return Math.min(turn, 2 * Math.PI - turn);
    };
    let previousRealised = Number.POSITIVE_INFINITY;
    let previousYaw = start;
    let glided = false;
    for (let step = 0; step < 40; step += 1) {
      const x = body.x;
      const z = body.z;
      steerStep(body, LIMITS, world, true, -30, -30, STEP_S);
      expect(containsPoint(area, body.x, body.z)).toBe(true);
      const realised = Math.hypot(body.x - x, body.z - z) / STEP_S;
      // No sudden rise of the speed it really gets, as when a clipped step leaves the speed high.
      expect(realised - previousRealised).toBeLessThanOrEqual(LIMITS.maxAccel * STEP_S + EPSILON);
      // The speed it is credited with follows the step it really took.
      expect(body.speed).toBeLessThanOrEqual(LIMITS.maxSpeed);
      // The turn towards the inside never exceeds the turn rate.
      expect(angleTo(body.yaw, previousYaw)).toBeLessThanOrEqual(
        LIMITS.maxTurnRate * STEP_S + EPSILON,
      );
      glided = glided || body.z < z - 0.01;
      previousRealised = realised;
      previousYaw = body.yaw;
    }
    expect(glided).toBe(true);
    // The heading has come round towards the inside (the normal of the fence is +x).
    expect(angleTo(body.yaw, inward)).toBeLessThan(angleTo(start, inward));
  });

  it('brakes in time for a tapir-sized neighbour at the nearest place the herd picks', () => {
    const area = areaOf(ROOM);
    const neighbour = createSteerBody(-4, 0, Math.PI / 2, 2.03);
    const body = createSteerBody(-8, 2.5, 0, 2.03);
    const world = worldOf(area, [body, neighbour]);
    // Right at the clearance of a 2.03 m animal from the neighbour's centre.
    const target = { x: -4, z: clearanceFor(2.03) };
    let steps = 0;
    while (!body.arrived && steps < 1200) {
      steerStep(body, LIMITS, world, true, target.x, target.z, STEP_S);
      expect(capsuleGap(body, neighbour)).toBeGreaterThan(-0.02);
      steps += 1;
    }
    expect(body.arrived).toBe(true);
  });

  it('lets two animals sent to the same interest point both arrive, at places of their own', () => {
    const area = areaOf(ROOM);
    const spot = { x: -4, z: 0 };
    const first = createSteerBody(-8, -3, 0);
    const second = createSteerBody(-8, 3, 0);
    const targetA = { x: first.x, z: first.z };
    const targetB = { x: second.x, z: second.z };
    const crowd = [first, targetA, second, targetB];
    expect(approachPoint(area, spot, 0, APPROACH_RADIUS_M, first, crowd, targetA)).toBe(true);
    expect(approachPoint(area, spot, 2.4, APPROACH_RADIUS_M, second, crowd, targetB)).toBe(true);
    const world = worldOf(area, [first, second]);
    for (let step = 0; step < 1000 && !(first.arrived && second.arrived); step += 1) {
      steerStep(first, LIMITS, world, !first.arrived, targetA.x, targetA.z, STEP_S);
      steerStep(second, LIMITS, world, !second.arrived, targetB.x, targetB.z, STEP_S);
    }
    expect(first.arrived).toBe(true);
    expect(second.arrived).toBe(true);
    expect(Math.hypot(first.x - second.x, first.z - second.z)).toBeGreaterThan(0.7);
  });

  it('reaches a target right next to the fence instead of circling round it', () => {
    const area = areaOf(ROOM);
    // Resting places are kept 0.5 m from the fence: the animals must be able to get there.
    for (const target of [
      { x: -9.5, z: 0 },
      { x: 1.5, z: 4.5 },
      { x: -9.5, z: -4.5 },
    ]) {
      const body = createSteerBody(-4, 0, 0, 2.03);
      const world = worldOf(area, [body]);
      let steps = 0;
      while (!body.arrived && steps < 900) {
        steerStep(body, LIMITS, world, true, target.x, target.z, STEP_S);
        steps += 1;
      }
      expect(body.arrived, `target ${String(target.x)},${String(target.z)}`).toBe(true);
      expect(steps * STEP_S).toBeLessThan(40);
    }
  });

  it('reaches a target close to a neighbour at rest, without overlapping it', () => {
    const area = areaOf(ROOM);
    const neighbour = createSteerBody(-4, 0, Math.PI / 2, 1.18);
    const body = createSteerBody(-8, 2.5, 0, 1.18);
    const world = worldOf(area, [body, neighbour]);
    // The nearest place the herd picks (the clearance of a 1.18 m animal): still inside the range
    // where the neighbour pushes.
    const target = { x: -4, z: 1.5 };
    let steps = 0;
    while (!body.arrived && steps < 900) {
      steerStep(body, LIMITS, world, true, target.x, target.z, STEP_S);
      expect(capsuleGap(body, neighbour)).toBeGreaterThan(-0.02);
      steps += 1;
    }
    expect(body.arrived).toBe(true);
  });

  it('reaches a target the neighbour pushes on, whatever the push: the pull of the target stays', () => {
    const area = areaOf(ROOM);
    const neighbour = createSteerBody(-4, 0, 0);
    const body = createSteerBody(-8, 2.5, 0);
    const world = worldOf(area, [body, neighbour]);
    let steps = 0;
    while (!body.arrived && steps < 900) {
      steerStep(body, LIMITS, world, true, -4, 0.9, STEP_S);
      steps += 1;
    }
    expect(body.arrived).toBe(true);
  });

  /** Runs some steps and checks the speed the animal really gets, from how far it moves. */
  function checkRealisedSpeed(
    body: SteerBody,
    neighbour: SteerBody,
    world: SteerWorld,
    target: { x: number; z: number },
    steps: number,
  ): { slowest: number; closest: number } {
    const TOLERANCE = 1e-6;
    let previousSpeed = 0;
    let slowest = Number.POSITIVE_INFINITY;
    let closest = Number.POSITIVE_INFINITY;
    for (let step = 0; step < steps; step += 1) {
      const x = body.x;
      const z = body.z;
      steerStep(body, LIMITS, world, true, target.x, target.z, STEP_S);
      const realised = Math.hypot(body.x - x, body.z - z) / STEP_S;
      expect(realised).toBeLessThanOrEqual(LIMITS.maxSpeed + TOLERANCE);
      expect(Math.abs(realised - previousSpeed)).toBeLessThanOrEqual(
        LIMITS.maxAccel * STEP_S + TOLERANCE,
      );
      previousSpeed = realised;
      closest = Math.min(closest, capsuleGap(body, neighbour));
      slowest = Math.min(slowest, realised);
    }
    return { slowest, closest };
  }

  it('brakes in time for a neighbour straight ahead: no sudden stop, no contact', () => {
    const area = areaOf(ROOM);
    const neighbour = createSteerBody(-4, 0, 0, 2.03);
    const body = createSteerBody(-9, 0, Math.PI / 2, 2.03);
    const world = worldOf(area, [body, neighbour]);
    const { slowest, closest } = checkRealisedSpeed(body, neighbour, world, { x: 1, z: 0 }, 400);
    expect(closest).toBeGreaterThan(0);
    expect(slowest).toBeLessThan(0.01);
  });

  it('brakes in time for a neighbour straight ahead along the fence', () => {
    const area = areaOf(ROOM);
    // Along the west fence (x = -10), 0.4 m from it, towards a neighbour standing there.
    const neighbour = createSteerBody(-9.6, -2, 0, 2.03);
    const body = createSteerBody(-9.6, 4, Math.PI, 2.03);
    const world = worldOf(area, [body, neighbour]);
    const { closest } = checkRealisedSpeed(body, neighbour, world, { x: -9.6, z: -4.5 }, 400);
    expect(closest).toBeGreaterThan(0);
    expect(containsPoint(area, body.x, body.z)).toBe(true);
  });

  it('never drives a long body into a neighbour in its way: it brakes and waits', () => {
    const area = areaOf(ROOM);
    const neighbour = createSteerBody(-4, 0, 0, 2.03);
    const body = createSteerBody(-8.5, 0, Math.PI / 2, 2.03);
    const world = worldOf(area, [body, neighbour]);
    for (let step = 0; step < 600; step += 1) {
      steerStep(body, LIMITS, world, true, 0, 0, STEP_S);
      expect(capsuleGap(body, neighbour)).toBeGreaterThan(-0.02);
    }
    expect(containsPoint(area, body.x, body.z)).toBe(true);
  });

  it('pivots on the spot more gently than it turns while walking', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(CENTRE.x, CENTRE.z, 0, 2.03);
    const world = worldOf(area, [body]);
    let previousYaw = body.yaw;
    for (let step = 0; step < 10; step += 1) {
      steerStep(body, LIMITS, world, true, CENTRE.x, CENTRE.z - 4, STEP_S);
      const turned = Math.abs(body.yaw - previousYaw);
      expect(Math.min(turned, 2 * Math.PI - turned)).toBeLessThanOrEqual(
        LIMITS.maxTurnRate * 0.6 * STEP_S + EPSILON,
      );
      previousYaw = body.yaw;
    }
  });

  it('measures the free space between two capsules, nose to tail', () => {
    const first = createSteerBody(0, 0, 0, 2);
    const aside = createSteerBody(1, 0, 0, 2);
    const ahead = createSteerBody(0, 3, 0, 2);
    const same = createSteerBody(0, 0, 1, 2);
    // Side by side the width counts: 1 m between the axes, minus two radii.
    expect(capsuleGap(first, aside)).toBeCloseTo(1 - 2 * first.radius);
    // Head to tail the lengths count: 3 m between the centres, minus two half-lengths.
    expect(capsuleGap(first, ahead)).toBeCloseTo(3 - 2);
    expect(capsuleGap(first, same)).toBeLessThan(0);
    expect(capsuleGap(first, createSteerBody(0, 0, 0, 0))).toBeLessThan(0);
  });

  it('does nothing while idle and stopped', () => {
    const area = areaOf(ROOM);
    const body = createSteerBody(CENTRE.x, CENTRE.z, 1);
    steerStep(body, LIMITS, worldOf(area, [body]), false, 0, 0, STEP_S);
    expect(body).toEqual({
      x: CENTRE.x,
      z: CENTRE.z,
      yaw: 1,
      speed: 0,
      arrived: false,
      lengthM: 0,
      radius: 0,
      halfSpan: 0,
    });
  });
});
