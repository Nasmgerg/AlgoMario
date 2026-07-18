import js from '@eslint/js';
import globals from 'globals';

const restrictedGlobals = [
  'window',
  'document',
  'navigator',
  'localStorage',
  'sessionStorage',
  'alert',
  'confirm',
  'prompt',
  'requestAnimationFrame',
  'cancelAnimationFrame',
].map((name) => ({
  name,
  message: 'core/, world/ és ai/ nem érheti el a DOM-ot (SPEC.md 9.1, CLAUDE.md architektúra szabály).',
}));

export default [
  js.configs.recommended,
  {
    ignores: ['dist/**', 'coverage/**'],
  },
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
  {
    // core/, world/ és ai/ Phaser- és DOM-független kell maradjon —
    // Node alatt, Phaser nélkül tesztelhető (CLAUDE.md architektúra szabály).
    files: ['src/core/**/*.js', 'src/world/**/*.js', 'src/ai/**/*.js'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['phaser', 'phaser/*'],
              message: 'core/, world/ és ai/ nem importálhat Phasert (SPEC.md 9.1).',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', ...restrictedGlobals],
    },
  },
];
