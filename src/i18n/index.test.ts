import { describe, expect, it } from 'vitest';
import { en } from './en';
import { fr } from './fr';
import { DEFAULT_LOCALE, LOCALES, t } from './index';

describe('t', () => {
  it('uses French by default', () => {
    expect(DEFAULT_LOCALE).toBe('fr');
    expect(t('app.loading')).toBe(fr['app.loading']);
  });

  it('returns the text of the requested language', () => {
    expect(t('app.loading', 'en')).toBe(en['app.loading']);
  });
});

describe('catalogs', () => {
  it('have exactly the same keys in every language', () => {
    const referenceKeys = Object.keys(fr).sort();
    expect(Object.keys(en).sort()).toEqual(referenceKeys);
  });

  it.each([
    ['fr', fr],
    ['en', en],
  ])('%s has no empty text', (_locale, catalog) => {
    for (const text of Object.values(catalog)) {
      expect(text.trim()).not.toBe('');
    }
  });

  it('lists every supported language', () => {
    expect(LOCALES).toEqual(['fr', 'en']);
  });
});
