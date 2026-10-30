import { describe, expect, it } from 'vitest';
import { loadGameContent } from '../../src/data';
import type { GameData } from '../../src/data/load';
import { runProfile } from './economy-run';
import { PROFILE_IDS, PROFILES } from './profiles';
import {
  checkPace,
  checkTarget,
  metAllSpeciesInTime,
  MIN_SHARE_ALL_SPECIES_IN_TIME,
} from './target';

/** Several seeds, so that a lucky or unlucky draw cannot hide a broken pace. */
const SEEDS = Array.from({ length: 12 }, (_unused, index) => index + 1);
/** Long enough for the slowest profile, or an unlucky one, to meet every species. */
const DAYS = 4;
const TIMEOUT_MS = 180_000;

function gameData(): GameData {
  const loaded = loadGameContent();
  if (!loaded.ok) {
    throw new Error('The game content must load.');
  }
  return loaded.value;
}

// Brief of task 1.6: a change of the economy that breaks the slice's target fails the check.
describe('economy target of the slice', () => {
  const data = gameData();

  it(
    'lets a regular player meet the 5 species in about 15 minutes of play',
    () => {
      const reports = SEEDS.map((seed) => runProfile(PROFILES.regular, 1, seed, data));
      for (const report of reports) {
        expect({ seed: report.seed, failures: checkPace(report) }).toEqual({
          seed: report.seed,
          failures: [],
        });
      }
      const inTime = reports.filter(metAllSpeciesInTime).length;
      expect(inTime / reports.length).toBeGreaterThanOrEqual(MIN_SHARE_ALL_SPECIES_IN_TIME);
    },
    TIMEOUT_MS,
  );

  it.each(PROFILE_IDS)(
    'never blocks the %s profile',
    (id) => {
      for (const seed of [1, 9]) {
        const report = runProfile(PROFILES[id], DAYS, seed, data);
        expect({ seed, failures: checkTarget(report) }).toEqual({ seed, failures: [] });
        expect(report.days.every((day) => day.ticketsEarned > 0)).toBe(true);
      }
    },
    TIMEOUT_MS,
  );
});
