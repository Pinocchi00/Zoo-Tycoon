// Renders the silhouette sheet of every exported model with Blender, headless.
// Usage: npm run models:silhouettes  (set BLENDER_PATH if blender is not on the PATH)
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const BLENDER_DIR = fileURLToPath(new URL('.', import.meta.url));
const MODELS_DIR = fileURLToPath(new URL('../../assets/models/', import.meta.url));
const SHEET_FILE = fileURLToPath(new URL('../../docs/silhouettes.png', import.meta.url));
const SILHOUETTES_SCRIPT = join(BLENDER_DIR, 'silhouettes.py');

function blenderExecutable(): string {
  const fromEnv = process.env['BLENDER_PATH'];
  return fromEnv !== undefined && fromEnv !== '' ? fromEnv : 'blender';
}

function main(): void {
  const blender = blenderExecutable();
  const result = spawnSync(
    blender,
    [
      '--background',
      '--factory-startup',
      '--python-exit-code',
      '1',
      '--python',
      SILHOUETTES_SCRIPT,
      '--',
      '--models',
      MODELS_DIR,
      '--out',
      SHEET_FILE,
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
    throw new Error(`Blender failed while rendering the silhouettes:\n${result.stdout}`);
  }
}

try {
  main();
} catch (error: unknown) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
