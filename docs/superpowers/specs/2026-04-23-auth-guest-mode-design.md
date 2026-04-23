# Auth + Guest Mode — Design Spec

**Date:** 2026-04-23
**Scope:** `apps/web` (Supabase project `seald`, already wired to `lib/supabase/supabaseClient.ts`)
**Status:** Approved for planning

---

## Goal

Give Sealed a real front door: email+password + Google sign-in, email sign-up with "keep me signed in", and a forgot-password flow backed by Supabase Auth. At the same time, support a **guest mode** — users who choose "Skip" can use the sign-a-PDF flow without an account, with an upgrade path back to sign up/sign in from the NavBar.

Supabase (`seald` project) is already configured: the browser client and a JWT-authenticated `/me` endpoint on the Nest API exist. This spec builds on that foundation — no new backend work.

---

## User-facing behavior

| User | Landing | NavBar | Nav items | Right cluster | Can create contacts? | Sees dashboard? |
|---|---|---|---|---|---|---|
| Anonymous | `/signin` | hidden | — | — | no | no |
| Guest | `/document/new` | visible | (none) | "Guest mode" chip + Sign in / Sign up buttons | no | no |
| Authed | `/documents` | visible | Documents / Sign / Signers | Avatar (→ user menu with Sign out) | yes | yes |

### Sign-in page (`/signin`)
- Split-screen: editorial brand panel (left), form (right). Collapses at 960px.
- Google SSO button at top, "or" divider, then email + password form.
- "Forgot?" link next to password label.
- "Keep me signed in" checkbox, default **on**.
- Primary "Sign in" button, disabled until valid.
- Footer: "New to Sealed? Create an account" → `/signup`.
- Under the footer, a dashed separator then: **"Skip — try it without an account"** → enters guest mode, routes to `/document/new`.

### Sign-up page (`/signup`)
- Same split screen. Google "Sign up with Google" button.
- Fields: Full name, Email, Password (with show/hide toggle and 4-bar strength meter).
- Terms-of-service checkbox, required to enable submit.
- Primary "Create account" button.
- Same "Skip — try it without an account" footer.

### Forgot-password page (`/forgot-password`)
- No Google SSO, no password field, no remember/ToS checkboxes.
- Email input + "Send reset link" button.
- Footer: "Remembered it? Back to sign in".

### Check-email page (`/check-email`)
- Success state after forgot-password submit.
- Mail-check icon, "Check your email" heading, hint copy referencing the submitted email.
- "Back to sign in" (secondary) + "Resend link" (primary) buttons.

### OAuth callback page (`/auth/callback`)
- Minimal page — waits for `supabase.auth.getSession()` to resolve after Supabase writes the session from the URL (`detectSessionInUrl: true` is already configured). Shows a centered spinner, then navigates to `/documents` on success or `/signin?error=...` on failure.

---

## Architecture

### New provider: `AuthProvider`

Wraps `AppStateProvider` at the app root (above the router).

```ts
interface AuthUser {
  readonly id: string;
  readonly email: string;
  readonly name: string;
  readonly avatarUrl?: string;
}

interface AuthContextValue {
  readonly session: Session | null;   // from @supabase/supabase-js
  readonly user: AuthUser | null;     // derived from session.user
  readonly guest: boolean;            // persisted in localStorage as 'sealed.guest'
  readonly loading: boolean;          // true while first getSession() is in flight
  readonly signInWithPassword: (email: string, password: string, keepSignedIn: boolean) => Promise<void>;
  readonly signUpWithPassword: (name: string, email: string, password: string, keepSignedIn: boolean) => Promise<{ readonly needsEmailConfirmation: boolean }>;
  readonly signInWithGoogle: () => Promise<void>;
  readonly resetPassword: (email: string) => Promise<void>;
  readonly signOut: () => Promise<void>;
  readonly enterGuestMode: () => void;
  readonly exitGuestMode: () => void;
}
```

**Responsibilities:**
- Subscribe to `supabase.auth.onAuthStateChange` on mount; keep `session`/`user` in sync.
- Initial `getSession()` populates state before `loading` drops to `false`.
- Guest flag lives in `localStorage` (`sealed.guest = '1' | '0'`) — read on mount, written on toggle. Signing in or signing out clears it.
- Derives `AuthUser` from `session.user.user_metadata` (falls back to email-local-part for name).

**"Keep me signed in" storage:**
The Supabase client in `lib/supabase/supabaseClient.ts` is updated to accept a custom `auth.storage` adapter. The adapter delegates to `localStorage` when `sealed.keepSignedIn === '1'` (default) and `sessionStorage` when set to `'0'`. The flag is updated **before** the sign-in call so the session token lands in the chosen store. On sign-out, both stores are cleared.

### New routes

Added to `AppRoutes.tsx`:

```
/signin              → SignInPage           (no AppShell; redirect → /documents if authed)
/signup              → SignUpPage           (no AppShell; redirect → /documents if authed)
/forgot-password     → ForgotPasswordPage   (no AppShell)
/check-email         → CheckEmailPage       (no AppShell)
/auth/callback       → AuthCallbackPage     (no AppShell; routes onward once session resolves)
```

Existing routes are wrapped by two new guards:

- **`<RequireAuth>`** — renders `<Outlet />` when `user` is present, else `<Navigate to="/signin" replace />`.
- **`<RequireAuthOrGuest>`** — renders `<Outlet />` when `user` or `guest` is true, else `<Navigate to="/signin" replace />`.

Both guards render a full-page spinner while `loading` is true (prevents redirect flicker on first paint when a session exists in localStorage but hasn't been hydrated yet).

| Route | Wrapper |
|---|---|
| `/documents`, `/signers`, `/email/*` | `<RequireAuth>` |
| `/document/new`, `/document/:id`, `/document/:id/sent` | `<RequireAuthOrGuest>` |
| `/signin`, `/signup`, `/forgot-password`, `/check-email` | Public; if authed, redirect → `/documents` |
| `/` | if authed: `/documents`, elif guest: `/document/new`, else: `/signin` |

### NavBar changes

`NavBar.tsx` gains one prop: `mode: 'authed' | 'guest'` (default `'authed'`).

- **`authed`** — current behavior preserved (nav items + Avatar on the right). The Avatar becomes a trigger for a small user menu (name + email + "Sign out").
- **`guest`** — nav items hidden; after the logo a `GuestBadge` is rendered; right cluster shows Sign in (ghost) + Sign up (primary) buttons. Both call `exitGuestMode()` then navigate to the respective route.

`AppShell` reads `user` and `guest` from `useAuth()` and passes the derived mode. Anonymous users never reach `AppShell` because they're redirected by `<RequireAuth>` first.

### Data-layer impact

- `AppStateProvider` stops calling `fetchCurrentUser()` directly. It reads `user` from `useAuth()` and exposes it unchanged on its own context (so existing consumers like `AppShell` keep working).
- `fetchContacts()` / `fetchDocuments()` are only invoked when `user` is non-null. For guests and anonymous users, the provider skips the initial fetch and immediately resolves `loading` to `false` with empty lists.
- Guest mutators (`addContact`/`createDocument`) stay in-memory, matching today's behavior — they are available under the `<RequireAuthOrGuest>` subtree (document flow) but a guest never reaches `/signers` or `/documents`, so `addContact` is de facto not exposed to guests.
- `DebugAuthPage` at `/debug/auth` remains functional and is not wrapped by a guard.

---

## Component breakdown

All new components live under `apps/web/src/components/<Name>/` with the standard six-file bundle (`tsx`, `types.ts`, `styles.ts`, `test.tsx`, `stories.tsx`, `index.ts`), `forwardRef` + `displayName`, and at least one Storybook variant.

| Component | Layer | Purpose |
|---|---|---|
| `AuthShell` | L3 | Split-screen container: brand panel left, form right, responsive collapse at 960px. |
| `AuthBrandPanel` | L2 | Editorial left-side panel: logo, heading, testimonial card, trust footer. |
| `AuthForm` | L3 | Mode-driven form (`signin` / `signup` / `forgot`). Owns field state; calls `useAuth()` actions. |
| `PasswordField` | L2 | Password input with show/hide eye toggle. Built on `TextField` primitives. |
| `PasswordStrengthMeter` | L1 | 4-bar meter + label, given a numeric level 0–4. |
| `GoogleButton` | L1 | Colored "G" SSO button with label + busy/disabled states. |
| `GuestBadge` | L1 | The "Guest mode" pill for the NavBar. |
| `Divider` | L1 | Horizontal "or" divider (two rules + centered label). |

### New pages

Under `apps/web/src/pages/<Name>/`:

- `SignInPage`, `SignUpPage`, `ForgotPasswordPage` — each is a thin wrapper that renders `AuthShell` + `AuthForm` in the matching mode.
- `CheckEmailPage` — standalone success screen.
- `AuthCallbackPage` — spinner + effect that waits for session then navigates.

---

## Data flow (happy paths)

### Sign-in with password
1. User submits form → `AuthForm` calls `signInWithPassword(email, pw, keep)`.
2. Provider sets storage flag (before call), then `supabase.auth.signInWithPassword(...)`.
3. On success, `onAuthStateChange` fires `SIGNED_IN` → provider updates `session`/`user`, clears `guest`.
4. `<Navigate to="/documents" replace />` from the signed-in branch of `SignInPage`.

### Sign-up
1. Form submits → `signUpWithPassword(name, email, pw, keep)`.
2. Provider calls `supabase.auth.signUp({ email, password, options: { data: { name } } })`.
3. If response has `session` → treated as a successful sign-in (Supabase project configured without email confirmation) → navigate to `/documents`.
4. If `session` is null (confirmation required) → resolve with `{ needsEmailConfirmation: true }`; page shows an inline "Check your email to finish signing up" state using `CheckEmailPage` visuals.

### Google SSO
1. `signInWithGoogle()` calls `supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${origin}/auth/callback` } })`.
2. Supabase redirects to Google → back to `/auth/callback` with tokens in URL.
3. `AuthCallbackPage` waits for `getSession()` → navigates to `/documents` once `user` appears, or `/signin?error=oauth` on failure.

### Forgot password
1. Form submits → `resetPassword(email)` → `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/signin` })`.
2. Page navigates to `/check-email`.

### Skip (enter guest)
1. User clicks "Skip" → `enterGuestMode()` sets `guest = true`, writes `localStorage`, navigates to `/document/new`.

### Exit guest
1. User clicks Sign in/Sign up in NavBar → `exitGuestMode()` clears `guest` flag, navigates to `/signin` or `/signup`.
2. Any in-memory documents/contacts on the guest session are dropped (matches the design's "You can sign up later to save your documents" copy — no implicit migration).

---

## Error handling

- **Invalid credentials / signup collision:** Supabase error surfaced to `AuthForm`'s `error` state and rendered in the existing error bar style (danger-50 background).
- **Network failure:** Caught at the provider level; action throws, `AuthForm` displays a generic "Something went wrong. Please try again." and the submit button re-enables.
- **OAuth redirect failure:** `AuthCallbackPage` reads `?error=...` query param (Supabase includes it) and routes to `/signin?error=oauth`; `SignInPage` renders the banner when `error` is present.
- **Rate-limited forgot-password:** Supabase returns a throttle error → form shows "Please wait a moment before trying again."

---

## Testing plan

### Component tests (Vitest + Testing Library)
- `AuthForm.test.tsx`
  - Renders correct fields per mode (signin, signup, forgot).
  - Submit disabled until valid; enables when fields populated + ToS checked (signup).
  - Password show/hide toggle swaps input `type`.
  - Strength meter text updates as password length/complexity grows.
  - "Forgot?" link navigates to `/forgot-password`.
  - Submit calls the matching `useAuth()` action with correct args; error state rendered on rejection.
- `PasswordStrengthMeter.test.tsx` — each level 0–4 renders expected label and filled-bar count; axe clean.
- `GoogleButton.test.tsx` — renders label; fires onClick; `disabled` suppresses click; axe clean.
- `GuestBadge.test.tsx` — renders text + icon; axe clean.
- `AuthShell.test.tsx` — renders children; responsive class toggles at 960px (jsdom matchMedia mock).
- `PasswordField.test.tsx` — show/hide toggle accessible name updates; value passthrough; axe clean.
- `Divider.test.tsx` — renders label.

### Provider tests
- `AuthProvider.test.tsx` (mocks `supabase` module)
  - Initial `getSession` → `loading` flips false; `user` hydrated.
  - `onAuthStateChange('SIGNED_IN')` updates `user` and clears `guest`.
  - `signInWithPassword` forwards args; sets `keepSignedIn` flag before call.
  - `signUpWithPassword` resolves `{ needsEmailConfirmation: true }` when session missing.
  - `enterGuestMode`/`exitGuestMode` toggle localStorage and context flag.
  - `signOut` clears `user` and both storages.

### NavBar tests (extend existing)
- `mode="guest"` shows `GuestBadge` and Sign in / Sign up buttons; no nav items rendered.
- `mode="authed"` unchanged.
- Axe clean in both modes.

### Route tests (extend `App.test.tsx` / add `AppRoutes.test.tsx`)
- Anonymous visits `/documents` → redirected to `/signin`.
- Guest visits `/documents` → redirected to `/document/new`.
- Authed visits `/signin` → redirected to `/documents`.
- `/` landing resolves per role (authed / guest / anonymous).
- `/auth/callback` shows spinner then lands on `/documents` once mocked session resolves.

### Storybook coverage
One `.stories.tsx` per new component:
- `AuthShell` — Default.
- `AuthBrandPanel` — Default.
- `AuthForm` — SignIn, SignUp, Forgot variants.
- `PasswordField` — Default, Filled.
- `PasswordStrengthMeter` — Weak, Okay, Strong, Excellent.
- `GoogleButton` — Default, Busy, Disabled.
- `GuestBadge` — Default.
- `Divider` — Default.

Pages intentionally stay out of Storybook (route-level, matches existing convention).

### Quality gates (all must pass before commit)
- `pnpm test` — green with new tests.
- `pnpm lint --max-warnings=0` — clean.
- `pnpm typecheck` — clean.
- `pnpm build-storybook` — builds.
- `pnpm build` — builds.

---

## Out of scope

- Phone/magic-link auth.
- Multi-factor auth.
- Migrating guest documents into an authed account after signup.
- A full user-settings page (the user menu for now only offers "Sign out").
- Server-side contact persistence (`AppStateProvider` still stores contacts in memory — this is a separate project).
