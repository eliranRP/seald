/// <reference types="vitest" />
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
  server: { port: 5173, strictPort: true },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: true,
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
