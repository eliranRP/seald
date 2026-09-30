// `as unknown as` is the only syntax ban today. Sealing turns that
// selector off and keeps every other selector in `syntaxBans`, so a
// ban added later is still enforced under src/sealing.
const asUnknownAsBan = {
  selector:
    "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
  message:
    'Do not use `as unknown as`. Narrow the value, or use a single assertion when the types already overlap.',
};
const syntaxBans = [asUnknownAsBan];

// A severity-only override inherits the parent selectors. When sealing
// has no bans of its own, a selector that matches nothing is what
// drops the cast without turning the whole rule off.
function syntaxRule(bans) {
  if (bans.length === 0) {
    return ['error', { selector: ':not(*)', message: 'No syntax bans in this override.' }];
  }
  return ['error', ...bans];
}

// Rule S.5. Repeated in the transport and service overrides because an
// override replaces the whole `no-restricted-imports` config.
const signpdfExtractSignatureBan = {
  name: '@signpdf/utils',
  importNames: ['extractSignature'],
  message:
    'Do not use extractSignature from @signpdf/utils — it strips trailing 0x00 bytes. Use extractContents() in pades-verify-helpers.ts.',
};

// MCP design step 0. Transport (HTTP controllers and src/mcp) calls
// application services. It does not open repositories or the database.
// Services do not import controllers or the MCP module.
const transportDbMessage =
  'Controllers and the MCP module call application services. They do not import repositories or the database.';

const transportImportBan = [
  'error',
  {
    paths: [
      signpdfExtractSignatureBan,
      { name: 'pg', message: transportDbMessage },
      { name: 'kysely', message: transportDbMessage },
    ],
    patterns: [
      {
        group: [
          '**/*.repository',
          '**/*.repository.pg',
          '**/*.repository.ts',
          '**/*.repository.pg.ts',
          '**/db',
          '**/db/**',
        ],
        message: transportDbMessage,
      },
    ],
  },
];

const serviceTransportMessage =
  'Application services do not import HTTP controllers or the MCP transport.';

const serviceImportBan = [
  'error',
  {
    paths: [signpdfExtractSignatureBan],
    patterns: [
      {
        group: ['**/*.controller', '**/*.controller.ts', '**/mcp', '**/mcp/**'],
        message: serviceTransportMessage,
      },
    ],
  },
];

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
  plugins: ['@typescript-eslint', '@eslint-community/eslint-comments'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended', 'prettier'],
  rules: {
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
    ],
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
      files: [
        'scripts/**/*.{ts,js,mjs,cjs}',
        'test/**/*.{ts,js}',
        '**/*.spec.ts',
        '**/__tests__/**',
      ],
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
      // Last among service files so a future src/mcp/*.service.ts is
      // covered by the MCP override below, not this one.
      files: ['src/**/*.service.ts'],
      excludedFiles: ['src/mcp/**'],
      rules: {
        'no-restricted-imports': serviceImportBan,
      },
    },
    {
      files: ['src/**/*.controller.ts', 'src/mcp/**/*.ts'],
      rules: {
        'no-restricted-imports': transportImportBan,
      },
    },
    {
      // Step 0d: the MCP module is a transport. It calls services.
      // It does not call controllers, repositories, or the database.
      files: ['src/mcp/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            paths: transportImportBan[1].paths,
            patterns: [
              ...transportImportBan[1].patterns,
              {
                group: ['**/*.controller', '**/*.controller.ts'],
                message: 'The MCP module calls application services, not HTTP controllers.',
              },
            ],
          },
        ],
      },
    },
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.config.ts', 'jest.config.ts'],
};
