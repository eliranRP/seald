import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright config for apps/web e2e.
 *
 * The signing flow has 593 vitest unit tests but no end-to-end browser
 * coverage. This config boots the existing Vite dev server (port 5173)
 * and runs the Chromium project against it. The first spec mocks the
 * `/sign/*` API at the network layer (page.route) so we exercise the
 * React state machine without standing up the Nest backend.
 *
 * CI parity: only Chromium is configured. We rely on Vitest + RTL for
 * the breadth of behaviour and use Playwright purely for the user-facing
 * happy paths that vitest can't cover.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: 'pnpm --filter web dev',
    port: 5173,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // The dev server reads VITE_API_BASE_URL (signApiClient throws if
    // missing). Anything matching the page.route glob will be mocked, so
    // the value is arbitrary as long as it's a valid URL.
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    },
  },
});
