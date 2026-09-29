# Design review — Seald web app

Honest read of the product UI as of this branch. It is based on the source
in `apps/web`, `apps/landing`, `apps/api/src/email`, and `Design-Guide/`,
plus a local Vite run of the SPA (`pnpm dev:web`) at 1440×900 and 390×844.

The local run had dummy Supabase credentials, so sign-in, guest mode, the
dashboard, the editor, and the signing session could not be completed.
Screens that rendered: `/signin`, `/signup`, `/forgot-password`,
`/verify/demo` (network error), and the mobile sign-in layout. Authed
product screens are reviewed from components, styles, and stories, not from
a logged-in session. Screenshot files from that run are not in git.

## Strengths

**The palette is calm and consistent where the theme is actually used.**
Ink, indigo, and four short semantic ramps are enough for a signing
product. Semantic aliases (`fg`, `bg`, `border`, `accent`, `overlay`) give
a designer one vocabulary. Shadows are cool-tinted and light. The indigo
focus halo `0 0 0 4px rgba(79, 70, 229, 0.18)` is defined once, as
`--shadow-focus` and `theme.shadow.focus`. That token is not the only
focus treatment on screen: `globalStyles.ts` also draws a 2px
`:focus-visible` outline, and several controls turn the outline off and
use the halo instead. Finding 5 covers that split.

**Type has a job for each family.** Inter for UI, Source Serif 4 for titles
and the wordmark, JetBrains Mono for ids, Caveat only for a typed
signature. The auth panel uses that split well: serif headline "Documents,
sealed in minutes.", a single testimonial, and a quiet trust line
(PAdES-LT, RFC 3161, AES-256). The form column is one task.

**The component kit is real, not a slide deck.** `Button`, `TextField`,
`Badge`, `StatusBadge`, `Avatar`, `PageHeader`, `NavBar`, and the editor
rails are implemented, storied, and mostly tested with Testing Library and
axe. Signer status is words plus color, not color alone
(`StatusBadge`: "Awaiting you", "Signed", "Declined", …).

**The information architecture of the desktop app is small.** Four nav
items: Documents, Sign, Contacts, Templates. Sign is "start a new
envelope", not a mode that stays highlighted on old documents. That rule
is written down in `layout/navItems.ts` because it was wrong before.

**Signing is visually and technically separated from the sender app.**
Recipients do not sit inside `AppShell`. The route tree is a short
sequence: entry, prep, fill, review, done or declined. That matches how
people actually sign a PDF someone else sent.

**Reduced motion and keyboard focus exist at the root**
(`styles/globalStyles.ts`). The legal footer is on every authed shell, not
only on the marketing site, which is the right place for privacy, terms,
and cookie preferences.

**Mobile was a deliberate product decision, not an accident.** Comments in
`SignInPage` say the desktop dashboard was not designed for 390px, so
viewports ≤640px go to `/m/send` instead of a crushed table. The redirect
is implemented (`AppShell`, `RootLanding`, `RedirectWhenAuthed`).

## Findings

Severity is about users and brand, not about how hard the code is to change.

### High

**1. Every SPA route is titled "Seald — Dev Harness".**

`apps/web/index.html` hard-codes that `<title>`. Nothing under
`apps/web/src` sets `document.title`. Cloudflare Pages copies this file to
`app.html` and serves it for `/signin`, `/documents`, `/sign/…`, and
`/verify/…` (`.github/workflows/deploy-cloudflare.yml`). The marketing
site has proper titles (`apps/landing/src/layouts/BaseLayout.astro`).
The app does not.

A recipient opening a signing link, and a reviewer opening the product,
see a development label in the tab, in history, and in screen readers that
announce the document title. This is the first thing to fix.

**2. The design kits and the product are different products.**

`Design-Guide/project/ui_kits/dashboard/index.html` is titled "Sealed —
Dashboard" and composes a top bar plus a 240px left rail. The live shell
is a 56px `NavBar` only. `SideBar` exists (`components/SideBar`, 240px,
sticky under the bar) and is not mounted by any route.

Measurements also differ:

| | Design-Guide dashboard | `DashboardPage` |
| --- | --- | --- |
| Title | about 40px serif | `PageHeader` `md` = 36px (`h2`) |
| Content max width | 1320px | 1280px (`DashboardPage.styles.ts`) |
| Page padding | 40px 48px 80px | 48px 48px 80px |

A designer who marks up the HTML kit will file bugs against intentional
product choices, and will miss bugs in the real nav. Either update the
kits to Seald + top nav, or write down that the kits are historical.
Right now neither is true, and `Design-Guide/project/README.md` already
says the system was generated without the production codebase.

**3. Mobile sender chrome is a second UI. AppShell routes never show their desktop responsive CSS on a phone. Signing, verify, and auth do.**

`useIsMobileViewport` is `(max-width: 640px)`. At that width `AppShell`
redirects to `/m/send` (`layout/AppShell.tsx`). Dashboard, contacts,
templates, settings, and the document editor live in that shell, so a
phone never sees `DashboardPage`'s 768px card layout, the 768px rules in
`TemplatesListPage` and `UploadPage`, or the 880px rule in
`IntegrationsPage`. A window between 641px and 768px still gets the
desktop nav plus the stacked dashboard.

Signing, verify, and auth are outside `AppShell`. A phone does hit their
CSS: `SigningFillPage.styles.ts` (nine `max-width: 768px` rules) and
`RecipientHeader.styles.ts` (768px), `VerifyPage.styles.ts` (eight
`max-width: 640px` rules), `SigningDonePage.tsx` (640px), the auth shell,
form, and forgot-password page (640px), `CheckEmailPage` (400px), and the
auth brand panel (960px). `lib/canvas-coords.ts`
(`MOBILE_CANVAS_BREAKPOINT = 768`) also shrinks the PDF canvas, so
signing fill hits both the CSS and that JS check. The full inventory is
in `DESIGN_SYSTEM.md` (Layout).

`/m/send` (`pages/MobileSendPage/`) is a separate UI with raw `#fff` and
other hex, and it does not go through `Button` / `PageHeader`. That split
is documented in code comments as a choice. It is still a design problem:
two visual languages, and no layout for "tablet width, I am trying to
read a document I already sent." Contacts, templates, settings, and
envelope detail are unreachable on a phone except by widening the window.
The mobile kit README
(`Design-Guide/project/ui_kits/mobile_web_send/README.md`) still lists
real PDF performance, field resize, and multi-document flows as deferred.

### Medium

**4. Primary actions are indigo in the app and near-black in email.**

`Button` `primary` is indigo 600 `#4F46E5`. Landing `.btn-primary` matches
it (`apps/landing/src/styles/globals.css`). Email `.cta` and `.cta-primary`
are ink 900 `#0b1220` (`apps/api/src/email/templates/_email.css`).
`.cta-indigo` exists and is easy to forget. The recipient's first branded
moment is the email, and it does not match the product they land in.

Email also invents colors the scale does not have (`#475569`, `#f1f5f9`,
`#92400e`, `#fef3c7`, `#991b1b`) and sits on `#f3f6fa` (ink 100) instead of
the app background ink 50. The wordmark radius in email is 7px; the nav
mark is 8px.

**5. Touch size and focus are inconsistent on the controls people hit first.**

`NavBar` guest buttons are `height: 34px` (`NavBar.styles.ts`). `Button`
has no minimum height: `sm` is 4px/12px padding at 14px type, `md` is
8px/16px. Signing, verify, and parts of auth do set 44px targets, so the
standard exists, it is just not on the primitive.

Focus is two systems. `globalStyles.ts` draws a 2px indigo outline on
`:focus-visible`. `Button` (and others) set `outline: none` and
`box-shadow: theme.shadow.focus`. Links in the shell footer use the
outline. A keyboard user sees different rings on a button and a link in
the same header, and some controls risk drawing both.

There is no skip link to `<main>`. Auth "Skip — try it without an account"
is guest mode (`AuthForm.tsx`). Screen-reader users do not get a way past
the nav.

**6. Tags, signer colors, and template accents leave the palette.**

`features/templates/tagColors.ts` hard-codes pairs for Legal, Sales, HR,
Construction, and Marketing, including pink `#FDF2F8` / `#BE185D` and
violet `#F5F3FF` / `#6D28D9`. The hash palette adds cyan and a second
green. `TemplateCard` has an accent `pink` that `Badge` does not.
`VerifyPage` and `UseTemplatePage` carry their own avatar hex lists.
`lib/mockApi/data/palette.ts` has another (`#F472B6`, `#7DD3FC`, …).

These are the most colorful pixels in the product, and they are not
tokens. Two lists will drift, and contrast is unaudited. HR pink on a
white card may be fine; it is not in the system, so a reviewer cannot
check it against `DESIGN_SYSTEM.md`.

**7. Breakpoints are not one system, and the product is English-only.**

Every SPA `@media` query is `max-width` (legacy desktop-first). Auth hides
the brand panel at 960px (`AuthBrandPanel.styles.ts`). The shell redirects
at 640px. The dashboard restyles at 768px, and so do signing fill and the
recipient header, which phones do see because they sit outside `AppShell`.
Landing uses 980px and 600px. There is no shared scale, so "tablet" means
a different layout on every surface. New CSS should be mobile-first
(base styles for the small viewport, desktop via `min-width`). The
inventory is in `DESIGN_SYSTEM.md`.

There is no message catalog. `index.html` is `lang="en"`. RTL shows up
only as test strings (Hebrew in an `Icon` story, bidi in a DSAR mailto
test). A signing product used by counterparties will hit names and
document text that are not LTR long before the chrome is translated.
Layout uses physical `left`/`right` (nav padding, icon slots, rails).
That is acceptable for an English v1 only if it is an explicit constraint.
It is not written down in the design kit.

### Low

**8. Light theme only.** Fine for v1. The favicon swaps for a dark OS
chrome and the app does not, so the tab icon and the page disagree after
sunset. `theme-color` is `#F8FAFC` in the SPA and `#4F46E5` in several
Design-Guide kits.

**9. `TextField` help and error text are 12px literals**
(`TextField.styles.ts`), not `font.size.caption` (13px). Labels are
optional, so a field can ship with only a placeholder.

**10. Auth brand panel is one frozen story.** The quote is attributed to
"Maya Raskin, General Counsel, Northwind"
(`AuthBrandPanel.tsx`). If that person and company are not a real,
approved testimonial, it should not ship on `/signin`. The trust line is
specific (PAdES-LT) and should stay accurate when the sealing tier changes.

**11. Cookie banner vs. form.** The SPA loads
`/scripts/cookie-consent.js` on every route, including signing and verify.
It is the right legal control. On a 390px sign-in screen it competes with
the only form on the page. Worth a pass on spacing and on whether the
banner should be shorter once consent is unknown.

**12. Verify's failure state is clear; its success state is hard to judge
without data.** `/verify/demo` against a dead API shows a centered serif
headline "We couldn't reach Seald" and a single primary "Try again". That
pattern (say what happened, one action, no chrome) is the right public
error. The intact/broken audit badge is implemented
(`VerifyPage.tsx`, `aria-label="Audit chain status"`) and should stay text
plus color.

## What is working well enough to protect

- Do not add a left rail to one screen to "match the kit" while the kit is
  stale. Change the kit, or change every screen, in one decision.
- Do not restyle `/m/send` with desktop `PageHeader` until mobile has a
  real navigation model for documents the user already sent.
- Keep `StatusBadge` labels. Do not switch dashboard status to dots.
- Keep the auth layout's restraint: one headline, one quote, one form.
  Do not add a feature grid to the brand panel.

## Recommendations, in order

1. **Set document titles per route** and replace `Seald — Dev Harness` in
   `apps/web/index.html` with a production default such as "Seald". Signing
   and verify should include the document name once it has loaded, and a
   generic title while loading.
2. **Pick one design source.** Update `Design-Guide/project/ui_kits/dashboard`
   (and the other kits' `<title>`) to the live chrome: wordmark Seald, top
   nav, 1280px column, 36px page title — or stamp the kits "archive" and
   point designers at Storybook `L1`–`L4`.
3. **Make `Button` the touch-target primitive.** Add a size or a prop that
   is at least 44px tall, use it in `NavBar` (replace the 34px guest
   buttons), and stop hand-rolling 44px rules in each page.
4. **One focus ring.** Document it in `globalStyles` and in `Button`:
   halo for controls, 2px outline for links. Remove the duplicate.
5. **Decide the email CTA.** Either switch `.cta-primary` to indigo 600 so
   mail matches the app, or document ink 900 as the email brand and stop
   calling it an accident. Pull the extra hex into comments that name the
   nearest token.
6. **Move tag and signer colors into the theme** as a named palette with
   contrast notes, and delete the copies in `tagColors.ts`, `VerifyPage`,
   `UseTemplatePage`, and `mockApi`.
7. **Write the responsive rule in one place, and make new CSS mobile-first.**
   The inventory is in `DESIGN_SYSTEM.md` (Layout). `AppShell` still
   redirects sender chrome to `/m/send` at ≤640px. That is a product
   choice for the sender shell. Signing, verify, and auth are outside
   the shell and already restyle on a phone, so "641–768 is unsupported"
   does not describe those pages. New rules should set base styles for
   the small viewport and add desktop changes with `min-width`. The
   existing `max-width` queries are legacy. Then either implement a
   readable envelope-detail for ≤640px, or say that reading sent
   documents on a phone is out of scope.
8. **i18n later, but stop painting into a corner.** New layout CSS should
   prefer logical properties (`margin-inline`, `inset-inline-start`) so an
   RTL pass is possible. Do not start a string-extraction project in the
   same change.
9. **Replace or label the Northwind testimonial** before any public launch
   review. Confirm the PAdES line still matches what production seals.
10. **Clean the token gap.** Either emit type, space, and radius as CSS
    variables from `tokens.css` (the Design-Guide file already lists them)
    or stop expecting landing and app to share a variable sheet. Landing
    can keep its copy; email cannot use variables, so email should cite
    the hex it inlines.

None of these require a new visual language. The language is already in
`theme.ts`. The work is making the kit, the email, the mobile sender, and
the document title use it.
