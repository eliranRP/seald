// Astro config for the Sealed marketing landing page.
//
// Deployment target: Cloudflare Pages (static).
// Hostname:          https://seald-landing.nromomentum.com
//
// Notes:
// - `output: 'static'` keeps the build a plain set of HTML/CSS/JS files
//   that Cloudflare Pages serves directly. No SSR adapter is needed.
// - @astrojs/sitemap auto-generates /sitemap-index.xml + /sitemap-0.xml
//   from the page list at build time. The robots.txt in /public links
//   to it.
// - `site` is required for sitemap + canonical URLs; keep it in sync
//   with the Cloudflare Pages custom domain.

import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  site: 'https://seald-landing.nromomentum.com',
  output: 'static',
  trailingSlash: 'never',
  build: {
    inlineStylesheets: 'auto',
    assets: 'assets',
  },
  compressHTML: true,
  integrations: [sitemap()],
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
