import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'vscode-extension/**', 'src/sandbox/sandbox-runner.js'],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        project: './tsconfig.eslint.json',
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/require-await': 'warn',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
    },
  },
);
