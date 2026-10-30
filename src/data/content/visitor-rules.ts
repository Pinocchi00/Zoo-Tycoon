import type { VisitorRulesInput } from '../schemas/visitors';

/**
 * Values of task 1.5; k (one group per minute per √A) set by task 1.6 with `npm run sim`. A need at
 * the seek threshold takes 6 to 10 minutes to build up; the star and view bonuses are those of the
 * GDD formula.
 */
export const visitorRules = {
  arrivals: {
    milliVisitorsPerSqrtAttractiveness: 1000,
    maxPerMinute: 30,
    maxPresent: 250,
    walkableCellsPerVisitor: 2,
  },
  attractiveness: { perStarBp: 2000, perViewPointBp: 1000 },
  needs: {
    seekThresholdBp: 6000,
    wantedRiseBp: 15_000,
    foodDrink: {
      risePerMinuteBp: 800,
      urgentThoughtKey: 'visitor.thought.hungry',
      missingThoughtKey: 'visitor.thought.missingFoodDrink',
    },
    rest: {
      risePerMinuteBp: 1000,
      urgentThoughtKey: 'visitor.thought.tired',
      missingThoughtKey: 'visitor.thought.missingRest',
    },
    comfort: {
      risePerMinuteBp: 600,
      urgentThoughtKey: 'visitor.thought.needsComfort',
      missingThoughtKey: 'visitor.thought.missingComfort',
    },
  },
  viewing: {
    baseSeconds: 10,
    secondsPerViewPoint: 4,
    wonderPerViewBp: 1500,
    wonderPerViewPointBp: 300,
  },
  satisfaction: {
    startBp: 7000,
    baseBp: 6000,
    wonderWeightBp: 4000,
    unmetPenaltyBp: 5000,
    smoothingSeconds: 60,
    spendFloorBp: 8000,
    departureSmoothingVisitors: 20,
  },
  suggestionHalfLifeMinutes: 10,
  zoneSizeCells: 16,
  thoughts: {
    contentKey: 'visitor.thought.content',
    amazedKey: 'visitor.thought.amazed',
    leavingKey: 'visitor.thought.leaving',
  },
} satisfies VisitorRulesInput;
