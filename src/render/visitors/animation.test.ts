import { expect, it } from 'vitest';
import {
  advanceAngularSpring,
  advanceWalkPhase,
  MAX_SMOOTH_YAW_RAD_PER_SECOND,
  MAX_YAW_RAD_PER_SECOND,
  MIN_WALK_STOP_MS,
  turnTowards,
  WALK_CYCLE_DISTANCE_M,
  YAW_SMOOTH_TIME_S,
  walkingClipForStationaryTime,
} from './animation';

const FLOAT_TOLERANCE = 1e-12;

it('keeps one-tick pauses walking and selects stop after the minimum dwell', () => {
  expect(walkingClipForStationaryTime(100)).toBe('walk');
  expect(walkingClipForStationaryTime(MIN_WALK_STOP_MS + 1)).toBe('stop');
});

it('turns from positive 170 degrees toward negative 170 along the short arc within the limit', () => {
  const start = (170 * Math.PI) / 180;
  const target = (-170 * Math.PI) / 180;
  const turned = turnTowards(start, target, 10);
  const signedTurn = Math.atan2(Math.sin(turned - start), Math.cos(turned - start));

  expect(signedTurn).toBeGreaterThan(0);
  expect(Math.abs(signedTurn)).toBeLessThanOrEqual(
    (MAX_YAW_RAD_PER_SECOND * 10) / 1000 + FLOAT_TOLERANCE,
  );
  expect(turnTowards(start, target, 100)).toBeCloseTo(start + (20 * Math.PI) / 180);
});

it('uses a continuous critically damped spring for a slow, bounded half-turn', () => {
  const spring = { yaw: 0, targetYaw: Math.PI, yawVelocity: 0 };
  let elapsedMs = 0;
  let previousVelocity = 0;
  while (elapsedMs < 5000) {
    const previousYaw = spring.yaw;
    advanceAngularSpring(spring, 1000 / 60);
    const frameVelocity = (spring.yaw - previousYaw) * 60;
    expect(Math.abs(frameVelocity)).toBeLessThanOrEqual(
      MAX_SMOOTH_YAW_RAD_PER_SECOND + FLOAT_TOLERANCE,
    );
    expect(Math.abs(spring.yawVelocity - previousVelocity)).toBeLessThan(1.5);
    previousVelocity = spring.yawVelocity;
    elapsedMs += 1000 / 60;
    if (spring.yaw === spring.targetYaw && spring.yawVelocity === 0) break;
  }

  expect(YAW_SMOOTH_TIME_S).toBe(0.4);
  expect(elapsedMs).toBeGreaterThanOrEqual(600);
  expect(spring.yaw).toBeCloseTo(Math.PI, 3);
  expect(spring.yawVelocity).toBe(0);
});

it('keeps the shortest angular path across the positive/negative pi boundary', () => {
  const start = (170 * Math.PI) / 180;
  const spring = { yaw: start, targetYaw: (-170 * Math.PI) / 180, yawVelocity: 0 };
  advanceAngularSpring(spring, 1000 / 60);

  const signedTurn = Math.atan2(Math.sin(spring.yaw - start), Math.cos(spring.yaw - start));
  expect(signedTurn).toBeGreaterThan(0);
  expect(signedTurn).toBeLessThan(0.1);
});

it.each([-1, 1])(
  'brakes smoothly before a close target with high incoming velocity (%s)',
  (sign) => {
    const spring = { yaw: 0, targetYaw: sign * 0.1, yawVelocity: sign * 2 };
    const initialVelocity = spring.yawVelocity;
    advanceAngularSpring(spring, 0.001);
    expect(Math.abs(spring.yawVelocity - initialVelocity)).toBeLessThan(0.0001);

    for (let frame = 0; frame < 120; frame += 1) {
      const previousVelocity = spring.yawVelocity;
      const previousYaw = spring.yaw;
      advanceAngularSpring(spring, 1000 / 60);
      expect(sign * spring.yaw).toBeGreaterThanOrEqual(sign * previousYaw - FLOAT_TOLERANCE);
      expect(sign * spring.yaw).toBeLessThanOrEqual(sign * spring.targetYaw + FLOAT_TOLERANCE);
      expect(Math.abs(spring.yawVelocity - previousVelocity)).toBeLessThan(0.6);
    }
    expect(spring.yaw).toBeCloseTo(spring.targetYaw, 4);
    expect(spring.yawVelocity).toBe(0);
  },
);

it.each([
  { targetYaw: Math.PI, yawVelocity: 0 },
  { targetYaw: Math.PI, yawVelocity: 2 },
  { targetYaw: 0.1, yawVelocity: 2 },
  { targetYaw: -0.1, yawVelocity: -2 },
])(
  'stays finite and bounded after a single two-second spring step ($targetYaw, $yawVelocity)',
  ({ targetYaw, yawVelocity }) => {
    const spring = { yaw: 0, targetYaw, yawVelocity };
    advanceAngularSpring(spring, 2000);
    expect(Number.isFinite(spring.yaw)).toBe(true);
    expect(Number.isFinite(spring.yawVelocity)).toBe(true);
    expect(Math.sign(targetYaw) * spring.yaw).toBeGreaterThan(0);
    expect(Math.abs(spring.yaw)).toBeLessThanOrEqual(Math.abs(targetYaw) + FLOAT_TOLERANCE);
    expect(Math.abs(spring.yawVelocity)).toBeLessThanOrEqual(MAX_SMOOTH_YAW_RAD_PER_SECOND);
  },
);

it.each([-1, 1])('completes a half-turn with nonzero initial momentum (%s)', (sign) => {
  const spring = { yaw: 0, targetYaw: sign * Math.PI, yawVelocity: sign * 2 };
  for (let frame = 0; frame < 300; frame += 1) {
    advanceAngularSpring(spring, 1000 / 60);
    expect(sign * spring.yaw).toBeGreaterThanOrEqual(-FLOAT_TOLERANCE);
    expect(sign * spring.yaw).toBeLessThanOrEqual(Math.PI + FLOAT_TOLERANCE);
    expect(Number.isFinite(spring.yawVelocity)).toBe(true);
  }
  expect(spring.yaw).toBeCloseTo(sign * Math.PI, 4);
  expect(spring.yawVelocity).toBe(0);
});

it('starts a new visitor at rest and accelerates gently toward its target', () => {
  const spring = { yaw: 0, targetYaw: 0, yawVelocity: 0 };
  advanceAngularSpring(spring, 1000 / 60);
  expect(spring.yaw).toBe(0);
  expect(spring.yawVelocity).toBe(0);
  spring.targetYaw = 1;
  advanceAngularSpring(spring, 1000 / 60);
  expect(spring.yawVelocity).toBeGreaterThan(0);
  expect(spring.yawVelocity).toBeLessThan(0.5);
  expect(spring.yaw).toBeGreaterThan(0);
  expect(spring.yaw).toBeLessThan(0.01);
});

it('preserves yaw, target and nonzero velocity when no time elapses', () => {
  const spring = { yaw: 0.5, targetYaw: -2, yawVelocity: 1.5 };
  const before = { ...spring };
  advanceAngularSpring(spring, 0);
  expect(spring).toEqual(before);
});

it('advances gait only with distance and proportionally to speed', () => {
  const phase = 0.1;
  expect(advanceWalkPhase(phase, 0)).toBe(phase);
  const slower = advanceWalkPhase(phase, 0.1) - phase;
  const faster = advanceWalkPhase(phase, 0.2) - phase;

  expect(slower).toBeCloseTo(0.1 / WALK_CYCLE_DISTANCE_M);
  expect(faster).toBeCloseTo(slower * 2);
});
