# Common rules for every seald work package (read fully before starting)

Repo: /home/user/seald (your worktree is a copy). Branch to build on: `feat/documenso-parity`.

1. FIRST: `git merge --ff-only feat/documenso-parity` (if it fails and you have no commits: `git reset --hard feat/documenso-parity`). Confirm `git log --oneline -1` shows the branch tip.
2. Read CLAUDE.md, docs/design/documenso-parity-plan.md (section 3 rules + your WP section + section 7 decisions D1–D6), and any design doc your WP cites (docs/design/mcp-server.md, docs/design/workflow-automations.md) — implement what they say.
3. Setup: `pnpm install --frozen-lockfile && pnpm --filter shared build`.
4. All new surfaces behind the flag named in your WP (flags already exist in packages/shared/src/feature-flags.ts; API helper `requireFlag` in apps/api/src/common/feature-flag.guard.ts). Flag off = existing behaviour and responses unchanged.
5. Migrations: only your reserved id; up in apps/api/db/migrations/, paired down in down/ (M.1–M.3); idempotent; RLS on new tables; keep apps/api/db/schema.ts in sync.
6. Hot files (AppRoutes.tsx, apps/landing/_worker.js, app.module.ts, ci.yml, CLAUDE.md, EVENT_TYPES append-only, envelopes.repository.pg.ts) — minimal, clearly-declared edits only; list them in your report.
7. Every new event via appendEvent (S.6). Never @signpdf/utils.extractSignature (S.5).
8. Tests: jest next to code + e2e for new routes; web vitest with role/name queries (rule 4.6) + a story per new component. Any e2e that boots AppModule with in-memory repos must also override `EnvelopeDocumentsRepository` with `new InMemoryEnvelopeDocumentsRepository(envelopesRepo)` (see existing e2e specs).
9. Real Postgres 16 is available locally. The orchestrator PRE-CREATES your database `seald_<wp>` (lowercase, e.g. seald_wp08) before you start — do NOT create, drop or administer databases yourself, and do not use `su`. Run pg e2e as `SUBMIT_SIGNER_DATABASE_URL=postgres://postgres:postgres@localhost:5432/seald_<wp> pnpm --filter api test:e2e` (every pg spec you write MUST create/drop its own uniquely named scratch database through that connection and run migrate.sh only against that scratch database — never migrate the URL database itself, because suites run in parallel and race on schema_migrations). pg specs must add `pool.on('error', () => undefined)` before forced drops and respect envelope_signers checks (signed_at needs tc_accepted_at + signature_format). If your database is missing or any command is refused by the permission system, STOP and report — never retry another way or route around a refusal.
10. Gates before commit, all must pass: `pnpm -r typecheck && pnpm -r lint && pnpm lint:spelling && pnpm --filter api test -- -w 3 && pnpm --filter web test && <pg e2e as above>`; if you touched sealing, also `pnpm --filter api exec ts-node scripts/verify-pades.ts test-output`. Secret scan: `GITLEAKS_CONFIG=.gitleaks.toml gitleaks (v8.24.3) detect --redact --no-banner --log-opts="--no-merges --first-parent feat/documenso-parity..HEAD"` must report no leaks — use obviously fake, low-entropy fixtures (e.g. 'seald_live_' + 'x'.repeat(43)) instead of allowlisting.
11. Commits: conventional, all-lowercase subject ending `(WP-xx)` (commitlint subject-case), body says why, trailers exactly:
    Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
    Claude-Session: <your session URL>
    Never amend, never --no-verify, never push.
12. Report: worktree path, branch, base commit, commits, gate results with counts, hot-file edits, deviations, risks. The seald-react-pr-review / seald-qa-validation skills are not installed; apply docs/agents/PR_REVIEW_CHECKLIST.md by hand for web changes and say so.
