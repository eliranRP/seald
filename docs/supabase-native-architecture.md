# Supabase-native architecture

Status: accepted (2026-10-25). Supersedes the "one fat function" design in
`docs/aws-exit-plan.md` WS-0 as the end state; that bundle stays only as a
bridge while routes move.

## Why change the shape, not just the host

The spike (aws-exit-plan WS-0 results) showed the Nest monolith runs as one
Edge Function but wastes the free tier:

- Every cold worker parses a 9 MB bundle: 0.7-1.0 s of a 2 s CPU budget
  that is counted **per worker**, so the budget left for real work is
  small and workers retire often.
- Every screen in the SPA is an HTTP round trip through that function,
  even a plain "list my contacts", which spends invocations (500k/month)
  and CPU on code that Postgres can answer alone.
- In-process polling loops have no place to run.

Supabase gives us Postgres with Row Level Security, SQL functions, pg_cron,
Queues (pgmq), pg_net, Storage policies, Auth and Deno Edge Functions. The
app should lean on those instead of rebuilding them in a Node server.

## Decisions

1. **Language and stack stay TypeScript + React + Postgres.** Edge
   Functions run TypeScript/JavaScript on Deno. The highest-value code (PAdES
   B-T/B-LT/B-LTA sealing, the audit chain, signing-order and access-auth
   rules) is tested TypeScript with legal weight; porting it to another
   language buys nothing and risks the seals. `packages/shared` keeps
   serving both sides.
2. **Domain logic is reused, the framework is dropped.** Services move
   into a framework-free core (plain classes and functions, constructor
   injection by hand, no Nest DI, no decorators). Each Edge Function is a
   small entry that wires only what it needs, so it bundles and boots
   fast.
3. **The owner's own data goes through RLS, not functions.** Contacts,
   templates, drafts, envelope lists and details, account settings: the
   SPA reads and writes them with `supabase-js` under policies keyed on
   `auth.uid()`. Multi-row state changes that must be atomic (send an
   envelope, cancel, correct a signer) are SQL functions (`security
definer`, called by RPC) so the rules live in one transaction in
   Postgres.
   Where a row carries columns the owner must not get (signer token
   hashes, IPs, storage paths), the read is a `security definer` RPC that
   filters on `auth.uid()` and returns exactly the API's JSON, and the
   table stays closed to the Data API (RLS on, no policy). Step 4 does this
   for the lists (migration 0050).
4. **Functions are for what Postgres cannot do:** PDF work, crypto, outbound
   HTTP (email, TSA, OCSP, Google, webhooks), public token-based flows, and
   protocol endpoints with fixed URLs.
5. **Background work is a queue plus a scheduler.** Jobs go into pgmq
   queues; pg_cron calls a worker function with `pg_net` every 30-60 s and
   the request path can kick one job right away with
   `EdgeRuntime.waitUntil`. A worker run takes **one** message, so heavy jobs
   never share a worker's CPU budget. Sealing is split into steps that
   each fit comfortably.
6. **Public URLs do not change.** `seald.nromomentum.com` and
   `api.seald.nromomentum.com` stay; the Cloudflare Pages worker routes
   each path to the function that owns it. Signer links, `/verify`, `/mcp`,
   `/api/v1`, OAuth callbacks and webhooks keep their addresses.

## Function map (end state)

| Function       | Owns                                                                | Heavy deps                |
| -------------- | ------------------------------------------------------------------- | ------------------------- |
| `seal-worker`  | sealing steps: burn-in + PAdES sign, DSS/B-LT, B-LTA, audit.pdf     | pdf-lib, forge, react-pdf |
| `email-worker` | outbox drain, template render, Resend send, bounce webhook          | none                      |
| `jobs`         | scheduler entry: expire, reminders, sweeps, bulk rows, automations  | none                      |
| `sign`         | public signer flow: start, access code, fields, signature, submit   | pngjs                     |
| `envelopes`    | sender actions needing Storage or PDF: upload, documents, downloads | pdf-lib                   |
| `verify`       | public `/verify/:id`: chain check, hashes                           | none                      |
| `mcp`          | `/mcp` + OAuth 2.1 + approvals                                      | MCP SDK                   |
| `public-api`   | `/api/v1/*`                                                         | none                      |
| `integrations` | Google Drive OAuth, picker credentials, import/export               | none                      |

Everything else is RLS + SQL functions called from the SPA.

## Migration order (strangler)

Each step ships alone, keeps tests green, and leaves the app working. Until
a route moves, the bridge function `seald` (the bundled Nest app) serves it,
so AWS can be switched off as soon as sealing and the workers run natively.

1. **Core extraction + `seal-worker`.** Sealing is what does not fit the
   bridge, so it moves first: framework-free sealing core, steps persisted
   between invocations, pgmq queue, pg_cron trigger. AWS EC2 could go after
   this step and step 2 (done: EC2 retired 2026-10-25).
2. **`email-worker` and `jobs`.** Replace the in-process loops.
3. **Cut-over:** Cloudflare routing, secrets, backups (aws-exit-plan
   WS-6..WS-8). Decommission AWS.
4. **RLS read paths** in the SPA (lists, details, contacts, templates).
5. **RLS write paths + SQL functions** for sender actions.
6. **`sign`, `verify`, `envelopes`** as native functions.
7. **`mcp`, `public-api`, `integrations`**, then delete the bridge and
   `apps/api`'s Nest shell.

## Progress

- Step 1 done: step-wise sealing on `seal-worker` (CLAUDE.md S.9).
- Step 2 done: `email-worker`; the per-minute and daily loop work as
  `POST /internal/cron/tick` and `/daily` on the bridge; pg_cron installer
  (migration 0049). A slim `jobs` function replaces those bridge
  endpoints when the rest of the routes move.
- Step 3 prepared, not executed: the API hostname proxy in `_worker.js`
  with `EDGE_PROXY_SECRET`, the `deploy-supabase` and `backup-supabase`
  workflows, the Drive token re-wrap script, and the runbook in
  `docs/self-hosting.md`.
- Step 4 started: the dashboard list, contacts and templates read through
  `seald_list_envelopes` / `_contacts` / `_templates` (migration 0050) with
  supabase-js, behind `ownerReadRpcs` (on). Each falls back to the API
  when the RPC fails. `owner-read-rpcs.pg.e2e-spec.ts` checks each RPC
  against the API's output and proves other users and `anon` get nothing.
  Envelope detail is next.

## Rules for the new code

- Core modules import nothing from `@nestjs/*`. They take their
  dependencies as constructor arguments typed by small interfaces.
- One function = one folder in `supabase/functions/`, an `index.ts` that
  wires the core, and nothing heavy at module top level.
- Database access from functions uses the transaction pooler (port 6543).
- Every RLS policy ships with a SQL test proving another user is denied.
- The existing sealing invariants (CLAUDE.md S.1-S.8) carry over
  unchanged; `verify-pades` keeps gating every PR.
