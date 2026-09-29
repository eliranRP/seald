// For more info, see https://github.com/storybookjs/eslint-plugin-storybook#configuration-flat-config-format
import storybook from "eslint-plugin-storybook";

// Flat ESLint config (ESLint 9). Replaces .eslintrc.cjs and migrates off the
// dormant `airbnb` preset. We intentionally roll our own preset stack (instead
// of @vercel/style-guide) because @vercel/style-guide@6 declares
// `"eslint": ">=8.48.0 <9"` in peerDependencies and is therefore incompatible
// with ESLint 9. The roll-your-own stack below is the same set of plugins the
// Vercel preset wraps (typescript-eslint + react + react-hooks + jsx-a11y +
// import) without the version cap.
//
// All 15+ custom rules from the previous .eslintrc.cjs are preserved verbatim:
//   1.  import/prefer-default-export: off
//   2.  import/no-default-export: error
//   3.  react/require-default-props: off
//   4.  react/jsx-props-no-spreading: off
//   5.  react/function-component-definition (function-declaration / arrow)
//   6.  @typescript-eslint/consistent-type-imports: error
//   7.  @typescript-eslint/no-unused-vars (argsIgnorePattern: ^_)
//   8.  import/no-restricted-paths — five layer-boundary zones (L0..L4 +
//       signer-surface isolation)
//   9.  no-restricted-syntax — FC/VFC/FunctionComponent type ban (bare + React.*)
//   10. no-restricted-imports — deep relative ban (rule 1.6)
//   11. *.styles.ts override — hex literal ban (Literal + TemplateElement)
//   12. tests/stories/.storybook override — disable
//       import/no-extraneous-dependencies, react/jsx-props-no-spreading,
//       import/no-default-export, no-restricted-imports
//   13. vite.config.ts + .storybook/main.ts override — disable
//       import/no-default-export + import/no-extraneous-dependencies
//   14. src/**/*.d.ts override — disable @typescript-eslint/no-empty-object-type
//       and @typescript-eslint/no-unused-vars
//   15. import-resolver-typescript settings preserved (project: tsconfig.json,
//       tsconfig.node.json) so the `@/*` alias resolves.

import fs from 'node:fs';
import path from 'node:path';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import eslintComments from '@eslint-community/eslint-plugin-eslint-comments';
import globals from 'globals';
import { buildComponentLayerZones } from './eslint/component-layers.mjs';

function readList(relativePath) {
  const file = path.join(import.meta.dirname, relativePath);
  return fs
    .readFileSync(file, 'utf8')
    .split('\n')
    .map((line) => line.replace(/#.*/, '').trim())
    .filter((line) => line.length > 0);
}

const hexAllowlist = readList('eslint/hex-allowlist.txt');

const typeSyntaxBans = [
  {
    selector:
      "TSTypeReference[typeName.type='Identifier'][typeName.name=/^(FC|VFC|FunctionComponent)$/]",
    message: 'Do not use FC/VFC/FunctionComponent type — declare props explicitly.',
  },
  {
    selector:
      "TSTypeReference[typeName.type='TSQualifiedName'][typeName.left.name='React'][typeName.right.name=/^(FC|VFC|FunctionComponent)$/]",
    message:
      'Do not use React.FC/React.VFC/React.FunctionComponent — declare props explicitly.',
  },
  {
    selector:
      "TSAsExpression[expression.type='TSAsExpression'][expression.typeAnnotation.type='TSUnknownKeyword']",
    message:
      'Do not use `as unknown as`. Narrow the value, or use a single assertion when the types already overlap.',
  },
];

const tagPaletteBan = {
  selector:
    "MemberExpression[property.name='tag'][object.type='MemberExpression'][object.property.name='color']",
  message:
    'color.tag (pink, violet, cyan) is a categorical palette for tags and template accents only. Do not use it for UI state or meaning.',
};

const hexSyntaxBans = [
  {
    selector: 'Literal[value=/^#[0-9A-Fa-f]{3,8}$/]',
    message: 'Hex literals are banned — read the color from theme.* (tokens.css).',
  },
  {
    selector: 'TemplateElement[value.raw=/#[0-9A-Fa-f]{3,8}/]',
    message: 'Hex literals are banned — read the color from theme.* (tokens.css).',
  },
];

export default tseslint.config(// Ignores (was apps/web/.eslintignore). The flat config file itself is
// ignored from the type-aware parser path because it is intentionally not
// included in tsconfig.{json,node.json}. Linting it would otherwise emit
// `Parsing error: parserOptions.project has been provided ... but was not
// found in any of the provided project(s)`.
{
  ignores: [
    'node_modules/**',
    'dist/**',
    'dist-ssr/**',
    'storybook-static/**',
    'coverage/**',
    '.vite/**',
    'eslint.config.js',
    'eslint/**',
    'scripts/**',
    // Playwright e2e + config — not part of any tsconfig project, so the
    // typescript-eslint parser would fail with "file was not found in any
    // of the provided project(s)". Linting these files isn't critical;
    // the spec already runs through Playwright's own type-aware runtime.
    'e2e/**',
    'playwright.config.ts',
    'playwright-report/**',
    'test-results/**',
  ],
}, {
  linterOptions: {
    reportUnusedDisableDirectives: 'error',
  },
}, // Base JS recommended rules.
js.configs.recommended, // typescript-eslint recommended (non type-checked baseline; type-checked
// rules layered on below for app source only).
...tseslint.configs.recommended, // Plugin recommended configs (flat-config exports).
reactPlugin.configs.flat.recommended, reactPlugin.configs.flat['jsx-runtime'], jsxA11yPlugin.flatConfigs.recommended, importPlugin.flatConfigs.recommended, importPlugin.flatConfigs.typescript, // Project-wide settings + custom rules (applies to all TS/TSX/JS/JSX files).
{
  files: ['**/*.{ts,tsx,js,jsx,cjs,mjs}'],
  languageOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    parserOptions: {
      ecmaFeatures: { jsx: true },
      project: ['./tsconfig.json', './tsconfig.node.json'],
      tsconfigRootDir: import.meta.dirname,
    },
    globals: {
      ...globals.browser,
      ...globals.node,
      ...globals.es2022,
    },
  },
  plugins: {
    'react-hooks': reactHooksPlugin,
    '@eslint-community/eslint-comments': eslintComments,
  },
  settings: {
    react: { version: 'detect' },
    // Teach eslint-plugin-import about the TS path-alias `@/*` declared in
    // tsconfig.json so `import { ... } from '@/components/Button'` resolves
    // for `import/no-unresolved` and `import/extensions`.
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
      },
      node: true,
    },
  },
  rules: {
    // react-hooks recommended — applied manually because the plugin's
    // `recommended` flat config export shape varies by version.
    ...reactHooksPlugin.configs.recommended.rules,
    // eslint-plugin-react-hooks v7 added three new strict rules that flag
    // legacy patterns across the codebase (13 violations on bump). They
    // are disabled here to keep the v5 baseline; a follow-up sweep can
    // refactor effects to fix them and re-enable each rule individually.
    'react-hooks/set-state-in-effect': 'off',
    'react-hooks/preserve-manual-memoization': 'off',
    'react-hooks/purity': 'off',

    // Directive comments are forbidden. Justified exceptions live in the
    // overrides below (test mocks, Vite worker query imports, a few hooks
    // whose dependency lists are intentionally stable).
    '@eslint-community/eslint-comments/no-use': 'error',
    '@typescript-eslint/no-non-null-assertion': 'error',
    'no-nested-ternary': 'error',

    'import/prefer-default-export': 'off',
    'import/no-default-export': 'error',
    // Matches the previous behavior under the airbnb chain. Several files
    // do `import styled from 'styled-components'` (legitimate default
    // import that happens to share a name with a named export), and a few
    // controlled accessibility-aware places use `autoFocus`. The legacy
    // .eslintrc.cjs produced 0 warnings/errors with these effectively
    // disabled; we preserve that.
    'import/no-named-as-default': 'off',
    'import/no-named-as-default-member': 'off',
    'jsx-a11y/no-autofocus': 'off',
    'react/require-default-props': 'off',
    'react/jsx-props-no-spreading': 'off',
    'react/function-component-definition': [
      'error',
      { namedComponents: 'function-declaration', unnamedComponents: 'arrow-function' },
    ],
    '@typescript-eslint/consistent-type-imports': 'error',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    // Layer boundary enforcement (Phase-1 component library).
    // Layers: L0 styles < L1 primitives < L2 domain < L3 widgets < L4 providers.
    // A component in Ln must NOT import from any layer above it. Same layer and
    // utilities (src/lib, src/types, src/test) are always allowed.
    'import/no-restricted-paths': [
      'error',
      {
        zones: [
          // L0 (styles) must not import from any component layer.
          {
            target: './src/styles',
            from: './src/components',
            message: 'Layer boundary: L0 (styles) must not import from components.',
          },
          // L1–L3 zones are folder globs. L1 is every component directory
          // that is not a higher layer (new folders are L1 until a story
          // title says otherwise). See eslint/component-layers.mjs.
          ...buildComponentLayerZones(),
          // Signer surface isolation — the public /sign/* flow must not
          // import any Supabase-aware code or the authenticated apiClient.
          // This makes a future split into a dedicated `apps/sign` package
          // purely mechanical, and prevents the recipient bundle from
          // accidentally pulling sender auth code.
          {
            target: [
              './src/features/signing',
              // New Signing* page folders are included without editing this list.
              './src/pages/Signing*/**',
              './src/components/RecipientHeader',
              './src/components/DocumentPageCanvas',
              './src/components/SignerField',
              './src/components/SignatureCapture',
              './src/components/FieldInputDrawer',
              './src/components/ReviewList',
              './src/components/ProgressBar',
            ],
            from: [
              './src/lib/supabase',
              './src/providers/AuthProvider',
              './src/providers/AppStateProvider',
              './src/features/contacts',
              './src/lib/api/apiClient',
            ],
            message:
              'Signer-surface code must not depend on sender/Supabase modules — use signApiClient + features/signing only.',
          },
          // L0-L3 (styles + components) must not import from L4 pages.
          {
            target: ['./src/styles', './src/components'],
            from: './src/pages',
            message: 'Layer boundary: components and styles must not import from L4 pages.',
          },
        ],
      },
    ],
    'no-restricted-syntax': ['error', ...typeSyntaxBans, tagPaletteBan],
    // Lock in rule 1.6 — once an import has to climb two or more levels
    // it should use the `@/*` alias instead. Same-dir (`./Foo`) and
    // parent-dir (`../sibling`) imports remain idiomatic and are allowed.
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@signpdf/utils',
            importNames: ['extractSignature'],
            message:
              'Do not use extractSignature from @signpdf/utils — it strips trailing 0x00 bytes. Use extractContents() from pades-verify-helpers.ts.',
          },
        ],
        patterns: [
          {
            group: ['../../*', '../../../*', '../../../../*'],
            message: 'Use @/* path alias instead of deep relative imports (rule 1.6).',
          },
        ],
      },
    ],
  },
}, // Hex literals banned in product styles and TSX. Token definitions
// live in src/styles/theme.ts and tokens.css, which are outside this
// glob. Stories, tests, and eslint/hex-allowlist.txt are the design-cycle
// remainder.
{
  files: ['src/**/*.styles.ts', 'src/**/*.tsx', 'src/features/templates/tagColors.ts'],
  ignores: [
    '**/*.test.tsx',
    '**/*.spec.tsx',
    '**/*.stories.tsx',
    'src/test/**',
    ...hexAllowlist,
  ],
  rules: {
    'no-restricted-syntax': ['error', ...typeSyntaxBans, ...hexSyntaxBans, tagPaletteBan],
  },
}, // color.tag is allowed only in the tag palette and template-accent card.
{
  files: ['src/features/templates/tagColors.ts', 'src/components/TemplateCard/**/*.{ts,tsx}'],
  rules: {
    'no-restricted-syntax': ['error', ...typeSyntaxBans, ...hexSyntaxBans],
  },
}, // Override: tests, stories, .storybook, src/test.
{
  files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}', '.storybook/**/*', 'src/test/**/*'],
  rules: {
    'import/no-extraneous-dependencies': 'off',
    'react/jsx-props-no-spreading': 'off',
    'import/no-default-export': 'off',
    // Tests + stories migrate to `@/*` in a separate worktree — disable
    // the deep-relative guard here so this commit doesn't churn them.
    'no-restricted-imports': 'off',
    // vi.mock() is registered before the import that consumes it.
    'import/first': 'off',
    // cookieConsent / dsar tests execute a copied IIFE source.
    'no-eval': 'off',
    // Fixture casts (`as unknown as`) and non-null checks on test data
    // stay until the testing cycle. Production source is enforced above.
    '@typescript-eslint/no-non-null-assertion': 'off',
    'no-nested-ternary': 'off',
    'no-restricted-syntax': ['error', ...typeSyntaxBans.slice(0, 2)],
  },
}, // Hooks that intentionally keep a stable dependency list. Inline
// disable comments are forbidden; the reason lives next to the effect.
{
  files: [
    'src/hooks/useColumnWidths.ts',
    'src/features/signingFill/model/useSigningFillController.ts',
    'src/components/UserMenu/UserMenu.tsx',
    'src/routes/TemplateEditorRoute.tsx',
    'src/routes/UploadRoute.tsx',
    'src/lib/pdf.ts',
  ],
  rules: {
    'react-hooks/exhaustive-deps': 'off',
  },
}, // Vite `?worker&url` imports are not resolvable by the TS import resolver.
{
  files: ['src/lib/pdf.ts', 'src/lib/pdfjsWorker.ts'],
  rules: {
    'import/no-unresolved': 'off',
    'import/extensions': 'off',
  },
}, // Override: build/dev configs that legitimately default-export.
{
  files: ['vite.config.ts', '.storybook/main.ts'],
  rules: {
    'import/no-default-export': 'off',
    'import/no-extraneous-dependencies': 'off',
  },
}, // Override: ambient declarations.
{
  files: ['src/**/*.d.ts'],
  rules: {
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
  },
}, storybook.configs["flat/recommended"]);
