import { describe, expect, it } from 'vitest';
import { createRng, type RngState } from '@/sim';
import {
  MAX_TRAVEL_MS,
  advanceBehaviour,
  animationOf,
  createBehaviour,
  failTravel,
  hasEnrichment,
  isTravelling,
  type Activity,
  type AnimalBehaviour,
  type BehaviourContext,
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
): Run[] {
  const runs: Run[] = [];
  let arrived = false;
  let current = behaviour.activity;
  let duration = 0;
  let previousRemaining = behaviour.remainingMs;
  let previousTravelled = behaviour.travelledMs;
  for (let elapsed = 0; elapsed < totalMs; elapsed += STEP_MS) {
    advanceBehaviour(behaviour, STEP_MS, arrived, rng, where);
    behaviour.needsDestination = false;
    arrived = isTravelling(behaviour.activity) && behaviour.travelledMs >= TRAVEL_MS;
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
      const behaviour = createBehaviour(rng, context(), true);
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
      const behaviour = createBehaviour(rng, context(), true);
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
      const behaviour = createBehaviour(rng, context(), false);
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
    const behaviour = createBehaviour(rng, context(), false);
    const seen = new Set(play(behaviour, rng, context(), HOUR_MS).map((run) => run.activity));
    expect(seen).toEqual(new Set(['walk', 'rest', 'eat', 'sleep', 'signature']));
  });

  it('never sleeps twice in a row', () => {
    for (let seed = 1; seed <= 10; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, context({ stars: 3, enrichmentSpots: 2 }), false);
      const runs = play(behaviour, rng, context({ stars: 3, enrichmentSpots: 2 }), 4 * HOUR_MS);
      runs.slice(1).forEach((run, index) => {
        expect(run.activity === 'sleep' && runs[index]?.activity === 'sleep').toBe(false);
      });
      expect(runs.some((run) => run.activity === 'sleep')).toBe(true);
    }
  });

  it('varies its durations and never repeats the same one twice in a row', () => {
    const rng = createRng(8);
    const behaviour = createBehaviour(rng, context(), false);
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
      return play(createBehaviour(rng, context(), true), rng, context(), HOUR_MS);
    });
    expect(lives[0]).toEqual(lives[1]);
  });

  it('keeps animals out of step with each other', () => {
    const rng = createRng(5);
    const group = Array.from({ length: 5 }, () => createBehaviour(rng, context(), true));
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
    return play(createBehaviour(rng, where, false), rng, where, 6 * HOUR_MS);
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
    const behaviour = createBehaviour(rng, where, false);
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
    const runs = play(createBehaviour(rng, context(), false), rng, context(), 2 * HOUR_MS);
    expect(runs.some((run) => run.activity === 'signature')).toBe(true);
    expect(runs.some((run) => run.activity === 'waterWalk')).toBe(false);
  });

  it('is played at the water when swimming, after walking there', () => {
    const where = context({ stars: 3, enrichmentSpots: 2, signatureAtWater: true });
    const rng = createRng(6);
    const runs = play(createBehaviour(rng, where, false), rng, where, 2 * HOUR_MS);
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
    const behaviour = createBehaviour(rng, where, false);
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

describe('walks that cannot happen', () => {
  function startedWalk(where: BehaviourContext): { behaviour: AnimalBehaviour; rng: RngState } {
    for (let seed = 1; seed < 200; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, where, false);
      if (behaviour.activity === 'walk') {
        return { behaviour, rng };
      }
    }
    throw new Error('no seed starts with a walk');
  }

  it('waits for a target without counting time', () => {
    const { behaviour, rng } = startedWalk(context());
    expect(behaviour.needsDestination).toBe(true);
    advanceBehaviour(behaviour, MAX_TRAVEL_MS * 2, true, rng, context());
    expect(behaviour.activity).toBe('walk');
    expect(behaviour.travelledMs).toBe(0);
  });

  it('rests when the herd finds no way, and ends the arrival exploration', () => {
    const rng = createRng(12);
    const behaviour = createBehaviour(rng, context(), true);
    behaviour.stage = 'explore';
    failTravel(behaviour, rng);
    expect(behaviour.activity).toBe('rest');
    expect(behaviour.needsDestination).toBe(false);
    expect(behaviour.stage).toBe('done');
  });

  it('gives up a walk that never arrives', () => {
    const { behaviour, rng } = startedWalk(context());
    behaviour.needsDestination = false;
    advanceBehaviour(behaviour, MAX_TRAVEL_MS - 1, false, rng, context());
    expect(behaviour.activity).toBe('walk');
    advanceBehaviour(behaviour, 1, false, rng, context());
    expect(behaviour.activity === 'walk' && behaviour.travelledMs > 0).toBe(false);
  });

  it('rests instead of using an enrichment point it never reached', () => {
    const where = context({ stars: 5, enrichmentSpots: 4 });
    for (let seed = 1; seed < 400; seed += 1) {
      const rng = createRng(seed);
      const behaviour = createBehaviour(rng, where, false);
      if (behaviour.activity !== 'enrichmentWalk') {
        continue;
      }
      behaviour.needsDestination = false;
      advanceBehaviour(behaviour, MAX_TRAVEL_MS, false, rng, where);
      expect(behaviour.activity).toBe('rest');
      return;
    }
    throw new Error('no seed starts with an enrichment walk');
  });
});
