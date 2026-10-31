import {
  AnimationClip,
  Bone,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  Quaternion,
  QuaternionKeyframeTrack,
  Vector3,
  VectorKeyframeTrack,
  type Object3D,
} from 'three';
import { describe, expect, it } from 'vitest';
import { loadGameContent, type GameData } from '@/data';
import { createEventQueue, type FocusArea } from '@/sim';
import {
  CROSS_FADE_S,
  SWIM_REFERENCE_SPEED_MPS,
  createAnimalHerd,
  swimClipScale,
  walkClipScale,
  walkPace,
  type AnimalSource,
} from '@/render';
import { buildAnimalDemo } from './dev-demo';
import { terrainGrid } from './entrance-focus';

/** Real lengths and signature clips of the five models (read in assets/models). */
interface ModelFacts {
  readonly lengthM: number;
  readonly signature: string;
  readonly trunk: boolean;
  /** Height of the hip, swing of the legs (degrees) and length of the cycle (s): the walk clip. */
  readonly hipM: number;
  readonly swingDeg: number;
  readonly cycleS: number;
}

const MODELS: Readonly<Record<string, ModelFacts>> = {
  capybara: { lengthM: 1.18, signature: 'swim', trunk: false, hipM: 0.36, swingDeg: 24, cycleS: 1 },
  collared_peccary: {
    lengthM: 1.07,
    signature: 'root',
    trunk: false,
    hipM: 0.36,
    swingDeg: 28,
    cycleS: 0.8,
  },
  lowland_tapir: {
    lengthM: 2.03,
    signature: 'trunk',
    trunk: true,
    hipM: 0.66,
    swingDeg: 20,
    cycleS: 1.4,
  },
  giant_otter: {
    lengthM: 1.27,
    signature: 'swim',
    trunk: false,
    hipM: 0.2,
    swingDeg: 32,
    cycleS: 0.7,
  },
  jaguar: {
    lengthM: 1.64,
    signature: 'stretch',
    trunk: false,
    hipM: 0.57,
    swingDeg: 26,
    cycleS: 1,
  },
};

/** The speed over the ground at which the walk clip of a model plays at its natural rate. */
function naturalSpeedOf(model: ModelFacts | undefined): number {
  return model === undefined
    ? 0.6
    : (4 * model.hipM * Math.sin((model.swingDeg * Math.PI) / 180)) / model.cycleS;
}

const REST = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), 0.3);
const LOOP_S = 4;

function track(name: string, from: number[], to: number[]): VectorKeyframeTrack {
  return new VectorKeyframeTrack(name, [0, LOOP_S / 2, LOOP_S], [...from, ...to, ...from]);
}

function clip(name: string, ...tracks: VectorKeyframeTrack[]): AnimationClip {
  return new AnimationClip(name, LOOP_S, tracks);
}

/** A model with the real bones and the breathing and blinking tracks of the real clips. */
function fakeSource(modelId: string): AnimalSource {
  const model = MODELS[modelId];
  if (model === undefined) {
    throw new Error(`unknown model ${modelId}`);
  }
  const scene = new Group();
  const breathing = track('chest.scale', [1, 1, 1], [1.03, 1, 1.03]);
  const held = track('chest.scale', [1, 1, 1], [1, 1, 1]);
  const blinking = track('eyes.scale', [1, 1, 1], [1, 0.1, 1]);
  const open = track('eyes.scale', [1, 1, 1], [1, 1, 1]);
  const closed = track('eyes.scale', [1, 0.1, 1], [1, 0.1, 1]);
  scene.add(new Mesh(new BoxGeometry(0.5, 0.7, model.lengthM), new MeshStandardMaterial()));
  const names = [
    'head',
    'ear_l',
    'ear_r',
    'tail',
    'chest',
    'eyes',
    ...(model.trunk ? ['trunk'] : []),
  ];
  for (const name of names) {
    const bone = new Bone();
    bone.name = name;
    bone.quaternion.copy(REST);
    scene.add(bone);
  }
  const leg = new Bone();
  leg.name = 'leg_fl';
  leg.position.set(0, model.hipM, 0);
  scene.add(leg);
  const swing = (model.swingDeg * Math.PI) / 180;
  const legKeys = [swing, 0, -swing, 0, swing].flatMap((turn) =>
    new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), turn).toArray(),
  );
  const stride = new AnimationClip('walk', model.cycleS, [
    new QuaternionKeyframeTrack(
      'leg_fl.quaternion',
      [0, 0.25, 0.5, 0.75, 1].map((fraction) => fraction * model.cycleS),
      legKeys,
    ),
    held,
    open,
  ]);
  return {
    scene,
    animations: [
      clip('idle', breathing, blinking),
      stride,
      clip('sleep', breathing, closed),
      clip('eat', held, open),
      clip(model.signature, held, open),
    ],
  };
}

function gameData(): GameData {
  const loaded = loadGameContent();
  if (!loaded.ok) {
    throw new Error('the game data must load');
  }
  return loaded.value;
}

const ALL_VISIBLE: FocusArea = { minColumn: 0, minRow: 0, maxColumn: 255, maxRow: 255 };
const CLOSE_SCALE = 100;
const WINDOW_S = 1;
/** Minutes of the demo park lived per image rate: enough for hundreds of walks and pauses. */
const SIMULATED_MINUTES = 3;
/** A few seconds of simulated life, several times more under coverage. */
const LONG_RUN_TIMEOUT_MS = 30_000;

/** Events within the last second: a rolling count with no allocation worth worrying about. */
class Rate {
  private readonly times: number[] = [];
  worst = 0;
  worstAt = 0;
  worstLabel = '';
  count(time: number, label = ''): void {
    this.times.push(time);
    while (this.times.length > 0 && (this.times[0] ?? 0) < time - WINDOW_S) {
      this.times.shift();
    }
    if (this.times.length > this.worst) {
      this.worst = this.times.length;
      this.worstAt = time;
      this.worstLabel = label;
    }
  }
}

interface Trace {
  readonly turnReversals: Rate;
  readonly moveReversals: Rate;
  readonly clipSwitches: Rate;
  readonly speedCrossings: Rate;
  readonly accelFlips: Rate;
  readonly boneFlips: Map<string, Rate>;
  readonly worstBoneStep: Map<string, number>;
  readonly activityAtWorst: Map<string, string>;
}

export interface MotionReport {
  readonly animals: readonly {
    readonly index: number;
    readonly model: string;
    readonly turnReversals: number;
    readonly moveReversals: number;
    readonly clipSwitches: number;
    readonly speedCrossings: number;
    readonly accelFlips: number;
    readonly turnLabel: string;
    readonly accelLabel: string;
    readonly crossLabel: string;
    readonly boneFlips: Readonly<Record<string, number>>;
    readonly worstBoneStep: Readonly<Record<string, number>>;
    readonly activityAtWorst: Readonly<Record<string, string>>;
    /** Worst distance covered, and top speed, in one stretch of a clip that is not a walk or a swim. */
    readonly seatedMoveM: number;
    readonly seatedSpeedMps: number;
    readonly seatedActivity: string;
    /** Most the animal moved while its walk clip had not yet taken over, in one start. */
    readonly onsetMoveM: number;
    /** Longest stretch with the body going faster or slower than its feet by too much. */
    readonly slipRunS: number;
    readonly slipLabel: string;
  }[];
}

/** While the walk clip has less than this age (s), its weight in the fade is under 70 %. */
const ONSET_S = 0.28;
const SLIP_MPS = 0.1;
const OMEGA_NOISE_RAD_S = 0.1;
const MOVE_NOISE_M = 1e-3;
const SPEED_THRESHOLD_MPS = 0.03;
const ACCEL_NOISE_MPS = 0.01;
const BONE_NOISE_RAD = 5e-4;
const BONES = ['head', 'ear_l', 'ear_r', 'tail', 'trunk'] as const;

function angleOf(root: Object3D, name: string): number | null {
  const bone = root.getObjectByName(name);
  return bone === undefined ? null : bone.quaternion.angleTo(REST);
}

/** Runs the demo park for `minutes` at `fps` and measures how much each animal shakes. */
async function measureDemoPark(minutes: number, fps: number): Promise<MotionReport> {
  const data = gameData();
  const state = buildAnimalDemo(data, createEventQueue());
  const parent = new Group();
  const modelIds = new Map<string, string>();
  const modelOf: string[] = [];
  for (const enclosure of state.enclosures) {
    const species =
      enclosure.speciesId === null ? undefined : data.species.get(enclosure.speciesId);
    const size =
      state.gacha.collection.find((one) => one.speciesId === enclosure.speciesId)?.groupSize ?? 0;
    for (let at = 0; at < size; at += 1) {
      modelOf.push(species?.modelId ?? '?');
    }
  }
  const herd = createAnimalHerd({
    parent,
    grid: terrainGrid(data.terrain),
    lookupSpecies: (id) => {
      const species = data.species.get(id);
      return species === undefined || species.modelId === null
        ? undefined
        : { modelId: species.modelId, hasWater: species.habitatKit.water !== null };
    },
    loadSource: (modelId) => {
      modelIds.set(modelId, modelId);
      return Promise.resolve(fakeSource(modelId));
    },
  });
  herd.syncAll(state);
  await herd.whenLoaded();
  const dtMs = 1000 / fps;
  const dtS = dtMs / 1000;
  const frames = Math.round(minutes * 60 * fps);
  const children = parent.children;
  const traces: Trace[] = children.map(() => ({
    turnReversals: new Rate(),
    moveReversals: new Rate(),
    clipSwitches: new Rate(),
    speedCrossings: new Rate(),
    accelFlips: new Rate(),
    boneFlips: new Map(BONES.map((name) => [name, new Rate()])),
    worstBoneStep: new Map(),
    activityAtWorst: new Map(),
  }));
  let previous = children.map((child) => ({
    x: child.position.x,
    z: child.position.z,
    yaw: child.rotation.y,
  }));
  const lastOmega = children.map(() => 0);
  const lastMove = children.map(() => ({ x: 0, z: 0 }));
  const lastSpeed = children.map(() => 0);
  const lastDv = children.map(() => 0);
  const history = children.map((): string[] => []);
  const lastClip = herd.animations();
  const lastBone = children.map(() => new Map<string, number>());
  const lastBoneStep = children.map(() => new Map<string, number>());
  const walkAge = children.map(() => Number.POSITIVE_INFINITY);
  const onset = children.map(() => ({ sum: 0, worst: 0 }));
  const slip = children.map(() => ({ run: 0, worst: 0, label: '' }));
  const seated = children.map(() => ({
    cumulative: 0,
    topSpeed: 0,
    worstCumulative: 0,
    worstSpeed: 0,
    worstActivity: '',
  }));
  for (let frame = 1; frame <= frames; frame += 1) {
    const time = frame * dtS;
    herd.update(dtMs, CLOSE_SCALE, ALL_VISIBLE);
    const clips = herd.animations();
    const activities = herd.activities();
    children.forEach((child, index) => {
      const trace = traces[index];
      const before = previous[index];
      if (trace === undefined || before === undefined) {
        return;
      }
      const dx = child.position.x - before.x;
      const dz = child.position.z - before.z;
      const turn = Math.atan2(
        Math.sin(child.rotation.y - before.yaw),
        Math.cos(child.rotation.y - before.yaw),
      );
      const omega = turn / dtS;
      if (
        Math.abs(omega) > OMEGA_NOISE_RAD_S &&
        Math.abs(lastOmega[index] ?? 0) > OMEGA_NOISE_RAD_S &&
        Math.sign(omega) !== Math.sign(lastOmega[index] ?? 0)
      ) {
        trace.turnReversals.count(
          time,
          (activities[index] ?? '?') + '/' + (clips[index] ?? '?') + '@' + time.toFixed(1),
        );
      }
      lastOmega[index] = omega;
      const last = lastMove[index] ?? { x: 0, z: 0 };
      if (
        Math.hypot(dx, dz) > MOVE_NOISE_M &&
        Math.hypot(last.x, last.z) > MOVE_NOISE_M &&
        dx * last.x + dz * last.z < 0
      ) {
        trace.moveReversals.count(time);
      }
      lastMove[index] = { x: dx, z: dz };
      const speed = Math.hypot(dx, dz) / dtS;
      if (speed > SPEED_THRESHOLD_MPS !== (lastSpeed[index] ?? 0) > SPEED_THRESHOLD_MPS) {
        trace.speedCrossings.count(
          time,
          (activities[index] ?? '?') +
            '/' +
            (clips[index] ?? '?') +
            '@' +
            time.toFixed(1) +
            ' ' +
            (history[index] ?? []).join(' '),
        );
      }
      const dv = speed - (lastSpeed[index] ?? 0);
      if (
        Math.abs(dv) > ACCEL_NOISE_MPS &&
        Math.abs(lastDv[index] ?? 0) > ACCEL_NOISE_MPS &&
        Math.sign(dv) !== Math.sign(lastDv[index] ?? 0)
      ) {
        trace.accelFlips.count(
          time,
          (activities[index] ?? '?') + '/' + (clips[index] ?? '?') + '@' + time.toFixed(1),
        );
      }
      lastDv[index] = dv;
      lastSpeed[index] = speed;
      history[index]?.push(
        speed.toFixed(3) + '/' + (activities[index] ?? '?').slice(0, 5) + '/' + omega.toFixed(1),
      );
      if ((history[index]?.length ?? 0) > 36) history[index]?.shift();
      const swims =
        MODELS[modelOf[index] ?? '']?.signature === 'swim' && clips[index] === 'signature';
      // The feet: the walk (or swim) clip counts as much as its weight in the cross-fade.
      const legsClip = clips[index] === 'walk' || swims;
      if (!legsClip) {
        walkAge[index] = Number.POSITIVE_INFINITY;
      } else if ((walkAge[index] ?? Number.POSITIVE_INFINITY) === Number.POSITIVE_INFINITY) {
        walkAge[index] = 0;
        const start = onset[index];
        if (start !== undefined) {
          start.sum = 0;
        }
      } else {
        walkAge[index] = (walkAge[index] ?? 0) + dtS;
      }
      const age = walkAge[index] ?? Number.POSITIVE_INFINITY;
      const weight = legsClip ? Math.min(1, age / CROSS_FADE_S) : 0;
      const natural = naturalSpeedOf(MODELS[modelOf[index] ?? '']);
      const legs = swims
        ? weight * swimClipScale(speed) * SWIM_REFERENCE_SPEED_MPS
        : weight * walkClipScale(walkPace(speed, Math.abs(omega)), natural) * natural;
      const start = onset[index];
      if (start !== undefined && legsClip && age < ONSET_S) {
        start.sum += Math.hypot(dx, dz);
        start.worst = Math.max(start.worst, start.sum);
      }
      const skid = slip[index];
      if (skid !== undefined) {
        skid.run = speed - legs > SLIP_MPS ? skid.run + dtS : 0;
        if (skid.run > skid.worst) {
          skid.worst = skid.run;
          skid.label =
            (activities[index] ?? '?') +
            '/' +
            (clips[index] ?? '?') +
            '@' +
            time.toFixed(1) +
            ' v=' +
            speed.toFixed(2) +
            ' legs=' +
            legs.toFixed(2);
        }
      }
      const episode = seated[index];
      if (episode !== undefined) {
        if (clips[index] === 'walk' || swims) {
          episode.cumulative = 0;
          episode.topSpeed = 0;
        } else {
          episode.cumulative += Math.hypot(dx, dz);
          episode.topSpeed = Math.max(episode.topSpeed, speed);
          if (episode.cumulative > episode.worstCumulative) {
            episode.worstCumulative = episode.cumulative;
            episode.worstActivity = (activities[index] ?? '?') + '/' + (clips[index] ?? '?');
          }
          episode.worstSpeed = Math.max(episode.worstSpeed, speed);
        }
      }
      if (clips[index] !== lastClip[index]) {
        trace.clipSwitches.count(time);
        lastClip[index] = clips[index] ?? 'idle';
      }
      for (const name of BONES) {
        const angle = angleOf(child, name);
        if (angle === null) {
          continue;
        }
        const bones = lastBone[index];
        const steps = lastBoneStep[index];
        const oldAngle = bones?.get(name) ?? angle;
        const step = angle - oldAngle;
        const oldStep = steps?.get(name) ?? 0;
        if (
          Math.abs(step) > BONE_NOISE_RAD &&
          Math.abs(oldStep) > BONE_NOISE_RAD &&
          Math.sign(step) !== Math.sign(oldStep)
        ) {
          trace.boneFlips.get(name)?.count(time);
        }
        if (Math.abs(step) > (trace.worstBoneStep.get(name) ?? 0)) {
          trace.worstBoneStep.set(name, Math.abs(step));
          trace.activityAtWorst.set(name, `${activities[index] ?? '?'}/${clips[index] ?? '?'}`);
        }
        bones?.set(name, angle);
        steps?.set(name, step);
      }
    });
    previous = children.map((child) => ({
      x: child.position.x,
      z: child.position.z,
      yaw: child.rotation.y,
    }));
  }
  return {
    animals: traces.map((trace, index) => ({
      index,
      model: modelOf[index] ?? '?',
      onsetMoveM: onset[index]?.worst ?? 0,
      slipRunS: slip[index]?.worst ?? 0,
      slipLabel: slip[index]?.label ?? '',
      seatedMoveM: seated[index]?.worstCumulative ?? 0,
      seatedSpeedMps: seated[index]?.worstSpeed ?? 0,
      seatedActivity: seated[index]?.worstActivity ?? '',
      turnReversals: trace.turnReversals.worst,
      moveReversals: trace.moveReversals.worst,
      clipSwitches: trace.clipSwitches.worst,
      speedCrossings: trace.speedCrossings.worst,
      accelFlips: trace.accelFlips.worst,
      turnLabel: trace.turnReversals.worstLabel,
      accelLabel: trace.accelFlips.worstLabel,
      crossLabel: trace.speedCrossings.worstLabel,
      boneFlips: Object.fromEntries([...trace.boneFlips].map(([name, rate]) => [name, rate.worst])),
      worstBoneStep: Object.fromEntries(trace.worstBoneStep),
      activityAtWorst: Object.fromEntries(trace.activityAtWorst),
    })),
  };
}

/**
 * What counts as shaking, per second of the demo park and per animal: the worst of 3 minutes at
 * 60 and at 30 images a second, plus this margin. Before the corrections it was far above: 61
 * reversals of the angular velocity a second, 31 reversals of the speed, tail and trunk at 7 to
 * 12 radians a second, a clip changing 18 times a second.
 */
const SAFETY_MARGIN = 1.15;
/** A whole number of events a second: the margin rounded up, and at least one more than seen. */
function countLimit(worst: number): number {
  return Math.max(Math.ceil(worst * SAFETY_MARGIN), worst + 1);
}
/** A measure with a floor, for the worst cases that measured nothing at all. */
function amountLimit(worst: number, floor: number): number {
  return Math.max(worst * SAFETY_MARGIN, floor);
}

/** Worst measured: 0. */
const MAX_TURN_REVERSALS_PER_S = countLimit(0);
/** Worst measured: 0. */
const MAX_MOVE_REVERSALS_PER_S = countLimit(0);
/** Worst measured: 4 (at 30 images a second). */
const MAX_ACCEL_FLIPS_PER_S = countLimit(4);
/**
 * Worst measured: 3. Stopping and setting off again (arrive, a short pause, go on) crosses the
 * line between still and moving a few times in a second; shaking crosses it every image.
 */
const MAX_SPEED_CROSSINGS_PER_S = countLimit(3);
/** Worst measured: 2 (a walk, a stop, the clip of the pause, the walk again). */
const MAX_CLIP_SWITCHES_PER_S = countLimit(2);
/** The fastest the bones may move (radians a second), never looser than before the margin was taken from the measures. Worst measured: head 1.33, ears 4.87, tail 4.53, trunk 1.18. */
const MAX_BONE_RATE_RAD_S: Readonly<Record<(typeof BONES)[number], number>> = {
  head: Math.min(1.5, amountLimit(1.33, 0)),
  ear_l: Math.min(6, amountLimit(4.87, 0)),
  ear_r: Math.min(6, amountLimit(4.87, 0)),
  tail: Math.min(5, amountLimit(4.53, 0)),
  trunk: Math.min(1.5, amountLimit(1.18, 0)),
};
/** Worst measured: 7 (the tail, with its fly-swat). */
const MAX_BONE_FLIPS_PER_S = countLimit(7);
/** Moving while the clip is not a walk (or swim). Worst measured: 0.0017 m, 0.033 m/s. */
const MAX_SEATED_MOVE_M = amountLimit(0.0017, 0.002);
const MAX_SEATED_SPEED_MPS = amountLimit(0.0333, 0.04);
/** Moving before the walk clip has taken over: nothing to see. Worst measured: 0. */
const MAX_ONSET_MOVE_M = amountLimit(0, 0.002);
/** The body may go faster than its feet by more than 0.1 m/s no longer than this. Worst measured: 0. */
const MAX_SLIP_RUN_S = amountLimit(0, 0.07);

/** Every animal that goes past a limit, with what it was doing, so that a failure says who and why. */
function violations(report: MotionReport, fps: number): string[] {
  const found: string[] = [];
  const check = (
    animal: MotionReport['animals'][number],
    what: string,
    value: number,
    limit: number,
    label = '',
  ): void => {
    if (value > limit) {
      found.push(
        `#${String(animal.index)} ${animal.model}: ${what} ${value.toFixed(3)} > ${String(limit)} ${label}`,
      );
    }
  };
  for (const animal of report.animals) {
    check(
      animal,
      'turn reversals/s',
      animal.turnReversals,
      MAX_TURN_REVERSALS_PER_S,
      animal.turnLabel,
    );
    check(animal, 'move reversals/s', animal.moveReversals, MAX_MOVE_REVERSALS_PER_S);
    check(
      animal,
      'speed up/down flips/s',
      animal.accelFlips,
      MAX_ACCEL_FLIPS_PER_S,
      animal.accelLabel,
    );
    check(
      animal,
      'moving/still crossings/s',
      animal.speedCrossings,
      MAX_SPEED_CROSSINGS_PER_S,
      animal.crossLabel,
    );
    check(animal, 'clip changes/s', animal.clipSwitches, MAX_CLIP_SWITCHES_PER_S);
    for (const name of BONES) {
      check(animal, `${name} direction flips/s`, animal.boneFlips[name] ?? 0, MAX_BONE_FLIPS_PER_S);
      check(
        animal,
        `${name} rad/s`,
        (animal.worstBoneStep[name] ?? 0) * fps,
        MAX_BONE_RATE_RAD_S[name],
        animal.activityAtWorst[name],
      );
    }
    check(animal, 'moved seated (m)', animal.seatedMoveM, MAX_SEATED_MOVE_M, animal.seatedActivity);
    check(
      animal,
      'seated speed (m/s)',
      animal.seatedSpeedMps,
      MAX_SEATED_SPEED_MPS,
      animal.seatedActivity,
    );
    check(animal, 'moved before the walk clip took over (m)', animal.onsetMoveM, MAX_ONSET_MOVE_M);
    check(animal, 'skating (s)', animal.slipRunS, MAX_SLIP_RUN_S, animal.slipLabel);
  }
  return found;
}

describe.each([60, 30])('the demo park at %d images a second', (fps) => {
  it(
    'does not shake, seat itself while it walks, or skate',
    async () => {
      const report = await measureDemoPark(SIMULATED_MINUTES, fps);
      expect(violations(report, fps)).toEqual([]);
    },
    LONG_RUN_TIMEOUT_MS,
  );
});
