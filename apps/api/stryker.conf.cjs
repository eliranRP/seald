/**
 * Stryker Mutator config for the API package (rule 5.4).
 *
 * Scope: high-risk modules whose tests must catch logic regressions, not
 * just shape regressions. We deliberately keep coverage analysis at
 * `perTest` so a mutant only re-runs the spec(s) that touch its code —
 * the full suite is too slow for routine CI.
 *
 * Run locally with: `pnpm --filter api test:mutation`.
 */
/** @type {import('@stryker-mutator/api/core').PartialStrykerOptions} */
module.exports = {
  packageManager: 'pnpm',
  testRunner: 'jest',
  jest: {
    projectType: 'custom',
    configFile: 'jest.config.ts',
    enableFindRelatedTests: true,
  },
  coverageAnalysis: 'perTest',
  mutate: [
    'src/sealing/**/*.ts',
    'src/auth/**/*.ts',
    'src/signing/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.spec.tsx',
  ],
  mutator: {
    excludedMutations: [],
  },
  reporters: ['progress', 'clear-text', 'html'],
  thresholds: {
    high: 80,
    low: 60,
    break: 50,
  },
  // Stryker creates an isolated sandbox; declare the workspace-relative
  // files it needs so it doesn't try to copy node_modules.
  ignorePatterns: [
    'dist/',
    'coverage/',
    'reports/',
    'node_modules/',
    '.stryker-tmp/',
  ],
  tempDirName: '.stryker-tmp',
  cleanTempDir: true,
};
