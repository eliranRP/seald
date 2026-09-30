// `as unknown as` is the only syntax ban today. Sealing turns that
// selector off and keeps every other selector in `syntaxBans`, so a
// ban added later is still enforced under src/sealing. The MCP
// override sets `no-restricted-syntax` itself (import() and
// createRequire), which replaces this list, so it spreads
// `syntaxBans` again.
const asUnknownAsBan = {
  selector:
    "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
  message:
    'Do not use `as unknown as`. Narrow the value, or use a single assertion when the types already overlap.',
};
const syntaxBans = [asUnknownAsBan];

// Rule S.5. An override replaces the whole `no-restricted-imports`
// config, so the MCP override repeats this ban. The allowlist's own
// message does not mention extractSignature; the named-import ban is
// what a mutation of this entry must fail.
const signpdfExtractSignatureBan = {
  name: '@signpdf/utils',
  importNames: ['extractSignature'],
  message:
    'Do not use extractSignature from @signpdf/utils — it strips trailing 0x00 bytes. Use extractContents() in pades-verify-helpers.ts.',
};

// import() is banned outright: a literal path can be a static import,
// and a template or variable path cannot be checked. createRequire is
// the same hole. `callee.callee` is `createRequire(id)(specifier)`.
// `callee.property` is `module.createRequire`. A non-literal require()
// is banned here too; a string require() goes through the allowlist.
const mcpSyntaxBans = [
  ...syntaxBans,
  {
    selector: 'ImportExpression',
    message:
      'The MCP module does not use import(). Call an application service through a static import.',
  },
  {
    selector: "CallExpression[callee.name='createRequire']",
    message: 'The MCP module does not use createRequire.',
  },
  {
    selector: "CallExpression[callee.callee.name='createRequire']",
    message: 'The MCP module does not use createRequire.',
  },
  {
    selector: "CallExpression[callee.property.name='createRequire']",
    message: 'The MCP module does not use createRequire.',
  },
  {
    selector: "CallExpression[callee.name='require'][arguments.0.type!='Literal']",
    message: 'The MCP module does not use a dynamic require().',
  },
];

// A severity-only override inherits the parent selectors. When sealing
// has no bans of its own, a selector that matches nothing is what
// drops the cast without turning the whole rule off.
function syntaxRule(bans) {
  if (bans.length === 0) {
    return ['error', { selector: ':not(*)', message: 'No syntax bans in this override.' }];
  }
  return ['error', ...bans];
}

module.exports = {
  root: true,
  env: { node: true, jest: true, es2022: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', '@eslint-community/eslint-comments', 'seald'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'prettier',
  ],
  rules: {
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'warn',
    // Node.js best-practices skill, rule 2.3 — every promise must be awaited or
    // attached with .catch(); fire-and-forget loses errors and crashes the process
    // via unhandledRejection. Allow IIFE void expressions only via `void`.
    '@typescript-eslint/no-floating-promises': ['error', { ignoreVoid: true }],
    // Rule 2.1 — never `throw 'string'` / `throw { code: 1 }`; preserves stack traces.
    // typescript-eslint v8 renamed `no-throw-literal` → `only-throw-error`.
    '@typescript-eslint/only-throw-error': 'error',
    // Rule 8.1 — Pino + Nest Logger only; raw console.log loses correlation ids
    // and pollutes structured-log pipelines. Scripts opt out via override below.
    'no-console': 'error',
    '@eslint-community/eslint-comments/no-use': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    'no-nested-ternary': 'error',
    'no-restricted-syntax': ['error', ...syntaxBans],
    'no-restricted-imports': [
      'error',
      {
        paths: [signpdfExtractSignatureBan],
      },
    ],
  },
  overrides: [
    {
      // CLIs + smoke scripts run interactively; console output is the contract.
      // Specs still use double-casts for test doubles (testing cycle).
      files: ['scripts/**/*.{ts,js,mjs,cjs}', 'test/**/*.{ts,js}', '**/*.spec.ts', '**/__tests__/**'],
      rules: {
        'no-console': 'off',
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-nested-ternary': 'off',
        'no-restricted-syntax': 'off',
      },
    },
    {
      // Throws a non-Error string so MeService.exportAll hits its String(err) fallback.
      files: ['src/me/__tests__/me.service.extra.spec.ts'],
      rules: { '@typescript-eslint/only-throw-error': 'off' },
    },
    {
      // Forge ASN.1 readers. Time box: clear by 2026-12-31 without changing
      // CMS bytes. 46 non-null assertions and 13 `as unknown as` in
      // production files under src/sealing. Only the cast selector is
      // exempt; other no-restricted-syntax selectors stay on.
      files: ['src/sealing/**/*.ts', 'src/sealing/**/*.tsx'],
      rules: {
        '@typescript-eslint/no-non-null-assertion': 'off',
        'no-restricted-syntax': syntaxRule(syntaxBans.filter((ban) => ban !== asUnknownAsBan)),
      },
    },
    {
      // Production MCP files. Specs are the only exemption: a helper
      // under __tests__ is still production code if a tool imports it.
      // `no-restricted-syntax` and `no-restricted-imports` replace the
      // parent rules, so the global bans are repeated here.
      files: ['src/mcp/**/*.ts'],
      excludedFiles: ['src/mcp/**/*.spec.ts'],
      rules: {
        'seald/mcp-import-allowlist': 'error',
        'no-restricted-imports': ['error', { paths: [signpdfExtractSignatureBan] }],
        'no-restricted-syntax': syntaxRule(mcpSyntaxBans),
      },
    },
    {
      // Repo-wide. Importing a repository from a service is normal.
      // Re-exporting it would let src/mcp reach the repository through
      // a *.service.ts name. Wrappers that are not re-exports are review.
      files: ['src/**/*.service.ts'],
      rules: {
        'seald/no-service-repository-reexport': 'error',
      },
    },
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.config.ts', 'jest.config.ts'],
};
