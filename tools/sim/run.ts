// Economy simulator: plays the GDD's three player profiles on the pure simulation, without
// rendering, and prints the pace of the economy.
// Usage: npm run sim -- --days 7 --seed 42 [--profile regular]
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runnerImport } from 'vite';
import type * as Data from '../../src/data/index';
import type * as EconomyRun from './economy-run';
import type * as Profiles from './profiles';
import type * as Target from './target';

const MAX_DAYS = 3650;
const MAX_SEED = 0xffff_ffff;
const MINUTE_MS = 60_000;
const DATA_ENTRY = fileURLToPath(new URL('../../src/data/index.ts', import.meta.url));
const RUN_ENTRY = fileURLToPath(new URL('./economy-run.ts', import.meta.url));
const PROFILES_ENTRY = fileURLToPath(new URL('./profiles.ts', import.meta.url));
const TARGET_ENTRY = fileURLToPath(new URL('./target.ts', import.meta.url));

interface Options {
  readonly days: number;
  readonly seed: number;
  readonly profile: string | null;
}

function parseInteger(name: string, raw: string, min: number, max: number): number {
  const value = Number(raw);
  if (!/^\d+$/.test(raw) || !Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(
      `--${name} must be an integer between ${String(min)} and ${String(max)}, got "${raw}".`,
    );
  }
  return value;
}

function readOptions(): Options {
  const { values } = parseArgs({
    options: {
      days: { type: 'string', default: '7' },
      seed: { type: 'string', default: '42' },
      profile: { type: 'string' },
    },
    strict: true,
  });
  return {
    days: parseInteger('days', values.days, 1, MAX_DAYS),
    seed: parseInteger('seed', values.seed, 0, MAX_SEED),
    profile: values.profile ?? null,
  };
}

function minutes(ms: number | null): string {
  return ms === null ? 'never' : `${(ms / MINUTE_MS).toFixed(1)} min`;
}

function pad(value: string | number, width: number): string {
  return String(value).padStart(width);
}

function describeProfile(profile: Profiles.Profile): string {
  const sessions = profile.sessions
    .map((session) => `${String(session.startHour)}h ${String(session.minutes)} min`)
    .join(', ');
  const first =
    profile.firstSessionMinutes === null
      ? ''
      : `, first session ${String(profile.firstSessionMinutes)} min`;
  return `${sessions}${first}`;
}

function formatReport(report: EconomyRun.ProfileReport, profile: Profiles.Profile): string[] {
  const met = report.speciesMet
    .map((entry) => `${entry.speciesId} ${minutes(entry.playMs)}`)
    .join(', ');
  const first = report.atFirstSession;
  const lines = [
    '',
    `== ${report.profile} (${describeProfile(profile)}) ==`,
    `  species met         ${met}`,
    `  all species         ${minutes(report.allSpeciesPlayMs)} of play`,
    `  welcome banner done ${minutes(report.welcomeDonePlayMs)} of play`,
    `  after 15 min        ${first === null ? 'never played that long' : `level ${String(first.level)}, ${String(first.species)} species`}`,
    `  blocked             ${report.blocked ?? 'no'}`,
    `  longest stretch without novelty: ${String(report.longestDaysWithoutNovelty)} day(s)`,
    '  day  play min  tickets  visitor coins  upkeep    coins  level  stars  species',
  ];
  for (const day of report.days) {
    lines.push(
      `  ${pad(day.day + 1, 3)}  ${pad((day.playMs / MINUTE_MS).toFixed(0), 8)}  ${pad(day.ticketsEarned, 7)}` +
        `  ${pad(day.visitorCoins, 13)}  ${pad(day.upkeepCoins, 6)}  ${pad(day.coinsAtEnd, 7)}` +
        `  ${pad(day.parkLevel, 5)}  ${pad(day.parkStars, 5)}  ${pad(day.speciesOwned, 7)}`,
    );
  }
  return lines;
}

async function main(): Promise<void> {
  const options = readOptions();
  const runner = { configFile: false, logLevel: 'silent' } as const;
  const { module: gameData } = await runnerImport<typeof Data>(DATA_ENTRY, runner);
  const { module: economy } = await runnerImport<typeof EconomyRun>(RUN_ENTRY, runner);
  const { module: profiles } = await runnerImport<typeof Profiles>(PROFILES_ENTRY, runner);
  const { module: target } = await runnerImport<typeof Target>(TARGET_ENTRY, runner);
  const loaded = gameData.loadGameContent();
  if (!loaded.ok) {
    throw new Error(gameData.formatDataErrors(loaded.error));
  }
  const chosen = profiles.PROFILE_IDS.filter(
    (id) => options.profile === null || id === options.profile,
  );
  if (chosen.length === 0) {
    throw new RangeError(
      `--profile must be one of ${profiles.PROFILE_IDS.join(', ')}, got "${String(options.profile)}".`,
    );
  }

  const startedAt = performance.now();
  const lines = [
    'Zoo Refuge economy simulator',
    `  seed ${String(options.seed)}, ${String(options.days)} day(s)`,
    `  target: ${target.TARGET_DESCRIPTION}`,
  ];
  let failures: string[] = [];
  for (const id of chosen) {
    const profile = profiles.PROFILES[id];
    const report = economy.runProfile(profile, options.days, options.seed, loaded.value);
    lines.push(...formatReport(report, profile));
    failures = [...failures, ...target.checkTarget(report)];
  }
  lines.push(
    '',
    failures.length === 0 ? 'Target met.' : `Target missed:\n  ${failures.join('\n  ')}`,
    `Compute time ${(performance.now() - startedAt).toFixed(0)} ms`,
  );
  process.stdout.write(`${lines.join('\n')}\n`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
