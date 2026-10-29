/** Success branch of a {@link Result}. */
export interface Ok<T> {
  readonly ok: true;
  readonly value: T;
}

/** Failure branch of a {@link Result}. */
export interface Err<E> {
  readonly ok: false;
  readonly error: E;
}

/** Outcome of an operation that can fail in an expected way. Never throw for these. */
export type Result<T, E> = Ok<T> | Err<E>;

export function ok<T>(value: T): Ok<T> {
  return { ok: true, value };
}

export function err<E>(error: E): Err<E> {
  return { ok: false, error };
}
