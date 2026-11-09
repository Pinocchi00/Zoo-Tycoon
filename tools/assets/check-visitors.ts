import { describeGlbError, type ModelReport, type NamedFile } from './check-models';
import { gltfSchema, readGlbJson } from './glb';
import { checkVisitorModel, visitorDescriptionSchema, VISITOR_ARCHETYPES } from './visitor-rules';

function checkOne(id: string, bytes: Uint8Array, text: string): readonly string[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (error: unknown) {
    return [
      `visitor description is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    ];
  }
  const description = visitorDescriptionSchema.safeParse(json);
  if (!description.success) return [`visitor description is invalid: ${description.error.message}`];
  if (description.data.id !== id) return ['visitor file id does not match its description'];
  const raw = readGlbJson(bytes);
  if (!raw.ok) return [describeGlbError(raw.error)];
  const gltf = gltfSchema.safeParse(raw.value);
  if (!gltf.success) return [`visitor glTF structure is invalid: ${gltf.error.message}`];
  return checkVisitorModel(gltf.data, description.data);
}

/** Pairs visitor models and descriptions without applying any animal rules. */
export function checkVisitorModels(
  models: readonly NamedFile<Uint8Array>[],
  descriptions: readonly NamedFile<string>[],
): readonly ModelReport[] {
  const ids = new Set([...models, ...descriptions].map((file) => file.id));
  return [...ids].sort().map((id) => {
    const foundModels = models.filter((file) => file.id === id);
    const foundDescriptions = descriptions.filter((file) => file.id === id);
    const model = foundModels[0];
    const description = foundDescriptions[0];
    let problems: readonly string[];
    if (foundModels.length > 1 || foundDescriptions.length > 1) {
      problems = ['duplicate visitor model or description id'];
    } else if (model === undefined) {
      problems = ['visitor has a description but no exported model (run npm run models)'];
    } else if (description === undefined) {
      problems = [`no visitor description tools/blender/visitors/descriptions/${id}.json`];
    } else {
      problems = checkOne(id, model.content, description.content);
    }
    return { id, problems };
  });
}

/** The production catalogue must contain all five archetypes, even if both files are absent. */
export function checkVisitorCatalogue(
  models: readonly NamedFile<Uint8Array>[],
  descriptions: readonly NamedFile<string>[],
): readonly ModelReport[] {
  const reports = [...checkVisitorModels(models, descriptions)];
  for (const id of VISITOR_ARCHETYPES) {
    if (!reports.some((report) => report.id === id)) {
      reports.push({
        id,
        problems: ['visitor archetype has neither description nor exported model'],
      });
    }
  }
  return reports.sort((a, b) => a.id.localeCompare(b.id));
}
