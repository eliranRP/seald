# SEO indexing (quiet use)

The Seald trademark is unresolved. The public site stays in quiet use:
crawlers may fetch every URL, and every page tells them not to index it.

## Flag

`SEO_INDEXING_ENABLED` in `apps/landing/indexing.config.js` defaults to
`false`. Marketing pages, `robots.txt`, the sitemap, `llms.txt`, JSON-LD,
and the `X-Robots-Tag` header all read that constant.

While it is `false`:

- Every marketing page emits
  `<meta name="robots" content="noindex, nofollow">` from
  `apps/landing/src/layouts/BaseLayout.astro`. That is the only layout.
  The app shell in `apps/web/index.html` has the same meta tag, and it
  stays noindex after the flag is turned on. App routes are not public
  documents.
- The layout does not emit JSON-LD. The script tag is rendered only when
  the flag is true.
- The layout does not emit `<link rel="sitemap">`. That link is rendered
  only on indexable marketing pages, which requires the flag. Footers do
  not mention a sitemap.
- `apps/landing/_worker.js` sets `X-Robots-Tag: noindex, nofollow` on
  every response. Cloudflare Pages runs that worker for the whole host
  (`seald.nromomentum.com`), which is both the Astro marketing site and
  the React app. `public/_headers` does not set this header: a static
  rule would stay on after the flag is turned back on. The worker is
  what actually serves the response, and it can see the flag.
- `/robots.txt` is `User-agent: *` followed by `Allow: /` for the whole
  quiet period. There is no `Disallow: /` and no `Sitemap:` line.
  Crawling stays allowed so Google and Bing can fetch pages, read
  `noindex`, and drop URLs that are already indexed. Blocking the crawl
  would hide `noindex` and can bring back URL-only results. The worker
  generates this body from the flag. `apps/landing/public/robots.txt` is
  the same text, so a static fallback cannot advertise a sitemap. There
  is no second `robots.txt` under `apps/web`: the deploy copies the SPA
  onto the landing output, and a web copy would overwrite this file.
- The Astro build does not write `sitemap.xml`. The worker answers
  `/sitemap.xml` and `/sitemap-index.xml` with 404.
- `llms.txt` is not in `public/`. The build copies `apps/landing/llms.txt`
  into the output only when the flag is true. While the flag is false
  the worker answers `/llms.txt` with 404.
- The Google Search Console meta tag and
  `apps/landing/public/google9a27f9c75cdae2dc.html` stay for the whole
  quiet period, with `Allow: /` and `noindex`. There is no Bing
  verification file in the repo today. If one is added, keep it too.

There is no IndexNow client and no Microsoft Clarity script in this
repo. Nothing of that kind was removed.

`api.seald.nromomentum.com` does not get `X-Robots-Tag`. The API serves
JSON plus OAuth redirects. `GET /verify/:short_code` is JSON metadata,
not an HTML page. The public verify page is the SPA at
`/verify/:id` on `seald.nromomentum.com`, and the worker already marks
that response `noindex, nofollow`.

## Re-enable

Do this only after the trademark question is resolved and indexing
should come back. Until then, keep `Allow: /`, `noindex`, and the
verification files.

1. In `apps/landing/indexing.config.js`, set `SEO_INDEXING_ENABLED` to
   `true`.
2. In `apps/web/src/test/landing-seo.contract.test.ts`, change the
   assertion that the constant is `false` so it expects `true`. The
   other SEO tests follow the flag.
3. Deploy the site (push to `main`, or dispatch the Cloudflare Pages
   workflow). The Astro build writes `sitemap.xml` and `llms.txt` again.
   The worker serves them. `/robots.txt` returns the previous crawl
   rules plus the `Sitemap:` line. Marketing pages go back to
   `index, follow`, the sitemap link, and JSON-LD. The 404 page and the
   app shell stay noindex.
4. In Google Search Console, resubmit
   `https://seald.nromomentum.com/sitemap.xml`.
5. In Bing Webmaster Tools, resubmit that same sitemap.

The deploy bundles `_worker.js` and does not upload `indexing.config.js`.
That file is not a public asset. The reason indexing is off stays in
this doc.
