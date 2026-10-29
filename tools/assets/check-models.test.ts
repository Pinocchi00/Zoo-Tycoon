import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { checkModels } from './check-models';
import { makeGlb, makeModelJson, VALID_DESCRIPTION } from './fixtures';
import { readGlbJson } from './glb';
import { speciesDescriptionSchema } from './species';

const DESCRIPTION = JSON.stringify(VALID_DESCRIPTION);

function check(model: Uint8Array, description = DESCRIPTION): readonly string[] {
  const [report] = checkModels(
    [{ id: 'capybara', content: model }],
    [{ id: 'capybara', content: description }],
  );
  return report?.problems ?? ['no report'];
}

describe('readGlbJson', () => {
  it('reads the JSON chunk back', () => {
    expect(readGlbJson(makeGlb({ asset: { version: '2.0' } }))).toEqual({
      ok: true,
      value: { asset: { version: '2.0' } },
    });
  });

  it('refuses damaged containers with a typed error', () => {
    const good = makeGlb({ asset: { version: '2.0' } });
    expect(readGlbJson(good.subarray(0, 10))).toEqual({
      ok: false,
      error: { kind: 'tooShort', bytes: 10 },
    });
    expect(readGlbJson(good.subarray(0, good.byteLength - 4)).ok).toBe(false);

    const badMagic = good.slice();
    badMagic[0] = 0;
    expect(readGlbJson(badMagic)).toEqual({ ok: false, error: { kind: 'badMagic' } });

    const badVersion = good.slice();
    new DataView(badVersion.buffer).setUint32(4, 1, true);
    expect(readGlbJson(badVersion)).toEqual({
      ok: false,
      error: { kind: 'badVersion', version: 1 },
    });

    const badChunk = good.slice();
    new DataView(badChunk.buffer).setUint32(16, 0, true);
    expect(readGlbJson(badChunk)).toEqual({ ok: false, error: { kind: 'missingJsonChunk' } });

    const badJson = good.slice();
    badJson[20] = 0x7d; // "}" where "{" was
    const result = readGlbJson(badJson);
    expect(result.ok ? 'ok' : result.error.kind).toBe('badJson');
  });
});

describe('checkModels', () => {
  it('accepts a valid model', () => {
    expect(check(makeGlb(makeModelJson()))).toEqual([]);
  });

  it('refuses a model that is too heavy (proof of the brief)', () => {
    expect(check(makeGlb(makeModelJson({ triangles: 12000 })))).toEqual([
      '12000 triangles, outside the budget of 1500 to 4000',
    ]);
  });

  it('refuses a model without idle (proof of the brief)', () => {
    expect(check(makeGlb(makeModelJson({ animations: ['walk'] })))).toEqual([
      'mandatory animation "idle" is missing',
    ]);
  });

  it('refuses truncated files, invalid glTF and invalid descriptions', () => {
    const good = makeGlb(makeModelJson());
    expect(check(good.subarray(0, good.byteLength - 8))[0]).toContain('truncated');
    expect(check(makeGlb({ nodes: 'oops' }))[0]).toContain('glTF structure is invalid');
    expect(check(good, '{ not json')[0]).toContain('not valid JSON');
    expect(check(good, JSON.stringify({ ...VALID_DESCRIPTION, lengthM: -1 }))[0]).toContain(
      'species description is invalid',
    );
  });

  it('pairs models and descriptions by id, both ways', () => {
    const reports = checkModels(
      [{ id: 'zebra', content: makeGlb(makeModelJson()) }],
      [{ id: 'capybara', content: DESCRIPTION }],
    );
    expect(reports.map((report) => [report.id, report.problems.length])).toEqual([
      ['capybara', 1],
      ['zebra', 1],
    ]);
    expect(reports[0]?.problems[0]).toContain('no exported model');
    expect(reports[1]?.problems[0]).toContain('no species description');
  });
});

describe('species descriptions', () => {
  it('the capybara description is valid', () => {
    const text = readFileSync(new URL('../blender/species/capybara.json', import.meta.url), 'utf8');
    const parsed = speciesDescriptionSchema.safeParse(JSON.parse(text));
    expect(parsed.success ? 'valid' : parsed.error.message).toBe('valid');
  });

  it('refuses a typo in a field name', () => {
    const typo = { ...VALID_DESCRIPTION, lenghtM: 1.1 };
    expect(speciesDescriptionSchema.safeParse(typo).success).toBe(false);
  });

  it('the committed capybara model passes the asset rules', () => {
    const model = new Uint8Array(
      readFileSync(new URL('../../assets/models/capybara.glb', import.meta.url)),
    );
    const text = readFileSync(new URL('../blender/species/capybara.json', import.meta.url), 'utf8');
    expect(check(model, text)).toEqual([]);
  });
});
