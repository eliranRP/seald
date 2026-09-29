// Astro config for the Seald marketing landing page.
//
// Deployment target: Cloudflare Pages (static), merged with the React
// SPA at the canonical seald.nromomentum.com domain. The deploy
// workflow (`.github/workflows/deploy-cloudflare.yml`) builds Astro
// here, builds the SPA, then merges them under apps/landing/dist/
// before pushing to CF Pages.

import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'astro/config';
import { MARKETING_PATHS } from './_worker.js';
import { buildLastmod, renderSitemap } from './sitemap.js';

// `build.format: 'file'` emits `contact.html` rather than
// `contact/index.html`. Cloudflare Pages serves the `.html` file at
// `/contact` with HTTP 200. The directory format 308s `/contact` to
// `/contact/`, which disagreed with our no-slash canonicals.
// Pair `format: 'file'` with `trailingSlash: 'never'` — Astro's
// documented combination for extensionless URLs.
//
// sitemap.xml is written in astro:build:done so lastmod is the build
// date, not a date checked into the repo.

function sitemapLastmod() {
  return {
    name: 'sitemap-lastmod',
    hooks: {
      'astro:build:done': ({ dir }) => {
        const dist = fileURLToPath(dir);
        writeFileSync(
          path.join(dist, 'sitemap.xml'),
          renderSitemap(MARKETING_PATHS, buildLastmod()),
        );
      },
    },
  };
}

export default defineConfig({
  site: 'https://seald.nromomentum.com',
  integrations: [sitemapLastmod()],
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
