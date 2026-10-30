import { describe, expect, it } from 'vitest';
import { createRng, type RngState } from '@/sim';
import {
  MAX_PURPOSEFUL_TRAVEL_MS,
  MAX_TRAVEL_MS,
  NO_SOCIAL,
  travelLimitMs,
  REGROUP_RETRY_MS,
  advanceBehaviour,
  animationOf,
  attentionOf,
  beginSalute,
  canSalute,
  createBehaviour,
  rollPace,
  failTravel,
  hasEnrichment,
  isTravelling,
  type Activity,
  type AnimalBehaviour,
  type BehaviourContext,
  type SocialView,
} from './behaviour';

const STEP_MS = 100;
const TRAVEL_MS = 3000;
const HOUR_MS = 3_600_000;

function context(overrides: Partial<BehaviourContext> = {}): BehaviourContext {
  return { stars: 1, enrichmentSpots: 0, signatureAtWater: false, ...overrides };
}

interface Run {
  readonly activity: Activity;
  readonly durationMs: number;
}

/**
 * Plays the herd's part: every walk gets a target at once and takes `TRAVEL_MS` to reach it.
 * Returns the activities in order, each with how long it lasted.
 */
function play(
  behaviour: AnimalBehaviour,
  rng: RngState,
  where: BehaviourContext,
  totalMs: number,
  social: SocialView = NO_SOCIAL,
  travelMs: number = TRAVEL_MS,
): Run[] {
  const runs: Run[] = [];
  let arrived = false;
  let current = behaviour.activity;
  let duration = 0;
  let previousRemaining = behaviour.remainingMs;
  let previousTravelled = behaviour.travelledMs;
  for (let elapsed = 0; elapsed < totalMs; elapsed += STEP_MS) {
    advanceBehaviour(behaviour, STEP_MS, arrived, rng, where, social);
    behaviour.needsDestination = false;
    arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= travelMs;
    const restarted =
      behaviour.activity !== current ||
      (isTravelling(behaviour.activity)
        ? behaviour.travelledMs < previousTravelled
        : behaviour.remainingMs > previousRemaining);
    previousRemaining = behaviour.remainingMs;
    previousTravelled = behaviour.travelledMs;
    if (restarted) {
      runs.push({ activity: current, durationMs: duration });
      current = behaviour.activity;
      duration = 0;
    }
    duration += STEP_MS;
  }
  runs.push({ activity: current, durationMs: duration });
  return runs;
}

describe('animation of each activity', () => {
  it('maps every activity to a clip', () => {
    expect(animationOf('hesitate')).toBe('idle');
    expect(animationOf('rest')).toBe('idle');
    expect(animationOf('walk')).toBe('walk');
    expect(animationOf('enrichmentWalk')).toBe('walk');
    expect(animationOf('waterWalk')).toBe('walk');
    expect(animationOf('sniff')).toBe('eat');
    expect(animationOf('eat')).toBe('eat');
    expect(animationOf('sleep')).toBe('sleep');
    expect(animationOf('signature')).toBe('signature');
  });

  it('only walks move the animal', () => {
    const walks: readonly Activity[] = ['walk', 'enrichmentWalk', 'waterWalk'];
    expect(walks.every(isTravelling)).toBe(true);
    expect(isTravelling('rest')).toBe(false);
    expect(isTravelling('sleep')).toBe(false);
  });
});

describe('arrival of a group', () => {
  it('hesitates, sniffs, then explores before it joins the routine', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, true);
      expect(behaviour.activity).toBe('hesitate');
      expect(behaviour.animation).toBe('idle');
      const runs = play(behaviour, rng, context(), 5 * 60_000);
      expect(runs.slice(0, 3).map((run) => run.activity)).toEqual(['hesitate', 'sniff', 'walk']);
      expect(behaviour.stage).toBe('done');
    }
  });

  it('explores with two or three short walks, and no long walk before that', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, true);
      const walks: boolean[] = [];
      let arrived = false;
      while (behaviour.stage !== 'done') {
        advanceBehaviour(behaviour, STEP_MS, arrived, rng, context());
        if (behaviour.needsDestination) {
          // The walk that ends the exploration may be followed at once by a routine walk.
          if (behaviour.stage === 'explore') {
            walks.push(behaviour.shortTrip);
          }
          behaviour.needsDestination = false;
        }
        arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
      }
      expect(walks.length).toBeGreaterThanOrEqual(2);
      expect(walks.length).toBeLessThanOrEqual(3);
      expect(walks.every((short) => short)).toBe(true);
    }
  });

  it('is skipped by an animal that was already there', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, false);
      expect(behaviour.stage).toBe('done');
      const runs = play(behaviour, rng, context(), 10 * 60_000);
      expect(runs.some((run) => run.activity === 'hesitate' || run.activity === 'sniff')).toBe(
        false,
      );
    }
  });
});

describe('routine', () => {
  it('uses every kind of timed behaviour over time', () => {
    const rng = createRng(2);
    const behaviour = createBehaviour(rng, false);
    const seen = new Set(play(behaviour, rng, context(), HOUR_MS).map((run) => run.activity));
    // Alone, with walks too short to be interrupted: no social activity, no pause on the way.
    expect(seen).toEqual(new Set(['walk', 'rest', 'eat', 'sleep', 'signature', 'lookAround']));
  });

  it('never sleeps twice in a row', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, false);
      const runs = play(behaviour, rng, context({ stars: 3, enrichmentSpots: 2 }), 4 * HOUR_MS);
      runs.slice(1).forEach((run, index) => {
        expect(run.activity === 'sleep' && runs[index]?.activity === 'sleep').toBe(false);
      });
      expect(runs.some((run) => run.activity === 'sleep')).toBe(true);
    }
  });

  it('varies its durations and never repeats the same one twice in a row', () => {
    const rng = createRng(8);
    const behaviour = createBehaviour(rng, false);
    const timed = play(behaviour, rng, context(), 4 * HOUR_MS).filter(
      (run) => !isTravelling(run.activity),
    );
    expect(new Set(timed.map((run) => run.durationMs)).size).toBeGreaterThan(20);
    timed.slice(1).forEach((run, index) => {
      expect(run.durationMs === timed[index]?.durationMs).toBe(false);
    });
  });

  it('is repeatable: same seed, same life', () => {
    const lives = [0, 1].map(() => {
      const rng = createRng(77);
      return play(createBehaviour(rng, true), rng, context(), HOUR_MS);
    });
    expect(lives[0]).toEqual(lives[1]);
  });

  it('keeps animals out of step with each other', () => {
    const rng = createRng(5);
    const group = Array.from({ length: 5 }, () => createBehaviour(rng, true));
    const timelines = group.map((behaviour) => play(behaviour, rng, context(), 60_000));
    const firstDurations = timelines.map((runs) => runs[0]?.durationMs);
    expect(new Set(firstDurations).size).toBeGreaterThan(1);
    const switchTimes = timelines.map((runs) => runs.map((run) => run.durationMs).join(','));
    expect(new Set(switchTimes).size).toBe(group.length);
  });
});

describe('enrichment', () => {
  function enrichmentRuns(where: BehaviourContext, seed: number): Run[] {
    const rng = createRng(seed);
    return play(createBehaviour(rng, false), rng, where, 6 * HOUR_MS);
  }

  it('is not used at one star, nor in an enclosure without enrichment points', () => {
    expect(hasEnrichment(context({ stars: 1, enrichmentSpots: 3 }))).toBe(false);
    expect(hasEnrichment(context({ stars: 3, enrichmentSpots: 0 }))).toBe(false);
    expect(hasEnrichment(context({ stars: 2, enrichmentSpots: 1 }))).toBe(true);
    for (const where of [
      context({ stars: 1, enrichmentSpots: 3 }),
      context({ stars: 4, enrichmentSpots: 0 }),
    ]) {
      expect(enrichmentRuns(where, 3).some((run) => run.activity === 'enrichmentWalk')).toBe(false);
    }
  });

  it('is used from two stars, more often as stars grow', () => {
    const countAt = (stars: number): number =>
      enrichmentRuns(context({ stars, enrichmentSpots: stars - 1 }), 3).filter(
        (run) => run.activity === 'enrichmentWalk',
      ).length;
    const two = countAt(2);
    const five = countAt(5);
    expect(two).toBeGreaterThan(0);
    expect(five).toBeGreaterThan(two);
  });

  it('asks for an enrichment point that exists, then eats or plays there', () => {
    const where = context({ stars: 4, enrichmentSpots: 3 });
    const rng = createRng(9);
    const behaviour = createBehaviour(rng, false);
    const spots = new Set<number>();
    const uses = new Set<Activity>();
    let arrived = false;
    let previous: Activity = behaviour.activity;
    for (let step = 0; step < (2 * HOUR_MS) / STEP_MS; step += 1) {
      advanceBehaviour(behaviour, STEP_MS, arrived, rng, where);
      if (behaviour.needsDestination) {
        if (behaviour.destination === 'enrichment') {
          spots.add(behaviour.enrichmentSpot);
        }
        behaviour.needsDestination = false;
      }
      if (previous === 'enrichmentWalk' && behaviour.activity !== 'enrichmentWalk') {
        uses.add(behaviour.activity);
      }
      previous = behaviour.activity;
      arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
    }
    expect(spots).toEqual(new Set([0, 1, 2]));
    expect(uses).toEqual(new Set(['eat', 'signature']));
  });
});

describe('signature', () => {
  it('is played on the spot when it is not swimming', () => {
    const rng = createRng(6);
    const runs = play(createBehaviour(rng, false), rng, context(), 2 * HOUR_MS);
    expect(runs.some((run) => run.activity === 'signature')).toBe(true);
    expect(runs.some((run) => run.activity === 'waterWalk')).toBe(false);
  });

  it('is played at the water when swimming, after walking there', () => {
    const where = context({ stars: 3, enrichmentSpots: 2, signatureAtWater: true });
    const rng = createRng(6);
    const runs = play(createBehaviour(rng, false), rng, where, 2 * HOUR_MS);
    const signatures = runs.filter((run) => run.activity === 'signature');
    expect(signatures.length).toBeGreaterThan(0);
    runs.forEach((run, index) => {
      if (run.activity === 'signature') {
        expect(runs[index - 1]?.activity === 'waterWalk' || index === 0).toBe(true);
      }
    });
  });

  it('asks the herd for the water as destination', () => {
    const where = context({ signatureAtWater: true });
    const rng = createRng(6);
    const behaviour = createBehaviour(rng, false);
    const destinations = new Set<string>();
    let arrived = false;
    for (let step = 0; step < HOUR_MS / STEP_MS; step += 1) {
      advanceBehaviour(behaviour, STEP_MS, arrived, rng, where);
      if (behaviour.needsDestination) {
        destinations.add(`${behaviour.activity}:${behaviour.destination}`);
        behaviour.needsDestination = false;
      }
      arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
    }
    expect(destinations).toEqual(new Set(['walk:free', 'waterWalk:water']));
  });
});

/** Lives on, as the herd would, until the animal has just set off on a walk of this kind. */
function justStarted(
  activity: Activity,
  where: BehaviourContext,
): { behaviour: AnimalBehaviour; rng: RngState } {
  for (let seed = 1; seed < 100; seed += 1) {
    const rng = createRng(seed);
    const behaviour = createBehaviour(rng, false);
    let arrived = false;
    for (let step = 0; step < HOUR_MS / STEP_MS; step += 1) {
      advanceBehaviour(behaviour, STEP_MS, arrived, rng, where);
      if (behaviour.activity === activity && behaviour.needsDestination) {
        return { behaviour, rng };
      }
      behaviour.needsDestination = false;
      arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
    }
  }
  throw new Error(`no seed sets off on a ${activity}`);
}

describe('walks that cannot happen', () => {
  it('waits for a target without counting time', () => {
    const { behaviour, rng } = justStarted('walk', context());
    expect(behaviour.needsDestination).toBe(true);
    advanceBehaviour(behaviour, MAX_TRAVEL_MS * 2, true, rng, context());
    expect(behaviour.activity).toBe('walk');
    expect(behaviour.travelledMs).toBe(0);
  });

  it('rests when the herd finds no way, and ends the arrival exploration', () => {
    const rng = createRng(12);
    const behaviour = createBehaviour(rng, true);
    behaviour.stage = 'explore';
    failTravel(behaviour, rng);
    expect(behaviour.activity).toBe('rest');
    expect(behaviour.needsDestination).toBe(false);
    expect(behaviour.stage).toBe('done');
  });

  it('gives up a walk that never arrives', () => {
    const { behaviour, rng } = justStarted('walk', context());
    behaviour.needsDestination = false;
    // Pauses on the way are tested apart: here the walk goes on without interruption.
    behaviour.wayEventMs = Number.POSITIVE_INFINITY;
    advanceBehaviour(behaviour, MAX_TRAVEL_MS - 1, false, rng, context());
    expect(behaviour.activity).toBe('walk');
    advanceBehaviour(behaviour, 1, false, rng, context());
    expect(behaviour.activity === 'walk' && behaviour.travelledMs > 0).toBe(false);
  });

  it('rests instead of using an enrichment point it never reached', () => {
    const where = context({ stars: 5, enrichmentSpots: 4 });
    const { behaviour, rng } = justStarted('enrichmentWalk', where);
    behaviour.needsDestination = false;
    advanceBehaviour(behaviour, MAX_TRAVEL_MS, false, rng, where);
    expect(behaviour.activity).toBe('rest');
  });
});

describe('first moments of an animal that was already there', () => {
  it('rests first, for a different time each, whatever the habitat offers', () => {
    const rng = createRng(21);
    const firsts = Array.from({ length: 8 }, () => createBehaviour(rng, false));
    for (const behaviour of firsts) {
      expect(behaviour.activity).toBe('rest');
      expect(behaviour.needsDestination).toBe(false);
    }
    expect(new Set(firsts.map((behaviour) => behaviour.remainingMs)).size).toBeGreaterThan(3);
  });

  it('plays a swimming signature at the water only, even for its very first routine', () => {
    const where = context({ signatureAtWater: true });
    for (let seed = 1; seed <= 200; seed += 1) {
      const rng = createRng(seed);
      const runs = play(createBehaviour(rng, false), rng, where, 5 * 60_000);
      runs.forEach((run, index) => {
        if (run.activity === 'signature') {
          expect(runs[index - 1]?.activity).toBe('waterWalk');
        }
      });
    }
  });
});

const LONG_WALK_MS = 25_000;

function social(overrides: Partial<SocialView>): SocialView {
  return { ...NO_SOCIAL, ...overrides };
}

describe('pace of a walk', () => {
  it('is a stroll or a decided pace, within named ranges', () => {
    const rng = createRng(3);
    const paces = Array.from({ length: 2000 }, () => rollPace(rng));
    expect(Math.min(...paces)).toBeGreaterThanOrEqual(0.45);
    expect(Math.max(...paces)).toBeLessThanOrEqual(1);
    const strolls = paces.filter((pace) => pace <= 0.65).length;
    const brisk = paces.filter((pace) => pace >= 0.85).length;
    expect(strolls + brisk).toBe(paces.length);
    expect(strolls).toBeGreaterThan(brisk);
    expect(brisk).toBeGreaterThan(300);
  });

  it('is repeatable', () => {
    const first = createRng(8);
    const second = createRng(8);
    expect([rollPace(first), rollPace(first)]).toEqual([rollPace(second), rollPace(second)]);
  });
});

describe('interruptions of a walk', () => {
  it('stops now and then to look around or sniff the ground, then goes on to the same target', () => {
    const rng = createRng(14);
    const where = context();
    const behaviour = createBehaviour(rng, false);
    const kinds = new Set<Activity>();
    let destinations = 0;
    let walks = 0;
    let previous: Activity = behaviour.activity;
    let arrived = false;
    for (let step = 0; step < (4 * HOUR_MS) / STEP_MS; step += 1) {
      advanceBehaviour(behaviour, STEP_MS, arrived, rng, where);
      if (behaviour.needsDestination) {
        behaviour.needsDestination = false;
        destinations += 1;
      }
      if (behaviour.activity === 'wayPause' || behaviour.activity === 'wayInspect') {
        kinds.add(behaviour.activity);
        expect(behaviour.resumeWalk).toBe(true);
      }
      if (previous === 'wayPause' || previous === 'wayInspect') {
        // The walk resumes at once: no new target is asked for.
        expect(behaviour.activity === 'walk' || behaviour.activity === previous).toBe(true);
      }
      walks += previous !== 'walk' && behaviour.activity === 'walk' ? 1 : 0;
      previous = behaviour.activity;
      arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= LONG_WALK_MS;
    }
    expect(kinds).toEqual(new Set(['wayPause', 'wayInspect']));
    expect(destinations).toBeGreaterThan(50);
    // More resumptions than targets: the pauses add walking stretches without new targets.
    expect(walks).toBeGreaterThan(destinations);
  });

  it('never interrupts the short walks of the arrival', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, true);
      const runs = play(behaviour, rng, context(), 60_000, NO_SOCIAL, LONG_WALK_MS);
      const arrival = runs.slice(0, 5).map((run) => run.activity);
      expect(arrival).not.toContain('wayPause');
      expect(arrival).not.toContain('wayInspect');
    }
  });
});

describe('looking around and greeting', () => {
  it('has the head most alert when looking around and still when asleep', () => {
    expect(attentionOf('lookAround')).toBe(1);
    expect(attentionOf('sleep')).toBe(0);
    for (const activity of ['rest', 'walk', 'eat', 'salute', 'wayInspect'] as const) {
      expect(attentionOf(activity)).toBeGreaterThan(0);
      expect(attentionOf(activity)).toBeLessThan(1);
    }
  });

  it('greets only when a resting neighbour is close, and never otherwise', () => {
    const alone = createRng(5);
    const lonely = play(createBehaviour(alone, false), alone, context(), 2 * HOUR_MS);
    expect(lonely.some((run) => run.activity === 'salute')).toBe(false);

    const rng = createRng(5);
    const crowd = social({ neighbourClose: true });
    const runs = play(createBehaviour(rng, false), rng, context(), 2 * HOUR_MS, crowd);
    expect(runs.some((run) => run.activity === 'salute')).toBe(true);
    for (const run of runs.filter((one) => one.activity === 'salute')) {
      expect(run.durationMs).toBeGreaterThanOrEqual(1500);
      expect(run.durationMs).toBeLessThanOrEqual(3600);
    }
  });

  it('lets a neighbour who stands about be greeted at once, but not one who walks or sleeps', () => {
    const rng = createRng(2);
    const standing = createBehaviour(rng, false);
    standing.activity = 'rest';
    expect(canSalute(standing)).toBe(true);
    beginSalute(standing, rng);
    expect(standing.activity).toBe('salute');
    expect(canSalute(standing)).toBe(false);
    for (const activity of ['walk', 'sleep', 'eat'] as const) {
      standing.activity = activity;
      expect(canSalute(standing)).toBe(false);
    }
    const arriving = createBehaviour(rng, true);
    arriving.activity = 'rest';
    expect(canSalute(arriving)).toBe(false);
  });
});

describe('following and regrouping', () => {
  function destinations(view: SocialView, seeds: number): Map<string, number> {
    const counts = new Map<string, number>();
    for (let seed = 1; seed <= seeds; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, false);
      let arrived = false;
      for (let step = 0; step < (30 * 60_000) / STEP_MS; step += 1) {
        advanceBehaviour(behaviour, STEP_MS, arrived, rng, context(), view);
        if (behaviour.needsDestination) {
          behaviour.needsDestination = false;
          const key = `${behaviour.activity}:${behaviour.destination}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
        arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
      }
    }
    return counts;
  }

  it('follows only when a neighbour walks, and then looks around where it stops', () => {
    expect(destinations(NO_SOCIAL, 5).get('followWalk:follow')).toBeUndefined();
    expect(destinations(social({ walkerNear: true }), 5).get('followWalk:follow')).toBeGreaterThan(
      10,
    );
    const rng = createRng(9);
    const runs = play(
      createBehaviour(rng, false),
      rng,
      context(),
      HOUR_MS,
      social({ walkerNear: true }),
    );
    runs.forEach((run, index) => {
      if (run.activity === 'followWalk') {
        const next = runs[index + 1]?.activity;
        expect(next === 'lookAround' || next === 'rest' || index === runs.length - 1).toBe(true);
      }
    });
  });

  it('goes back to the group when scattered, as a clear favourite', () => {
    const counts = destinations(social({ scattered: true }), 5);
    const regroup = counts.get('regroupWalk:group') ?? 0;
    const others = [...counts.entries()]
      .filter(([key]) => key !== 'regroupWalk:group')
      .reduce((sum, [, count]) => sum + count, 0);
    expect(regroup).toBeGreaterThan(others / 2);
    expect(destinations(NO_SOCIAL, 5).get('regroupWalk:group')).toBeUndefined();
  });
});

/** Reads the activity through a call, so that the compiler does not assume it never changes. */
function activityOf(behaviour: AnimalBehaviour): Activity {
  return behaviour.activity;
}

describe('how long a walk may take', () => {
  it('gives the long, purposeful walks twice as long as the others', () => {
    expect(travelLimitMs('walk')).toBe(MAX_TRAVEL_MS);
    expect(travelLimitMs('enrichmentWalk')).toBe(MAX_TRAVEL_MS);
    expect(travelLimitMs('sleeperWalk')).toBe(MAX_PURPOSEFUL_TRAVEL_MS);
    expect(travelLimitMs('regroupWalk')).toBe(MAX_PURPOSEFUL_TRAVEL_MS);
    expect(MAX_PURPOSEFUL_TRAVEL_MS).toBe(2 * MAX_TRAVEL_MS);
  });

  it('does not give up a walk to a sleeper after the time of an ordinary walk', () => {
    const where = context();
    for (let seed = 1; seed < 200; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, false);
      let arrived = false;
      for (let step = 0; step < HOUR_MS / STEP_MS; step += 1) {
        advanceBehaviour(behaviour, STEP_MS, arrived, rng, where, social({ sleeperNear: true }));
        if (activityOf(behaviour) === 'sleeperWalk' && behaviour.needsDestination) {
          behaviour.needsDestination = false;
          // Past the limit of an ordinary walk, still on its way.
          advanceBehaviour(behaviour, MAX_TRAVEL_MS + 1000, false, rng, where, NO_SOCIAL);
          expect(activityOf(behaviour)).toBe('sleeperWalk');
          // Arriving then, it lies down.
          advanceBehaviour(behaviour, STEP_MS, true, rng, where, NO_SOCIAL);
          expect(activityOf(behaviour)).toBe('sleep');
          return;
        }
        behaviour.needsDestination = false;
        arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
      }
    }
    throw new Error('no animal walked to a sleeper');
  });
});

describe('regrouping that finds no way', () => {
  it('waits before it is tried again, then is tried again', () => {
    const scattered = social({ scattered: true });
    const where = context();
    for (let seed = 1; seed < 100; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, false);
      let arrived = false;
      for (let step = 0; step < HOUR_MS / STEP_MS; step += 1) {
        advanceBehaviour(behaviour, STEP_MS, arrived, rng, where, scattered);
        if (behaviour.activity === 'regroupWalk' && behaviour.needsDestination) {
          failTravel(behaviour, rng);
          expect(behaviour.regroupCooldownMs).toBe(REGROUP_RETRY_MS);
          // Until the delay is over, no regrouping starts again.
          for (let waited = 0; waited < REGROUP_RETRY_MS; waited += STEP_MS) {
            advanceBehaviour(behaviour, STEP_MS, false, rng, where, scattered);
            behaviour.needsDestination = false;
            expect(activityOf(behaviour)).not.toBe('regroupWalk');
          }
          // Afterwards the scattered animal tries again, as a clear favourite.
          let again = false;
          for (let later = 0; later < 600_000 && !again; later += STEP_MS) {
            advanceBehaviour(behaviour, STEP_MS, false, rng, where, scattered);
            again = activityOf(behaviour) === 'regroupWalk';
            behaviour.needsDestination = false;
          }
          expect(again).toBe(true);
          return;
        }
        behaviour.needsDestination = false;
        arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
      }
    }
    throw new Error('no animal tried to regroup');
  });
});

describe('one swimmer at a time', () => {
  it('does not go to the water while a neighbour is in it, and goes when it is free', () => {
    const where = context({ signatureAtWater: true });
    const count = (view: SocialView): number => {
      let walks = 0;
      for (let seed = 1; seed <= 10; seed += 1) {
        const rng = createRng(seed);
        const runs = play(createBehaviour(rng, false), rng, where, HOUR_MS, view);
        walks += runs.filter((run) => run.activity === 'waterWalk').length;
      }
      return walks;
    };
    expect(count(NO_SOCIAL)).toBeGreaterThan(10);
    expect(count(social({ waterBusy: true }))).toBe(0);
  });

  it('still plays a signature on the spot when the water is no matter to the species', () => {
    const rng = createRng(3);
    const runs = play(
      createBehaviour(rng, false),
      rng,
      context(),
      2 * HOUR_MS,
      social({ waterBusy: true }),
    );
    expect(runs.some((run) => run.activity === 'signature')).toBe(true);
  });
});

describe('sleeping in a pile', () => {
  it('goes next to a sleeper when there is one, in most cases, then sleeps there', () => {
    const counts = new Map<string, number>();
    let sleepsAfterWalk = 0;
    let walksToSleeper = 0;
    for (let seed = 1; seed <= 20; seed += 1) {
      const rng = createRng(seed);
      const view = social({ sleeperNear: true });
      const runs = play(createBehaviour(rng, false), rng, context(), 2 * HOUR_MS, view);
      runs.forEach((run, index) => {
        counts.set(run.activity, (counts.get(run.activity) ?? 0) + 1);
        if (run.activity === 'sleeperWalk') {
          walksToSleeper += 1;
          sleepsAfterWalk += runs[index + 1]?.activity === 'sleep' ? 1 : 0;
        }
      });
    }
    const alone = counts.get('sleep') ?? 0;
    expect(walksToSleeper).toBeGreaterThan(alone / 2);
    // A walk that arrives always ends in sleep (the last run of a trace may be cut short).
    expect(sleepsAfterWalk).toBeGreaterThan(walksToSleeper - 25);
  });

  it('sleeps where it is when no neighbour sleeps, and never walks to a sleeper', () => {
    const rng = createRng(4);
    const runs = play(createBehaviour(rng, false), rng, context(), 4 * HOUR_MS);
    expect(runs.some((run) => run.activity === 'sleep')).toBe(true);
    expect(runs.some((run) => run.activity === 'sleeperWalk')).toBe(false);
  });

  it('still never sleeps twice in a row', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed);
      const runs = play(
        createBehaviour(rng, false),
        rng,
        context(),
        4 * HOUR_MS,
        social({ sleeperNear: true }),
      );
      runs.slice(1).forEach((run, index) => {
        expect(run.activity === 'sleep' && runs[index]?.activity === 'sleep').toBe(false);
      });
    }
  });

  it('rests instead when the walk to the sleeper never arrives', () => {
    const where = context();
    for (let seed = 1; seed < 200; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, false);
      let arrived = false;
      for (let step = 0; step < HOUR_MS / STEP_MS; step += 1) {
        advanceBehaviour(behaviour, STEP_MS, arrived, rng, where, social({ sleeperNear: true }));
        if (behaviour.activity === 'sleeperWalk' && behaviour.needsDestination) {
          behaviour.needsDestination = false;
          advanceBehaviour(behaviour, MAX_PURPOSEFUL_TRAVEL_MS, false, rng, where, NO_SOCIAL);
          expect(behaviour.activity).toBe('rest');
          return;
        }
        behaviour.needsDestination = false;
        arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
      }
    }
    throw new Error('no animal walked to a sleeper');
  });
});
