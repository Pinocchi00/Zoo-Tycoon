import type { fr } from './fr';

/** Every text key of the game, taken from the reference language. */
export type TranslationKey = keyof typeof fr;

/** A complete language: exactly the reference keys, no more, no fewer. */
export type Messages = Readonly<Record<TranslationKey, string>>;
