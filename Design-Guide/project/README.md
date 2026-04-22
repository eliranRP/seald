# Sealed — Design System

Sealed is a digital document-signing product. Users upload a PDF, place their signature (or collect signatures from others), and send signed documents back — all in a browser or from a phone. The system is built to feel **calm, trustworthy, and editorial** — closer to a modern law firm or private bank than to a consumer utility like iLovePDF.

> **Tagline:** _"Put your name to it."_

---

## Provenance & sources

- **Codebase:** _none provided._ This system was generated from scratch against a written brief.
- **Figma:** _none provided._
- **Brand assets:** _none provided._ Logos, iconography substitutions, and illustrations here are originals built for this system.
- **Written brief (user-supplied):**
  - Clean aesthetic inspired by ilovepdf.com
  - Calm & professional (muted blues/slates, whitespace, editorial serifs)
  - Primary accent: deep indigo (#4F46E5)
  - Humanist sans for UI + serif display for hero
  - Soft corner radii (12–16px)
  - Signature motif: handwritten script in logo/hero
  - Tone: Professional & trustworthy (like DocuSign)
  - Products: Web signing app, Mobile app, Email templates, Dashboard
  - Flows: self-sign + request signature, equal weight
  - Variations: 2 signing-app layouts

If you have real brand assets, a Figma link, or existing product code, **please re-run with them attached** — a system rooted in real sources will always outperform one generated from a brief.

---

## Index

| File / Folder          | Purpose                                                                                              |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| `colors_and_type.css`  | All design tokens — colors, type, radii, shadows, spacing, motion. Import this file first.           |
| `assets/`              | Logos (full lockup, mark-only, white, script wordmark), illustrations, icons.                        |
| `preview/`             | HTML cards that render in the Design System tab. Read these to understand the token system visually. |
| `ui_kits/signing_app/` | Desktop web signing app — upload, place fields, sign, send. Includes 2 layout variations.            |
| `ui_kits/dashboard/`   | Document list, status tracking, inbox.                                                               |
| `ui_kits/mobile_app/`  | iOS signing flow.                                                                                    |
| `ui_kits/email/`       | Signature-request email templates (HTML-email safe).                                                 |
| `SKILL.md`             | Agent-skill manifest. Read this if you're an agent picking up this system.                           |

---

## Content fundamentals

### Voice

Sealed speaks like a trusted professional: a law clerk you actually like. The copy is **confident, spare, and warm** — never cute, never shouty.

- **Person:** Second person (_"you"_) for product UI. First-person plural (_"we"_) sparingly, only for trust claims (_"We encrypt every page at rest"_).
- **Casing:** Sentence case everywhere — buttons, menus, headings, titles. No Title Case. No ALL CAPS except for the eyebrow/label role (small, tracked-out).
- **Punctuation:** No trailing periods on buttons, menu items, or single-sentence empty states. Use periods in body copy. Em dashes (—) are welcome; avoid exclamation points entirely.
- **Oxford comma:** Yes.
- **Numbers:** Spell out zero through nine in prose; digits for 10+ and anything measured (_"3 signers"_, _"2 MB limit"_).
- **Dates:** `May 14, 2026` in prose; `2026-05-14` or `May 14` in dense UI.

### Do / Don't

| ✅ Yes                           | ❌ No                            |
| -------------------------------- | -------------------------------- |
| "Put your name to it."           | "Sign documents easily with AI!" |
| "Request signature"              | "Request A Signature Now 🚀"     |
| "Signed by 2 of 3 signers"       | "2/3 complete ✅"                |
| "Send for signature"             | "Shoot it over"                  |
| "This contract is sealed."       | "You're all set!!"               |
| "We encrypt every page at rest." | "Military-grade security!!"      |

### Emoji & special characters

**No emoji** in product UI, marketing, or email. Ever. They fight the editorial serif and the trust register.

- **Checkmark / seal** → use the SVG glyphs in `assets/icons/`.
- **Arrow** → use the Lucide `arrow-right` icon, never `→` or `>` (except in breadcrumbs where the keyboard character is fine).
- **Bullets** → use HTML lists; don't type `•` in headings.

### Copy examples (lift these verbatim)

**Hero**

> Put your name to it.
> Sealed is a quieter way to sign, send, and store documents — built for the contracts you actually care about.

**Empty states**

- Inbox: _"Nothing to sign. When someone sends you a document, it'll land here."_
- Sent: _"You haven't sent anything for signature yet."_
- Drafts: _"Drafts you're still preparing live here."_

**Button labels (paste these, don't invent new ones)**
Sign now · Send for signature · Add signer · Place signature · Download signed copy · Request changes · Decline to sign

**Status badges**
Awaiting you · Awaiting others · Completed · Declined · Expired · Draft

**Microcopy**

- Upload well: _"Drop a PDF, or choose from your computer. Up to 25 MB."_
- After send: _"Sent. We'll let you know when each signer completes their part."_
- On the signed page: _"This document is sealed. The audit trail is on the last page."_

---

## Visual foundations

### Palette

- **Neutrals** are slightly cool (slate-tinted). We pair `--ink-900` for text with `--paper` (#FFFFFF) for surfaces and `--ink-50` for app backdrops. Never pure black on pure white — always `--ink-900` on `--paper` for a softer read.
- **Primary** is indigo 600 (`#4F46E5`). Used for: primary CTAs, links, focus rings, active field markers, and the brand mark. **Never** used as a flat background on large areas — indigo appears as ink on paper, or as a subtle tint (`--indigo-50`).
- **Signed / success** is `--success-500` (emerald). Reserved for "completed," "signed," audit-trail accents. Never used as a decorative color.
- **Warning** (amber) is reserved for "awaiting" and expiring-soon states.
- **Danger** (red) is reserved for declines, errors, destructive destructive actions. Never for urgency/marketing.

### Type

- **Display (serif):** Source Serif 4 — hero H1/H2, marketing headlines, large numbers. Editorial feel, slightly condensed, with italics available for emphasis in long-form.
- **UI (sans):** Inter — everything else. Weights: 400 / 500 / 600 / 700.
- **Mono:** JetBrains Mono — document IDs, timestamps, IP addresses in the audit trail, code blocks.
- **Script:** Caveat — **used sparingly**. Shows up in the brand mark, in one hero moment ("Put your _name_ to it"), and as the default placeholder inside the signature-capture box before the user draws. Never in body copy. Never as a headline.

Headings lean serif; supporting UI leans sans. H1/H2 = serif, H3+ = sans. This is a rule, not a suggestion — it's the rhythm that gives Sealed its editorial calm.

### Spacing

4px base grid. The most common values in layout are `--sp-4` (16) for compact clusters, `--sp-6` (24) between related blocks, `--sp-12` (48) between sections, and `--sp-20` (80) for hero padding. Dense UI (dashboard rows, table cells) drops to `--sp-3` (12) padding.

### Backgrounds

- **No full-bleed photography.** Sealed is a document product — the document is the image.
- **No aggressive gradients.** The one allowed gradient is a subtle paper-to-surface wash (`--ink-50` → `--paper`) on hero sections, barely perceptible.
- **Textures:** A single, very subtle paper-grain texture is allowed on the upload canvas and signed-document preview (opacity ≤ 4%). Everywhere else: flat.
- **No repeating patterns.** No dot grids. No illustrated characters.

### Animation

- **Philosophy:** Motion is functional, never decorative. Things fade and slide in with authority — they don't bounce, spin, or wiggle.
- **Standard easing:** `cubic-bezier(0.2, 0, 0, 1)` — a decelerate curve.
- **Durations:** 120ms (hover/press), 200ms (tooltips, menus, field focus), 320ms (sheets, modals, page transitions).
- **No bounces.** No elastic. No confetti. Ever.
- **Signing signature:** the _only_ flourish. When a user completes signing, their drawn signature briefly pulses its stroke color through indigo → emerald over 320ms, then settles. That's the celebration.

### Hover & press states

- **Hover on fills:** darken by ~1 step (indigo 600 → indigo 700).
- **Hover on ghost/text buttons:** apply `--bg-subtle` background tint.
- **Hover on rows:** apply `--bg-subtle` background tint.
- **Press:** darken by 2 steps and scale to `0.98` on CTAs. No scale on rows or menu items.
- **Focus ring:** `--shadow-focus` — a 4px indigo halo at 18% opacity. Always visible on keyboard focus; hidden on mouse interaction.

### Borders

- **Hairlines:** `1px solid var(--border-1)` everywhere. Borders are a first-class citizen in Sealed — we use them instead of heavy shadows to define surfaces.
- **Dividers inside cards:** same `--border-1`, often inset with `--sp-4` padding.
- **Input borders:** 1px idle, 1.5px focus (combined with the focus ring).
- **No colored borders** except focus (indigo) and error (red).

### Shadows

- Used sparingly. The default card on the page is **border + no shadow**. Shadows appear on elevated UI: dropdown menus (`--shadow-md`), popovers (`--shadow-lg`), modals (`--shadow-xl`).
- **`--shadow-paper`** is a special signature shadow for the document preview — it simulates a printed page lifted slightly off the background, with a 1px hairline border baked in.
- **Never inner shadows.** They make UI feel cheap.

### Protection gradients vs capsules

Sealed uses **capsules** (pill-shaped or rounded-rect chips) over text on imagery. No protection gradients or scrim overlays — we rarely use large imagery. When we do need contrast (e.g. a status badge overlaid on the PDF preview), it's a small, solid pill.

### Layout rules

- **Max content width:** 1200px for marketing, 1440px for the app.
- **App uses a 3-pane layout:** left rail (navigation, 240px) · center (document), right rail (details, 360px).
- **Fixed top bar on all app pages:** 56px, border-bottom, never a shadow.
- **Mobile bottom bar:** 64px, fixed, with safe-area inset.
- **Sheet modals** on mobile; centered-modal on desktop. Never a full-screen takeover on desktop.

### Transparency & blur

- Backdrop blur is used only on the sticky nav when the page scrolls underneath it: `backdrop-filter: blur(12px); background: rgba(255,255,255,0.72)`.
- No other blur. No frosted-glass cards. No "liquid" surfaces.

### Color vibe of imagery

When we do use imagery (placeholder contract-avatar photos, marketing): **cool, slightly desaturated, natural light, paper-forward**. Never warm sunset tones. Never stock-photo smiling-in-office. Prefer detail shots: hands on a desk, a pen on paper, a stamped envelope, a courthouse facade. Grain is fine; filters are not.

### Corner radii

| Token      | px  | Use                                   |
| ---------- | --- | ------------------------------------- |
| `--r-xs`   | 6   | Chips, inline code                    |
| `--r-sm`   | 8   | Small buttons, icon buttons           |
| `--r-md`   | 12  | Inputs, buttons (default), menu items |
| `--r-lg`   | 16  | Cards                                 |
| `--r-xl`   | 20  | Panels, right-rail                    |
| `--r-2xl`  | 28  | Hero surfaces, signing pad            |
| `--r-pill` | 999 | Status badges, tags                   |

### Cards

**Default card** = `var(--paper)` fill, `1px solid var(--border-1)`, `var(--r-lg)` radius, **no shadow**. Padding is `--sp-6` (24px).
**Elevated card** (rare — used for "hero" callouts on marketing): same, plus `--shadow-md`.

---

## Iconography

Sealed uses **[Lucide](https://lucide.dev/)** as its icon system — a CDN-available, open-source, 1.5px stroke-weight icon library that pairs cleanly with Inter and Source Serif.

> **⚠️ Substitution flag:** No custom icon library was provided. If you have one, drop it into `assets/icons/` and update this section.

**Rules of use:**

- **Stroke weight:** 1.75px (Lucide default). Do not mix with filled/solid icons.
- **Size:** 16 (dense UI), 20 (default), 24 (rail nav), 32+ (empty-state hero).
- **Color:** `currentColor` — always inherit from the text color around them. Never color an icon independently except for semantic states (success-500 on the "signed" checkmark).
- **Pairing with labels:** 6–8px gap between icon and text. Icons are always the same height as their label's cap height.
- **Emoji:** Forbidden in product UI. Forbidden in email. Forbidden in marketing.
- **Unicode glyphs as icons:** Forbidden. Use an SVG. The one exception: `→` is okay inside running prose (e.g. "Upload → Place → Sign"), not as a standalone icon.

**Loading Lucide in an HTML artifact:**

```html
<script src="https://unpkg.com/lucide@latest/dist/umd/lucide.min.js"></script>
<i data-lucide="pen-tool"></i>
<script>
  lucide.createIcons();
</script>
```

**Named icons we use often:**
`pen-tool` · `file-signature` · `file-text` · `upload-cloud` · `send` · `check-circle-2` · `circle-dashed` · `shield-check` · `clock` · `users` · `download` · `more-horizontal` · `x` · `arrow-right` · `arrow-left` · `chevron-right` · `lock` · `mail` · `inbox`

---

## Signature motif

The one recurring visual flourish in Sealed is the **underline-and-script combination** — a single flowing line beneath a word in Caveat script, echoing a signature on a page. It appears:

- In the logo mark (below the ink-pen glyph).
- Once in the marketing hero (under the word _name_).
- As the cursor-like stroke animation while drawing a signature.
- In empty states for the Signatures screen.

Don't overuse it. One per surface, maximum.
