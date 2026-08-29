import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'public/**',
      '.fixtures-cache/**',
      'server/node_modules/**',
      'server/dist/**',
      'server/coverage/**',
      // A reading convenience concatenated from docs/api-contract.md, not a
      // compiled module (duplicate/merged declarations by design) — excluded
      // from tsconfig.json too. Regenerate with tools/extract-contract-types.py.
      'src/shared/contract/types-extrait.ts',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: { parserOptions: { projectService: true } },
    rules: {
      'no-console': 'error',
      'no-var': 'error',
      'prefer-const': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // fixtures/ and mocks/ are test scaffolding. Application code never imports
    // them; only tests do.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}', 'src/test/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/fixtures/**', '**/mocks/**'],
              message:
                'fixtures/ and mocks/ are test-only. Application code must not import them.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'fixtures/**/*.ts', 'mocks/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // `server/` is its own project — see the plan, D1. `projectService` finds
    // `server/tsconfig.json` on its own for every file under here, but this
    // block is what actually turns the rules on for the directory: without a
    // `server/**` entry somewhere, the ROOT tsconfig's `include` (src, mocks,
    // fixtures — never `server`) leaves these files outside any TS project,
    // and typescript-eslint reports them as unlinted rather than erroring.
    files: ['server/**/*.ts'],
    ignores: ['server/**/*.test.ts', 'server/**/*.itest.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/fixtures/**', '**/mocks/**'],
              message:
                'fixtures/ and mocks/ are test-only. Application code must not import them.',
            },
          ],
        },
      ],
    },
  },
  {
    // Integration/unit tests: fixtures ARE the point, and console is fine for
    // the CLI entry points' own diagnostics, but never inside test bodies.
    files: ['server/**/*.test.ts', 'server/**/*.itest.ts'],
    rules: { 'no-console': 'off' },
  },
  {
    // This config file is not part of the TS project; type-aware rules cannot
    // apply to it.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
