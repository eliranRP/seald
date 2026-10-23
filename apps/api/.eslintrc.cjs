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

// Existing global import ban. Overrides replace `no-restricted-imports`
// options wholesale, so every override that sets the rule repeats this.
const signpdfPath = {
  name: '@signpdf/utils',
  importNames: ['extractSignature'],
  message:
    'Do not use extractSignature from @signpdf/utils — it strips trailing 0x00 bytes. Use extractContents() in pades-verify-helpers.ts.',
};

// MCP transport boundary (docs/design/mcp-server.md, step 0d). `src/mcp`
// reaches the application through `*.service.ts` and `shared` only. The
// patterns match imports that leave the directory (`../`); a specifier
// alone cannot tell `../registry` (inside mcp) from `../../envelopes/x`,
// so the strict "services only" rule is a deny-list of what is not one.
const mcpModulePattern = {
  group: ['../**/*.module'],
  message: 'src/mcp must not import Nest modules. Only src/mcp/*.module.ts wires them.',
};
const mcpDeniedPatterns = [
  {
    group: ['../**/*.repository', '../**/*.repository.*', '../**/db', '../**/db/**'],
    message: 'src/mcp must not touch repositories or the database. Call a *.service.ts instead.',
  },
  {
    group: ['../**/*.controller', '../**/*.guard', '../**/*.interceptor', '../**/*.http-errors'],
    message:
      'src/mcp must not import HTTP transport code (controllers, guards, HTTP error mapping).',
  },
  {
    // The one exception is the sender-side signing-order service behind
    // `PUT /envelopes/:id/signing-order` (WP-05), which the draft tools
    // call (WP-19). It sets the order on a draft; it does not sign.
    // WP-26 adds a second: the sender-side access-code settings service
    // behind `GET|PATCH /envelopes/:id/access-auth` (WP-10). It reads and
    // sets a draft's code requirement; the tools call only `getSettings` and
    // `patchSettings`, never the signer-side code methods.
    group: [
      '../**/signing/**',
      '!../**/signing/signing-order.service',
      // The directory is re-included first (an ignore-style pattern cannot
      // re-include a file under an excluded directory), then everything in
      // it but the one service is blocked again.
      '!../**/signing/access-auth',
      '../**/signing/access-auth/**',
      '!../**/signing/access-auth/access-auth.service',
      '../**/signing.service',
      '../**/signer-session.service',
      '../**/signer-session',
    ],
    message:
      'src/mcp must not import the signing module. Signing stays with the signer in a browser (docs/design/mcp-server.md).',
  },
];
const mcpDeniedPaths = [
  signpdfPath,
  { name: 'pg', message: 'src/mcp must not use the database driver. Call a *.service.ts instead.' },
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
        paths: [signpdfPath],
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
      // MCP boundary. Specs may import anything they need to build fixtures.
      files: ['src/mcp/**/*.ts'],
      excludedFiles: ['src/mcp/**/__tests__/**', 'src/mcp/**/*.spec.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: mcpDeniedPaths, patterns: [mcpModulePattern, ...mcpDeniedPatterns] },
        ],
      },
    },
    {
      // WP-35: the public REST API is a thin adapter over the MCP tool layer,
      // so it keeps the same boundary (no repositories, no database driver,
      // no signing; the messages name src/mcp, the rule is the same).
      files: ['src/public-api/**/*.ts'],
      excludedFiles: [
        'src/public-api/**/__tests__/**',
        'src/public-api/**/*.spec.ts',
        'src/public-api/*.module.ts',
      ],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: mcpDeniedPaths, patterns: [mcpModulePattern, ...mcpDeniedPatterns] },
        ],
      },
    },
    {
      // WP-27: the OAuth 2.1 authorization server under src/mcp/oauth owns
      // its tables, HTTP endpoints and Nest module. It is auth
      // infrastructure, not the tool layer, so only the signing and
      // extractSignature bans apply.
      files: ['src/mcp/oauth/**/*.ts'],
      excludedFiles: ['src/mcp/oauth/**/__tests__/**', 'src/mcp/oauth/**/*.spec.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          { paths: [signpdfPath], patterns: [mcpDeniedPatterns[2]] },
        ],
      },
    },
    {
      // The MCP Nest module is the one place that wires other modules.
      files: ['src/mcp/*.module.ts'],
      rules: {
        'no-restricted-imports': ['error', { paths: mcpDeniedPaths, patterns: mcpDeniedPatterns }],
      },
    },
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.config.ts', 'jest.config.ts'],
};
