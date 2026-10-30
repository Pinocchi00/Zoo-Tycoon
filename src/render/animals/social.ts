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
/** Neighbours this close greet each other. */
export const SALUTE_RANGE_M = 3;
/** The head may look at a neighbour this near. */
export const GAZE_RANGE_M = 9;
/** A walker slower than this does not count as walking. */
const WALKING_SPEED_MPS = 0.05;
/** A follower stops this far behind the walker it follows. */
export const FOLLOW_GAP_M = 1.4;
/** Lying next to a sleeper: close enough to touch, too far to overlap (more than the clearance). */
export const SLEEP_CONTACT_M = 1.1;
/** A regrouping animal stops this far from the middle of the others. */
export const REGROUP_RADIUS_M = 1.6;

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
    view: { walkerNear: false, sleeperNear: false, scattered: false, neighbourClose: false },
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

/** Fills `report` with what `self` sees among `members` (which may include `self`). */
export function observeGroup(self: Member, members: readonly Member[], report: SocialReport): void {
  let walkerSquared = FOLLOW_RANGE_M * FOLLOW_RANGE_M;
  let sleeperSquared = SLEEPER_RANGE_M * SLEEPER_RANGE_M;
  let nearestSquared = GAZE_RANGE_M * GAZE_RANGE_M;
  report.walker = -1;
  report.sleeper = -1;
  report.nearest = -1;
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
  view.neighbourClose =
    near !== undefined &&
    nearestSquared <= SALUTE_RANGE_M * SALUTE_RANGE_M &&
    canSalute(near.behaviour);
}

/** A point `gapM` behind a walker, on its path; written into `out`. */
export function pointBehind(walker: SteerBody, gapM: number, out: Point2): void {
  out.x = walker.x - Math.sin(walker.yaw) * gapM;
  out.z = walker.z - Math.cos(walker.yaw) * gapM;
}
