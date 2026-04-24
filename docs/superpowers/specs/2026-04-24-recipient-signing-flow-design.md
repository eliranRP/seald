# Recipient Signing Flow — Design Spec

**Date:** 2026-04-24
**Scope:** `apps/web` (adds public recipient surface wired to the existing Nest `/sign/*` API)
**Status:** Approved for planning

---

## Goal

Ship the Sealed recipient signing experience: a signer who clicks an email link arrives on a public, no-account-required surface, confirms identity, walks through every field (text / date / email / checkbox / signature / initials), reviews, and submits. The backend already exposes `/sign/*` under a cookie-scoped session guard; this spec wires a new web surface to it, built from new core components and an isolated feature folder.

---

## User-facing flow

Four real stages, driven by the backend session cookie `seald_sign`:

| Stage | Route | What the user does |
|---|---|---|
| **Entry** | `/sign/:envelopeId?t=<token>` | Invisible handshake — `POST /sign/start` exchanges the opaque 43-char token for the session cookie, then redirects to `/prep`. |
| **Prep** | `/sign/:envelopeId/prep` | Confirm identity (name + email rendered from `/sign/me`), tick the consumer-disclosure checkbox, click "Start signing". |
| **Fill** | `/sign/:envelopeId/fill` | Multi-page document with absolute-positioned field boxes. Guided "Next field" CTA steps through every required field. Input drawer handles text / date / email / name; signature capture handles signature / initials; checkboxes toggle in place. |
| **Review** | `/sign/:envelopeId/review` | Read-only list of every filled field with page number + value preview, plus "Sign and submit". |
| **Done** | `/sign/:envelopeId/done` | Success state + Download + Audit trail + "Save a copy to Sealed" upsell. |
| **Declined** | `/sign/:envelopeId/declined` | Terminal state if the recipient declined. |

The design prototype's inbox-email preview stage is **not** in the route tree — the real entry point is the email link. The design is preserved as a single Storybook story on the existing `EmailCard` component.

---

## Architecture

### New public routes

Added to `AppRoutes.tsx`, outside every auth / guest guard:

```
<Route path="/sign/:envelopeId"          element={<SigningEntryPage />} />
<Route element={<RequireSignerSession />}>
  <Route path="/sign/:envelopeId/prep"     element={<SigningPrepPage />} />
  <Route path="/sign/:envelopeId/fill"     element={<SigningFillPage />} />
  <Route path="/sign/:envelopeId/review"   element={<SigningReviewPage />} />
</Route>
<Route path="/sign/:envelopeId/done"       element={<SigningDonePage />} />
<Route path="/sign/:envelopeId/declined"   element={<SigningDeclinedPage />} />
```

The `done` and `declined` routes are **outside** the session guard: by the time the user lands there, the cookie has been cleared by `POST /sign/submit` or `POST /sign/decline` respectively, so a guard call would 401. Both pages render from a `sessionStorage` snapshot written immediately before navigation (see Data flow below).

### New API client

`apps/web/src/lib/api/signApiClient.ts` — a separate axios instance from the existing `apiClient`:

- `baseURL` from `VITE_API_BASE_URL`.
- `withCredentials: true` so the browser sends the `seald_sign` HttpOnly cookie.
- **No** request interceptor — Supabase auth is irrelevant for signer routes.
- Response interceptor: wraps non-2xx into the same `ApiError` (`status` + readable `message`) used by `apiClient`, so callers get one consistent error shape.

Every function accepts an optional `AbortSignal`.

### New feature folder `apps/web/src/features/signing/`

Mirrors `features/contacts/`:

```
signingApi.ts   startSession, me, acceptTerms, fillField,
                uploadSignature, submit, decline, getPdfUrl
useSigning.ts   useSignMeQuery, useStartSessionMutation,
                useAcceptTermsMutation, useFillFieldMutation,
                useSignatureMutation, useSubmitMutation, useDeclineMutation
session.tsx     SigningSessionProvider + useSigningSession hook
index.ts        barrel
```

**`useSignMeQuery(envelopeId)`** is the single source of truth for every signing route. Key: `['sign', 'me', envelopeId]`. Every mutation patches that cache optimistically and reconciles with the server response.

**`SigningSessionProvider`** is a thin context above the guarded signing routes. It reads from `useSignMeQuery` and exposes:

```ts
interface SigningSessionValue {
  readonly envelope: SignMeEnvelope;
  readonly signer: SignMeSigner;
  readonly fields: ReadonlyArray<SignMeField>;
  readonly otherSigners: ReadonlyArray<SignMeOtherSigner>;
  readonly completedRequired: number;
  readonly requiredCount: number;
  readonly nextField: SignMeField | null;
  readonly allRequiredFilled: boolean;
  readonly fillField: (id: string, value: FillValue) => Promise<void>;
  readonly setSignature: (id: string, input: SignatureInput) => Promise<void>;
  readonly acceptTerms: () => Promise<void>;
  readonly submit: () => Promise<void>;
  readonly decline: (reason?: string) => Promise<void>;
}
```

No duplicated state — the provider is a derivation layer over react-query data.

**Value types** the provider accepts (matching the backend DTOs):

```ts
type FillValue =
  | { readonly value_text: string }     // text / email / date / name
  | { readonly value_boolean: boolean }; // checkbox

interface SignatureInput {
  readonly blob: Blob;
  readonly format: 'drawn' | 'typed' | 'upload';
  readonly font?: string;
  readonly stroke_count?: number;
  readonly source_filename?: string;
}
```

### Entry page token handoff

`SigningEntryPage` responsibilities:

1. Parse `?t=<token>` from the URL.
2. If missing → render "Invalid link" screen with a mailto.
3. Call `POST /sign/start { envelope_id, token }` via `signApiClient`.
4. On success → `window.history.replaceState(null, '', /sign/${envelopeId}/prep)` (strips `?t` from history + referer). Navigate to `/prep`, or directly to `/fill` if `requires_tc_accept === false` **and** the signer already has `tc_accepted_at`.
5. On 400 `token_malformed` → "Invalid link".
6. On 401 `token_invalid` / 410 `token_used` → "This link is no longer valid" screen with a "Request a new link" mailto to the sender.
7. On 404 → "We couldn't find this request".

### Session guard

`<RequireSignerSession>` — a thin `react-router` wrapper that calls `useSignMeQuery(envelopeId)` on mount:

- While pending → `AuthLoadingScreen` (reusing the existing component).
- On 401 / 410 → `Navigate` back to `/sign/:envelopeId` (the entry page will render the appropriate error state since the token is already gone from the URL).
- On success → `<Outlet />`.

---

## Components

All new components follow the existing convention: `tsx` + `types.ts` + `styles.ts` + `test.tsx` + `stories.tsx` + `index.ts`, `forwardRef` + `displayName`.

### New L2 components

| Component | Purpose |
|---|---|
| **`RecipientHeader`** | Sticky top bar: logo · doc title · short-code · optional step chip · optional Exit button. Stateless. |
| **`DocumentPageCanvas`** | White-paper page panel with shadow. Takes `pageNum`, `totalPages`, absolute-positioned children slot. Placeholder-bars variant for demo/Storybook; real PDF rendering is a follow-up. |
| **`SignatureField`** | In-doc field box. Variants `signature | initials | date | text | checkbox | name | email`. Tone derived from state (`filled | active | required-empty | optional-empty`) → green / indigo / amber / neutral. |
| **`SignatureCapture`** | Bottom-sheet signature input. Tabs `type | draw | upload`. Owns canvas draw logic + file picker. Emits `{ blob, format, font?, stroke_count?, source_filename? }`. Also handles `initials` variant. |
| **`FieldInputDrawer`** | Bottom-sheet shell for text / date / name / email inputs. Wraps one input + Cancel + Apply; validates presence/format before enabling Apply. |
| **`ProgressBar`** | 6px filled bar + value/max counter. Generic — reusable outside signing. |
| **`ReviewList`** | Read-only vertical list of filled fields: icon badge, label, page number, value preview (right-aligned; signatures render via the existing `SignatureMark`). |

### Extended / reused

- `Skeleton` — new "filler loading" story.
- `EmailCard` — one new story rendering the signing-request email (preserves the design-prototype reference without being on the route tree).
- `Button`, `TextField`, `Checkbox`, `Avatar`, `SignatureMark`, `Icon` — reused unchanged.

### New L4 pages

Thin compositions over the components + the session provider:
- `SigningEntryPage`
- `SigningPrepPage`
- `SigningFillPage`
- `SigningReviewPage`
- `SigningDonePage`
- `SigningDeclinedPage`

### Layer enforcement

Every new L2 component is added to the `L1 target / L2 source` zone in `apps/web/.eslintrc.cjs` so L1 primitives still can't import from them. The existing `components → pages` zone already catches the new L4 pages.

---

## Data flow (happy paths)

### Start
`/sign/:envelopeId?t=token` → `SigningEntryPage` → `startSession` → cookie set → `history.replaceState` strips `?t` → `navigate('/sign/:envelopeId/prep')`.

### Accept terms (if required)
`SigningPrepPage` → `acceptTerms()` → `POST /sign/accept-terms` (204) → update `tc_accepted_at` in the `sign.me` cache → `navigate('/fill')`.

### Fill — text / email / date / name / checkbox
`SigningFillPage` → user clicks field → `FieldInputDrawer` opens (or checkbox toggles in place) → Apply → `fillField(fieldId, { value_text })` or `{ value_boolean }` → optimistic patch on `sign.me` cache → `POST /sign/fields/:id` → server response reconciles the field.

### Fill — signature / initials
`SigningFillPage` → user clicks field → `SignatureCapture` opens → user picks tab + input → Apply → `setSignature(fieldId, { blob, format, ... })` → multipart `POST /sign/signature` → on success, update `signer.signed_at` placeholder + field value (points at a local object URL for the preview; the server returns the path).

### Submit
Review → `submit()` → `POST /sign/submit` (200) → server clears cookie + returns `{ status, envelope_status }` → snapshot `{ title, sender, recipient_email, signed_at }` to `sessionStorage['sealed.sign.last']` → `navigate('/sign/:envelopeId/done')`.

### Decline
Prep or Fill → confirm dialog → `decline(reason?)` → `POST /sign/decline` (200) → cookie cleared → snapshot written → `navigate('/sign/:envelopeId/declined')`.

---

## Error handling

The `signApiClient` response interceptor surfaces every error as `ApiError { message, status }`. Mapping:

| HTTP | Where it surfaces | UI response |
|---|---|---|
| 400 `token_malformed` / `field_kind_mismatch` / `image_unreadable` | any mutation | inline banner using the server's `message`; retry available |
| 401 `token_invalid` / mid-flow expiry | any call | mid-flow: navigate back to `/sign/:envelopeId`; entry: render "This link is no longer valid" |
| 404 `envelope_not_found` / `signer_not_found` | entry page | "We couldn't find this request" |
| 410 `token_used` / `envelope_terminal` | entry or mid-flow | "This link has already been used" + mailto CTA |
| 412 `requires_tc_accept` | fill-field / signature | navigate back to `/prep` |
| 413 signature too large | signature upload | `SignatureCapture` shows inline error; user retries |
| 422 | any mutation | generic "Please try again" (dev-facing bug) |
| 429 | any call | rate-limit copy in the offending screen |
| network failure | any call | generic banner + manual retry button; mutations **do not auto-retry** (avoids double-submission) |

React-Query defaults for the signing feature: `retry: 0` on mutations, `retry: 1` on `useSignMeQuery` only.

---

## Testing

### Component tests (Vitest + Testing Library + vitest-axe)
- `RecipientHeader` — title, step chip, Exit click.
- `DocumentPageCanvas` — renders children absolute-positioned.
- `SignatureField` — each variant × each tone renders; `onClick` fires; axe clean.
- `SignatureCapture` — tab switching; `type` tab emits blob on Apply; `draw` tab renders canvas (jsdom stub); `upload` tab accepts file.
- `FieldInputDrawer` — validation gates Apply; Cancel fires; axe clean.
- `ProgressBar` — `role="progressbar"` + aria values.
- `ReviewList` — per-kind icon badge; per-kind value preview.

### Feature tests
`features/signing/useSigning.test.tsx` — mocks `signApiClient`:
- `useSignMeQuery` calls `/sign/me` and returns typed shape.
- `fillField` optimistically patches the query cache.
- Failure rolls back cache.
- `submit` writes the done-snapshot to sessionStorage.
- `decline` writes the declined-snapshot to sessionStorage.

### Route tests
`AppRoutes.test.tsx` (extended) with mocked `signApiClient`:
- `/sign/:id?t=abc…` happy path lands on `/prep` and strips `?t=`.
- `/sign/:id` without `?t` renders the invalid-link screen.
- Session expiry on `/fill` redirects back to `/sign/:id`.
- Submit flow lands on `/done`; Decline flow lands on `/declined`.

### Storybook coverage
Every new L2 component has `Default` + at least one meaningful variant. Specifically:
- `SignatureField` — one story per field kind.
- `SignatureCapture` — one per tab (`Type`, `Draw`, `Upload`, `Initials`).
- `FieldInputDrawer` — one per input type.
- `ReviewList` — one story with a mixed set of kinds.
- `EmailCard` — new `SigningRequest` story preserves the design-prototype email inbox reference.

Pages stay out of Storybook (route-level — matches existing convention).

### Quality gates (all must pass before commit)
- `pnpm --filter web test` — green with new tests.
- `pnpm --filter web lint --max-warnings=0` — clean.
- `pnpm --filter web typecheck` — clean.
- `pnpm --filter web build` — builds.
- `pnpm --filter web build-storybook` — builds.

---

## Out of scope

- **Separate `apps/sign` package.** The signer lives alongside the sender app today. Splitting to a dedicated subdomain + package is a later infrastructure task.
- **Real PDF rendering** inside `DocumentPageCanvas`. The placeholder-bar variant ships first; `pdfjs-dist` integration is a follow-up (sender side already uses it).
- **"Save a copy to Sealed" form wire-up** on the Done page. Card renders but the form calls `enterGuestMode()` + navigates to `/signup?email=…`; no backend wire-up in this spec.
- **Sequential-signing logic** (`DELIVERY_MODES.sequential`). Backend supports it; for now the UI treats all signers as independent (parallel). Adding the turn-taking guard is a later spec.
- **Mobile-specific tweaks** beyond what the design prototype already specifies.
- **E2E tests against a real API.** Backend coverage lives in `apps/api/test`; we unit-test the web surface with mocked `signApiClient`.
- **Inbox preview as an in-app route.** Rendered only as an `EmailCard` Storybook story.
