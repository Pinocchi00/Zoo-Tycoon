import { expect } from 'vitest';
import type { TextStore } from './text-store';

/** The contract every backend must honour. */
export async function checkTextStore(store: TextStore): Promise<void> {
  expect(await store.get('missing')).toBeNull();
  await store.set('a', 'first');
  await store.set('b', 'second');
  await store.set('a', 'replaced');
  expect(await store.get('a')).toBe('replaced');
  expect((await store.keys()).sort()).toEqual(['a', 'b']);
  await store.remove('a');
  await store.remove('never-written');
  expect(await store.get('a')).toBeNull();
  expect(await store.keys()).toEqual(['b']);
}
