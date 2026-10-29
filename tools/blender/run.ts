// Generates every species model with Blender, headless.
// Usage: npm run models  (set BLENDER_PATH if blender is not on the PATH)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLENDER_DIR = fileURLToPath(new URL('.', import.meta.url));
const SPECIES_DIR = join(BLENDER_DIR, 'species');
const MODELS_DIR = fileURLToPath(new URL('../../assets/models/', import.meta.url));
const BUILD_SCRIPT = join(BLENDER_DIR, 'build.py');

function blenderExecutable(): string {
  const fromEnv = process.env['BLENDER_PATH'];
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : 'blender';
}

function buildSpecies(blender: string, descriptionFile: string): void {
  const id = basename(descriptionFile, '.json');
  const result = spawnSync(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      BUILD_SCRIPT,
      '--',
      '--species',
      join(SPECIES_DIR, descriptionFile),
      '--out',
      join(MODELS_DIR, `${id}.glb`),
    ],
    { stdio: ['ignore', 'pipe', 'inherit'], encoding: 'utf8' },
  );
  if (result.error !== undefined) {
    throw new Error(
      `Could not start Blender ("${blender}"): ${result.error.message}. Set BLENDER_PATH, see docs/blender.md.`,
    );
  }
  for (const line of result.stdout.split('\n')) {
    if (line.startsWith('[zoo-refuge]')) {
      process.stdout.write(`${line}\n`);
    }
  }
  if (result.status !== 0) {
    throw new Error(`Blender failed on ${descriptionFile}:\n${result.stdout}`);
  }
}

function main(): void {
  const blender = blenderExecutable();
  const descriptions = readdirSync(SPECIES_DIR)
    .filter((file) => file.endsWith('.json'))
    .sort();
  for (const file of descriptions) {
    buildSpecies(blender, file);
  }
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
