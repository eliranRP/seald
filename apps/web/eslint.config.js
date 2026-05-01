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

import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import importPlugin from 'eslint-plugin-import';
import globals from 'globals';

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
    // Playwright e2e + config — not part of any tsconfig project, so the
    // typescript-eslint parser would fail with "file was not found in any
    // of the provided project(s)". Linting these files isn't critical;
    // the spec already runs through Playwright's own type-aware runtime.
    'e2e/**',
    'playwright.config.ts',
    'playwright-report/**',
    'test-results/**',
  ],
}, // Project-wide linterOptions. Many `// eslint-disable-next-line ...`
// directives in the source target rules that came from the legacy `airbnb`
// preset (e.g. `react/no-array-index-key`, `no-param-reassign`,
// `import/first`, `no-alert`, `consistent-return`, `max-classes-per-file`,
// `class-methods-use-this`, `no-await-in-loop`). Airbnb is now removed
// (it was already dormant) so those rules are off and the directives are
// flagged as "unused". Turning the report off keeps this migration
// zero-source-churn; a future cleanup pass can sweep the directives out.
{
  linterOptions: {
    reportUnusedDisableDirectives: 'off',
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
          // L1 (primitives) must not import from L2/L3.
          {
            target: [
              './src/components/Badge',
              './src/components/Button',
              './src/components/Avatar',
              './src/components/Icon',
              './src/components/TextField',
              './src/components/DocThumb',
              './src/components/EmptyState',
              './src/components/SignatureMark',
              './src/components/StatCard',
            ],
            from: [
              './src/components/AddSignerDropdown',
              './src/components/EmailMasthead',
              './src/components/FieldsPlacedList',
              './src/components/FilterTabs',
              './src/components/PageHeader',
              './src/components/PageThumbStrip',
              './src/components/PageToolbar',
              './src/components/PlacedField',
              './src/components/SendPanelFooter',
              './src/components/StatusBadge',
              './src/components/SignatureField',
              './src/components/SignerRow',
              './src/components/CollapsibleRail',
              './src/components/DocumentCanvas',
              './src/components/EmailCard',
              './src/components/FieldPalette',
              './src/components/FieldsBar',
              './src/components/NavBar',
              './src/components/PlaceOnPagesPopover',
              './src/components/SelectSignersPopover',
              './src/components/SideBar',
              './src/components/SignaturePad',
              './src/components/SignersPanel',
            ],
            message: 'Layer boundary: L1 primitives must not import from L2/L3 components.',
          },
          // L2 (domain) must not import from L3.
          {
            target: [
              './src/components/AddSignerDropdown',
              './src/components/EmailMasthead',
              './src/components/FieldsPlacedList',
              './src/components/FilterTabs',
              './src/components/PageHeader',
              './src/components/PageThumbStrip',
              './src/components/PageToolbar',
              './src/components/PlacedField',
              './src/components/SendPanelFooter',
              './src/components/StatusBadge',
              './src/components/SignatureField',
              './src/components/SignerRow',
            ],
            from: [
              './src/components/CollapsibleRail',
              './src/components/DocumentCanvas',
              './src/components/EmailCard',
              './src/components/FieldPalette',
              './src/components/FieldsBar',
              './src/components/NavBar',
              './src/components/PlaceOnPagesPopover',
              './src/components/SelectSignersPopover',
              './src/components/SideBar',
              './src/components/SignaturePad',
              './src/components/SignersPanel',
            ],
            message: 'Layer boundary: L2 domain components must not import from L3 widgets.',
          },
          // Signer surface isolation — the public /sign/* flow must not
          // import any Supabase-aware code or the authenticated apiClient.
          // This makes a future split into a dedicated `apps/sign` package
          // purely mechanical, and prevents the recipient bundle from
          // accidentally pulling sender auth code.
          {
            target: [
              './src/features/signing',
              './src/pages/SigningEntryPage',
              './src/pages/SigningPrepPage',
              './src/pages/SigningFillPage',
              './src/pages/SigningReviewPage',
              './src/pages/SigningDonePage',
              './src/pages/SigningDeclinedPage',
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
    'no-restricted-syntax': [
      'error',
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
    ],
    // Lock in rule 1.6 — once an import has to climb two or more levels
    // it should use the `@/*` alias instead. Same-dir (`./Foo`) and
    // parent-dir (`../sibling`) imports remain idiomatic and are allowed.
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: ['../../*', '../../../*', '../../../../*'],
            message: 'Use @/* path alias instead of deep relative imports (rule 1.6).',
          },
        ],
      },
    ],
  },
}, // Override: hex literals banned in component styles.
{
  files: ['src/components/**/*.styles.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'Literal[value=/^#[0-9A-Fa-f]{3,8}$/]',
        message: 'Hex literals are banned in component styles — read from theme.*',
      },
      {
        selector: 'TemplateElement[value.raw=/#[0-9A-Fa-f]{3,8}/]',
        message: 'Hex literals are banned in component styles — read from theme.*',
      },
    ],
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
