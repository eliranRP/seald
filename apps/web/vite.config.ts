/// <reference types="vitest" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { visualizer } from 'rollup-plugin-visualizer';

// Enable the bundle visualizer with `SEALD_VISUALIZE=1 pnpm --filter web build`.
// Emits `dist/stats.html` — copy into `docs/bundle/` to track deltas.
const withVisualizer = process.env.SEALD_VISUALIZE === '1';

export default defineConfig({
  plugins: [
    react(),
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
  build: {
    // Vite 5.4.21 ships an esbuild that flags top-level destructuring inside
    // CJS-wrapped modules (axios, supabase-js, semver, styled-components
    // template literals, etc.) as untransformable for the default `'modules'`
    // target — even though ES2020 has supported destructuring since 2017. All
    // browsers in our baseline (chrome87+/safari14+/firefox78+/edge88+) parse
    // it natively, so skip the down-leveling pass entirely.
    target: 'esnext',
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
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'html', 'lcov'],
      include: ['src/**/*.{ts,tsx}'],
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
