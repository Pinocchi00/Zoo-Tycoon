import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  animalId,
  enclosureId,
  itemId,
  speciesId,
  type EnclosureId,
  type SpeciesId,
} from './brand';

describe('typed identifiers', () => {
  it.each([
    ['speciesId', speciesId],
    ['animalId', animalId],
    ['enclosureId', enclosureId],
    ['itemId', itemId],
  ])('%s accepts a valid id and keeps its text', (_name, make) => {
    expect(make('capybara_01')).toEqual({ ok: true, value: 'capybara_01' });
  });

  it('rejects an empty id', () => {
    expect(speciesId('')).toEqual({ ok: false, error: 'emptyId' });
  });

  it.each(['Capybara', 'red panda', 'émeu', 'a/b'])('rejects invalid characters in %j', (raw) => {
    expect(speciesId(raw)).toEqual({ ok: false, error: 'invalidIdCharacters' });
  });

  it('produces distinct, non-interchangeable types', () => {
    const result = speciesId('capybara');
    if (!result.ok) {
      throw new Error('expected a valid id');
    }
    expectTypeOf(result.value).toEqualTypeOf<SpeciesId>();
    expectTypeOf(result.value).not.toEqualTypeOf<EnclosureId>();
    expectTypeOf<string>().not.toExtend<SpeciesId>();
  });
});
