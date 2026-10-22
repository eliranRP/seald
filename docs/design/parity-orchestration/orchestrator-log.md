# Orchestrator log (append-only, oldest first)

Raw running notes from the orchestrating session. Branch names and worktrees mentioned for waves 1–5 no longer exist; their commits are on feat/documenso-parity.

```text
Wave1 worktrees + deps worktree branched from 93cee5f (pre-reword). Merge via: git rebase --onto 65913bd 93cee5f <branch>
Merge wave branches with: git rebase --onto feat/documenso-parity 93cee5f <branch>
EXCEPTION: WP-12 worktree (agent-aa7058b6a4c107054) is based on bff9c66 (main) -> git rebase --onto feat/documenso-parity bff9c66 <branch>
WP-02 DONE: branch worktree-agent-a994b2798f2a0a876 on 93cee5f, commit e085661 (pg SQL unverified locally; CI e2e has postgres). Stray local postgres 16 cluster left running by agent.
WP-15 DONE: branch worktree-agent-af9ef80af55c8782c on 93cee5f, commits d2def48 3381374 (one unexplained flaky web test in an earlier run)
WP-12 DONE: branch worktree-agent-aa7058b6a4c107054 on bff9c66 (main), commits 2b0678c a9ff87f 73e69e1 c83e3af. Note: templates applied via API only on saved-doc branch; 0d is deny-list.
WP-13 DONE: branch worktree-agent-abe9d76531d90592c on 93cee5f, commit 4648cf3, migration 0027. Deploy risk: rollback needs drain+down first; queued emails lose stored link (intended).
WP-18 DONE: branch worktree-agent-ad36edcce36807f35 on 85fe098 (current), commits 8227e4e d929426 bbee5c3. Gaps: OAuth sign-in drops next (WP-22).
WP-13 FIX: d7f3cca on top of 4648cf3 (regex scoped to /sign/ links)
WP-01 DONE: branch worktree-agent-ad70e2298b7b49394 on 93cee5f, commits d450ae7..6908e3f
WP-28 DONE: branch worktree-agent-ab2a0c4ad0de8ad89 base 8bb81ea, commits 86c39c8 8b7d4f3 ac078f0; migration 0031; touches app.module.ts, env.schema.ts, envelopes.repository.pg.ts (appendEvent hook)
WP-09 DONE: branch worktree-agent-a45c43f5f76bb4a85 base 8bb81ea, commits 9cfd65e..bd2c77c; migration 0025. Flaky DocumentPage.test 'Group button' under load.
WP-14 DONE: branch worktree-agent-ada5afa9d9979a406 base 8bb81ea, commits 22606c9..234ba6f; migration 0028. Watch gitleaks on seald_live_ fixtures in src specs. MCP_DISABLED not in env schema.
WP-16 DONE: branch worktree-agent-af2f26bfaa0f36405 base 02e2d14, commit 9409c9a. Agent's su postgres was refused by permission system (not run). Need pg e2e at merge (my gate). CodeQL suppression pushed 0e802ef - check if alerts clear.
D7: all security findings (CodeQL, trivy, audit, gitleaks) -> WP-46 at end; don't act mid-way
WP-07 DONE: branch worktree-agent-ac2b892a58a4bd0dc base 02e2d14, commits 45a4a95 40013cc; migration 0024; touched web rebindFieldsToSigners.ts. Agent created DB via psql URL after su was refused (surfaced to user). Future: orchestrator pre-creates per-WP DBs.
WP-05 DONE (pending backstop fix): branch worktree-agent-a2b308570c1ac70c0 base 02e2d14, commits 03c3b79 5964f0e 4d15840; migration 0023; down/0022 enum hardcode risk; VerifyPage one-line edit (also WP-03/WP-05 both touched VerifyPage label map -> conflict likely)
WP-17 DONE: branch worktree-agent-a94c794b5be979538 base 02e2d14, commits 87c704b a364248 f2d8133; adds @modelcontextprotocol/sdk 1.32.1 (lockfile!), .github/pull_request_template.md, app.module/main.ts/env.schema edits. Follow-ups: drive_file_name filter matches nothing (fix in WP-19 8d), per-credential limiter deferred, /me/export mapped WP-45 (add to WP-45 scope). Agent ran one spec vs postgres db before rule (surfaced).
WP-04 DONE: branch worktree-agent-a94c14b2bfd16e46e base 02e2d14, commit f98c95f. Playwright spec multi-document-signing not run (chromium at /opt/pw-browsers exists - run at merge). Gaps: no public zip on verify; unreadable extra PDF dropped silently.
Wave 3 merged+pushed 963d70b. Wave 4 running: WP-10 (opus) WP-19 (opus) WP-29 A2 (opus) WP-06 (sonnet) WP-08 (sonnet). Prod note: app pg Pool has no 'error' listener -> idle client error could crash process (pre-existing) -> add to WP-46 list.
WP-46 list: CodeQL js/polynomial-redos packages/shared/src/field-meta.ts:208 (WP-07) — alert #35, thread 4348786323
WP-06 DONE: branch worktree-agent-a291f23bf33869145 base 963d70b, commit 618bdcd. Follow-ups: templates don't store signing order (API+web, add to WP-37/templates), 'Sent to N signers' text on sequential, Playwright 2-step spec not written. First pg run failure = old signing-order race (fixed in e2b5745).
WP-29A2 DONE: branch worktree-agent-a60850291df58a821 base 963d70b, commits 9850bd6 814c01b. Terraform hop limit kept 2 (variable) - user decision deferred to WP-46. AUTOMATION_SECRETS_KEY needed in prod before flag. TODO at merge: make all pg spec DB names random-suffixed (fixed names collide across parallel worktrees).
WP-10 DONE: branch worktree-agent-a5af9a0edb497021a base 963d70b, commits b7cd758 e4e5291 e1da04a; migration 0026; SIGNER_OTP_KEY needed in prod; MCP version 0.3.0 + snapshot (expect conflict w/ WP-19, regenerate at merge).
WP-08 DONE: branch worktree-agent-afa75f9f2977d4207 base 963d70b, commits 2b11813 e4569ce 6ebf8f6. TODO merge: API accepts read_only on kinds w/o default (name/date/email/checkbox) -> unfillable required field; reject in shared field-meta. Mobile send lacks new kinds (follow-up).
Wave4 merged+pushed cb5e171. Wave5 started: 21 36 37 11 20; queued 30 38
WP-20 DONE: branch worktree-agent-acabf648ff00c153a base cb5e171, commit 6a982ff; MCP 0.4.0 + snapshot (step-9). Heuristic-only suggest.
WP-38b launched (sonnet). WP-30 held until WP-21 lands (needs approvals).
WP-11 DONE: branch worktree-agent-abe5fbeaf190417d2 base cb5e171, commit 9a0cc88. Fixed WP-06 not_your_turn parsing. TODO merge: main.ts enableCors exposedHeaders ['Retry-After']. Gaps: UseTemplatePage lacks access-code + signing order; GET access-auth unused.
WP-38b DONE: branch worktree-agent-a3357925359b5cbdb base cb5e171, commit 64c38d5; migration 0035. Load flakes (sealing-hardening, multi-document-seal, App.test) - recheck at merge. MCP locale not added (follow-up). Web has no per-signer locale UI.
WP-36 DONE: branch worktree-agent-a910d3cd2fe08bfda base cb5e171, commits 4c65d87 32cddec; migration 0032; env BULK_SEND_ROWS_PER_MINUTE (WP-41 docs). Hot: AppRoutes, app.module, shared index, template.service, dispatcher, route-coverage step-15. Sealing specs 5s timeouts under load (recurring; consider timeout bump at merge). apiClient error body gap.
WP-37 DONE: branch worktree-agent-a2a8df6cf01ad2b2c base cb5e171, commits eeb752f 8fc8878; migration 0033. Hot: AppRoutes /d/, _worker SPA_PREFIXES /d/, app.module, route-coverage step-13. Deviation: emailed signing link instead of mandatory access code (code only if signerAccessAuth on) - tell user. Fixed DocumentRoute.documents.test race. Follow-up: bulk ignores template delivery_mode/slot order; use-template source='app'. New SHA-256 token hashing -> likely CodeQL alert (WP-46).
WP-21 DONE: branch worktree-agent-a200e4b04ad979f4c commits fd31928 ea4a6f9 b2c8c5f; migration 0030; env APPROVAL_CSRF_KEY, EMAIL_PROVIDER_DAILY/MONTHLY_QUOTA; MCP 0.4.0 (conflict w/ WP-20). TODO(WP-24) send caps; decision+action not one tx.
Wave5 (21 20 36 37 38 11 + cors fix) merged+pushed 16e5073. WP-30 launched on 16e5073 (MCP -> 0.6.0).
STOPPED 2026-10-22 at owner request. WP-30 partial pushed to wip/wp30-automations-mcp (b441d24, unverified).
```
