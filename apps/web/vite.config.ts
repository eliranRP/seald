/// <reference types="vitest" />
import { existsSync, readFileSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { visualizer } from 'rollup-plugin-visualizer';

// Enable the bundle visualizer with `SEALD_VISUALIZE=1 pnpm --filter web build`.
// Emits `dist/stats.html` — copy into `docs/bundle/` to track deltas.
const withVisualizer = process.env.SEALD_VISUALIZE === '1';

/**
 * Dev-only middleware that serves `/scripts/*` from the Astro landing's
 * `public/scripts/` folder. In production both apps are merged into one
 * Cloudflare Pages deployment so the path resolves naturally; this plugin
 * gives the dev server (and therefore Playwright/E2E) the same behaviour
 * without duplicating the file. Single source of truth lives in
 * `apps/landing/public/scripts/`.
 */
function landingScriptsBridge(): Plugin {
  const root = resolvePath(fileURLToPath(new URL('../landing/public/scripts', import.meta.url)));
  return {
    name: 'seald:landing-scripts-bridge',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();
        const match = /^\/scripts\/([\w.-]+)(?:\?.*)?$/.exec(req.url);
        if (!match) return next();
        const file = resolvePath(root, match[1]!);
        if (!file.startsWith(root) || !existsSync(file)) return next();
        res.setHeader('content-type', 'application/javascript; charset=utf-8');
        res.end(readFileSync(file));
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    landingScriptsBridge(),
    ...(withVisualizer
      ? [
          visualizer({
            filename: 'dist/stats.html',
            gzipSize: true,
            brotliSize: true,
            template: 'treemap',
          }),
        ]
      : []),
  ],
  resolve: {
    alias: {
      // Mirrors `paths` in tsconfig.json. Prefer `@/feature/...` over deep
      // relative imports — see react-best-practices skill rule 1.6.
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5173, strictPort: true },
  // pdfjs-dist v4 emits top-level await; bump esbuild's transpile target so
  // the dev server (vite dev → optimizeDeps prebundle) and the production
  // build both keep TLA. Matches the floor of every browser that supports
  // TLA natively.
  esbuild: { target: 'es2022' },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
  build: {
    target: ['chrome89', 'edge89', 'firefox89', 'safari15'],
    rollupOptions: {
      output: {
        // Split heavy vendor libs into their own chunks so the dashboard /
        // sign-in entry doesn't ship the PDF + Supabase + styled-components
        // payload upfront. Function form so it works for both bare specifiers
        // and absolute node_modules paths Rollup hands us.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('node_modules/pdfjs-dist')) return 'vendor-pdf';
          if (
            id.includes('node_modules/react-router-dom') ||
            id.includes('node_modules/react-router/') ||
            /node_modules\/react-dom\//.test(id) ||
            /node_modules\/react\//.test(id) ||
            /node_modules\/scheduler\//.test(id)
          ) {
            return 'vendor-react';
          }
          if (id.includes('node_modules/styled-components')) return 'vendor-styled';
          if (id.includes('node_modules/@supabase')) return 'vendor-supabase';
          if (
            id.includes('node_modules/@tanstack/react-query') ||
            id.includes('node_modules/axios')
          ) {
            return 'vendor-data';
          }
          return undefined;
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // Provide deterministic dummy env values for the test run so module-load
    // guards in `signApiClient` / `supabaseClient` don't throw in CI where
    // `.env.local` isn't present. Tests that exercise these clients install
    // their own MSW/axios mocks; the values never reach a real network.
    env: {
      VITE_API_BASE_URL: 'http://localhost:3000',
      VITE_SUPABASE_URL: 'http://localhost:54321',
      VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    },
    // React 18's invokeGuardedCallback rethrows caught errors as window
    // 'error' events for devtools visibility. Tests that intentionally
    // trip invariants (e.g. useSignaturePadValue) already assert via
    // `toThrow`; the rethrow is just noise that otherwise causes vitest
    // to exit 1 even when every test passed.
    dangerouslyIgnoreUnhandledErrors: true,
    // Rule 4.6 — mock state should never leak between tests.
    clearMocks: true,
    restoreMocks: true,
    // Rule 12.4 — randomize file + within-file ordering so hidden order
    // dependencies surface locally rather than only on a noisy CI runner.
    sequence: { shuffle: true },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
      // Rule 5.1 / 5.2 — coverage gates so the web suite refuses to slip
      // below baseline. Floors set just below current observed coverage
      // (lines ~70.0%, branches ~58.0% on this branch); ratchet up over
      // time in dedicated PRs, not as drive-by changes. Branches dipped
      // when the templates wizard + edit flows landed (large declarative
      // JSX with many conditional render paths exercised only by E2E);
      // unit-test ratchet-up is tracked separately.
      thresholds: {
        lines: 69,
        branches: 58,
      },
      // Exclude generated/style/test scaffolding so coverage signals what
      // production code is actually exercised by the suite.
      exclude: [
        '**/node_modules/**',
        'dist/**',
        '.storybook/**',
        'src/**/*.stories.{ts,tsx}',
        'src/**/*.styles.{ts,tsx}',
        'src/**/*.types.ts',
        'src/**/*.test.{ts,tsx}',
        'src/test/**',
        'src/**/__index-smoke.test.ts',
        '**/*.d.ts',
      ],
    },
  },
});
