import type { AnimationClip, KeyframeTrack, Object3D } from 'three';
import { createRng, randomFloat, type RngState } from '@/sim';

/** Bones the models breathe and blink with (see tools/blender). */
const CHEST_BONE = 'chest';
const EYES_BONE = 'eyes';
const SCALE_TRACK_SUFFIX = '.scale';
const TWO_PI = Math.PI * 2;

const BREATH_AMPLITUDE = 0.025;
const BREATH_PERIOD_MIN_S = 3.4;
const BREATH_PERIOD_MAX_S = 4.4;
const BLINK_GAP_MIN_S = 2.5;
const BLINK_GAP_MAX_S = 6.5;
const BLINK_DURATION_S = 0.24;
/** Same depth as the blink baked in the idle clip. */
const BLINK_CLOSED_SCALE = 0.1;
/** An eyes track at or below this is a pair of closed eyes (sleep), not a pair to blink. */
const OPEN_EYES_SCALE = 0.5;
const SAME_VALUE_EPSILON = 1e-6;

/** What a clip leaves to the procedural layer. */
export interface ClipNeeds {
  /** The clip does not animate the chest: it needs a breath. */
  readonly breath: boolean;
  /** The clip leaves the eyes open and still: it needs blinking. */
  readonly blink: boolean;
}

function scaleTrack(clip: AnimationClip, bone: string): KeyframeTrack | undefined {
  return clip.tracks.find((track) => track.name === `${bone}${SCALE_TRACK_SUFFIX}`);
}

function isMoving(track: KeyframeTrack): boolean {
  const { values } = track;
  const stride = 3;
  for (let index = stride; index < values.length; index += 1) {
    if (Math.abs((values[index] ?? 0) - (values[index % stride] ?? 0)) > SAME_VALUE_EPSILON) {
      return true;
    }
  }
  return false;
}

/**
 * Looks at the tracks, not at clip names: `idle` and `sleep` breathe and `idle` blinks on their
 * own, while the other clips hold the chest and the open eyes still.
 */
export function clipNeeds(clip: AnimationClip): ClipNeeds {
  const chest = scaleTrack(clip, CHEST_BONE);
  const eyes = scaleTrack(clip, EYES_BONE);
  const eyesOpenAndStill =
    eyes === undefined || (!isMoving(eyes) && (eyes.values[1] ?? 1) > OPEN_EYES_SCALE);
  return { breath: chest === undefined || !isMoving(chest), blink: eyesOpenAndStill };
}

/**
 * Breathing and blinking for the clips that carry none, so that no animal is ever still.
 * The mixer only writes a bone when the value it computes changes, and never resets one that no
 * playing clip drives, so the layer cannot simply overwrite or accumulate. `undo` takes back
 * exactly what the last `apply` added, before the mixer runs; `apply` then adds, for each clip
 * that needs it, its share of the difference between the procedural pose and the rest pose, so a
 * fade between two clips never jumps and the bones never drift.
 */
export interface BodyLife {
  undo: () => void;
  /** `breathShare` and `blinkShare`: fraction (0 to 1) of the pose that comes from clips in need. */
  apply: (elapsedS: number, breathShare: number, blinkShare: number) => void;
}

export function createBodyLife(root: Object3D, seed: number): BodyLife | null {
  const chest = root.getObjectByName(CHEST_BONE);
  const eyes = root.getObjectByName(EYES_BONE);
  if (chest === undefined && eyes === undefined) {
    return null;
  }
  const rng: RngState = createRng(seed);
  const breathPeriodS =
    BREATH_PERIOD_MIN_S + randomFloat(rng) * (BREATH_PERIOD_MAX_S - BREATH_PERIOD_MIN_S);
  let breathCycle = randomFloat(rng);
  const nextGapS = (): number =>
    BLINK_GAP_MIN_S + randomFloat(rng) * (BLINK_GAP_MAX_S - BLINK_GAP_MIN_S);
  let untilBlinkS = nextGapS();
  let blinkAgeS = -1;
  let chestAdded = 0;
  let eyesAdded = 0;

  return {
    undo: () => {
      if (chest !== undefined) {
        chest.scale.x -= chestAdded;
        chest.scale.z -= chestAdded;
      }
      if (eyes !== undefined) {
        eyes.scale.y -= eyesAdded;
      }
      chestAdded = 0;
      eyesAdded = 0;
    },
    apply: (elapsedS, breathShare, blinkShare) => {
      breathCycle = (breathCycle + elapsedS / breathPeriodS) % 1;
      if (blinkAgeS >= 0) {
        blinkAgeS += elapsedS;
        if (blinkAgeS >= BLINK_DURATION_S) {
          blinkAgeS = -1;
          untilBlinkS = nextGapS();
        }
      } else {
        untilBlinkS -= elapsedS;
        if (untilBlinkS <= 0) {
          blinkAgeS = 0;
        }
      }
      if (chest !== undefined && breathShare > 0) {
        const breath = BREATH_AMPLITUDE * (0.5 - 0.5 * Math.cos(TWO_PI * breathCycle));
        chestAdded = breathShare * breath;
        chest.scale.x += chestAdded;
        chest.scale.z += chestAdded;
      }
      if (eyes !== undefined && blinkShare > 0 && blinkAgeS >= 0) {
        // Squared, so the lids start and end their move gently.
        const closing = Math.sin((Math.PI * blinkAgeS) / BLINK_DURATION_S) ** 2;
        eyesAdded = -blinkShare * (1 - BLINK_CLOSED_SCALE) * closing;
        eyes.scale.y += eyesAdded;
      }
    },
  };
}
