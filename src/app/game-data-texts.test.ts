import { describe, expect, it } from 'vitest';
import { GAME_CONTENT } from '@/data';
import { fr } from '@/i18n/fr';

/** Every string stored under a `…Key` property, wherever it sits in the content. */
function collectTextKeys(value: unknown, found: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectTextKeys(item, found);
    }
  } else if (typeof value === 'object' && value !== null) {
    for (const [name, child] of Object.entries(value)) {
      if (name.endsWith('Key') && typeof child === 'string') {
        found.push(child);
      } else {
        collectTextKeys(child, found);
      }
    }
  }
  return found;
}

// Only app knows both data and i18n, so the run-time check of the text keys lives here.
describe('game data texts', () => {
  it('only uses text keys that exist in the catalogs', () => {
    const keys = collectTextKeys(GAME_CONTENT);
    expect(keys.length).toBeGreaterThan(0);
    const known = new Set(Object.keys(fr));
    expect(keys.filter((key) => !known.has(key))).toEqual([]);
  });
});
