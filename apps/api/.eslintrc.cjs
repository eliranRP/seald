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
  plugins: ['@typescript-eslint'],
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
    '@typescript-eslint/no-throw-literal': 'error',
    // Rule 8.1 — Pino + Nest Logger only; raw console.log loses correlation ids
    // and pollutes structured-log pipelines. Scripts opt out via override below.
    'no-console': 'error',
  },
  overrides: [
    {
      // CLIs + smoke scripts run interactively; console output is the contract.
      files: ['scripts/**/*.{ts,js,mjs,cjs}', 'test/**/*.{ts,js}'],
      rules: { 'no-console': 'off' },
    },
  ],
  ignorePatterns: ['dist', 'coverage', 'node_modules', '*.config.ts', 'jest.config.ts'],
};
