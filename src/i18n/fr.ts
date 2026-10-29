/**
 * Reference language: every key defined here must exist in every other language,
 * otherwise `npm run typecheck` fails.
 */
export const fr = {
  'app.title': 'Zoo Refuge',
  'app.loading': 'Préparation du parc…',
  'dev.fpsUnit': 'i/s',
} as const satisfies Record<string, string>;
