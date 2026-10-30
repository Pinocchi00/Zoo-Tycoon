import { describe, expect, it } from 'vitest';
import { createRng } from '@/sim';
import { createBehaviour, type Activity, type AnimalBehaviour } from './behaviour';
import {
  FOLLOW_RANGE_M,
  SALUTE_RANGE_M,
  SCATTER_DISTANCE_M,
  SLEEPER_RANGE_M,
  bearing,
  createSocialReport,
  followGapM,
  regroupRadiusM,
  saluteRangeM,
  sleepContactM,
  observeGroup,
  pointBehind,
  type Member,
} from './social';
import { clearanceFor } from './enclosure-area';
import { capsuleGap, createSteerBody } from './steering';

function member(x: number, z: number, activity: Activity, speed = 0): Member {
  const behaviour: AnimalBehaviour = createBehaviour(createRng(1), false);
  behaviour.activity = activity;
  behaviour.stage = 'done';
  const body = createSteerBody(x, z, 0);
  body.speed = speed;
  return { body, behaviour };
}

describe('observeGroup', () => {
  it('sees nobody when alone', () => {
    const self = member(0, 0, 'rest');
    const report = createSocialReport();
    observeGroup(self, [self], report);
    expect(report.view).toEqual({
      walkerNear: false,
      sleeperNear: false,
      scattered: false,
      neighbourClose: false,
      waterBusy: false,
    });
    expect([report.walker, report.sleeper, report.nearest]).toEqual([-1, -1, -1]);
  });

  it('finds the nearest walker, sleeper and neighbour', () => {
    const self = member(0, 0, 'rest');
    const walkerFar = member(FOLLOW_RANGE_M - 1, 0, 'walk', 0.5);
    const walkerNear = member(3, 0, 'walk', 0.5);
    const idleWalker = member(1, 0, 'walk', 0);
    const sleeper = member(0, SLEEPER_RANGE_M - 1, 'sleep');
    const members = [self, walkerFar, walkerNear, idleWalker, sleeper];
    const report = createSocialReport();
    observeGroup(self, members, report);
    expect(report.walker).toBe(2);
    expect(report.sleeper).toBe(4);
    expect(report.nearest).toBe(3);
    expect(report.view.walkerNear).toBe(true);
    expect(report.view.sleeperNear).toBe(true);
  });

  it('ignores a walker or a sleeper that is too far', () => {
    const self = member(0, 0, 'rest');
    const members = [
      self,
      member(FOLLOW_RANGE_M + 1, 0, 'walk', 0.5),
      member(0, SLEEPER_RANGE_M + 1, 'sleep'),
    ];
    const report = createSocialReport();
    observeGroup(self, members, report);
    expect(report.view.walkerNear).toBe(false);
    expect(report.view.sleeperNear).toBe(false);
  });

  it('calls an animal far from the others scattered, but only in a group of three or more', () => {
    const near = [member(0, 0, 'rest'), member(1, 0, 'rest'), member(2, 0, 'rest')];
    const report = createSocialReport();
    const [first] = near;
    if (first === undefined) {
      throw new Error('expected a member');
    }
    observeGroup(first, near, report);
    expect(report.view.scattered).toBe(false);

    const far = member(SCATTER_DISTANCE_M + 5, 0, 'rest');
    const group = [member(0, 0, 'rest'), member(1, 1, 'rest'), far];
    observeGroup(far, group, report);
    expect(report.view.scattered).toBe(true);
    expect(report.centre.x).toBeCloseTo(0.5);

    const pair = [member(0, 0, 'rest'), member(SCATTER_DISTANCE_M + 5, 0, 'rest')];
    const [, second] = pair;
    if (second === undefined) {
      throw new Error('expected a member');
    }
    observeGroup(second, pair, report);
    expect(report.view.scattered).toBe(false);
  });

  it('offers a greeting only to a close neighbour who stands about', () => {
    const self = member(0, 0, 'rest');
    const report = createSocialReport();
    observeGroup(self, [self, member(SALUTE_RANGE_M - 0.5, 0, 'rest')], report);
    expect(report.view.neighbourClose).toBe(true);
    observeGroup(self, [self, member(SALUTE_RANGE_M + 0.5, 0, 'rest')], report);
    expect(report.view.neighbourClose).toBe(false);
    observeGroup(self, [self, member(1, 0, 'sleep')], report);
    expect(report.view.neighbourClose).toBe(false);
    observeGroup(self, [self, member(1, 0, 'walk', 0.5)], report);
    expect(report.view.neighbourClose).toBe(false);
  });
});

describe('distances follow the length of the animal', () => {
  const LENGTHS = [1.07, 1.18, 1.27, 1.64, 2.03];

  it('keeps a follower at least its length behind the walker, centre to centre', () => {
    for (const length of LENGTHS) {
      expect(followGapM(length)).toBeGreaterThanOrEqual(length);
      const walker = createSteerBody(3, -2, 0.7, length);
      const out = { x: 0, z: 0 };
      pointBehind(walker, followGapM(length), out);
      expect(Math.hypot(out.x - walker.x, out.z - walker.z)).toBeCloseTo(followGapM(length));
    }
  });

  it('lies down in contact: more than a length from the sleeper, so no overlap whichever way it faces', () => {
    for (const length of LENGTHS) {
      expect(sleepContactM(length)).toBeGreaterThan(length);
      expect(sleepContactM(length)).toBeLessThan(length + 0.3);
      const first = createSteerBody(0, 0, 0, length);
      for (let turn = 0; turn < 8; turn += 1) {
        const second = createSteerBody(sleepContactM(length), 0, (turn * Math.PI) / 4, length);
        expect(capsuleGap(first, second)).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('greets and regroups from further away when longer', () => {
    for (let index = 1; index < LENGTHS.length; index += 1) {
      const shorter = LENGTHS[index - 1] ?? 0;
      const longer = LENGTHS[index] ?? 0;
      expect(saluteRangeM(longer)).toBeGreaterThanOrEqual(saluteRangeM(shorter));
      expect(regroupRadiusM(longer)).toBeGreaterThanOrEqual(regroupRadiusM(shorter));
      expect(clearanceFor(longer)).toBeGreaterThan(longer);
    }
    expect(saluteRangeM(0)).toBe(SALUTE_RANGE_M);
  });

  it('sees the water as busy when a neighbour walks to it, or swims in it', () => {
    const self = member(0, 0, 'rest');
    const report = createSocialReport();
    observeGroup(self, [self, member(5, 0, 'waterWalk')], report);
    expect(report.view.waterBusy).toBe(true);
    observeGroup(self, [self, member(5, 0, 'signature')], report);
    expect(report.view.waterBusy).toBe(false);
    observeGroup(self, [self, member(5, 0, 'signature')], report, true);
    expect(report.view.waterBusy).toBe(true);
    observeGroup(self, [self, member(5, 0, 'walk', 0.4)], report, true);
    expect(report.view.waterBusy).toBe(false);
  });
});

describe('directions', () => {
  it('works out the yaw towards a point: the animal faces (sin, cos)', () => {
    expect(bearing(0, 0, 0, 5)).toBeCloseTo(0);
    expect(bearing(0, 0, 5, 0)).toBeCloseTo(Math.PI / 2);
    expect(bearing(1, 1, 0, 0)).toBeCloseTo((-3 * Math.PI) / 4);
  });

  it('finds the point behind a walker, on its path', () => {
    const walker = createSteerBody(2, 3, Math.PI / 2);
    const out = { x: 0, z: 0 };
    pointBehind(walker, 1.5, out);
    expect(out.x).toBeCloseTo(0.5);
    expect(out.z).toBeCloseTo(3);
  });
});
