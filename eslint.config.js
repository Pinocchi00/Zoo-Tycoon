import js from '@eslint/js';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Folders that must stay pure: no engine, no UI, no platform, no ambient state. */
const PURE_FOLDERS = ['src/shared', 'src/data', 'src/sim', 'src/save'];

/** Folders that read the simulation but must not know each other. */
const PRESENTATION_FOLDERS = ['render', 'audio', 'ui'];

/**
 * Matches an import of a sibling `src` folder, through the `@/` alias or a relative path.
 * @param {readonly string[]} folders
 * @returns {string}
 */
function folderImportRegex(folders) {
  return `^(@/|(\\.\\./)+)(${folders.join('|')})(/|$)`;
}

const pureRestrictedImports = {
  patterns: [
    {
      regex: '^(three|preact)(/|$)',
      message: 'Pure layers (shared, data, sim, save) must not depend on three or preact.',
    },
    {
      regex: '^@capacitor/',
      message: 'Pure layers (shared, data, sim, save) must not depend on Capacitor.',
    },
    {
      regex: folderImportRegex(['render', 'audio', 'ui', 'platform', 'app']),
      message:
        'Pure layers (shared, data, sim, save) must not import render, audio, ui, platform or app.',
    },
  ],
};

const pureRestrictedGlobals = [
  { name: 'Date', message: 'Time comes from outside: pass it to advance(state, deltaMs).' },
  { name: 'performance', message: 'Time comes from outside: pass it to advance(state, deltaMs).' },
  { name: 'window', message: 'Pure layers must not touch the browser.' },
  { name: 'document', message: 'Pure layers must not touch the DOM.' },
  { name: 'localStorage', message: 'Storage belongs to src/platform.' },
  { name: 'sessionStorage', message: 'Storage belongs to src/platform.' },
  { name: 'indexedDB', message: 'Storage belongs to src/platform.' },
  { name: 'fetch', message: 'Pure layers must not use the network.' },
];

/** Rules that guard the architecture: they may never be disabled by a comment. */
const ARCHITECTURE_RULES = [
  '@typescript-eslint/no-restricted-imports',
  'no-restricted-globals',
  'no-restricted-properties',
  'no-console',
];

export default defineConfig(
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'assets/', 'playwright-report/'],
  },
  {
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  eslintComments.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/switch-exhaustiveness-check': [
        'error',
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: true },
      ],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      // Only `as const` is allowed: every other assertion lies to the compiler.
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'never' }],
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-expect-error': true,
          'ts-nocheck': true,
          'ts-check': false,
        },
      ],
      '@typescript-eslint/explicit-function-return-type': [
        'error',
        { allowExpressions: true, allowTypedFunctionExpressions: true },
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'all' },
      ],
      'no-console': 'error',
      eqeqeq: ['error', 'always'],
      '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
      '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
      '@eslint-community/eslint-comments/no-restricted-disable': ['error', ...ARCHITECTURE_RULES],
    },
  },
  {
    files: PURE_FOLDERS.map((folder) => `${folder}/**/*.ts`),
    rules: {
      '@typescript-eslint/no-restricted-imports': ['error', pureRestrictedImports],
      'no-restricted-globals': ['error', ...pureRestrictedGlobals],
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Use the seeded generator in src/sim/rng: the simulation must be deterministic.',
        },
      ],
    },
  },
  ...PRESENTATION_FOLDERS.map((folder) => ({
    files: [`src/${folder}/**/*.ts`, `src/${folder}/**/*.tsx`],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: folderImportRegex(PRESENTATION_FOLDERS.filter((other) => other !== folder)),
              message:
                'render, audio and ui must not import each other: talk through sim commands/events or app.',
            },
          ],
        },
      ],
    },
  })),
  {
    // The development logger is the only place allowed to write to the console.
    files: ['src/shared/logger.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['tools/**/*.ts', 'tests/**/*.ts', '*.config.ts', '*.config.js'],
    languageOptions: { globals: globals.node },
  },
  {
    // Plain JavaScript config files are outside the TypeScript projects.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
    rules: { '@typescript-eslint/explicit-function-return-type': 'off' },
  },
);
