import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'vscode-extension/**', 'src/sandbox/sandbox-runner.js', 'scripts/**', 'docs/**', '*.bench.ts'],
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
      // Off: too many false positives with interface implementations (Gateway/CircuitBreaker/tool defs)
      // that require async for interface compliance even when no await needed
      '@typescript-eslint/require-await': 'off',
      'no-console': 'off',
      'prefer-const': 'error',
      'no-var': 'error',
      'eqeqeq': ['error', 'always'],
    },
  },
);
