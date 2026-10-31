import type { AnimalAnimation } from './animal-model';

/** An animal faster than this moves, one turning faster than this turns: its clip must be a walk. */
const MOVING_ON_SPEED_MPS = 0.04;
const TURNING_ON_RATE_RAD_S = 0.2;
/** ... and keeps moving, for this purpose, until it goes below these (so that it cannot flicker). */
const MOVING_OFF_SPEED_MPS = 0.02;
const TURNING_OFF_RATE_RAD_S = 0.1;
/** A walk clip goes on this long after the animal stopped, so that it does not flicker. */
export const WALK_HOLD_MS = 500;
/** An animal that stopped walking in vain waits this long before it shows its walk clip again. */
export const RESTART_COOLDOWN_MS = 1500;

/**
 * Whether an animal counts as moving for its clip: it needs a clear movement to start, and keeps
 * counting until it is nearly still, so that a speed that wavers round one threshold does not
 * make the clip flicker.
 */
export function nextMoving(wasMoving: boolean, speedMps: number, turnRateRadS: number): boolean {
  return wasMoving
    ? speedMps > MOVING_OFF_SPEED_MPS || turnRateRadS > TURNING_OFF_RATE_RAD_S
    : speedMps > MOVING_ON_SPEED_MPS || turnRateRadS > TURNING_ON_RATE_RAD_S;
}

/** What the choice of a clip keeps from one image to the next. */
export interface ClipState {
  /** The clip being shown. */
  shown: AnimalAnimation;
  /** How long it has been still (while showing the walk clip). */
  stillMs: number;
  /** Time before an animal that stopped walking in vain may show its walk clip again. */
  restMs: number;
  /** How long the clip shown has been shown. */
  clipAgeMs: number;
}

/** Time passes. */
export function tickClipClock(state: ClipState, elapsedMs: number): void {
  state.clipAgeMs += elapsedMs;
  state.restMs = Math.max(0, state.restMs - elapsedMs);
}

/** Shows `clip`; true when that is a change, which starts the clip's age again. */
export function showClip(state: ClipState, clip: AnimalAnimation): boolean {
  if (state.shown === clip) {
    return false;
  }
  state.shown = clip;
  state.clipAgeMs = 0;
  return true;
}

/**
 * An animal that means to move shows the clip of the movement first (the walk, or the swim), and
 * gets going as that clip takes over. Not while it waits after a walk in vain. True on a change.
 */
export function promoteToLegs(
  state: ClipState,
  intent: boolean,
  legsClip: AnimalAnimation,
): boolean {
  if (!intent || state.shown === legsClip || state.restMs > 0) {
    return false;
  }
  state.stillMs = 0;
  return showClip(state, legsClip);
}

export interface SettleInput {
  /** The animal moves or turns (see `nextMoving`). */
  readonly moving: boolean;
  /** The clip its activity asks for. */
  readonly behaviourClip: AnimalAnimation;
  /** It means to go somewhere (walking, or swimming round the water). */
  readonly intent: boolean;
  /** It is swimming: its signature clip is the clip of a movement. */
  readonly swimming: boolean;
  readonly elapsedMs: number;
}

/**
 * The clip an animal shows once it has moved. Whatever its activity, if it moves it walks (or
 * swims); once it stops the walk goes on a moment (so that a body that flickers between moving
 * and still does not make the clip flicker); and an animal that wants to go but stands still
 * puts down its walk and waits before it shows it again (see `RESTART_COOLDOWN_MS`).
 */
export function settleClip(state: ClipState, input: SettleInput): AnimalAnimation {
  const { behaviourClip } = input;
  if (input.moving) {
    state.stillMs = 0;
    const legs = behaviourClip === 'walk' || (behaviourClip === 'signature' && input.swimming);
    return legs ? behaviourClip : 'walk';
  }
  if (state.shown !== 'walk') {
    state.stillMs = 0;
    // The walk clip comes back by moving or by `promoteToLegs`, not by the wish alone.
    return behaviourClip === 'walk' ? state.shown : behaviourClip;
  }
  state.stillMs += input.elapsedMs;
  if (state.stillMs < WALK_HOLD_MS) {
    return 'walk';
  }
  if (input.intent) {
    state.restMs = RESTART_COOLDOWN_MS;
  }
  return behaviourClip === 'walk' ? 'idle' : behaviourClip;
}
