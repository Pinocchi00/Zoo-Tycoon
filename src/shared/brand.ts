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

// The brand only exists at compile time, so this guard is the single, audited place
// where a plain value becomes branded (type assertions are banned everywhere).
function isBranded<T, B extends string>(_value: T): _value is Brand<T, B> {
  return true;
}

function brandId<B extends string>(raw: string): Result<Brand<string, B>, IdError> {
  if (raw.length === 0) {
    return err('emptyId');
  }
  if (!ID_PATTERN.test(raw)) {
    return err('invalidIdCharacters');
  }
  if (isBranded<string, B>(raw)) {
    return ok(raw);
  }
  throw new Error('unreachable: isBranded always narrows');
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
