import type { Config } from 'jest';

const config: Config = {
  // `tsx` added so the audit-pdf React-PDF renderer (audit-pdf.tsx) is
  // resolvable alongside the rest of the .ts codebase.
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '.*\\.spec\\.tsx?$',
  transform: {
    // yoga-layout (transitive dep of @react-pdf/renderer used by
    // audit-pdf.tsx) ships an ESM-only bundle that uses `import.meta.url`
    // and `export default`. ts-jest's CJS output can't handle either, so
    // we rewrite that single file with a tiny regex transformer before
    // ts-jest runs over the rest of the workspace. Order matters: the
    // first matching key wins, so the yoga rule must come before the
    // generic ts/js rule.
    'yoga-wasm-base64-esm\\.js$': '<rootDir>/test/yoga-import-meta-transformer.cjs',
    '^.+\\.(t|j)sx?$': 'ts-jest',
  },
  // The audit-pdf renderer pulls in a deep graph of ESM-only deps via
  // @react-pdf/* (color-name, color-string, restructure, yoga-layout,
  // pdfkit, fontkit, etc.). Letting jest skip transformation for all
  // of those crashes with `Cannot use import statement outside a
  // module`. List the ones the renderer actually touches; if a future
  // dep gets added, add it here too.
  //
  // `jose` (v6+) and `@faker-js/faker` (v10+) also ship pure-ESM
  // bundles — Jest's CJS transformer can't load them otherwise, so
  // they're whitelisted here too. Removing either entry will surface
  // as `SyntaxError: Unexpected token 'export'` in any spec that
  // imports it (jose: auth/JWT verification, faker: test factories).
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/)?(?:@react-pdf|yoga-layout|restructure|@babel/runtime|color-name|color-string|simple-swizzle|is-arrayish|hyphen|hyphenation|pdfkit|fontkit|emoji-regex|@pdf-lib|jose|@faker-js/faker))',
  ],
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
};

export default config;
