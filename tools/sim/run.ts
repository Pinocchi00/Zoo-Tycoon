// Economy simulator: plays the pure simulation for N days without rendering.
// Usage: npm run sim -- --days 7 --seed 42
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runnerImport } from 'vite';
import type * as Data from '../../src/data/index';
import type * as Sim from '../../src/sim/index';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Time fed to advance() per call: large chunks keep the loop overhead negligible. */
const CHUNK_MS = 60 * 60 * 1000;
const MAX_DAYS = 3650;
const MAX_SEED = 0xffff_ffff;
const SIM_ENTRY = fileURLToPath(new URL('../../src/sim/index.ts', import.meta.url));
const DATA_ENTRY = fileURLToPath(new URL('../../src/data/index.ts', import.meta.url));

interface Options {
  readonly days: number;
  readonly seed: number;
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
    },
    strict: true,
  });
  return {
    days: parseInteger('days', values.days, 1, MAX_DAYS),
    seed: parseInteger('seed', values.seed, 0, MAX_SEED),
  };
}

async function main(): Promise<void> {
  const options = readOptions();
  const runner = { configFile: false, logLevel: 'silent' } as const;
  const { module: sim } = await runnerImport<typeof Sim>(SIM_ENTRY, runner);
  const { module: gameData } = await runnerImport<typeof Data>(DATA_ENTRY, runner);
  const loaded = gameData.loadGameContent();
  if (!loaded.ok) {
    throw new Error(gameData.formatDataErrors(loaded.error));
  }
  // No camera: every visitor runs at full rate (D-018, point 7).
  const context = sim.createSimContext(loaded.value);

  const startedAt = performance.now();
  const state = sim.createGameState(options.seed);
  const events = sim.createEventQueue();
  const totalMs = options.days * DAY_MS;
  let eventCount = 0;
  while (state.clock.timeMs < totalMs) {
    sim.advance(state, Math.min(CHUNK_MS, totalMs - state.clock.timeMs), context, events);
    eventCount += sim.drain(events).length;
  }
  const elapsedMs = performance.now() - startedAt;

  const simulatedHours = state.clock.timeMs / (60 * 60 * 1000);
  const lines = [
    'Zoo Refuge economy simulator',
    `  seed            ${String(options.seed)}`,
    `  simulated time  ${String(options.days)} days (${String(simulatedHours)} h)`,
    `  fixed steps     ${String(state.clock.timeMs / sim.STEP_MS)}`,
    `  events          ${String(eventCount)}`,
    `  coins           ${String(state.currencies.coins)}`,
    `  visitors        ${String(state.visitors.list.length)}`,
    `  compute time    ${elapsedMs.toFixed(0)} ms`,
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
