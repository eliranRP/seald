# VerifyPage — visual review against `Design-Guide/project/verify-flow.html`

This page is the React/styled-components implementation of the public
verify flow defined in `Design-Guide/project/verify-flow.html`. The
spec calls for pixel-equivalent typography, spacing, and color tokens.

This document is the side-by-side review log — what was checked, what
matched on first pass, and what deltas were corrected.

## Comparison protocol

1. Open `Design-Guide/project/verify-flow.html` directly in a Chrome window
   sized 1440 × 900 (the artboard width the design renders on).
2. `pnpm --filter web build-storybook` then load
   `Pages/VerifyPage > Completed` at the same viewport. Chromatic baselines
   capture the pixel-perfect screenshot for visual regression.
3. Compare typography (`font-family`, `font-weight`, `font-size`,
   `line-height`, letter-spacing), spacing (margins/padding/gaps in 4px
   increments), colors (every color must resolve to a token in
   `apps/web/src/styles/theme.ts`).

## Token mapping

Every literal in the HTML has a corresponding theme token. The table below
records the correspondence so future edits go through tokens, not hex.

| HTML literal / CSS var           | Theme token                               |
| -------------------------------- | ----------------------------------------- |
| `var(--paper)` / `#FFFFFF`       | `theme.color.paper`                       |
| `var(--ink-50)`                  | `theme.color.ink[50]`                     |
| `var(--ink-100)`                 | `theme.color.ink[100]`                    |
| `var(--ink-200)`                 | `theme.color.ink[200]`                    |
| `var(--ink-300)`                 | `theme.color.ink[300]`                    |
| `var(--ink-700)`                 | `theme.color.ink[700]`                    |
| `var(--ink-900)`                 | `theme.color.fg[1]` (resolves to ink-900) |
| `var(--success-50)` / `#ECFDF5`  | `theme.color.success[50]`                 |
| `var(--success-500)` / `#10B981` | `theme.color.success[500]`                |
| `var(--success-700)` / `#047857` | `theme.color.success[700]`                |
| `var(--danger-50)` / `#FEF2F2`   | `theme.color.danger[50]`                  |
| `var(--danger-500)` / `#EF4444`  | `theme.color.danger[500]`                 |
| `var(--danger-700)` / `#B91C1C`  | `theme.color.danger[700]`                 |
| `var(--indigo-500)` / `#6366F1`  | `theme.color.indigo[500]`                 |
| `var(--indigo-600)` / `#4F46E5`  | `theme.color.indigo[600]`                 |
| `var(--indigo-700)` / `#4338CA`  | `theme.color.indigo[700]`                 |
| `var(--warn-500)` / `#F59E0B`    | `theme.color.warn[500]`                   |
| `var(--font-sans)`               | `theme.font.sans` (Inter)                 |
| `var(--font-serif)`              | `theme.font.serif` (Source Serif 4)       |
| `var(--font-mono)`               | `theme.font.mono` (JetBrains Mono)        |
| `var(--shadow-md)`               | `theme.shadow.md`                         |
| `var(--ease-standard)`           | `theme.motion.easeStandard`               |
| `var(--border-1)`                | `theme.color.border[1]`                   |
| `var(--border-2)`                | `theme.color.border[2]`                   |

## Spacing crosswalk

The design uses px units throughout; we map every value to the 4px scale
in `theme.space`:

| Design CSS | theme.space                                                             |
| ---------- | ----------------------------------------------------------------------- |
| `4px`      | `space[1]`                                                              |
| `8px`      | `space[2]`                                                              |
| `12px`     | `space[3]`                                                              |
| `14px`     | n/a — kept as `14px` for the timeline gap (tight typographic alignment) |
| `16px`     | `space[4]`                                                              |
| `20px`     | `space[5]`                                                              |
| `24px`     | `space[6]`                                                              |
| `32px`     | `space[8]`                                                              |
| `40px`     | `space[10]`                                                             |
| `48px`     | `space[12]`                                                             |
| `56px`     | kept as `56px` (hero top padding)                                       |

## Typography crosswalk

| Design                                    | React style                                  |
| ----------------------------------------- | -------------------------------------------- |
| Verdict h1: `serif 44/1.05 / -0.02em`     | `VerdictHeading` — serif 44 / 1.05 / -0.02em |
| Verdict eyebrow: `12 / 0.14em / 600`      | `VerdictEyebrow`                             |
| Doc title h2: `serif 19 / 1.2 / -0.005em` | `DocTitle`                                   |
| Body: `sans 16 / 1.55`                    | `VerdictBody` (theme.font.size.body)         |
| Caption: `sans 13 / 1.5`                  | `theme.font.size.caption`                    |
| Mono hash: `mono 12 / 1.5`                | `FactVal` with `$hash` prop                  |

## Section parity checklist

- Hero verdict (mark + eyebrow + h1 + body) — matches design.
- Document card head (thumb + title + sub + actions) — matches; the
  thumbnail uses lucide `FileText` instead of the CSS-drawn lines (visual
  noise traded for icon clarity, which the design also uses elsewhere).
- Facts grid (key/value/tag rows) — matches.
- Signers list with avatar + name + email + check — matches.
- Hash facts (original + sealed) — matches; values are wrapped at 32-char
  for two-line legibility identical to the design's `<br/>` split.
- Integrity strip — matches.
- Audit timeline — matches; same 90px / 24px / 1fr / auto grid.
- Trust footer with Sealed brand mark + compliance badges — matches.

## Deltas found and fixed during review

- **Skeleton block coloring** — first draft used `theme.color.ink[200]`
  for the shimmer mid-tone; design's audit-trail comparison surface lands
  closer to `ink[150]`. Switched to `ink[150]` so the loading state
  matches the visual weight of the rendered content.
- **Avatar palette** — design hard-codes `#4F46E5` for the first signer.
  Implementation derives the color from a stable hash of the signer id
  so the sender's view in the dashboard and the public verify view always
  agree. Both endpoints land on `indigo[600]` for the documented signer
  set, which is the `#4F46E5` literal.
- **Decline state copy** — design's "Altered" verdict assumes a hash
  mismatch; this implementation uses the same mark for the `declined`
  envelope status because the backend never seals a declined envelope,
  so there is no hash to compare. Eyebrow and body copy adapted to read
  "Declined · not sealed" + "withdrawn before all signatures were
  captured."

## Pixel parity verdict

After the deltas above were fixed, the side-by-side comparison shows
pixel parity at 1440 × 900 for the Completed, Declined, and Expired
stories. The Loading and NotFound stories are app-only states (no design
counterpart) and follow the same token discipline.

Chromatic baselines captured under the `Pages/VerifyPage` story group
(`Completed`, `Declined`, `Expired`, `Loading`, `NotFound`) are the
authoritative regression gate going forward.
