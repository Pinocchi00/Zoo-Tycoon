// Checks every exported model against the asset rules.
// Usage: npm run assets:check [-- --models <dir> --species <dir>]
import { readdirSync, readFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { runnerImport } from 'vite';
import type * as Check from './check-models';
import type * as VisitorCheck from './check-visitors';

const CHECK_ENTRY = fileURLToPath(new URL('./check-models.ts', import.meta.url));
const DEFAULT_MODELS_DIR = fileURLToPath(new URL('../../assets/models', import.meta.url));
const DEFAULT_SPECIES_DIR = fileURLToPath(new URL('../blender/species', import.meta.url));
const VISITOR_CHECK_ENTRY = fileURLToPath(new URL('./check-visitors.ts', import.meta.url));
const DEFAULT_VISITOR_MODELS_DIR = fileURLToPath(
  new URL('../../assets/models/visitors', import.meta.url),
);
const DEFAULT_VISITOR_DESCRIPTIONS_DIR = fileURLToPath(
  new URL('../blender/visitors/descriptions', import.meta.url),
);

function filesWithExtension(dir: string, extension: string): string[] {
  return readdirSync(dir)
    .filter((file) => extname(file) === extension)
    .sort();
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      models: { type: 'string' },
      species: { type: 'string' },
      visitors: { type: 'boolean', default: false },
      'visitor-models': { type: 'string' },
      'visitor-descriptions': { type: 'string' },
    },
    strict: true,
  });
  const modelsDir = values.models ?? DEFAULT_MODELS_DIR;
  const speciesDir = values.species ?? DEFAULT_SPECIES_DIR;
  const customAnimals = values.models !== undefined || values.species !== undefined;
  const includeAnimals = !values.visitors;
  const includeVisitors = values.visitors || !customAnimals;
  const models = includeAnimals
    ? filesWithExtension(modelsDir, '.glb').map((file) => ({
        id: basename(file, '.glb'),
        content: new Uint8Array(readFileSync(join(modelsDir, file))),
      }))
    : [];
  const descriptions = includeAnimals
    ? filesWithExtension(speciesDir, '.json').map((file) => ({
        id: basename(file, '.json'),
        content: readFileSync(join(speciesDir, file), 'utf8'),
      }))
    : [];
  if (includeAnimals && models.length === 0) {
    throw new Error(`No .glb model found in ${modelsDir}.`);
  }

  const { module: check } = await runnerImport<typeof Check>(CHECK_ENTRY, {
    configFile: false,
    logLevel: 'silent',
  });
  const reports = [...check.checkModels(models, descriptions)];
  if (includeVisitors) {
    const visitorModelsDir = values['visitor-models'] ?? DEFAULT_VISITOR_MODELS_DIR;
    const visitorDescriptionsDir =
      values['visitor-descriptions'] ?? DEFAULT_VISITOR_DESCRIPTIONS_DIR;
    const visitorModels = filesWithExtension(visitorModelsDir, '.glb').map((file) => ({
      id: basename(file, '.glb'),
      content: new Uint8Array(readFileSync(join(visitorModelsDir, file))),
    }));
    const visitorDescriptions = filesWithExtension(visitorDescriptionsDir, '.json').map((file) => ({
      id: basename(file, '.json'),
      content: readFileSync(join(visitorDescriptionsDir, file), 'utf8'),
    }));
    if (visitorModels.length === 0)
      throw new Error(`No visitor .glb model found in ${visitorModelsDir}.`);
    const { module: visitorCheck } = await runnerImport<typeof VisitorCheck>(VISITOR_CHECK_ENTRY, {
      configFile: false,
      logLevel: 'silent',
    });
    reports.push(...visitorCheck.checkVisitorCatalogue(visitorModels, visitorDescriptions));
  }
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
