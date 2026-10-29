import { describe, expect, expectTypeOf, it } from 'vitest';
import { err, ok, type Result } from './result';

function parsePositive(value: number): Result<number, 'notPositive'> {
  return value > 0 ? ok(value) : err('notPositive');
}

describe('Result', () => {
  it('wraps a success value', () => {
    expect(ok(42)).toEqual({ ok: true, value: 42 });
  });

  it('wraps an error value', () => {
    expect(err('boom')).toEqual({ ok: false, error: 'boom' });
  });

  it('narrows on the ok flag', () => {
    const success = parsePositive(3);
    const failure = parsePositive(-1);

    expect(success.ok && success.value).toBe(3);
    expect(!failure.ok && failure.error).toBe('notPositive');
  });

  it('keeps the value and error types', () => {
    const result = parsePositive(1);
    if (result.ok) {
      expectTypeOf(result.value).toEqualTypeOf<number>();
    } else {
      expectTypeOf(result.error).toEqualTypeOf<'notPositive'>();
    }
  });
});
