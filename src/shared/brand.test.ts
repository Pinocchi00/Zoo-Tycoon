import { describe, expect, expectTypeOf, it } from 'vitest';
import {
  animalId,
  archetypeId,
  bannerId,
  behaviorId,
  biomeId,
  buildingId,
  enclosureId,
  itemId,
  speciesId,
  type EnclosureId,
  type SpeciesId,
} from './brand';

const CONSTRUCTORS = [
  ['speciesId', speciesId],
  ['animalId', animalId],
  ['enclosureId', enclosureId],
  ['itemId', itemId],
  ['biomeId', biomeId],
  ['bannerId', bannerId],
  ['behaviorId', behaviorId],
  ['archetypeId', archetypeId],
  ['buildingId', buildingId],
] as const;

describe('typed identifiers', () => {
  it.each(CONSTRUCTORS)('%s accepts a valid id and keeps its text', (_name, make) => {
    expect(make('capybara_01')).toEqual({ ok: true, value: 'capybara_01' });
  });

  it.each(CONSTRUCTORS)('%s rejects an empty id', (_name, make) => {
    expect(make('')).toEqual({ ok: false, error: 'emptyId' });
  });

  it.each(CONSTRUCTORS)('%s rejects invalid characters', (_name, make) => {
    for (const raw of ['Capybara', 'red panda', 'émeu', 'a/b', ' capybara']) {
      expect(make(raw)).toEqual({ ok: false, error: 'invalidIdCharacters' });
    }
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
