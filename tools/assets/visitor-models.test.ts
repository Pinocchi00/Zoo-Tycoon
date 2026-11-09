import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkVisitorCatalogue } from './check-visitors';

const MODELS = new URL('../../assets/models/visitors/', import.meta.url);
const DESCRIPTIONS = new URL('../blender/visitors/descriptions/', import.meta.url);

describe('exported visitor models', () => {
  it('validates every exported GLB and description and requires all five archetypes', () => {
    const models = readdirSync(MODELS)
      .filter((file) => file.endsWith('.glb'))
      .map((file) => ({
        id: file.slice(0, -'.glb'.length),
        content: new Uint8Array(readFileSync(new URL(file, MODELS))),
      }));
    const descriptions = readdirSync(DESCRIPTIONS)
      .filter((file) => file.endsWith('.json'))
      .map((file) => ({
        id: file.slice(0, -'.json'.length),
        content: readFileSync(new URL(file, DESCRIPTIONS), 'utf8'),
      }));
    const reports = checkVisitorCatalogue(models, descriptions);
    expect(reports).toHaveLength(5);
    expect(reports.filter((report) => report.problems.length > 0)).toEqual([]);
  });
});
