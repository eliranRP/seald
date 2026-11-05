import type { Config } from 'jest';

const config: Config = {
  // `tsx` added so the audit-pdf React-PDF renderer (audit-pdf.tsx) is
  // resolvable alongside the rest of the .ts codebase.
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.tsx?$',
  transform: {
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  // Packages under node_modules are not transformed. ESM-only ones
  // (@nestjs/* 12, @react-pdf/*, jose, kysely, @faker-js/faker and their
  // deps) load as native ES modules: Jest supports require(esm) on
  // Node >= 24.9 with --experimental-vm-modules, which the test scripts
  // pass. The old allowlist of packages to transpile to CommonJS could not
  // handle `import.meta.url` (used by @nestjs/common 12) and is gone.
  transformIgnorePatterns: ['/node_modules/'],
  collectCoverageFrom: ['src/**/*.(t|j)sx?'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
  // Rule 4.6 — reset mock state between tests so order/seed effects
  // can't leak across `it()` blocks.
  clearMocks: true,
  restoreMocks: true,
  // Rule 5.1 / 5.2 — coverage gate so the unit suite refuses to slip
  // below baseline. Numbers set just below current observed coverage so
  // the bar's enforceable today; ratchet up over time in dedicated PRs,
  // not as drive-by changes. (Bare `pnpm test` doesn't run coverage —
  // these only bite when `pnpm test --coverage` is run, e.g. nightly.)
  coverageThreshold: {
    global: {
      branches: 60,
      lines: 70,
      statements: 70,
      functions: 65,
    },
  },
  // Rule 12.4 — randomize test order inside a file to surface hidden
  // ordering dependencies before they bite in CI.
  randomize: true,
  // Real-Postgres tests. The unit runner has no database; the e2e
  // config picks these files up and CI provides Postgres.
  testPathIgnorePatterns: [
    '/node_modules/',
    'submit-signer.concurrency.e2e-spec.ts',
    'gdrive-token-erasure.pg.e2e-spec.ts',
  ],
};

export default config;
