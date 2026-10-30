import type { ProfileReport } from './economy-run';

const MINUTE_MS = 60_000;
/**
 * Brief of task 1.6: the regular player meets the slice's 5 species in about 15 minutes of play.
 * The welcome banner's guaranteed very rare sets that pace whatever the luck of the draws, so its
 * last arrival must come between these bounds.
 */
export const EARLIEST_WELCOME_DONE_MS = 11 * MINUTE_MS;
export const LATEST_WELCOME_DONE_MS = 18 * MINUTE_MS;
/**
 * The other species still depend on luck: an early very rare also fulfils the rare guarantee, so
 * the giant otter can stay away for a while. Share of seeds that must have every species by
 * `LATEST_WELCOME_DONE_MS`; the others must get them on a later day (never blocked).
 */
export const MIN_SHARE_ALL_SPECIES_IN_TIME = 0.75;

export const TARGET_DESCRIPTION =
  'regular player: welcome banner (guaranteed very rare) done between 11 and 18 min of play; ' +
  'no profile blocked (every species met, tickets every day)';

/** Ways a regular player's first minutes miss the pace; empty when it is met. */
export function checkPace(report: ProfileReport): string[] {
  const done = report.welcomeDonePlayMs;
  if (report.profile !== 'regular') {
    return [];
  }
  if (done === null || done < EARLIEST_WELCOME_DONE_MS || done > LATEST_WELCOME_DONE_MS) {
    return [`regular: welcome banner done at ${String(done)} ms of play`];
  }
  return [];
}

/** True when every species was met within the target time. */
export function metAllSpeciesInTime(report: ProfileReport): boolean {
  return report.allSpeciesPlayMs !== null && report.allSpeciesPlayMs <= LATEST_WELCOME_DONE_MS;
}

/** Every way a profile misses the target over a run of several days; empty when it is met. */
export function checkTarget(report: ProfileReport): string[] {
  const failures = checkPace(report);
  if (report.blocked !== null) {
    failures.push(`${report.profile}: blocked (${report.blocked})`);
  }
  return failures;
}
