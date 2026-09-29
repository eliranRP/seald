// Astro config for the Seald marketing landing page.
//
// Deployment target: Cloudflare Pages (static), merged with the React
// SPA at the canonical seald.nromomentum.com domain. The deploy
// workflow (`.github/workflows/deploy-cloudflare.yml`) builds Astro
// here, builds the SPA, then merges them under apps/landing/dist/
// before pushing to CF Pages.

import { defineConfig } from 'astro/config';
import { fileURLToPath } from 'node:url';

// Sitemap is hand-authored at apps/landing/public/sitemap.xml so every
// public page (home, contact, DSAR, legal) is listed with a lastmod.
// `build.format: 'file'` emits `contact.html` rather than
// `contact/index.html`. Cloudflare Pages serves the `.html` file at
// `/contact` with HTTP 200. The directory format 308s `/contact` to
// `/contact/`, which disagreed with our no-slash canonicals.
// Pair `format: 'file'` with `trailingSlash: 'never'` — Astro's
// documented combination for extensionless URLs.

export default defineConfig({
  site: 'https://seald.nromomentum.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    format: 'file',
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
