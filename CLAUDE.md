# CLAUDE.md — repo conventions for AI assistants

This file is the contract between the working repo and any AI assistant
(Claude Code, etc.) editing it. Human contributors are welcome to read and
ignore the AI-specific sections.

## Branch + push conventions

- Default branch: **`main`**. Day-to-day commits go directly to `main`.
  Every CI gate, every deploy (Cloudflare Pages, EC2 Caddy, Docker, Terraform),
  and every release fires off `main`. There is no `develop` branch — it was
  removed on 2026-04-28 once we standardized on a single trunk.
- Direct push to `main` is allowed for committers; CI is the gate.

## CI gates (`.github/workflows/ci.yml`)

Every push to `main` (and every PR) runs five jobs:

| Job | What it runs |
|---|---|
| `install` | `pnpm install --frozen-lockfile` |
| `lint` | `pnpm -r typecheck` + `pnpm -r lint` |
| `unit` | `pnpm --filter api test` (jest) |
| `web` | `pnpm --filter web test` (vitest) |
| `e2e` | `pnpm --filter api test:e2e` (jest e2e, includes PAdES) |

Doc-only changes (`**/*.md`, `docs/**`, `Design-Guide/**`, LICENSE,
.gitignore, .editorconfig) skip CI via `paths-ignore`.

Every push is followed by an automated CI validator (see "Standing rules
for AI assistants" below). Local pre-merge gate:

```sh
pnpm -r typecheck && pnpm -r lint && pnpm --filter api test && pnpm --filter web test
```

## Code conventions

### React + TypeScript
The [`react-best-practices` skill](~/.claude/skills/react-best-practices/SKILL.md)
distills the canonical sources (Vercel, react.dev, TS handbook, Packt patterns,
bulletproof-react, FSD) into numbered rules (1.1–4.6). Every commit touching
React/TS should respect them, especially:

- **1.6** Path alias `@/*` → `apps/web/src/*` over deep relative imports.
- **2.4** `useMemo`/`useCallback` only with a measured perf problem.
- **2.5** `Suspense` + ErrorBoundary around lazy/async data.
- **3.1** Strict tsconfig: `strict`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- **3.2** No `any`, no `Function` — `unknown` + narrowing instead.
- **4.3** No array index as `key` for reorderable lists.
- **4.4** One responsibility per `useEffect`.
- **4.6** Tests query by accessible role/name; testid only as last resort.

### Email HTML
The [`gmail-email-html` skill](~/.claude/skills/gmail-email-html/SKILL.md)
covers Gmail/Outlook quirks. Inline visual styles, defeat the auto-linker,
preview every change in real Gmail before committing.

### Sealing / PAdES
The seald API seals every completed envelope into a PAdES PDF that
progresses **B-T → B-LT (DSS) → optional B-LTA**. All sealing code lives
in `apps/api/src/sealing/`. Full pipeline + module-factory selection in
`memory/project_pades_pipeline.md`; KMS hand-built CMS rationale in
`memory/project_kms_signer.md`.

- **S.1** Producer order in `SealingModule` factory: `KmsPadesSigner`
  (production, when `PDF_SIGNING_PROVIDER=kms` + key id set) →
  `P12PadesSigner` (dev, P12 path present) → `NoopPadesSigner` (last
  resort). Never silently downgrade — startup must throw on misconfig.
- **S.2** `KmsCmsSigner` hand-builds CMS — forge's `pkcs7.sign()`
  requires a local private key, which defeats KMS. Preserve the RFC 5652
  §5.4 explicit-`SET` (tag `0x31`) re-encoding of `signedAttrs` before
  hashing; Adobe Reader rejects the wrong tag.
- **S.3** Env-var contract: `PDF_SIGNING_PROVIDER` (`local`/`kms`/`sslcom`),
  `PDF_SIGNING_KMS_KEY_ID`, `PDF_SIGNING_KMS_REGION`,
  `PDF_SIGNING_KMS_CERT_PEM` or `_PATH`, `PDF_SIGNING_TSA_URLS` (CSV;
  rotated on failure by `MultiTsaClient`; legacy singular
  `PDF_SIGNING_TSA_URL` still honored).
- **S.4** Verifier: `pnpm --filter api exec ts-node scripts/verify-pades.ts <dir>`.
  Runs as the `pades-verify` CI job on every PR — gates regressions in
  `/Contents` parsing, signed-attrs digest, TST presence, and DSS
  injection.
- **S.5** **Never** call `@signpdf/utils.extractSignature` — it strips
  trailing `0x00` byte pairs and corrupts CMS that legitimately ends in
  `0x00`. Use `apps/api/src/sealing/pades-verify-helpers.ts` instead
  (`extractContents()` slices by the outer DER `SEQUENCE` length).
- **S.6** Audit chain: `envelope_events.prev_event_hash =
  SHA-256(canonical-JSON of prior row)`; `GET /verify/:envelopeId`
  surfaces `chain_intact`. Walk via `verifyEventChain`. Canonical JSON
  contract (sorted keys, RFC 8785-ish) lives next to the helper — import
  it, don't reimplement.

### Sprint history
- **Sprint 1 (PR #9)** — PAdES B-T conformance + production hardening.
- **Sprint 2 (PR #12)** — KMS-backed sealing + multi-TSA fallback +
  verifier CI.
- **Sprint 3 (PR #10)** — PAdES B-LT (DSS) + tamper-evident audit chain.
- **Post-sprint-2** — PR #14 (B-LTA archive timestamp), PR #15
  (LocalStack KMS e2e harness).

All PAdES due-diligence findings F-1..F-14 are closed across these PRs;
F-7 (AATL trust) and F-15 (HSM-backed key rotation runbook) remain
external/legal. See `memory/feedback_pades_due_diligence_resolved.md`
before re-raising any sealing finding.

### Commit messages
Follow conventional commits: `type(scope): subject` (e.g.
`fix(audit): refined event icons`, `refactor(api): tighten TS hygiene`).
Body should explain *why* and reference the rule id when the change is
skill-driven (e.g. `(rule 4.4)`).

## Standing rules for AI assistants

These are persisted as memory under
`~/.claude/projects/-Users-eliranazulay-Documents-projects-seald/memory/`
and apply to every session.

### Always validate CI after every push (in background)

After every `git push`, spawn a `general-purpose` subagent with
`run_in_background: true` to:
1. List GH Actions runs for the new HEAD.
2. Wait for each to reach `completed`.
3. If any fail, fetch `gh run view <id> --log-failed`, fix the root cause,
   commit, re-push, re-validate. Max 3 iterations.

Do NOT block the main thread waiting for CI. The harness delivers the
validator's completion notification automatically.

### Never amend / never `--no-verify` / never `--force`

If a pre-commit hook fails: fix the underlying issue, re-stage, create a
NEW commit. Don't bypass.

### Phase 3 deferrals

All five MVP deferrals were resolved on 2026-04-24. See
`memory/project_phase3_mvp_deferrals.md` before touching PAdES/TSA/
migrations/Terraform.

## Repo layout

```
apps/
  api/      Nest.js API (jest)
  web/      React + Vite + Vitest SPA
packages/
  shared/   Cross-package types and helpers
deploy/
  Caddyfile, terraform/, docker-compose.yml
.github/workflows/
  ci.yml, deploy.yml, deploy-web.yml, docker.yml, terraform.yml
```

Path alias `@/*` applies to `apps/web/src/*` only (configured in
`apps/web/tsconfig.json` + `apps/web/vite.config.ts`).

## Visual regression (Chromatic)

Every Storybook story is diffed against the last accepted baseline; baselines
auto-accept on `main`, PRs surface diffs in Chromatic's UI for review.

### Run locally

Set the token in your shell only — never commit it:

```sh
CHROMATIC_PROJECT_TOKEN=<token> pnpm --filter web chromatic
```

Get the token from https://www.chromatic.com/manage?appId=eliranRP/seald.
A placeholder lives in `apps/web/.env.local.example`.

### CI

`.github/workflows/chromatic.yml` runs on every PR and every push to
`main` (doc-only paths skipped). It:

1. Reads `CHROMATIC_PROJECT_TOKEN` from GitHub Actions secrets.
2. Builds Storybook (`pnpm --filter web build-storybook` via the action).
3. Uploads snapshots; TurboSnap (`onlyChanged: true`) skips unchanged stories.
4. On `main`, accepts changes automatically (new baseline).
   On PRs, diffs are surfaced at https://chromatic.com — a reviewer must
   accept in the Chromatic UI to update the baseline.

### Repo secret

`CHROMATIC_PROJECT_TOKEN` is already provisioned as a GitHub Actions secret
(added 2026-04-25 via `gh secret set`). To rotate it, generate a new token at
https://www.chromatic.com/manage?appId=eliranRP/seald and run:

```sh
printf '<new-token>' | gh secret set CHROMATIC_PROJECT_TOKEN -R eliranRP/seald --body -
```

## Web hosting (Cloudflare Pages, single domain)

`seald.nromomentum.com` serves both the **Astro landing page** (at `/`)
and the **React SPA** (every other route — `/signin`, `/signup`,
`/sign/*`, `/verify/*`, `/document/*`, `/documents`, `/contacts`,
`/signers`, `/auth/*`, `/debug/*`).

Architecture:
- DNS: GoDaddy CNAME `seald` → `seald-landing.pages.dev`
- Cloudflare Pages project: `seald-landing`
- Build: `.github/workflows/deploy-cloudflare.yml` runs on push to main
  with paths under `apps/web/**` or `apps/landing/**`. It builds both,
  merges them (rename SPA `index.html` → `app.html`), writes a
  `_redirects` manifest covering every SPA route, and deploys.
- API stays on the EC2 Caddy at `api.seald.nromomentum.com`. The web
  block was removed from `deploy/Caddyfile` on 2026-04-25.

Required GH secrets (already provisioned):
- `CLOUDFLARE_API_TOKEN`
- `CLOUDFLARE_ACCOUNT_ID`
- `VITE_API_BASE_URL` — `https://api.seald.nromomentum.com`
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`

First-deploy workflow:

1. **One-time** — create the Cloudflare Pages project. The token in the
   GH secret can deploy to an existing project but lacks `Pages: Edit`
   scope to enumerate/create. Open the dashboard:
   https://dash.cloudflare.com/?to=/:account/pages → Create a project →
   Direct upload → name `seald-landing`, production branch `main`,
   no upload (wrangler will fill it on the next push). 30 seconds.
   Alternative: regenerate the token via the "Edit Cloudflare Workers"
   template (includes Pages: Edit), then `gh secret set
   CLOUDFLARE_API_TOKEN`. The deploy workflow will then auto-create
   the project on its next run with no human action needed.

2. **DNS** — `gh workflow run terraform.yml --ref main -f action=apply`
   flips `seald.nromomentum.com` from A record (EC2) to CNAME → CF Pages.

3. **Domain attach** — happens automatically inside the
   `Deploy (Cloudflare Pages — landing + SPA merged)` workflow on every
   push to main. The job calls the Cloudflare Pages API to attach
   `seald.nromomentum.com` to the `seald-landing` project; idempotent so
   subsequent runs are no-ops.

4. **Optional polish** — paste the real Cloudflare Web Analytics token
   into `apps/landing/src/layouts/BaseLayout.astro` `data-cf-beacon`,
   replace `apps/landing/public/google-site-verification.html` with the
   real GSC token file. Both ship with placeholders.

When extending: any new SPA route must be added to the `_redirects`
block in `.github/workflows/deploy-cloudflare.yml`, otherwise CF Pages
will 404 it.
