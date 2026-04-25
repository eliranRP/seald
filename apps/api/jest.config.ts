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
  transformIgnorePatterns: [
    'node_modules/(?!(?:\\.pnpm/)?(?:@react-pdf|yoga-layout|restructure|@babel/runtime|color-name|color-string|simple-swizzle|is-arrayish|hyphen|hyphenation|pdfkit|fontkit|emoji-regex|@pdf-lib))',
  ],
  collectCoverageFrom: ['src/**/*.(t|j)sx?'],
  coverageDirectory: 'coverage',
  testEnvironment: 'node',
};

export default config;
