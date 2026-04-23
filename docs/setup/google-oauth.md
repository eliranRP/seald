# Google OAuth Setup (Supabase + Google Cloud)

One-time setup to enable "Sign in with Google" against the `seald` Supabase project.

**Supabase project:** `seald` (id `hsjlihhcwvjvybpszjsa`, region `eu-central-1`)
**Supabase URL:** `https://hsjlihhcwvjvybpszjsa.supabase.co`
**Supabase OAuth callback:** `https://hsjlihhcwvjvybpszjsa.supabase.co/auth/v1/callback`

You will do this in two places:

1. **Google Cloud Console** — create an OAuth client and collect a Client ID + Client Secret.
2. **Supabase Dashboard** — paste those credentials into the Google provider and configure redirect URLs.

---

## 1. Google Cloud Console

### 1.1 Create (or select) a project

1. Open <https://console.cloud.google.com/>.
2. Top bar project picker → **New Project**.
3. Name it `seald` (or reuse an existing project). Click **Create**.
4. Make sure the new project is selected in the top bar before the next step.

### 1.2 Configure the OAuth consent screen

1. Left menu → **APIs & Services** → **OAuth consent screen**.
2. User type: **External**. Click **Create**.
3. App information:
   - App name: `Seald`
   - User support email: your email
   - Developer contact: your email
   - Leave logo / app domain / privacy policy / terms empty for dev.
4. **Save and Continue**.
5. Scopes: click **Add or Remove Scopes** → select `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile` → **Update** → **Save and Continue**.
6. Test users: **Add Users** → add your own Google email (and any teammate you want to let sign in while the app is in Testing mode). **Save and Continue**.
7. Summary → **Back to Dashboard**.

> While **Publishing status = Testing**, only the listed test users can sign in — tokens issued to other users expire after 7 days. That's fine for development. Publish later when ready.

### 1.3 Create the OAuth 2.0 Client ID

1. Left menu → **APIs & Services** → **Credentials**.
2. **+ Create Credentials** → **OAuth client ID**.
3. Application type: **Web application**.
4. Name: `Seald Web (dev)`.
5. **Authorized JavaScript origins** — add both:
   - `http://localhost:5173`
   - `https://hsjlihhcwvjvybpszjsa.supabase.co`
6. **Authorized redirect URIs** — add:
   - `https://hsjlihhcwvjvybpszjsa.supabase.co/auth/v1/callback`
   > This MUST be the Supabase callback, not your frontend URL. Supabase handles the OAuth round-trip and then redirects back to your app via the `redirectTo` option you pass in code (`/debug/auth`).
7. **Create**.
8. A modal shows **Client ID** and **Client secret**. Copy both — you'll paste them into Supabase in §2.3. You can re-open them anytime from the Credentials page.

---

## 2. Supabase Dashboard

### 2.1 Open the project

1. <https://supabase.com/dashboard/project/hsjlihhcwvjvybpszjsa>

### 2.2 Configure URL configuration (redirects)

1. Left menu → **Authentication** → **URL Configuration**.
2. **Site URL:** `http://localhost:5173`
3. **Redirect URLs** → **Add URL** — add each:
   - `http://localhost:5173/**`
   - (Later, for prod:) `https://<your-prod-domain>/**`
4. **Save**.

> Supabase only redirects back to URLs on this allow-list after OAuth. Without this, `redirectTo: window.location.origin + '/debug/auth'` will fail.

### 2.3 Enable the Google provider

1. Left menu → **Authentication** → **Providers**.
2. Find **Google** in the list → open it.
3. Toggle **Enable Sign in with Google** on.
4. Paste the **Client ID** and **Client Secret** from §1.3.
5. **Authorized Client IDs (optional)** — leave empty unless you have a native/mobile client.
6. **Save**.

---

## 3. Smoke test

From the repo root:

```bash
pnpm install
pnpm dev:api    # NestJS on :3000
pnpm dev:web    # Vite on :5173 (run in a second terminal)
```

Then:

1. Open <http://localhost:5173/debug/auth>.
2. Click **Sign in with Google**.
3. Complete the Google consent screen (use one of your Test Users from §1.2 step 6).
4. You land back at `/debug/auth` and see your email.
5. Click **Call /me**.
6. Expected response: `200 {"id":"<uuid>","email":"<you>@...","provider":"google"}`.

If `/me` returns 401:

- `missing_token` → the frontend isn't attaching the bearer (check [apps/web/src/lib/api/apiFetch.ts](../../apps/web/src/lib/api/apiFetch.ts)).
- `invalid_token` → `SUPABASE_URL` in `apps/api/.env` does not match the project issuing the JWT.
- `token_expired` → sign out and in again; Supabase client should auto-refresh.

---

## 4. Going to production (later)

When deploying:

1. In Google Cloud §1.3: add the prod origin (`https://<prod-domain>`) to **Authorized JavaScript origins**. The redirect URI stays the same (always the Supabase callback).
2. In Supabase §2.2: add `https://<prod-domain>/**` to the redirect allow-list and update the Site URL.
3. In Google Cloud §1.2: **Publish app** to move out of Testing mode (Google will review for sensitive scopes — `email`/`profile`/`openid` are non-sensitive, so approval is typically instant).
4. Rotate the Client Secret before/after any suspected leak — it's only stored in Supabase's provider config, not in the repo.

---

## 5. What NOT to commit

- The Google **Client Secret** lives only in Supabase's provider config. It is never in the repo.
- `apps/api/.env` and `apps/web/.env.local` are gitignored — do not `git add` them.
- The publishable key (`sb_publishable_...`) in `apps/web/.env.example` is safe to commit (it is public by design and rate-limited; RLS enforces access).
