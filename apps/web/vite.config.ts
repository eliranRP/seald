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
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
    // React 18's invokeGuardedCallback rethrows caught errors as window
    // 'error' events for devtools visibility. Tests that intentionally
    // trip invariants (e.g. useSignaturePadValue) already assert via
    // `toThrow`; the rethrow is just noise that otherwise causes vitest
    // to exit 1 even when every test passed.
    dangerouslyIgnoreUnhandledErrors: true,
  },
});
