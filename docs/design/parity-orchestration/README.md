# Resuming the documenso-parity work

Work on PR #380 (`feat/documenso-parity`, draft) was paused on 2026-10-22, partway through wave 5. This folder is enough for a new session or agent to pick it up without the original conversation.

- **Plan and decisions:** [`../documenso-parity-plan.md`](../documenso-parity-plan.md). It holds the work packages (WP-xx), migration ids, model tiers, waves (§5) and decisions D1–D7.
- **Rules every WP agent follows:** [`agent-preamble.md`](agent-preamble.md).
- **Running log** (what each WP delivered, its gaps and follow-ups): [`orchestrator-log.md`](orchestrator-log.md).

## State at the stop

| Item | State |
|---|---|
| `feat/documenso-parity` head | `16e5073` plus this docs commit. Waves 0–5 are merged, except WP-30. |
| CI on `16e5073` | Every functional job is green. CodeQL, Trivy and `pnpm audit` are red **by design**: D6/D7 defer every security finding to WP-46, the last WP. Do not fix them earlier. |
| WP-30 (automations MCP tools) | **Partial, unverified.** Pushed to branch `wip/wp30-automations-mcp` (`b441d24`), based on `16e5073`. Typecheck passes; tests and gates have not run. |
| MCP server version | 0.5.0. WP-30's WIP bumps it to 0.6.0. |
| Migrations used | 0023–0033 and 0035. 0034 is reserved for WP-33, 0036 for WP-27. |

## Next steps, in order

1. **Finish WP-30.**
   - Check out `wip/wp30-automations-mcp` and read its diff against `16e5073`.
   - Complete the WP-30 brief: MCP tools to list, upsert, enable, list runs, get run and retry automations.
   - `automations:write` is off by default for new keys.
   - Implement the `automations external destination` approval kind in `apps/api/src/approvals/kinds/`. It is a stub today. MCP upserts of external destinations must return `approval_pending`, and the recipe stays inactive until the owner approves.
   - Write unit specs plus `apps/api/test/mcp-automations.pg.e2e-spec.ts`.
   - Run all gates, then merge onto `feat/documenso-parity`.
2. **Wave 6**, in merge order: 23 → 24 → 25 → 29b → 35 → 33 → 34 → 32 → 22 → 31.
   - WP-24 must make idempotency share the write's transaction first. WP-21 left `TODO(WP-24)` for the send caps, and its approve step and send step are not yet in one transaction.
3. **Wave 7:** 26 → 27 → 45 → 41 → 39, then **WP-46** (security sweep) last.
   - WP-26 also owns the `planned: 'step-15'` routes: access-auth and bulk send.
   - WP-46 picks up every security item in the log: CodeQL alerts, dependency CVEs (including node-forge), the pg Pool `error` listener, and the Terraform IMDS hop limit.

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
