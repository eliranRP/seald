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
  settings: { react: { version: 'detect' } },
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
    'no-restricted-syntax': [
      'error',
      {
        selector: 'TSTypeReference[typeName.name=/^(React\\.FC|FC)$/]',
        message: 'Do not use React.FC — declare props explicitly.',
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
      files: ['**/*.test.{ts,tsx}', '**/*.stories.tsx', '.storybook/**/*', 'src/test/**/*'],
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
  ],
};
