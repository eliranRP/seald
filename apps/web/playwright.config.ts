import { defineConfig, devices } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';

// playwright-bdd compiles e2e/features/*.feature into spec files in the
// gitignored `e2e/.bdd/` output, then Playwright picks them up alongside
// hand-written specs in `e2e/*.spec.ts`. See `cucumber-react-bdd` skill
// rule 1.1.
//
// `defineBddConfig` returns the resolved output dir; Playwright's BDD project
// uses it as `testDir` so workers can locate the saved env config. Hand-
// written `.spec.ts` files live under `./e2e` and run as a sibling project.
const bddTestDir = defineBddConfig({
  features: 'e2e/features/**/*.feature',
  steps: ['e2e/steps/**/*.ts', 'e2e/fixtures/**/*.ts'],
  outputDir: 'e2e/.bdd',
});

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts', '**/*.spec.js'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testDir: './e2e',
      testIgnore: ['**/.bdd/**'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'chromium-bdd',
      testDir: bddTestDir,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // The Vite dev server only serves the SPA bundle. All `/api/*` and
    // `/sign/*` traffic is mocked at `page.route()` (rule 3.5).
    // Env vars are stubbed because the SPA's supabaseClient/signApiClient
    // throw at module-load if they're missing.
    command: 'pnpm dev --host 127.0.0.1 --port 5173',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_API_BASE_URL: 'http://127.0.0.1:5173/api',
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    },
  },
});
