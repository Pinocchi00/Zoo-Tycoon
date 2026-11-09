import { expect, it } from 'vitest';
import {
  advanceWalkPhase,
  MAX_YAW_RAD_PER_SECOND,
  MIN_WALK_STOP_MS,
  turnTowards,
  WALK_CYCLE_DISTANCE_M,
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

it('advances gait only with distance and proportionally to speed', () => {
  const phase = 0.1;
  expect(advanceWalkPhase(phase, 0)).toBe(phase);
  const slower = advanceWalkPhase(phase, 0.1) - phase;
  const faster = advanceWalkPhase(phase, 0.2) - phase;

  expect(slower).toBeCloseTo(0.1 / WALK_CYCLE_DISTANCE_M);
  expect(faster).toBeCloseTo(slower * 2);
});
