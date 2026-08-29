import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'public/**',
      '.fixtures-cache/**',
      // server/ belongs to impl-backend and carries its own tsconfig. It is
      // ignored here until they add their own `files: ['server/**/*.ts']`
      // block, so that a red frontend gate always means a frontend problem.
      'server/**',
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
    // This config file is not part of the TS project; type-aware rules cannot
    // apply to it.
    files: ['**/*.js'],
    extends: [tseslint.configs.disableTypeChecked],
  },
);
