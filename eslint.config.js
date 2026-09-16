import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'node_modules/**', 'vscode-extension/**', 'src/sandbox/sandbox-runner.js', 'scripts/**', 'docs/**', '**/*.bench.ts'],
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
  // Library modules should route diagnostics through `logger`, not `console`.
  // CLI-facing code (commands/, ui/, index.ts, bridge entrypoints) is exempt —
  // there `console` *is* the user interface.
  {
    files: [
      'src/mcp/**/*.ts',
      'src/recovery/**/*.ts',
      'src/security/**/*.ts',
      'src/gateway/**/*.ts',
      'src/planner/**/*.ts',
      'src/tot/**/*.ts',
      'src/a2a/**/*.ts',
      'src/closed-loop/**/*.ts',
      'src/tracing/**/*.ts',
      'src/circuit-breaker/**/*.ts',
      'src/permission/**/*.ts',
      'src/sandbox/**/*.ts',
      'src/utils/**/*.ts',
    ],
    rules: {
      'no-console': 'warn',
    },
  },
  // logger itself, plus a handful of utilities that intentionally write straight
  // to the console (startup pre-flight, debug assertions, test helpers). These
  // must be listed *after* the rule above so they win.
  {
    files: [
      'src/utils/logger.ts',
      'src/utils/debug.ts',
      'src/utils/nodeVersionCheck.ts',
      'src/utils/testHelpers.ts',
    ],
    rules: {
      'no-console': 'off',
    },
  },
  // Tests may log freely.
  {
    files: ['**/*.test.ts'],
    rules: {
      'no-console': 'off',
    },
  },
);
