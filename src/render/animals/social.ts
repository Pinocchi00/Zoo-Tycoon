import type { AnimalBehaviour, SocialView } from './behaviour';
import { canSalute } from './behaviour';
import type { Point2 } from './enclosure-area';
import type { SteerBody } from './steering';

/** A neighbour is worth following when it walks within this distance. */
export const FOLLOW_RANGE_M = 7;
/** A sleeper this near is somewhere to lie down next to. */
export const SLEEPER_RANGE_M = 14;
/** Beyond this distance from the others, an animal of a group of three or more is scattered. */
export const SCATTER_DISTANCE_M = 6.5;
const SCATTER_MIN_GROUP = 3;
/** Neighbours this close (plus half the length of the animal) greet each other. */
export const SALUTE_RANGE_M = 3;
/** The head may look at a neighbour this near. */
export const GAZE_RANGE_M = 9;
/** A walker slower than this does not count as walking. */
const WALKING_SPEED_MPS = 0.05;
/** Free space a follower leaves between itself and the walker it follows, beyond its length. */
const FOLLOW_SLACK_M = 0.6;
/** Free space between two sleepers in contact: they touch, nearly, but never overlap. */
const SLEEP_CONTACT_SLACK_M = 0.2;
/** A regrouping animal stops at least this far from the middle of the others. */
const REGROUP_RADIUS_MIN_M = 1.6;
/** ... and, for a long animal, this share of its length plus this much room. */
const REGROUP_LENGTH_SHARE = 1.2;
const REGROUP_SLACK_M = 0.5;

/** A follower this close to the place it wants (in metres) keeps its place behind the walker. */
const FOLLOW_HOLD_TOLERANCE_M = 0.5;

/** Whether a follower at `distanceM` from the walker holds the gap it is to keep. */
export function keepsGap(distanceM: number, lengthM: number): boolean {
  return Math.abs(distanceM - followGapM(lengthM)) <= FOLLOW_HOLD_TOLERANCE_M;
}

/** A follower stops behind the walker, centre to centre, at least as far as its own length. */
export function followGapM(lengthM: number): number {
  return lengthM + FOLLOW_SLACK_M;
}

/**
 * Lying down next to a sleeper: centre to centre, one length plus a little. Whichever way the two
 * face, their bodies then touch at most and never overlap.
 */
export function sleepContactM(lengthM: number): number {
  return lengthM + SLEEP_CONTACT_SLACK_M;
}

/** A regrouping animal stops this far from the middle of the others: more for a longer animal. */
export function regroupRadiusM(lengthM: number): number {
  return Math.max(REGROUP_RADIUS_MIN_M, lengthM * REGROUP_LENGTH_SHARE + REGROUP_SLACK_M);
}

/** Longer animals greet from a little further. */
export function saluteRangeM(lengthM: number): number {
  return SALUTE_RANGE_M + lengthM / 2;
}

/** What the social decisions need to know about a group member. */
export interface Member {
  readonly body: SteerBody;
  readonly behaviour: AnimalBehaviour;
}

/** What one animal sees of its group; plain numbers, reused from step to step. */
export interface SocialReport {
  readonly view: SocialView;
  /** Indices in the group, or -1. */
  walker: number;
  sleeper: number;
  nearest: number;
  /** Middle of the other members. */
  readonly centre: Point2;
}

export function createSocialReport(): SocialReport {
  return {
    view: {
      walkerNear: false,
      sleeperNear: false,
      scattered: false,
      neighbourClose: false,
      waterBusy: false,
    },
    walker: -1,
    sleeper: -1,
    nearest: -1,
    centre: { x: 0, z: 0 },
  };
}

/** Direction from (fromX, fromZ) to (toX, toZ), as a yaw: the animal faces (sin, cos). */
export function bearing(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

/**
 * Fills `report` with what `self` sees among `members` (which may include `self`).
 * `signatureAtWater`: the signature of the species is played at the water, so that a member
 * doing it is in the water.
 */
export function observeGroup(
  self: Member,
  members: readonly Member[],
  report: SocialReport,
  signatureAtWater = false,
): void {
  let walkerSquared = FOLLOW_RANGE_M * FOLLOW_RANGE_M;
  let sleeperSquared = SLEEPER_RANGE_M * SLEEPER_RANGE_M;
  let nearestSquared = GAZE_RANGE_M * GAZE_RANGE_M;
  report.walker = -1;
  report.sleeper = -1;
  report.nearest = -1;
  let waterBusy = false;
  let others = 0;
  let sumX = 0;
  let sumZ = 0;
  for (let index = 0; index < members.length; index += 1) {
    const other = members[index];
    if (other === undefined || other === self) {
      continue;
    }
    others += 1;
    sumX += other.body.x;
    sumZ += other.body.z;
    const dx = other.body.x - self.body.x;
    const dz = other.body.z - self.body.z;
    const squared = dx * dx + dz * dz;
    const activity = other.behaviour.activity;
    if (squared < nearestSquared) {
      nearestSquared = squared;
      report.nearest = index;
    }
    if (activity === 'walk' && other.body.speed > WALKING_SPEED_MPS && squared < walkerSquared) {
      walkerSquared = squared;
      report.walker = index;
    }
    if (activity === 'waterWalk' || (signatureAtWater && activity === 'signature')) {
      waterBusy = true;
    }
    if (activity === 'sleep' && squared < sleeperSquared) {
      sleeperSquared = squared;
      report.sleeper = index;
    }
  }
  report.centre.x = others > 0 ? sumX / others : self.body.x;
  report.centre.z = others > 0 ? sumZ / others : self.body.z;
  const toCentre = Math.hypot(report.centre.x - self.body.x, report.centre.z - self.body.z);
  const near = report.nearest >= 0 ? members[report.nearest] : undefined;
  const view = report.view;
  view.walkerNear = report.walker >= 0;
  view.sleeperNear = report.sleeper >= 0;
  view.scattered = others + 1 >= SCATTER_MIN_GROUP && toCentre > SCATTER_DISTANCE_M;
  const saluteRange = saluteRangeM(self.body.lengthM);
  view.waterBusy = waterBusy;
  view.neighbourClose =
    near !== undefined && nearestSquared <= saluteRange * saluteRange && canSalute(near.behaviour);
}

/** A point `gapM` behind a walker, on its path; written into `out`. */
export function pointBehind(walker: SteerBody, gapM: number, out: Point2): void {
  out.x = walker.x - Math.sin(walker.yaw) * gapM;
  out.z = walker.z - Math.cos(walker.yaw) * gapM;
}
