# Seald design system

Audience: a designer reviewing UI work, and the engineer implementing it.
Values below are copied from the files named in each section. Hex in
`tokens.css` is lowercase; the same colors in `theme.ts` are uppercase.
They are the same sRGB values.

There is no dark theme. `SealdThemeProvider`
(`apps/web/src/providers/SealdThemeProvider.tsx`) always passes the `seald`
object. The only `prefers-color-scheme` behavior is the favicon
(`apps/web/index.html`).

## Where tokens live

| File | What it owns |
| --- | --- |
| `apps/web/src/styles/tokens.css` | CSS variables for color, semantic color, shadows, and `--overlay`. Imported once from `main.tsx`. |
| `apps/web/src/styles/theme.ts` | The styled-components theme: color (raw + semantic), font, space, radius, shadow, motion, z-index. **This is what components read.** |
| `apps/web/src/styles/globalStyles.ts` | Reset, body type, focus ring, reduced motion. Injected by the theme provider. |
| `apps/web/src/styles/mixins.ts` | `truncateText` only. No breakpoint mixin. |
| `apps/web/src/styles/styled.d.ts` | `DefaultTheme` = `SealdTheme`. |
| `Design-Guide/project/colors_and_type.css` | Canonical specimen sheet. Colors match the app. It also declares type, space, radius, motion, and z as CSS variables. The app keeps those in `theme.ts` instead. |
| `apps/landing/src/styles/globals.css` | Landing copy of the Design-Guide `:root`, plus marketing layout. |
| `apps/api/src/email/templates/_email.css` | Email CSS. No variables (Gmail/Outlook). Hard-coded hex. |

Product code should read `theme.*` (or the CSS variables for the few
surfaces that are plain CSS). Do not introduce a third palette.

Semantic names are the ones to use in UI:

| Token | Resolves to | Use |
| --- | --- | --- |
| `fg.1` / `--fg-1` | ink 900 | Headings |
| `fg.2` / `--fg-2` | ink 700 | Body |
| `fg.3` / `--fg-3` | ink 500 | Meta |
| `fg.4` / `--fg-4` | ink 400 | Placeholder, disabled icon |
| `fg.inverse` | `#FFFFFF` | Text on indigo or ink |
| `bg.app` | ink 50 | Page backdrop |
| `bg.surface` | paper | Cards, sheets |
| `bg.sunken` | ink 100 | Wells |
| `bg.subtle` | ink 150 | Hover, chips |
| `border.1` | ink 200 | Hairline |
| `border.2` | ink 300 | Stronger divider |
| `border.focus` | indigo 500 | Focus stroke |
| `accent.base` | indigo 600 | Brand |
| `accent.hover` | indigo 700 | |
| `accent.press` | indigo 800 | |
| `accent.subtle` | indigo 50 | |
| `accent.ink` | `#FFFFFF` | Label on accent |
| `overlay` | `rgba(15, 23, 42, 0.45)` | Modal scrim |

`theme.color.fg[1]` is the CSS variable `var(--fg-1)`, not a raw hex, so a
future override on `:root` would flow through. Raw scales (`ink`, `indigo`,
`success`, `warn`, `danger`, `info`, and the proposed tag ramps below) are
hex literals inside `theme.ts`.

## Color

### Ink

| Step | Hex | theme key | CSS variable |
| --- | --- | --- | --- |
| 900 | `#0B1220` | `color.ink.900` | `--ink-900` |
| 800 | `#131A2B` | `color.ink.800` | `--ink-800` |
| 700 | `#1F2937` | `color.ink.700` | `--ink-700` |
| 600 | `#374151` | `color.ink.600` | `--ink-600` |
| 500 | `#64748B` | `color.ink.500` | `--ink-500` |
| 400 | `#94A3B8` | `color.ink.400` | `--ink-400` |
| 300 | `#CBD5E1` | `color.ink.300` | `--ink-300` |
| 200 | `#E2E8F0` | `color.ink.200` | `--ink-200` |
| 150 | `#EDF1F6` | `color.ink.150` | `--ink-150` |
| 100 | `#F3F6FA` | `color.ink.100` | `--ink-100` |
| 50 | `#F8FAFC` | `color.ink.50` | `--ink-50` |
| paper | `#FFFFFF` | `color.paper` | `--paper` |

### Indigo

| Step | Hex | CSS variable |
| --- | --- | --- |
| 50 | `#EEF2FF` | `--indigo-50` |
| 100 | `#E0E7FF` | `--indigo-100` |
| 200 | `#C7D2FE` | `--indigo-200` |
| 300 | `#A5B4FC` | `--indigo-300` |
| 400 | `#818CF8` | `--indigo-400` |
| 500 | `#6366F1` | `--indigo-500` |
| 600 | `#4F46E5` | `--indigo-600` (brand primary) |
| 700 | `#4338CA` | `--indigo-700` (hover) |
| 800 | `#3730A3` | `--indigo-800` (pressed) |
| 900 | `#312E81` | `--indigo-900` |

### Semantic ramps

Only steps 50, 500, and 700 exist. There is no 100/200/300/400/600/800/900.

| Ramp | 50 | 500 | 700 |
| --- | --- | --- | --- |
| success | `#ECFDF5` | `#10B981` | `#047857` |
| warn | `#FFFBEB` | `#F59E0B` | `#B45309` |
| danger | `#FEF2F2` | `#EF4444` | `#B91C1C` |
| info | `#EFF6FF` | `#3B82F6` | `#1D4ED8` |

Theme keys: `color.success[50]`, `color.warn[500]`, `color.danger[700]`,
`color.info[500]`, and the same shape for the other steps.

### Proposed tokens: decorative tag ramps

Tag chips need hues the semantic ramps do not cover. These three ramps are
an explicit proposal for that palette only. They are not status colors.
Each ramp is steps 50, 500, and 700. Product UI paints tags with 50 and 700;
the 500 step exists so the ramp matches the semantic shape and is unused
by current call sites.

| Ramp | 50 | 500 | 700 |
| --- | --- | --- | --- |
| pink | `#FDF2F8` | `#EC4899` | `#BE185D` |
| violet | `#F5F3FF` | `#8B5CF6` | `#6D28D9` |
| cyan | `#ECFEFF` | `#06B6D4` | `#0E7490` |

Theme keys: `color.pink`, `color.violet`, `color.cyan`.

Folded into tokens that already exist:

- There is no `danger.200`. The mobile error-banner border uses `danger.50`
  (`#FEF2F2`). The previous border was `#FECACA`.
- There is no green ramp. The tag palette's last slot uses `success`
  (`#ECFDF5` / `#047857`) in place of `#F0FDF4` / `#166534`.
- There is no `brand.drive.blue`. Drive marks use `brand.google.blue`
  (`#4285F4`), the same hex. `brand.drive.green` and `brand.drive.yellow`
  stay, because they are not the Google mark colors.

### Shadows

Defined as `--shadow-*` in `tokens.css` and referenced from `theme.shadow`.
Tint is `rgba(15, 23, 42, …)`.

| Token | Value |
| --- | --- |
| `xs` | `0 1px 2px rgba(15, 23, 42, 0.04)` |
| `sm` | `0 1px 2px rgba(15, 23, 42, 0.04), 0 2px 4px rgba(15, 23, 42, 0.04)` |
| `md` | `0 2px 4px rgba(15, 23, 42, 0.04), 0 6px 16px rgba(15, 23, 42, 0.06)` |
| `lg` | `0 4px 8px rgba(15, 23, 42, 0.04), 0 12px 28px rgba(15, 23, 42, 0.08)` |
| `xl` | `0 8px 16px rgba(15, 23, 42, 0.06), 0 24px 56px rgba(15, 23, 42, 0.12)` |
| `focus` | `0 0 0 4px rgba(79, 70, 229, 0.18)` |
| `paper` | `0 1px 0 rgba(15, 23, 42, 0.04), 0 10px 30px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)` |

## Typography

Loaded from Google Fonts in `apps/web/index.html` (weights Inter 400–700,
Source Serif 4 400–600 plus italic 400, JetBrains Mono 400–500, Caveat
500–700).

| Role | `theme.font` stack |
| --- | --- |
| `sans` | `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif` |
| `serif` | `'Source Serif 4', 'Iowan Old Style', 'Palatino Linotype', Georgia, serif` |
| `mono` | `'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace` |
| `script` | `'Caveat', 'Segoe Script', cursive` |

Use serif for page titles and the wordmark. Use script only for a typed
signature. Use mono for ids, timestamps, and codes.

### Size

| Token | Value | Typical use |
| --- | --- | --- |
| `display` | 64px | Rare hero. Landing and Design-Guide, not dashboard. |
| `h1` | 48px | `PageHeader` size `lg` |
| `h2` | 36px | `PageHeader` size `md` (dashboard) |
| `h3` | 28px | |
| `h4` | 22px | |
| `h5` | 18px | Nav wordmark |
| `bodyLg` | 18px | |
| `body` | 16px | Body default (`globalStyles`) |
| `bodySm` | 14px | Controls, nav items, buttons sm/md |
| `caption` | 13px | Eyebrows, footer, helper intent |
| `micro` | 11px | Overlines, dense meta |

### Weight, line height, tracking

| | |
| --- | --- |
| Weight | regular 400, medium 500, semibold 600, bold 700 |
| Line height | tight 1.1, snug 1.25, normal 1.5, relaxed 1.65 |
| Tracking | tight `-0.02em`, normal `0`, wide `0.04em`, wider `0.08em` (eyebrows) |

Body in `globalStyles.ts`: 16px, line-height 1.5, color `fg.2`, background
`bg.app`, antialiased. Headings in product components set their own family;
there is no global `h1` style inside the SPA (the Design-Guide `.sealed h1`
rules are for the HTML kits).

## Space, radius, motion, z-index

Space is a 4px grid. There is no step 7, 9, 11, or 14.

| Token | px |
| --- | --- |
| `space.1` | 4 |
| `space.2` | 8 |
| `space.3` | 12 |
| `space.4` | 16 |
| `space.5` | 20 |
| `space.6` | 24 |
| `space.8` | 32 |
| `space.10` | 40 |
| `space.12` | 48 |
| `space.16` | 64 |
| `space.20` | 80 |
| `space.24` | 96 |

| Radius | px |
| --- | --- |
| `xs` | 6 |
| `sm` | 8 |
| `md` | 12 (inputs, default buttons md/lg) |
| `lg` | 16 (cards) |
| `xl` | 20 |
| `2xl` | 28 |
| `pill` | 999 |

| Motion | Value |
| --- | --- |
| `easeStandard` | `cubic-bezier(0.2, 0, 0, 1)` |
| `easeEmphasized` | `cubic-bezier(0.2, 0, 0, 1.15)` |
| `easeDecelerate` | `cubic-bezier(0, 0, 0.2, 1)` |
| `durFast` | 120ms |
| `durBase` | 200ms |
| `durSlow` | 320ms |

`globalStyles.ts` sets animation and transition duration to `0.001ms` under
`prefers-reduced-motion: reduce`.

| Z | Value | Use |
| --- | --- | --- |
| `nav` | 20 | Top bar |
| `sticky` | 30 | |
| `overlay` | 80 | Scrim |
| `modal` | 90 | Dialog |
| `toast` | 100 | Toast |

## Layout

There is no shared breakpoint mixin. `styles/mixins.ts` exports `truncateText`
only. Every SPA `@media` query is `max-width` (legacy desktop-first). New
CSS is mobile-first: base styles are the small viewport, and desktop
enhancements use `min-width`. Leave the existing `max-width` queries in
place until that screen is rewritten.

`AppShell` redirects to `/m/send` at `max-width: 640px`
(`hooks/useIsMobileViewport.ts`). That redirect covers sender chrome only
(dashboard, documents, templates, settings, the editor). Phones still
render auth, signing, verify, and `/m/send`, and those pages' media
queries do run. "Phones never see the 768px dashboard CSS" is true inside
`AppShell` and false on signing, verify, and auth.

Counts below are on `main` `4a8c663`. Re-grep `@media (max-width` under
`apps/web/src` before citing them. Content `max-width` values (420, 440,
560, 640, 680, 920, 960, 1240, 1280) are column caps, not viewport
breakpoints, and are not listed here.

| Query | Files | Who hits it |
| --- | --- | --- |
| `max-width: 400px` | `pages/CheckEmailPage/CheckEmailPage.styles.ts` | Auth, outside `AppShell`. Phones hit it. |
| `max-width: 640px` | `useIsMobileViewport` (`AppShell` redirect); `AuthShell.styles.ts`; `AuthForm.styles.ts`; `ForgotPasswordPage.tsx`; `VerifyPage.styles.ts` (8); `SigningDonePage.tsx` (2) | The redirect sends phones away from dashboard CSS. Auth, verify, and signing-done are outside the shell, so phones hit those 640px rules. |
| `max-width: 760px` | `components/SendingOverlay/SendingOverlay.styles.ts` | Desktop send overlay. A phone already redirected by `AppShell` does not see it. |
| `max-width: 768px` | `DashboardPage.styles.ts` (4); `UploadPage.styles.ts`; `TemplatesListPage.styles.ts` (`MOBILE = '768px'`) | Inside `AppShell`. Phones are on `/m/send` and do not see these. A window from 641px to 768px still does. |
| `max-width: 768px` | `SigningFillPage.styles.ts` (9); `RecipientHeader.styles.ts` | Signing is outside `AppShell`. Phones hit these. |
| `max-width: 880px` | `routes/settings/integrations/IntegrationsPage.tsx` | Inside `AppShell`. Phones are redirected. Visible from about 641px to 880px. |
| `max-width: 960px` | `AuthBrandPanel.styles.ts` (`display: none`); `AuthMobileHeader.tsx` (shown) | Auth is outside `AppShell`. Phones hit both. |

`lib/canvas-coords.ts` exports `MOBILE_CANVAS_BREAKPOINT = 768`. That is a
JS width check, not a CSS query. The editor and the signing canvas use
it, so a phone on `/sign/.../fill` hits both the 768px CSS and this shrink.

Landing only: `980px` and `600px` in `apps/landing/src/styles/globals.css`.
The SPA does not use them.

Desktop chrome (`AppShell`):

- Column, `height: 100vh`, `overflow: hidden`, background `bg.app`.
- `NavBar`: height 56px, padding `0 24px`, gap 24px, bottom border `border.1`, background `rgba(255,255,255,0.82)`, `blur(12px)`.
- Logo mark 28×28, radius 8px, indigo 600. Wordmark Source Serif 18px, text "Seald".
- Nav item padding `4px 12px`, radius 8px, 14px medium.
- Guest "Sign in" / "Sign up" buttons in the bar are **34px** tall.
- Footer padding `14px 24px`, 13px caption, border-top `border.2`.

Page padding that shows up often:

| Surface | Padding | Max width |
| --- | --- | --- |
| Dashboard `Main` | 48px 48px 80px (`space.12`, `space.20`) | Inner 1280px |
| Dashboard ≤768px | 24px 16px 48px | same |
| Signing prep / review | 48px 24px 80px | |
| Editor rails | Left `CollapsibleRail` min 200 / max 360. Right rail min 280 / max 440. | |
| `FieldsBar` aside | width 360px, padding 24px | |
| `SideBar` (built, not mounted) | width 240px, sticky under the 56px bar | |

`PageHeader` sizes: `lg` title 48px serif, `md` title 36px serif. Eyebrow
13px, tracking `0.08em`. The dashboard uses `md`.

`SideBar` (`components/SideBar`) matches the Design-Guide left rail and is
exported from the barrel. No page renders it. Product navigation is the top
`NavBar` only.

## Icons

`lucide-react` is the icon set. Wrap icons in `components/Icon` when the
control is icon-only or the size should match the system: default **20px**,
stroke **1.75**. Pass `label` to expose `role="img"`; otherwise the icon is
`aria-hidden`.

Exceptions, kept as brand SVG: `GoogleButton`, Drive mark
(`features/gdriveImport/GDriveLogo.tsx` and the integrations page),
`EnvelopeIllustration`.

## Accessibility rules already in the system

- Keyboard focus: `globalStyles.ts` draws `outline: 2px solid border.focus`
  with `outline-offset: 2px` on `:focus-visible`, and removes the outline
  for mouse `:focus`.
- Many controls also set `box-shadow: theme.shadow.focus` and `outline: none`
  on their own focus rule. Those two systems stack or fight. Prefer one:
  the 4px indigo halo on inputs and buttons, the 2px outline on text links.
- 44×44px hit areas exist on verify, several signing controls, auth skip,
  disconnect modal, and parts of the mobile sender. They are not a property
  of `Button`.
- Interactive tests use Testing Library roles and, on primitives, `vitest-axe`.
- ESLint: `eslint-plugin-jsx-a11y` recommended. `jsx-a11y/no-autofocus` is off.
- No skip-to-content link. The word "Skip" on auth screens starts guest mode.
- `<html lang="en">`. There is no i18n catalog and no `dir="rtl"` layout.
  Dates use `en-US` or the runtime locale (`lib/dateFormat.ts`).

## Component inventory

Paths are under `apps/web/src/components/<Name>/` unless noted. "Layer" is
the Storybook title prefix where one exists, cross-checked with the ESLint
zones in `eslint.config.js`. The ESLint lists are incomplete: a component
can import upward without a lint error if it is missing from those arrays.
See `PR_REVIEW_CHECKLIST.md`.

Props below are the ones that change appearance or behavior. Most components
also accept normal DOM props. Optional props are typed `T | undefined`
because `exactOptionalPropertyTypes` is on.

### L1 primitives — reach for these first

| Component | Variants / props | When to use |
| --- | --- | --- |
| `Button` | `variant`: `primary` \| `secondary` \| `ghost` \| `danger` \| `dark`. `size`: `sm` \| `md` \| `lg`. `iconLeft`, `iconRight`, `loading`, `fullWidth`. | Every button. Primary is indigo 600. `dark` is ink 900 (the email CTA color). Do not invent a sixth variant in a page stylesheet. |
| `TextField` | `type` text/email/password/url/tel/search. `label`, `helpText`, `error`, `iconLeft`. | Single-line inputs. Padding 11px 14px, radius 12px, 14px type. Help and error text are a raw **12px**, not `caption` (13px). Label is optional, so callers must pass one (or an `aria-label`). |
| `PasswordField` | Wraps `TextField` with visibility toggle. | Passwords. Pair with `PasswordStrengthMeter`. |
| `PasswordStrengthMeter` | Prop `level: PasswordStrength` (`0 \| 1 \| 2 \| 3 \| 4`). | Signup only. |
| `Badge` | `tone`: `indigo` \| `amber` \| `emerald` \| `red` \| `neutral`. Optional dot 6px. Pill, padding 4px 10px 4px 8px, 12px semibold. | Generic status chips. For signer status use `StatusBadge`. |
| `Avatar` | `size` 24 \| 32 \| 40 \| 56. `tone`: `indigo` \| `emerald` \| `amber` \| `danger` \| `slate`. Initials, white text. | People. Do not use a raw colored circle. |
| `Icon` | Lucide icon, `size` default 20, `label?`. | Icon-only controls and consistent stroke. |
| `Card` | Surface, radius, shadow from theme. | Grouped content. |
| `Divider` | Horizontal rule using `border.1`. | Section breaks. |
| `DocThumb` | `size` 40 \| 52 \| 72. | Document thumbnail in lists. |
| `EmptyState` | Title, body, action slot. | Zero-data panels. |
| `Skeleton` | `variant`: `text` \| `rect` \| `circle`. | Loading. Dashboard stories render this while envelopes load. |
| `StatCard` | Label, value, hint. | Dashboard metric tiles. |
| `ProgressBar` | `tone`: `indigo` \| `success`. | Linear progress. Signer completion uses `SignerProgressBar`. |
| `GoogleButton` | Google "G" SVG plus label. | OAuth only. Do not recolor the mark. |
| `GuestBadge` | Small "Guest" chip. | Chrome when `guest` is true. |
| `SignatureMark` | `tone`: `ink` \| `indigo`. | Static signature glyph, not the pad. |

`Button` size box (padding, type, radius). No `min-height`.

| Size | Padding | Font | Radius |
| --- | --- | --- | --- |
| sm | 4px 12px | 14px | 8px |
| md | 8px 16px | 14px | 12px |
| lg | 12px 20px | 16px | 12px |

Shared: inline-flex, gap 8px, weight 600, line-height 1.2, 120ms color
transition. Primary press scales to 0.98 and uses indigo 800. Focus halo is
`shadow.focus`.

### L2 domain

| Component | Notable props | When to use |
| --- | --- | --- |
| `StatusBadge` | `status`: `awaiting-you`, `awaiting-others`, `completed`, `declined`, `expired`, `draft`. | Signer/envelope status. Map is fixed: indigo "Awaiting you", amber "Awaiting others", emerald "Signed", red "Declined"/"Expired", neutral "Draft". |
| `PageHeader` | `size`: `lg` \| `md`. Eyebrow, title, actions. | Top of a page inside `AppShell`. |
| `SignerRow` | Name, email, status, actions. | One recipient in a list. |
| `SignerStack` | Entry status: `signed` \| `pending` \| `awaiting-you` \| `declined` \| `draft`. | Compact stacked avatars. |
| `SignerField` | One field a recipient fills. | Signing surface. |
| `SignatureField` | Placed signature well on a page. | Editor and preview. |
| `PlacedField` | Positioned field on the PDF. | Editor canvas. |
| `FieldsPlacedList` | Signer + items. | List of fields already placed. |
| `FilterTabs` | `items` with id, label, count. | Dashboard status tabs. |
| `PageThumbStrip`, `PageThumbRail` | Page index, current page. | Jump between PDF pages. |
| `PageToolbar` | Zoom, page nav. | Above the canvas. |
| `SendPanelFooter` | Primary/secondary actions for the editor. | Bottom of the send column. |
| `ActivityTimeline` | `tone`: `indigo` \| `success` \| `amber` \| `danger` \| `slate`. | Envelope audit events. |
| `FieldInputDrawer` | `kind`: `text` \| `email` \| `date` \| `name`. | Mobile/narrow field editor. |
| `RecipientHeader` | Document title, progress. | Signer chrome (no `AppShell`). |
| `ReviewList` | Field kinds to confirm. | Signer review step. |
| `SignatureCapture` | `format`: `drawn` \| `typed` \| `upload`. `kind`: `signature` \| `initials`. | Capturing a signature outside the full pad. |
| `AddSignerDropdown` | Contact list. | Pick an existing contact. |
| `AuthBrandPanel` | No content props. Copy is hard-coded. | Left pane of auth screens. Hidden when the viewport is narrow. |
| `UserMenu` | Name, email, sign-out, account actions. | Right side of `NavBar`. |
| `EmailMasthead` | Preview of the email header. | Storybook / email preview, not the sent MIME. |
| `TagChip` | Label and color. | A single tag. Colors come from `features/templates/tagColors.ts`, not from `Badge` tones. |
| `TemplateCard` | `accent`: `indigo` \| `amber` \| `emerald` \| `pink`. | Template library card. `pink` is not a theme ramp. |
| `TemplateModeBanner` | `tone`: `success` \| `info`. | "You are editing / using a template". |
| `TemplateFlowHeader` | `step` 1 \| 2 \| 3. `mode`: `new` \| `using` \| `editing`. | Wizard sub-header under `NavBar`. |
| `RemoveLinkedCopiesDialog` | `scope`: `only-this` \| `all-pages`. | Deleting a field that was placed on many pages. |

### L3 widgets and chrome

| Component | Notable props | When to use |
| --- | --- | --- |
| `NavBar` | `mode`: `authed` \| `guest`. Items from `NAV_ITEMS`. | The only app navigation. Do not mount `SideBar` beside it unless product IA changes on purpose. |
| `SideBar` | Nav items, folders, primary action. Width 240px. | Design-Guide parity only. Unused in routes today. |
| `AuthShell` | Centers the form. Slots `AuthBrandPanel`. | Sign-in, sign-up, forgot password. |
| `AuthForm` | `mode`: `signin` \| `signup` \| `forgot`. | Those three forms. Skip starts guest mode; it is not an a11y skip link. |
| `CollapsibleRail` | `side`: `left` \| `right`. | Editor side panels. |
| `DocumentCanvas`, `DocumentPageCanvas`, `PdfPageView` | PDF page rendering. | Editor vs signer page view. Signer code may use `DocumentPageCanvas`; it must not pull in Supabase. |
| `FieldPalette` | Field kinds to drag. | Left rail of the editor. |
| `FieldsBar` | Signers assigned to fields. | Right rail, 360px. |
| `PlaceOnPagesPopover` | `this` \| `all` \| `allButLast` \| `last` \| `custom`. | Repeat a field across pages. |
| `SelectSignersPopover` | Signer ids. | Assign a field. |
| `SignaturePad` | `mode`: `type` \| `draw` \| `upload`. Subfolders `modes/DrawMode`, `TypeMode`, `UploadMode`. | Full signature capture. |
| `SignersPanel`, `SignersStepCard` | Signer list for upload / template use. | Collecting recipients. |
| `CreateSignatureRequestDialog` | Opens a new request. | Entry from a list. |
| `SendConfirmDialog` | Confirm send. | Before `POST /send`. Has a story, no unit test. |
| `SendingOverlay` | Phases and signer names. | Blocking state while send is in flight. |
| `ExitConfirmDialog` | Confirm leaving a dirty editor. | Unsaved changes. |
| `SaveAsTemplateDialog` | Template name and payload. | Save the current envelope as a template. |
| `TemplatePickerDialog` | Pick a template. | Start from a template. |
| `DownloadMenu` | Menu items. | Download sealed PDF / audit. |
| `Toast` | `tone`: `success` \| `error` \| `info`. | Transient feedback. Has a story, no unit test. |
| `drive-picker/DrivePicker` | `mime`: `pdf` \| `doc` \| `docx` \| `all`. | Google Picker wrapper. |
| `EmailCard` | Email preview card. | Previews, not production MIME. |

### Small or internal

| Component | Notes |
| --- | --- |
| `ColumnResizeHandle` | Dashboard column drag. Test, no story. |
| `FilterToolbar` | Dashboard filters. No story, no test. |
| `TagEditor`, `TagEditorPopover`, `TagFilterMenu` | Tag editing. `TagFilterMenu` has neither story nor test. |
| `DialogPrimitives` | Shared dialog styles. No story, no test. |
| `ErrorBoundary` | Per-route in `AppShell`, and around mobile send. Test, no story. |
| `EnvelopeIllustration` | Empty-state SVG. Hard-coded hex. No story, no test. |
| `GuestSenderEmailDialog` | Asks a guest for an email before send. Test, no story. |
| `shared/Spinner`, `shared/ErrorBanner` | Internal. Not a public primitive; pages sometimes restyle their own error banner instead. |

### Pages (L4)

These are screens, not kit components. Compose them from the tables above.
Route ownership is in `CODEBASE_GUIDE.md`.

Auth: `SignInPage`, `SignUpPage`, `ForgotPasswordPage`, `CheckEmailPage`,
`AuthCallbackPage`.

Sender: `DashboardPage`, `ContactsPage`, `TemplatesListPage`,
`UseTemplatePage`, `UploadPage`, `DocumentPage`, `EnvelopeDetailPage`,
`SentConfirmationPage`.

Settings: `routes/settings/integrations/IntegrationsPage` plus
`DisconnectModal`.

Signer: `SigningEntryPage`, `SigningPrepPage`, `SigningFillPage`,
`SigningReviewPage`, `SigningDonePage`, `SigningDeclinedPage`.

Public: `VerifyPage`.

Mobile: `pages/MobileSendPage/` (its own screens, not `AppShell`) and
`MobileGdriveReturnPage.tsx`.

## UX patterns

**Auth.** Split layout: editorial brand panel (serif headline "Documents,
*sealed* in minutes.", one testimonial, trust line "PAdES-LT · RFC 3161
timestamps · AES-256 at rest") and a single column form. Google button, then
email and password. Guest entry is a text button under the form. Errors use
a danger banner with an `AlertTriangle` icon (`role="alert"`).

**Desktop app.** Top nav, page header, then content on `bg.app`. Dashboard
is a stat row plus a filterable table inside a 1280px column. Empty and
loading states should use `EmptyState` and `Skeleton`.

**Editor.** Three panes: field palette, PDF, signer/field bar. Rails
collapse. Dirty exit uses `ExitConfirmDialog`.

**Signing.** No sender nav. `RecipientHeader`, one task per step
(prep, fill, review). Session loss returns to the entry URL.

**Verify.** Public, no auth chrome. Shows seal state and
"Audit chain · intact" or "Audit chain · broken".

**Mobile.** ≤640px does not reflow the desktop shell. It routes to
`/m/send`, a separate wizard. Treat that folder as its own surface when
reviewing visuals.

**Dialogs.** Scrim is `theme.color.overlay`. Layer them at `z.modal` (90).
Escape handling goes through `hooks/useEscapeKey.ts`. Trap focus; the
disconnect modal and template list are the reference implementations.

**Tags.** Not `Badge` tones. `features/templates/tagColors.ts` maps a few
names to hex pairs and hashes unknown names into an 8-color palette that
includes pink, violet, and cyan. Those hues are outside `tokens.css`.

## Known inconsistencies

1. **Three stylesheets.** SPA theme, landing `:root`, and email hex. Landing
   primary buttons use indigo 600, matching `Button` `primary`. Email
   `.cta` and `.cta-primary` use `#0b1220` (ink 900). `.cta-indigo` is the
   one that matches the app. Email also uses `#475569`, `#f1f5f9`,
   `#92400e`, `#fef3c7`, and `#991b1b`, which are not in the ink/warn/danger
   steps. Email body background is `#f3f6fa` (ink 100), not the app's ink 50.
   Email mark radius is 7px; the nav mark is 8px.
2. **Design-Guide name and chrome.** Kits say "Sealed" in `<title>` and
   still show a 240px left rail plus a top bar (`ui_kits/dashboard`). The
   app wordmark is "Seald" and has no left rail. Dashboard kit padding is
   40/48/80 with max-width 1320; the app is 48/48/80 with max-width 1280.
   Kit page title is 40px; the app header at `md` is 36px.
3. **`tokens.css` is a subset.** Type, space, radius, motion, and z-index
   are JS-only in the SPA. The Design-Guide CSS file has them as variables.
   Do not expect `var(--sp-4)` to exist in the app.
4. **Hex outside the theme.** ESLint bans hex in `src/**/*.styles.ts`,
   `src/**/*.tsx`, and `features/templates/tagColors.ts`. The design-cycle
   remainder is `apps/web/eslint/hex-allowlist.txt` (review by 2026-12-31):
   `VerifyPage`, `UseTemplatePage`, and the `MobileSendPage` screens.
   `lib/mockApi` fixtures are `.ts` and outside that ban.
5. **Focus and hit area.** Global 2px outline plus per-component 4px halo.
   `NavBar` auth buttons are 34px tall. `Button` sm/md are shorter than
   44px. `TextField` help text is 12px while the caption token is 13px.
6. **Breakpoints are per screen, and they are desktop-first.** Every SPA
   query is `max-width`. The 640px `AppShell` redirect does not suppress
   CSS outside the shell. Phones hit 768px rules on `SigningFillPage` and
   `RecipientHeader`, 640px rules on `VerifyPage`, `SigningDonePage`,
   `AuthShell`, `AuthForm`, and `ForgotPasswordPage`, the 400px rule on
   `CheckEmailPage`, and the 960px auth brand panel. Dashboard, templates,
   and upload 768px rules, and the integrations 880px rule, sit inside
   `AppShell`, so a phone never reaches them. New CSS should be
   mobile-first (`min-width`). See the layout table above.
7. **NavBar scrim vs landing.** App bar uses white at 0.82 opacity. Landing
   nav uses 0.78.
8. **Document title.** `apps/web/index.html` sets `<title>Seald — Dev Harness</title>`.
   Nothing in `apps/web/src` sets `document.title`. Cloudflare serves that
   file as `app.html` for every SPA route.
9. **Light only.** No theme switch. Cookie banner and legal footer are easy
   to miss against `bg.app` because they are intentionally quiet (caption,
   `fg.3`).
