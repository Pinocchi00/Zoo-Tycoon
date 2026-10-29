// Checks every exported model against the asset rules.
// Usage: npm run assets:check [-- --models <dir> --species <dir>]
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runnerImport } from 'vite';
import type * as Check from './check-models';

const CHECK_ENTRY = fileURLToPath(new URL('./check-models.ts', import.meta.url));
const DEFAULT_MODELS_DIR = fileURLToPath(new URL('../../assets/models', import.meta.url));
const DEFAULT_SPECIES_DIR = fileURLToPath(new URL('../blender/species', import.meta.url));

function filesWithExtension(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((file) => extname(file) === extension)
    .sort();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      models: { type: 'string', default: DEFAULT_MODELS_DIR },
      species: { type: 'string', default: DEFAULT_SPECIES_DIR },
    },
    strict: true,
  });
  const models = filesWithExtension(values.models, '.glb').map((file) => ({
    id: basename(file, '.glb'),
    content: new Uint8Array(readFileSync(join(values.models, file))),
  }));
  const descriptions = filesWithExtension(values.species, '.json').map((file) => ({
    id: basename(file, '.json'),
    content: readFileSync(join(values.species, file), 'utf8'),
  }));
  if (models.length === 0) {
    throw new Error(`No .glb model found in ${values.models}.`);
  }

  const { module: check } = await runnerImport<typeof Check>(CHECK_ENTRY, {
    configFile: false,
    logLevel: 'silent',
  });
  const reports = check.checkModels(models, descriptions);
  const lines: string[] = [];
  for (const report of reports) {
    if (report.problems.length === 0) {
      lines.push(`  ok      ${report.id}`);
    } else {
      lines.push(
        `  REFUSED ${report.id}`,
        ...report.problems.map((problem) => `          - ${problem}`),
      );
    }
  }
  const refused = reports.filter((report) => report.problems.length > 0).length;
  lines.push(`${String(reports.length - refused)} accepted, ${String(refused)} refused`);
  process.stdout.write(`Asset check\n${lines.join('\n')}\n`);
  if (refused > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
