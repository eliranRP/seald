# Resuming the documenso-parity work

All work packages of PR #380 (`feat/documenso-parity`, draft) are merged as of 2026-10-23. This folder records how the work was run, so a follow-up session or agent can pick up the remaining follow-ups without the original conversation.

- **Plan and decisions:** [`../documenso-parity-plan.md`](../documenso-parity-plan.md). It holds the work packages (WP-xx), migration ids, model tiers, waves (§5) and decisions D1–D11.
- **Rules every WP agent follows:** [`agent-preamble.md`](agent-preamble.md).
- **Running log** (what each WP delivered, its gaps and follow-ups): [`orchestrator-log.md`](orchestrator-log.md).

## State

| Item | State |
|---|---|
| `feat/documenso-parity` head | `f3e4998` (WP-46), plus docs. Waves 0–7 and WP-46 are merged. |
| CI | Every check is green except CodeQL, which holds six `js/insufficient-password-hash` false positives on SHA-256 of random keys and tokens. The owner dismisses them in GitHub code scanning (D11). |
| Feature flags | Every new surface ships **off**. Each flag is turned on later in its own small PR, after the env vars in CLAUDE.md are set. |
| MCP server version | 0.10.0 (`MCP_SERVER_VERSION`). |
| Migrations used | 0022–0037 and 0039. `0038` is unused, which is harmless because the runner globs files. |
| Docs | CLAUDE.md covers the new env vars, S.7/S.8, the migration list, the flags and the new web routes. [`docs/self-hosting.md`](../../self-hosting.md) covers operation. |

## Follow-ups (not in this PR)

- **i18n (WP-39 was partial):** move the rest of the SPA (sign-in/up, documents list, envelope detail, shared components such as SignatureCapture), the emails and the certificate to catalog keys. Decide the certificate title wording first: the code says "Certificate of Completion", the catalog says "Certificate of completion".
- **Product gaps:**
  - Mobile send lacks the new field kinds, and approving from a phone cannot edit fields.
  - The "Use template" page has no access-code or signing-order controls.
  - Bulk send ignores a template's saved signing order.
  - Declined-envelope PDFs are missing from export, Drive and download.
  - MCP envelope tools do not accept `locale`.
  - Email-copy recipient confirmation and the "automation saved" email both need a migration. D10 meanwhile allows only the owner's own mailbox.
  - Bounce and complaint suspension is inert until email-provider webhooks are stored.
- **Accepted risks (WP-46):**
  - Browser-based OAuth clients are blocked by CORS on `/oauth/token`.
  - Rate limiters are per process, so they need a shared store before scaling out.
  - Expired OAuth codes and tokens are never purged; add a cron sweep.
  - node-forge GHSA-86w9-cpqp-85rv has no fix and is ignored with a dated note (verify-only path, unreachable from `apps/api/src`). Re-check when a fixed version ships.
- **External:** register the MCP OAuth clients with ChatGPT and Claude. Preview the "API key created", approval and automation emails in real Gmail.

## How each wave was run

- **Agents:** one WP per agent, each in its own git worktree, at most 5 at a time.
  - Model tier per the plan: opus for large WPs or planning, sonnet for medium, haiku for well-defined ones.
  - Each agent's prompt says: read `agent-preamble.md`, plus a short WP-specific brief.
- **Databases:** before launching an agent, the orchestrator creates its Postgres database `seald_<wp>`, for example `su postgres -c "psql -qc 'create database seald_wp22'"`. Agents never create or drop databases.
- **Merging:** cherry-pick each WP's commits onto `feat/documenso-parity` in the plan's merge order.
  - Hot files (`tools-list.snapshot.json`, `MCP_SERVER_VERSION`, `schema.ts`, email-kind unions, `route-coverage.ts`, `app.module.ts`, `AppRoutes.tsx`, `_worker.js`) conflict often. Resolve by keeping both sides.
  - When two WPs both bump the MCP version, bump it once more. Then regenerate the snapshot with `cd apps/api && UPDATE_MCP_SNAPSHOT=1 npx jest src/mcp` and run prettier on it.
  - Run `pnpm --filter shared build` after any change to shared code. Stale `dist/` output causes spurious typecheck errors.
- **Gates before every push:**
  1. `pnpm -r typecheck && pnpm -r lint && pnpm lint:spelling`
  2. `pnpm --filter api test -- -w 3` and `pnpm --filter web test`
  3. Postgres e2e on a fresh database: drop and recreate `seald`, then `SUBMIT_SIGNER_DATABASE_URL=postgres://postgres:postgres@localhost:5432/seald pnpm --filter api test:e2e`
  4. `pnpm --filter api exec ts-node scripts/verify-pades.ts test-output`
  5. Playwright. Use a temporary config that sets `launchOptions.executablePath: '/opt/pw-browsers/chromium'`, and don't commit it.
  6. gitleaks on the range, and commitlint (all-lowercase subject).
- **After a push:**
  - Watch CI. Every check except the three deferred security ones must be green before the next wave starts.
  - Don't edit the PR description while CI is running: the edit restarts CI and cancels the run in progress.
- **Git rules:** never amend, never `--no-verify`, never force-push (CLAUDE.md).

## Open questions for the owner

- **Direct links (WP-37):** the plan made an emailed access code mandatory. The implementation sends the emailed signing link instead, and adds the code only when `signerAccessAuth` is on. Confirm, or ask for the code to be made mandatory.
- **Approval email:** the "API key created" and approval emails still need a preview in a real Gmail inbox.
