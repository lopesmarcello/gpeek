import tsParser from '@typescript-eslint/parser';
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      'test-results/**',
      'playwright-report/**',
      '.agents/**',
      '.aws/**',
      '.codex/**',
      '.git/**',
    ],
  },
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 'latest',
      sourceType: 'module',
    },
    rules: {
      'no-debugger': 'error',
      'no-constant-condition': 'error',
      eqeqeq: ['error', 'always'],
    },
  },
];
