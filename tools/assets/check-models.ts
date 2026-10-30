// Pairs each exported model with its species description and lists every problem.
// Pure: the command line (validate.ts) does the file reading.
import { readGlbJson, gltfSchema, type GlbError } from './glb';
import { checkModel, describeIssue, type ModelExpectations } from './model-rules';
import { speciesDescriptionSchema } from './species';

export interface NamedFile<T> {
  /** File name without extension: the species id. */
  readonly id: string;
  readonly content: T;
}

export interface ModelReport {
  readonly id: string;
  readonly problems: readonly string[];
}

function describeGlbError(error: GlbError): string {
  switch (error.kind) {
    case 'tooShort':
      return `file is too short to be a .glb (${String(error.bytes)} bytes)`;
    case 'badMagic':
      return 'file does not start with the glTF signature';
    case 'badVersion':
      return `binary glTF version ${String(error.version)} is not 2`;
    case 'lengthMismatch':
      return `header says ${String(error.declared)} bytes, file has ${String(error.actual)} (truncated?)`;
    case 'missingJsonChunk':
      return 'the JSON chunk is missing or truncated';
    case 'badJson':
      return `the JSON chunk is not valid JSON: ${error.message}`;
  }
}

function readExpectations(text: string): ModelExpectations | string {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    return `species description is not valid JSON: ${error instanceof Error ? error.message : String(error)}`;
  }
  const parsed = speciesDescriptionSchema.safeParse(json);
  return parsed.success
    ? { lengthM: parsed.data.lengthM, signature: parsed.data.signature }
    : `species description is invalid: ${parsed.error.message}`;
}

function checkOne(model: Uint8Array, description: string): readonly string[] {
  const expectations = readExpectations(description);
  if (typeof expectations === 'string') {
    return [expectations];
  }
  const raw = readGlbJson(model);
  if (!raw.ok) {
    return [describeGlbError(raw.error)];
  }
  const gltf = gltfSchema.safeParse(raw.value);
  if (!gltf.success) {
    return [`glTF structure is invalid: ${gltf.error.message}`];
  }
  return checkModel(gltf.data, expectations).map(describeIssue);
}

/** One report per species id found on either side; an empty problem list means accepted. */
export function checkModels(
  models: readonly NamedFile<Uint8Array>[],
  descriptions: readonly NamedFile<string>[],
): readonly ModelReport[] {
  const byId = new Map(descriptions.map((file) => [file.id, file.content]));
  const reports: ModelReport[] = models.map((model) => {
    const description = byId.get(model.id);
    return {
      id: model.id,
      problems:
        description === undefined
          ? [`no species description tools/blender/species/${model.id}.json`]
          : checkOne(model.content, description),
    };
  });
  const modelIds = new Set(models.map((model) => model.id));
  for (const description of descriptions) {
    if (!modelIds.has(description.id)) {
      reports.push({
        id: description.id,
        problems: ['species has a description but no exported model (run npm run models)'],
      });
    }
  }
  return reports.sort((a, b) => a.id.localeCompare(b.id));
}
