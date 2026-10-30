/** One play session: when it starts in the real day and how long the player stays. */
export interface Session {
  readonly startHour: number;
  readonly minutes: number;
}

/** A player habit of the GDD ("Équilibrage par simulation"). */
export interface Profile {
  readonly id: ProfileId;
  readonly sessions: readonly Session[];
  /** Length of the very first session, when it differs from the habit. */
  readonly firstSessionMinutes: number | null;
}

export const PROFILE_IDS = ['occasional', 'regular', 'passionate'] as const;
export type ProfileId = (typeof PROFILE_IDS)[number];

/**
 * 2 sessions of 5 minutes, 5 of 8 minutes, and 2 hours a day split in four. The regular player's
 * first session lasts 15 minutes, as in the GDD's pace table ("Fin de la 1re session (15 min)").
 */
export const PROFILES: Readonly<Record<ProfileId, Profile>> = {
  occasional: {
    id: 'occasional',
    sessions: [
      { startHour: 12, minutes: 5 },
      { startHour: 20, minutes: 5 },
    ],
    firstSessionMinutes: null,
  },
  regular: {
    id: 'regular',
    sessions: [9, 12, 15, 18, 21].map((startHour) => ({ startHour, minutes: 8 })),
    firstSessionMinutes: 15,
  },
  passionate: {
    id: 'passionate',
    sessions: [9, 13, 17, 21].map((startHour) => ({ startHour, minutes: 30 })),
    firstSessionMinutes: null,
  },
};

/**
 * Seconds of play a person needs for each action: the simulated player is no faster than a human
 * drawing an enclosure on a phone, so the first minutes keep their real pace.
 */
export const ACTION_SECONDS = {
  claimMail: 5,
  buyCounterTicket: 4,
  singleArrival: 12,
  multiArrival: 40,
  welcomeChoice: 10,
  placeEnclosure: 30,
  installGroup: 8,
  placePath: 6,
  placeBuilding: 10,
  /** Looking at the park when there is nothing to do. */
  idle: 10,
} as const;
