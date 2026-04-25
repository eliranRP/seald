# URL audit — 2026-04-25

Catalog of every URL/host/path reference in the codebase, after the
Cloudflare Pages cutover for the SPA.

## Canonical URL scheme

| Surface | Canonical host | Notes |
|---|---|---|
| Landing site (Astro `/`) | `https://seald.nromomentum.com` | Cloudflare Pages |
| SPA (everything else) | `https://seald.nromomentum.com` | Cloudflare Pages, `_redirects` rewrites every non-static path to `/app.html`. **No `/app` prefix.** |
| API | `https://api.seald.nromomentum.com` | EC2 + Caddy, unchanged |
| Verify (public) | `https://seald.nromomentum.com/verify/<short_code>` | **No `/code/` segment** — fixed in this audit. |
| Sign | `https://seald.nromomentum.com/sign/<envelope_id>?t=<token>` | Unchanged |
| Sealed/audit anchors | `…/verify/<short_code>#sealed` / `#audit` | Unchanged |

`APP_PUBLIC_URL` env var is the single source of truth on the API side.
Trailing slash is always stripped before composition.

## Bug fixed

The SPA verify route is `/verify/:shortCode`, but 8 email templates were
embedding `/verify/code/<short_code>` (a leftover from the original API
spec where `/verify/code/:short_code` was a server endpoint). The audit
PDF QR was already correct (`/verify/<short_code>`); the email pattern
disagreed with both the SPA and the audit PDF.

### Files updated

| File | Before | After |
|---|---|---|
| `apps/api/src/envelopes/envelopes.service.ts:443` (invite) | `/verify/code/${short_code}` | `/verify/${short_code}` |
| `apps/api/src/envelopes/envelopes.service.ts:539` (reminder) | `/verify/code/${short_code}` | `/verify/${short_code}` |
| `apps/api/src/email/template.service.spec.ts:33,77` | `/verify/code/abcde12345` | `/verify/abcde12345` |
| `apps/api/src/email/email-dispatcher.service.spec.ts:47` | `/verify/code/ABC123` | `/verify/ABC123` |
| `apps/api/scripts/render-emails.ts:32` | `/verify/code/FKXWAxpdWChG9` | `/verify/FKXWAxpdWChG9` |
| `apps/api/scripts/verify-emails.ts:47` | `/verify/code/FKXWAxpdWChG9` | `/verify/FKXWAxpdWChG9` |
| `apps/api/scripts/seed-signer.ts:183` | `/verify/code/${shortCode}` | `/verify/${shortCode}` |
| `apps/web/src/pages/EnvelopeDetailPage/EnvelopeDetailPage.tsx:308` (JSDoc) | `/verify/code/:short_code` | `/verify/:short_code` |

## Confirmed correct (no change needed)

### `seald.nromomentum.com` references (canonical web host)

| File | Purpose |
|---|---|
| `apps/api/src/email/templates/{invite,reminder,completed,declined_to_sender,withdrawn_to_signer,withdrawn_after_sign,expired_to_sender,expired_to_signer}/body.html` | logo `<img src>` |
| `apps/api/src/sealing/audit-pdf.tsx:60` | JSDoc — example public URL |
| `apps/api/src/signing/signing.controller.ts:39-40` | JSDoc — CORS origin |
| `apps/api/scripts/render-audit-samples.{ts,cjs}`, `render-audit-sample.ts`, `verify-emails.ts` | Sample/script renderers |
| `docker-compose.yml`, `.github/workflows/deploy-web.yml`, `.github/workflows/terraform.yml` | Deploy/CI defaults |

### `api.seald.nromomentum.com` references (canonical API host)

| File | Purpose |
|---|---|
| `docker-compose.yml`, `.github/workflows/deploy-web.yml` | Caddy + deploy defaults |
| `apps/api/src/signing/signing.controller.ts:40` | JSDoc |

### Verify URL composition (already correct)

| File | Pattern |
|---|---|
| `apps/api/src/sealing/audit-pdf.tsx:68` | `${publicUrl}/verify/${short_code}` (QR + cite block) |
| `apps/api/src/sealing/sealing.service.ts:158-160` | `${publicUrl}/verify/${short_code}{,#sealed,#audit}` |
| `apps/api/src/verify/verify.controller.ts` | API endpoint `GET /verify/:short_code` |
| `apps/api/test/verify-cron.e2e-spec.ts` | Hits `/verify/<short_code>` |

### `localhost:5173` / `localhost:3000`

Confined to:
- `apps/api/src/email/email-dispatcher.service.spec.ts` (test fixture only)
- `apps/api/src/config/env.schema.spec.ts` defaults

No prod path references either; safe.

### `seald.app` references (legacy domain in docs/specs/test fixtures only)

- `docs/superpowers/specs/2026-04-24-envelopes-design.md` — design doc; archival.
- `docs/superpowers/plans/2026-04-24-envelopes.md` — plan doc; archival.
- `apps/api/src/signing/signer-session.service.ts:29` — JWT `iss` claim (`seald.app/sign`); intentional, stable identifier.
- `apps/api/src/email/email-dispatcher.service.spec.ts`, `apps/api/src/email/logging-email-sender.spec.ts`, `apps/api/src/config/env.schema.spec.ts` — test fixtures; no prod impact.
- `apps/web/src/**/*.test.tsx`, `apps/web/src/**/*.stories.tsx`, `apps/web/src/test/renderWithProviders.tsx` — Storybook + test fixtures (`jamie@seald.app` etc.); cosmetic.
- `apps/web/src/pages/SigningEntryPage/SigningEntryPage.tsx:172` — `support@seald.app` mailto; intentional support address until DNS migration.
- `Design-Guide/project/ui_kits/email/*.html` and `Design-Guide/project/audit-trail.html` — static design mockups; don't ship.

### `seald-landing.pages.dev`

No occurrences in `apps/`, `packages/`, `deploy/`, `Design-Guide/`, `scripts/`. Confirmed not leaked.

### Old EC2-only paths (`/srv/web`)

No occurrences. Cleanup complete.

## Email template variables

`apps/api/src/email/template.service.ts` consumes the following placeholders;
each is composed from `APP_PUBLIC_URL` in `envelopes.service.ts` + `sealing.service.ts`:

| Placeholder | Source | Pattern |
|---|---|---|
| `{{public_url}}` | `APP_PUBLIC_URL` | `https://seald.nromomentum.com` |
| `{{sign_url}}` | `envelopes.service.ts` | `${publicUrl}/sign/<envelope_id>?t=<token>` |
| `{{verify_url}}` | `envelopes.service.ts`, `sealing.service.ts` | `${publicUrl}/verify/<short_code>` ✓ fixed |
| `{{sealed_url}}` | `sealing.service.ts` | `${publicUrl}/verify/<short_code>#sealed` |
| `{{audit_url}}` | `sealing.service.ts` | `${publicUrl}/verify/<short_code>#audit` |
| `{{dashboard_url}}` | (caller-supplied, optional in some templates) | `${publicUrl}/dashboard` |

## Verification

| Gate | Status |
|---|---|
| `pnpm --filter api lint` | clean |
| `pnpm --filter api test` (template + email-dispatcher + envelopes) | 57/57 passed |
| `pnpm --filter web test` | 593/593 passed |
| `pnpm -r typecheck` | pre-existing failures unrelated to URL changes (TS7006 in `audit-pdf.tsx`/`signing/*`/in-memory repos + module resolution for `'shared'`); none introduced by this audit. |

## Out of scope / could not verify autonomously

- The `/verify/:shortCode` route is **not yet wired up in `apps/web/src/AppRoutes.tsx`** — the public verify page exists only as a backend endpoint + audit PDF QR target. The SPA route addition is a separate task; this audit only ensures generated URLs follow the canonical pattern.
- The transient `ERR_SSL_VERSION_OR_CIPHER_MISMATCH` reported by the user is a Cloudflare cert-issuance delay, not a URL bug; nothing to fix in code.
- `apps/landing/` does not exist in this worktree, so the "primary CTA points at `/signup`" check could not be performed.
- `Design-Guide/project/ui_kits/email/*.html` and `Design-Guide/project/audit-trail.html` are static design mockups (not shipped), so their stale `sealed.app/verify/code/...` strings were left as-is.
