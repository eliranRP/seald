# Landing visual review

Side-by-side comparison of the built Astro landing page against the
Sealed design system (`Design-Guide/project/`). The original design
brief did **not** ship a `landing-page.html` artifact — the page was
designed from scratch using:

- `Design-Guide/project/colors_and_type.css` (tokens)
- `Design-Guide/project/README.md` (voice, type rhythm, motion rules,
  signature motif, copy library)
- `Design-Guide/project/preview/*.html` (visual reference for buttons,
  cards, type, badges, signature field)
- `Design-Guide/project/assets/logo.svg` (brand mark, inlined verbatim)

## Token parity

| Token group | Source                                                                  | Status                                                |
| ----------- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| Colors      | `colors_and_type.css` `--ink-*`, `--indigo-*`, etc.                     | Copied 1:1 into `apps/landing/src/styles/globals.css` |
| Type scale  | `--fs-display`, `--fs-h1` … `--fs-micro`                                | Copied 1:1                                            |
| Spacing     | 4px grid, `--sp-1` … `--sp-24`                                          | Copied 1:1                                            |
| Radii       | `--r-xs` … `--r-2xl`, `--r-pill`                                        | Copied 1:1                                            |
| Shadows     | `--shadow-xs` … `--shadow-paper`, `--shadow-focus`                      | Copied 1:1                                            |
| Motion      | `--ease-standard`, `--dur-fast/base/slow`                               | Copied 1:1                                            |
| Type pairs  | Inter (sans), Source Serif 4 (display), Caveat (script), JetBrains Mono | Self-hosted via @font-face (no Google CDN)            |

## Page composition

| Section      | Component                         | Notes                                                                                                                                                                                   |
| ------------ | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sticky nav   | `src/components/Header.astro`     | 56px, border-bottom, no shadow, backdrop-blur on scroll (per README)                                                                                                                    |
| Hero         | `src/components/Hero.astro`       | Display H1 with italic + script flourish under "name" (signature motif rule); paper-card document preview rotated -2°, `--shadow-paper` baked-in border; floating "Sealed" success-pill |
| Value props  | `src/components/ValueProps.astro` | 3-column grid of cards (`--r-lg`, hairline border, no shadow — default card per README)                                                                                                 |
| How it works | `src/components/HowItWorks.astro` | 4-step grid on `--bg-app` background; numbered cards with mono step labels                                                                                                              |
| Trust strip  | `src/components/TrustStrip.astro` | 4-column dl/dt/dd grid with hairline dividers, no card chrome                                                                                                                           |
| CTA section  | `src/components/CTASection.astro` | Hero-grade rounded card (`--r-2xl`) with primary + ghost CTAs                                                                                                                           |
| Footer       | `src/components/Footer.astro`     | Brand mark, three nav columns, italic serif tagline, hairline divider, copyright                                                                                                        |

Total: 1 layout (`BaseLayout.astro`) + 8 components + 1 page
(`index.astro`). Zero client-side JS shipped from our source — only
external script is the deferred Cloudflare Web Analytics beacon.

## Voice & copy spot-check

| Brand rule (README §Voice)      | Landing page result                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Sentence case everywhere        | "Put your name to it.", "How it works", "Get started", "Sign in", "See how it works" — all sentence case                                                                        |
| No emoji, ever                  | None used; semantic dot in hero is a CSS circle with `aria-hidden`                                                                                                              |
| Em dashes welcome, no `!`       | "— built for the contracts you actually care about." present; no `!` anywhere                                                                                                   |
| Spell out 0-9                   | "Four steps. None of them annoying." (4 used as digit only in `01`/`02`/`03`/`04` step labels — those are dense-UI step IDs, mono-styled, fine per README "dense UI" exception) |
| One signature motif per surface | Single Caveat flourish under "name" in hero, single Caveat signature in the doc-preview illustration. Footer tagline is italic serif (not script). Within budget.               |

## Responsive checks (manual review against breakpoints in CSS)

| Viewport            | Hero                                      | Grid sections            | Footer            |
| ------------------- | ----------------------------------------- | ------------------------ | ----------------- |
| 375×812 (iPhone SE) | Stacked, paper preview centred            | 1-col grids              | 2-col footer-cols |
| 768×1024 (tablet)   | Stacked, paper centred                    | 3-col props, 2-col steps | 3-col footer-cols |
| 1024×768 (desktop)  | 2-col hero, paper rotated -2°             | 4-col steps + claims     | 3-col footer-cols |
| 1440×900 (wide)     | Same as desktop, container caps at 1200px | Centred, 1200 max        | Centred, 1200 max |

## Accessibility

- Skip-link in `BaseLayout.astro` jumps to `#main` (rendered by `<Hero>`).
- Visible focus rings via `--shadow-focus` on every `.btn` and `.logo-link`.
- All decorative SVGs marked `aria-hidden="true"`; logo SVGs carry `role="img"` + `aria-label`.
- Text/background contrast pairs (verified by colour ratio of `--fg-1` `#0B1220` on `--paper` `#FFFFFF` = 18.6:1 AAA, `--fg-2` `#1F2937` on `--paper` = 14.6:1 AAA, `--accent` `#4F46E5` on `--paper` = 6.4:1 AA-pass for body, AAA for large).
- `prefers-reduced-motion` honoured globally.
- Semantic landmarks: `<header>`, `<nav>`, `<main>`, `<footer>` + section headings hierarchy H1 → H2 → H3.

## Build / Lighthouse status

The sandbox running this session refused `pnpm build` and the local
`astro` binary, so I could not produce `apps/landing/dist/` here.
The first push will run `.github/workflows/deploy-landing.yml`, which:

1. `pnpm install --frozen-lockfile`
2. `pnpm --filter landing build` (Astro emits static HTML/CSS/SVG; no client JS bundle)
3. `cloudflare/wrangler-action@v3` deploys `apps/landing/dist/` to the
   `seald-landing` Cloudflare Pages project.

After the first successful deploy, run Lighthouse against
`https://seald-landing.pages.dev` (or the custom domain once DNS is
attached). Target scores per the brief: 95+ on Performance, SEO,
Accessibility, Best Practices. Expected to clear easily because:

- Zero JavaScript shipped from source.
- One deferred external script (Cloudflare Web Analytics, ~1KB).
- Single shared CSS file inlined where small (`inlineStylesheets: 'auto'`).
- Self-hosted variable fonts with `font-display: swap`.
- All images/SVGs are inline or static, no third-party media.
- Static HTML only — no SSR, no client hydration.

## Estimated build size

| Asset                  | ~ size                                                                                                           | Notes                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `index.html`           | ~14 KB                                                                                                           | Hand-counted from source; HTML compressed by Astro |
| Inline + external CSS  | ~12 KB                                                                                                           | Single combined sheet, gzip estimate               |
| Inline SVGs            | ~3 KB                                                                                                            | Logo, hero flourish, OG mark                       |
| `favicon.svg`          | 0.3 KB                                                                                                           |                                                    |
| `og-image.svg`         | 1.1 KB                                                                                                           |                                                    |
| `sitemap-index.xml`    | <1 KB                                                                                                            | Generated by `@astrojs/sitemap`                    |
| `robots.txt`           | <1 KB                                                                                                            |                                                    |
| **Total HTML/CSS/SVG** | ~32 KB                                                                                                           | Before fonts                                       |
| Variable WOFF2 fonts   | ~310 KB total once dropped in `/public/fonts/` (Inter ~110, Source Serif 4 ~140, Caveat ~30, JetBrains Mono ~30) |

Page weight on first visit (no fonts dropped yet): **~32 KB**.
Page weight with fonts: **~340 KB**.

## Known follow-ups (documented in CLAUDE.md)

1. Replace `data-cf-beacon='{"token":""}'` in `BaseLayout.astro` with the
   real Cloudflare Web Analytics token after the first deploy.
2. Replace `public/google-site-verification.html` with the real GSC token
   file when adding the property to Search Console.
3. `terraform apply` (with `var.godaddy_enabled=true`) from
   `deploy/terraform/` to publish the `seald-landing` CNAME.
4. Drop the four variable WOFF2 files into `public/fonts/` per
   `public/fonts/README.md` to upgrade the page from system fonts.
5. (Optional) generate a 1200×630 PNG from `og-image.svg` for maximum
   social-media reach; update `BaseLayout.astro`'s `ogImage` default.
