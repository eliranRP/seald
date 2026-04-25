module.exports = {
  root: true,
  env: { browser: true, es2022: true, node: true },
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
    project: ['./tsconfig.json', './tsconfig.node.json'],
    tsconfigRootDir: __dirname,
  },
  plugins: ['@typescript-eslint', 'react', 'react-hooks', 'jsx-a11y', 'import'],
  extends: [
    'airbnb',
    'airbnb-typescript',
    'airbnb/hooks',
    'plugin:@typescript-eslint/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:jsx-a11y/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier',
  ],
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
    'import/prefer-default-export': 'off',
    'import/no-default-export': 'error',
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
  },
  overrides: [
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
    },
    {
      files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}', '.storybook/**/*', 'src/test/**/*'],
      rules: {
        'import/no-extraneous-dependencies': 'off',
        'react/jsx-props-no-spreading': 'off',
        'import/no-default-export': 'off',
      },
    },
    {
      files: ['vite.config.ts', '.storybook/main.ts'],
      rules: {
        'import/no-default-export': 'off',
        'import/no-extraneous-dependencies': 'off',
      },
    },
    {
      files: ['src/**/*.d.ts'],
      rules: {
        '@typescript-eslint/no-empty-object-type': 'off',
        '@typescript-eslint/no-unused-vars': 'off',
      },
    },
  ],
};
