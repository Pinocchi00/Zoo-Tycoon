import { err, ok, type Result } from './result';

declare const brandTag: unique symbol;

/**
 * A value of type `T` that the compiler refuses to mix up with another brand,
 * e.g. a `SpeciesId` can never be passed where an `EnclosureId` is expected.
 */
export type Brand<T, B extends string> = T & { readonly [brandTag]: B };

export type SpeciesId = Brand<string, 'SpeciesId'>;
export type AnimalId = Brand<string, 'AnimalId'>;
export type EnclosureId = Brand<string, 'EnclosureId'>;
export type ItemId = Brand<string, 'ItemId'>;

export type IdError = 'emptyId' | 'invalidIdCharacters';

/** Lowercase letters, digits, `-` and `_`: safe in save files, URLs and asset names. */
const ID_PATTERN = /^[a-z0-9_-]+$/;

// A type guard backed by a runtime check is the only way a plain string becomes branded:
// type assertions are banned, so no id can skip validation.
function isValidId<B extends string>(raw: string): raw is Brand<string, B> {
  return ID_PATTERN.test(raw);
}

function brandId<B extends string>(raw: string): Result<Brand<string, B>, IdError> {
  if (raw.length === 0) {
    return err('emptyId');
  }
  if (!isValidId<B>(raw)) {
    return err('invalidIdCharacters');
  }
  return ok(raw);
}

export function speciesId(raw: string): Result<SpeciesId, IdError> {
  return brandId<'SpeciesId'>(raw);
}

export function animalId(raw: string): Result<AnimalId, IdError> {
  return brandId<'AnimalId'>(raw);
}

export function enclosureId(raw: string): Result<EnclosureId, IdError> {
  return brandId<'EnclosureId'>(raw);
}

export function itemId(raw: string): Result<ItemId, IdError> {
  return brandId<'ItemId'>(raw);
}
