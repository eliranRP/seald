# Resuming the documenso-parity work

Work on PR #380 (`feat/documenso-parity`, draft) was paused on 2026-10-22, partway through wave 5. This folder is enough for a new session or agent to pick it up without the original conversation.

- **Plan and decisions:** [`../documenso-parity-plan.md`](../documenso-parity-plan.md). It holds the work packages (WP-xx), migration ids, model tiers, waves (§5) and decisions D1–D7.
- **Rules every WP agent follows:** [`agent-preamble.md`](agent-preamble.md).
- **Running log** (what each WP delivered, its gaps and follow-ups): [`orchestrator-log.md`](orchestrator-log.md).

## State

Waves 0–7 are merged on `feat/documenso-parity` except WP-39 and WP-46.

| Item | State |
|---|---|
| `feat/documenso-parity` head | Wave 7 through WP-45 (`46d1a57`), plus the WP-41 docs commit. |
| Still open | **WP-39** (i18n string extraction, haiku) and **WP-46** (security sweep, opus, last). |
| Security checks | CodeQL, Trivy and `pnpm audit` are red **by design** until WP-46 (D6/D7). Do not fix them earlier. |
| MCP server version | 0.10.0 (`MCP_SERVER_VERSION`). |
| Migrations used | 0022–0037 and 0039. `0038` is unused, which is harmless because the runner globs files. |
| Docs | WP-41: CLAUDE.md covers the new env vars, S.7/S.8, the migration list, the flags and the new web routes. [`docs/self-hosting.md`](../../self-hosting.md) covers operation. |

## Next steps, in order

1. **WP-39** (i18n string extraction), then **WP-46** (security sweep) last.
   - WP-46 picks up every security item in the log: CodeQL alerts, dependency CVEs (including node-forge), the pg Pool `error` listener, and the Terraform IMDS hop limit.
   - Earlier waves' steps (WP-30 and the wave 6 and 7 merges) are complete. Their follow-ups are in the orchestrator log.

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
