import { Quaternion, Vector3, type Object3D } from 'three';
import { createRng, randomFloat, type RngState } from '@/sim';

/**
 * Small procedural gestures on the bones every model has (see tools/blender/animations.py): the
 * head looks about, the ears flick, the tail sways and now and then swats flies, and the tapir's
 * trunk searches. Bone axes at rest, in the models: for spine, head and trunk, local X is lateral
 * (a positive turn about it lifts the front) and local Z is up (a turn about it turns the bone
 * sideways); for the ears, local Z points forward; for the tail, local Z is up.
 * Every bone is optional: a model without it simply goes without that gesture, and clips that
 * Blender adds later keep working, since this layer only adds to what the mixer wrote.
 */

const AXIS_PITCH = new Vector3(1, 0, 0);
const AXIS_TURN = new Vector3(0, 0, 1);
const TWO_PI = Math.PI * 2;
const SEED_SALT = 0x9e37_79b9;

const HEAD_BONE = 'head';
const EAR_LEFT_BONE = 'ear_l';
const EAR_RIGHT_BONE = 'ear_r';
const TAIL_BONE = 'tail';
const TRUNK_BONE = 'trunk';

/** The head never turns further than this from straight ahead, nor lifts or lowers more. */
export const HEAD_MAX_YAW_RAD = 0.7;
export const HEAD_MAX_PITCH_RAD = 0.22;
/** Top turning speed of the head, and how quickly it eases towards its target. */
const HEAD_RATE_RAD_S = 0.9;
const HEAD_EASE_PER_S = 2.5;
/** Pause before the head picks another target, from calm to alert. */
const LOOK_PAUSE_CALM_S = { min: 2, max: 6 } as const;
const LOOK_PAUSE_ALERT_S = { min: 0.8, max: 2.4 } as const;
/** Odds that a new target is straight ahead, and that it is a neighbour (when one is near). */
const LOOK_AHEAD_CHANCE = 0.3;
const LOOK_NEIGHBOUR_CHANCE = 0.4;
/** Share of the full range the head uses when the animal is not paying attention. */
const LOOK_MIN_SHARE = 0.35;

export const EAR_FLICK_RAD = 0.4;
const EAR_GAP_S = { min: 2.5, max: 9 } as const;
const EAR_FLICK_S = 0.28;
/** Ears and tail barely move in sleep: this much of the gesture is left. */
const SLEEP_SHARE = 0.2;

export const TAIL_SWAY_RAD = 0.22;
const TAIL_PERIOD_S = { min: 3.5, max: 6.5 } as const;
export const TAIL_SWAT_RAD = 0.55;
const TAIL_SWAT_GAP_S = { min: 10, max: 28 } as const;
const TAIL_SWAT_S = 0.9;
const TAIL_SWAT_WAVES = 1;

export const TRUNK_YAW_RAD = 0.3;
export const TRUNK_PITCH_RAD = 0.18;
const TRUNK_YAW_HZ = 0.31;
const TRUNK_PITCH_HZ = 0.47;

/** Where the neighbours are, written by the herd; the head may look their way. */
export interface GazeInput {
  hasNeighbour: boolean;
  /** Direction of the nearest neighbour, relative to where the animal faces (radians). */
  yaw: number;
}

/** How the clips playing now change what the layer may do, from 0 to 1. */
export interface GestureDrive {
  /** 1: looking about. 0: head still. */
  attention: number;
  /** 1: awake. Near 0: asleep. */
  awake: number;
  /** Share of the head gestures allowed (zero asleep, less while eating). */
  lookScale: number;
  /** Share of the pose that comes from walking clips: the trunk searches less. */
  walking: number;
}

export interface Gestures {
  readonly gaze: GazeInput;
  readonly drive: GestureDrive;
  /** Takes back exactly what the last `apply` added; call before the mixer runs. */
  undo: () => void;
  apply: (elapsedS: number) => void;
}

interface Driven {
  readonly bone: Object3D;
  readonly added: Quaternion;
}

const UNDO = new Quaternion();
const TURN = new Quaternion();
const PITCH = new Quaternion();
const DELTA = new Quaternion();

function drive(root: Object3D, name: string): Driven | null {
  const bone = root.getObjectByName(name);
  return bone === undefined ? null : { bone, added: new Quaternion() };
}

function takeBack(driven: Driven | null): void {
  if (driven === null) {
    return;
  }
  UNDO.copy(driven.added).conjugate();
  driven.bone.quaternion.multiply(UNDO).normalize();
  driven.added.identity();
}

function add(driven: Driven | null, turnRad: number, pitchRad: number): void {
  if (driven === null) {
    return;
  }
  TURN.setFromAxisAngle(AXIS_TURN, turnRad);
  PITCH.setFromAxisAngle(AXIS_PITCH, pitchRad);
  DELTA.copy(TURN).multiply(PITCH);
  driven.bone.quaternion.multiply(DELTA);
  driven.added.copy(DELTA);
}

function between(rng: RngState, range: { readonly min: number; readonly max: number }): number {
  return range.min + randomFloat(rng) * (range.max - range.min);
}

function clamp(value: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, value));
}

/** Smooth one-sided bump from 0 to 1 and back to 0 as `age` goes from 0 to `duration`. */
function bump(age: number, duration: number): number {
  return Math.sin((Math.PI * age) / duration) ** 2;
}

interface Flicker {
  untilS: number;
  ageS: number;
}

/** Null when the model has none of the bones. */
export function createGestures(root: Object3D, seed: number): Gestures | null {
  const head = drive(root, HEAD_BONE);
  const earLeft = drive(root, EAR_LEFT_BONE);
  const earRight = drive(root, EAR_RIGHT_BONE);
  const tail = drive(root, TAIL_BONE);
  const trunk = drive(root, TRUNK_BONE);
  if (head === null && earLeft === null && earRight === null && tail === null && trunk === null) {
    return null;
  }
  const rng = createRng((seed ^ SEED_SALT) >>> 0);
  const gaze: GazeInput = { hasNeighbour: false, yaw: 0 };
  const state: GestureDrive = { attention: 0.5, awake: 1, lookScale: 1, walking: 0 };

  let yaw = 0;
  let pitch = 0;
  let targetYaw = 0;
  let targetPitch = 0;
  let untilRetargetS = between(rng, LOOK_PAUSE_CALM_S);
  // Each ear has its own clock, so the two never flick together.
  const left: Flicker = { untilS: between(rng, EAR_GAP_S), ageS: -1 };
  const right: Flicker = { untilS: between(rng, EAR_GAP_S), ageS: -1 };
  const swayPeriodS = between(rng, TAIL_PERIOD_S);
  let swayCycle = randomFloat(rng);
  let untilSwatS = between(rng, TAIL_SWAT_GAP_S);
  let swatAgeS = -1;
  let trunkClockS = randomFloat(rng) * TWO_PI;

  const retarget = (): void => {
    const range = HEAD_MAX_YAW_RAD * (LOOK_MIN_SHARE + (1 - LOOK_MIN_SHARE) * state.attention);
    if (gaze.hasNeighbour && randomFloat(rng) < LOOK_NEIGHBOUR_CHANCE) {
      targetYaw = clamp(gaze.yaw, HEAD_MAX_YAW_RAD);
      targetPitch = 0;
    } else if (randomFloat(rng) < LOOK_AHEAD_CHANCE) {
      targetYaw = 0;
      targetPitch = 0;
    } else {
      targetYaw = (randomFloat(rng) * 2 - 1) * range;
      targetPitch = (randomFloat(rng) * 2 - 1) * HEAD_MAX_PITCH_RAD;
    }
    const calm = between(rng, LOOK_PAUSE_CALM_S);
    const alert = between(rng, LOOK_PAUSE_ALERT_S);
    untilRetargetS = calm + (alert - calm) * state.attention;
  };

  const flick = (ear: Flicker, elapsedS: number): number => {
    if (ear.ageS >= 0) {
      ear.ageS += elapsedS;
      if (ear.ageS >= EAR_FLICK_S) {
        ear.ageS = -1;
        ear.untilS = between(rng, EAR_GAP_S);
      }
    } else {
      ear.untilS -= elapsedS;
      if (ear.untilS <= 0) {
        ear.ageS = 0;
      }
    }
    return ear.ageS >= 0 ? bump(ear.ageS, EAR_FLICK_S) : 0;
  };

  return {
    gaze,
    drive: state,
    undo: () => {
      takeBack(head);
      takeBack(earLeft);
      takeBack(earRight);
      takeBack(tail);
      takeBack(trunk);
    },
    apply: (elapsedS) => {
      const still = SLEEP_SHARE + (1 - SLEEP_SHARE) * state.awake;
      if (head !== null) {
        untilRetargetS -= elapsedS;
        if (untilRetargetS <= 0) {
          retarget();
        }
        const share = state.lookScale;
        const wantYaw = targetYaw * share;
        const wantPitch = targetPitch * share;
        const reach = HEAD_RATE_RAD_S * elapsedS;
        yaw += clamp((wantYaw - yaw) * HEAD_EASE_PER_S * elapsedS, reach);
        pitch += clamp((wantPitch - pitch) * HEAD_EASE_PER_S * elapsedS, reach);
        add(head, yaw, pitch);
      }
      // The ears turn about their forward axis, one way for each side.
      const leftFlick = flick(left, elapsedS);
      const rightFlick = flick(right, elapsedS);
      add(earLeft, EAR_FLICK_RAD * still * leftFlick, 0);
      add(earRight, -EAR_FLICK_RAD * still * rightFlick, 0);
      if (tail !== null) {
        swayCycle = (swayCycle + elapsedS / swayPeriodS) % 1;
        let swat = 0;
        if (swatAgeS >= 0) {
          swatAgeS += elapsedS;
          if (swatAgeS >= TAIL_SWAT_S) {
            swatAgeS = -1;
            untilSwatS = between(rng, TAIL_SWAT_GAP_S);
          } else {
            swat =
              TAIL_SWAT_RAD *
              bump(swatAgeS, TAIL_SWAT_S) *
              Math.sin((TWO_PI * TAIL_SWAT_WAVES * swatAgeS) / TAIL_SWAT_S);
          }
        } else {
          untilSwatS -= elapsedS;
          if (untilSwatS <= 0) {
            swatAgeS = 0;
          }
        }
        add(tail, (TAIL_SWAY_RAD * Math.sin(TWO_PI * swayCycle) + swat) * still, 0);
      }
      if (trunk !== null) {
        trunkClockS += elapsedS;
        const search = state.lookScale * (1 - state.walking);
        add(
          trunk,
          TRUNK_YAW_RAD * search * Math.sin(TWO_PI * TRUNK_YAW_HZ * trunkClockS),
          TRUNK_PITCH_RAD * search * Math.sin(TWO_PI * TRUNK_PITCH_HZ * trunkClockS + 1),
        );
      }
    },
  };
}
