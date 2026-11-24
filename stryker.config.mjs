/**
 * Mutation testing for the security-critical modules only.
 *
 * Line coverage tells you a line ran. It does not tell you the test would fail
 * if that line were wrong. This project has 2856 passing tests and 78%
 * statement coverage, yet the deleted `isPrivateIP` copies had drifted for
 * months while their tests passed — because the tests asserted the copy against
 * itself. Mutation testing is the measurement that catches that class of
 * problem, and it is cheap if you only point it at the code where being wrong
 * is a vulnerability.
 *
 * Scope is deliberately narrow: src/security and src/permission. Running it
 * across the whole repo would take hours and mostly tell us things we can
 * already infer from coverage.
 *
 * Usage:
 *   npm run mutation        full run
 *   npm run mutation:fast   only the SSRF + permission-decision operators
 */
export default {
  testRunner: 'vitest',
  vitest: {
    configFile: 'vitest.config.ts',
  },
  mutate: [
    'src/security/ssrf.ts',
    'src/security/SecurityPolicy.ts',
    'src/permission/index.ts',
    'src/tools/pathGuard.ts',
  ],
  reporters: ['clear-text', 'progress', 'html'],
  htmlReporter: { fileName: 'reports/mutation/index.html' },
  thresholds: {
    // Baselines measured on this codebase, not aspirational targets.
    // Keep a floor here so a change that guts a security test fails the build.
    high: 80,
    low: 60,
    break: 50,
  },
  timeoutMS: 20000,
  concurrency: 2,
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
