// Generates every species and visitor model with Blender, headless.
// Usage:
//   npm run models                  # build species and visitors
//   npm run models -- --visitors    # build visitors only
//   npm run models -- --species     # build species only
// Set BLENDER_PATH if blender is not on the PATH.
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLENDER_DIR = fileURLToPath(new URL('.', import.meta.url));
const SPECIES_DIR = join(BLENDER_DIR, 'species');
const VISITORS_DIR = join(BLENDER_DIR, 'visitors', 'descriptions');
const MODELS_DIR = fileURLToPath(new URL('../../assets/models/', import.meta.url));
const SPECIES_BUILD_SCRIPT = join(BLENDER_DIR, 'build.py');
const VISITOR_BUILD_SCRIPT = join(BLENDER_DIR, 'visitors', 'build.py');

function blenderExecutable(): string {
  const fromEnv = process.env['BLENDER_PATH'];
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : 'blender';
}

function parseArgs(): { species: boolean; visitors: boolean } {
  const args = process.argv.slice(2);
  const species = args.includes('--species');
  const visitors = args.includes('--visitors');
  if (!species && !visitors) {
    return { species: true, visitors: true };
  }
  return { species, visitors };
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
      SPECIES_BUILD_SCRIPT,
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

function buildVisitor(blender: string, descriptionFile: string): void {
  const id = basename(descriptionFile, '.json');
  const outDir = join(MODELS_DIR, 'visitors');
  const result = spawnSync(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      VISITOR_BUILD_SCRIPT,
      '--',
      '--desc',
      join(VISITORS_DIR, descriptionFile),
      '--out',
      join(outDir, `${id}.glb`),
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
  const { species, visitors } = parseArgs();

  if (species) {
    const descriptions = readdirSync(SPECIES_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort();
    for (const file of descriptions) {
      buildSpecies(blender, file);
    }
  }

  if (visitors) {
    const descriptions = readdirSync(VISITORS_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort();
    for (const file of descriptions) {
      buildVisitor(blender, file);
    }
  }
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
