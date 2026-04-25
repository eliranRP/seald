// Astro config for the Sealed marketing landing page.
//
// Deployment target: Cloudflare Pages (static), merged with the React
// SPA at the canonical seald.nromomentum.com domain. The deploy
// workflow (`.github/workflows/deploy-cloudflare.yml`) builds Astro
// here, builds the SPA, then merges them under apps/landing/dist/
// before pushing to CF Pages.

import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

// Sitemap is hand-authored at apps/landing/public/sitemap.xml — the
// landing surface only ships one indexable URL (`/`), which makes
// @astrojs/sitemap (which crashes on a 1-page site under Astro 4.16)
// overkill anyway.

export default defineConfig({
  site: 'https://seald.nromomentum.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'auto',
    assets: 'assets',
  },
  compressHTML: true,
  vite: {
    build: {
      cssCodeSplit: false,
    },
    resolve: {
      // Mirror tsconfig.json's `@/*` -> `src/*` alias so imports like
      // `@/styles/globals.css` resolve in both editor and bundler.
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
  },
});
