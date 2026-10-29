import { en } from './en';
import { fr } from './fr';
import type { Messages, TranslationKey } from './messages';

export type { Messages, TranslationKey } from './messages';

export type Locale = 'fr' | 'en';

export const LOCALES: readonly Locale[] = ['fr', 'en'];

export const DEFAULT_LOCALE: Locale = 'fr';

const CATALOGS: Readonly<Record<Locale, Messages>> = { fr, en };

/** Text shown to the player for `key`, in `locale` (French by default). */
export function t(key: TranslationKey, locale: Locale = DEFAULT_LOCALE): string {
  return CATALOGS[locale][key];
}
