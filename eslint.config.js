import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'prototype/**',
      'dist/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'node_modules/**',
      '.worktrees/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    // TECH_SPEC §2: src/core is pure logic — no three.js, no render/game imports.
    files: ['src/core/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/core must not depend on three.js (TECH_SPEC §2)' },
            { group: ['**/render/**', '**/game/**'], message: 'src/core must not import render/game (TECH_SPEC §2)' },
          ],
        },
      ],
    },
  },
);
