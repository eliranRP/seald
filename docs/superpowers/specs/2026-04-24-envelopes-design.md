# Phase 3 — Envelopes: Send PDF for Signature

**Status:** Approved design, ready for implementation planning
**Date:** 2026-04-24
**Author:** Eliran Azulay + Claude (brainstormed)
**Supersedes:** n/a (new feature)
**Related specs:**
- `2026-04-23-backend-monorepo-auth-design.md` — Supabase JWT auth (Phase 1, shipped)
- `2026-04-23-contacts-crud-design.md` — Contacts repository pattern (Phase 2, shipped)
- `2026-04-23-auth-guest-mode-design.md` — Frontend guest mode (not yet implemented)

---

## 1. Goal

Let a Seald user upload a PDF, choose 1–10 recipients from their contacts, place signature / initials / date / text / checkbox / email fields per recipient, and send. Each recipient receives an email with a unique link, opens a browser-based signing surface (no Seald account required), accepts terms, signs, and submits. When all recipients have submitted, Seald seals the PDF with a cryptographic signature (PAdES-B-LT, RFC 3161 timestamp) and a burned-in visual signature for each signer, generates an audit-trail PDF, and emails both artifacts to everyone involved.

Declined and expired envelopes produce an audit PDF too (not a sealed PDF) and follow the same notification discipline.

This feature replaces the frontend's `mockApi`-backed document composition and adds the full recipient side, which does not exist in the current codebase.

---

## 2. Non-goals (MVP)

The following are explicitly out of scope. Schema accommodates them where noted; logic does not.

- Sequential signing order. `envelope_signers.signing_order` column exists; MVP treats all signers in parallel.
- Roles other than Sender and Signatory. `envelope_signers.role` enum includes `validator` and `witness`; MVP only implements `proposer` (sender, implicit) and `signatory`.
- Signer reassignment ("forward to a colleague") — no backend support.
- Automated reminders on a cadence — only manual sender-triggered reminders.
- Sender dashboard real-time status push (SSE / WebSocket / Supabase Realtime) — frontend polls.
- SMS OTP, email OTP, ID verification, access codes — single-factor token-link only.
- Multi-document envelopes (one PDF per envelope).
- In-app comments or threaded discussion between signers.
- Sender-initiated cancellation mid-flight.
- QES / eIDAS Qualified signatures. SES + PAdES app-wide seal only.
- Per-signer crypto certificates (each signer is attributed via visual signature + audit trail, not individual PKI).

---

## 3. Key decisions

| Topic | Choice | Rationale |
|---|---|---|
| Legal level | Simple Electronic Signature (SES) under ESIGN / UETA / eIDAS Art. 3(10) | Valid for US + most EU commercial e-signing; infrastructure footprint manageable. |
| Crypto | PAdES-B-LT with RFC 3161 timestamp | Industry standard; app-wide Seald seal (not per-signer). Tamper-evident; Acrobat shows ✅ when trust anchor is AATL. |
| CA (production) | SSL.com eSigner (cloud HSM) | AATL-listed; cheapest AATL path; no key material on Seald infrastructure. Port isolates choice; `GlobalSignDssSigner` and `LocalP12Signer` are alternative adapters. |
| TSA | FreeTSA (dev), DigiCert TSA (prod) | FreeTSA works for dev + CI; DigiCert is free and reliable for prod volume. |
| Storage | Supabase Storage (private bucket `envelopes`) | Already in the stack; signed URLs for transient downloads. |
| Email | Resend | Matches earlier decision; port abstracts it so SMTP/dev adapters work without swap. |
| Recipient auth | One-time opaque token in email → short-lived (30 min) signing session JWT in HttpOnly cookie | Standard industry pattern; stateless; no account required. |
| Worker model | Separate Nest process polling Postgres queues via `FOR UPDATE SKIP LOCKED` | Proven, scales horizontally, one DB, two processes, same image. |

---

## 4. Architecture

### 4.1 Process topology

```
┌────────────────────────────────────────────────────────────────────────────────────┐
│                             Seald Backend (apps/api)                                │
│                                                                                    │
│  ┌──────────────────────────┐         ┌──────────────────────────┐                │
│  │    HTTP Process (main)   │         │   Worker Process          │                │
│  │                          │         │                           │                │
│  │  Nest AppModule          │         │   Nest AppModule          │                │
│  │  ├─ Sender endpoints     │         │   (same DI, no HTTP)      │                │
│  │  ├─ Signer endpoints     │         │   ├─ EnvelopeJobLoop      │                │
│  │  ├─ Public verification  │         │   │   └─ seal | audit_only│                │
│  │  └─ Cron endpoints       │         │   └─ OutboundEmailLoop    │                │
│  │                          │         │       └─ Resend / SMTP    │                │
│  └────────┬─────────────────┘         └────────┬──────────────────┘                │
│           │                                    │                                    │
└───────────┼────────────────────────────────────┼────────────────────────────────────┘
            │                                    │
            ▼                                    ▼
   ┌───────────────────┐              ┌──────────────────────┐
   │  Supabase         │              │  Supabase            │
   │  Postgres         │              │  Storage             │
   │  (envelopes,      │              │  (private bucket     │
   │   signers,        │              │   'envelopes/{id}/')  │
   │   fields,         │              └──────────────────────┘
   │   events,         │
   │   jobs, emails)   │
   └───────────────────┘              ┌──────────────────────┐
                                      │  Resend (email)      │
                                      │  SSL.com eSigner     │
                                      │  (PAdES, prod only)  │
                                      │  TSA (dev: FreeTSA)  │
                                      └──────────────────────┘
```

Deploy as two containers from the same image, different `CMD`. Dev runs both locally via `pnpm --filter api start:dev` + `pnpm --filter api start:worker:dev`.

### 4.2 Envelope state machine

```
       ┌───────────┐  upload+signers+fields+send
       │   draft   │────────────────────────────────┐
       └───────────┘                                │
                                                    ▼
                                     ┌──────────────────────────┐
                                     │     awaiting_others      │
                                     │  (all signers can sign    │
                                     │   in parallel)           │
                                     └──────────┬───────────────┘
                       last sign submitted      │        any decline        cron expire
                                 │              │              │                 │
                                 ▼              │              ▼                 ▼
                        ┌───────────┐           │        ┌──────────┐      ┌──────────┐
                        │  sealing  │           │        │ declined │      │ expired  │
                        │ (worker)  │           │        └──────────┘      └──────────┘
                        └─────┬─────┘           │
                              │                 │
                              ▼                 │
                        ┌───────────┐           │
                        │ completed │           │
                        └───────────┘           │
                                                │
                     ┌──────────┐               │
                     │ canceled │ (post-MVP)    │
                     └──────────┘◀──────────────┘
```

Terminal states: `completed`, `declined`, `expired`, `canceled`. Every transition into a terminal state is guarded by a row-conditional `UPDATE ... WHERE status = <expected>` inside a single transaction that also writes the matching `envelope_events` row.

### 4.3 Module layout

```
apps/api/src/
├── envelopes/                        ← this spec's primary module
│   ├── envelopes.controller.ts
│   ├── envelopes.service.ts
│   ├── envelopes.module.ts
│   ├── envelopes.repository.ts       ← port (abstract class)
│   ├── envelopes.repository.pg.ts    ← Kysely adapter
│   ├── dto/
│   │   ├── create-envelope.dto.ts
│   │   ├── patch-envelope.dto.ts
│   │   ├── add-signer.dto.ts
│   │   └── place-fields.dto.ts
│   ├── coord.ts                       ← normalize/denormalize field coords
│   └── short-code.ts                  ← nanoid-based generator + collision retry
├── signing/                           ← signer-facing (guest) endpoints
│   ├── signing.controller.ts          ← /sign/*
│   ├── signing.service.ts
│   ├── signing.module.ts
│   ├── signer-session.guard.ts        ← JWT-in-cookie guard
│   ├── signer-session.service.ts      ← issue/verify session JWT
│   └── dto/
├── verification/                      ← public verify endpoints
│   ├── verification.controller.ts     ← /verify/*
│   └── verification.module.ts
├── worker/
│   ├── worker.main.ts                 ← process entry point
│   ├── worker.module.ts
│   ├── worker.service.ts              ← loop coordinator
│   ├── envelope-job.processor.ts      ← seal | audit_only
│   ├── outbound-email.processor.ts
│   └── cleanup.service.ts             ← stuck-row recovery
├── pdf-signing/
│   ├── pdf-signer.ts                  ← port
│   ├── local-p12-signer.ts            ← dev/test adapter
│   ├── sslcom-esigner-signer.ts       ← prod adapter (SSL.com eSigner REST)
│   ├── globalsign-dss-signer.ts       ← alt prod (not in MVP tasks; spec-ready)
│   └── pdf-signing.module.ts          ← selects adapter via env
├── sealing/                           ← non-crypto PDF pipeline
│   ├── seal.service.ts                ← orchestration
│   ├── burn-in.ts                     ← pdf-lib field placement + watermark
│   ├── audit-pdf.ts                   ← 3-page audit generator
│   └── sealing.module.ts
├── storage/
│   ├── storage.service.ts             ← Supabase Storage adapter
│   └── storage.module.ts
├── email/
│   ├── email-sender.ts                ← port
│   ├── resend-email-sender.ts
│   ├── smtp-email-sender.ts
│   ├── logging-email-sender.ts
│   ├── templates/                     ← *.mjml + *.txt
│   └── email.module.ts
└── common/
    ├── idempotency.middleware.ts      ← Idempotency-Key handling
    ├── etag.ts                        ← If-Match on sender mutations
    └── rate-limit.ts                  ← rate-limiter-flexible wrappers

apps/api/db/migrations/
├── 0001_contacts.sql                  (shipped)
├── 0002_envelopes.sql                 ← this spec
└── 0003_outbound_emails.sql           ← this spec

packages/shared/src/
└── envelope-contract.ts               ← wire types + zod schemas used by FE + BE
```

---

## 5. Data model

### 5.1 Enums

```sql
create type envelope_status  as enum ('draft','awaiting_others','sealing','completed','declined','expired','canceled');
create type delivery_mode    as enum ('parallel','sequential');
create type signer_role      as enum ('proposer','signatory','validator','witness');
create type field_kind       as enum ('signature','initials','date','text','checkbox','email');
create type signature_format as enum ('drawn','typed','upload');
create type actor_kind       as enum ('sender','signer','system');
create type event_type       as enum (
  'created','sent','viewed','tc_accepted','field_filled',
  'signed','all_signed','sealed','declined','expired','canceled',
  'reminder_sent','session_invalidated_by_decline','job_failed','retention_deleted'
);
create type job_kind         as enum ('seal','audit_only');
create type job_status       as enum ('pending','running','done','failed');
create type email_kind       as enum (
  'invite','reminder','completed','declined_to_sender',
  'withdrawn_to_signer','withdrawn_after_sign',
  'expired_to_sender','expired_to_signer'
);
create type email_status     as enum ('pending','sending','sent','failed');
```

### 5.2 `envelopes`

```sql
create table public.envelopes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  short_code         text not null unique check (char_length(short_code) = 13),
  status             envelope_status not null default 'draft',
  delivery_mode      delivery_mode   not null default 'parallel',
  original_file_path text,                                        -- null until upload
  original_sha256    text check (char_length(original_sha256) = 64),
  original_pages     integer check (original_pages > 0),
  sealed_file_path   text,
  sealed_sha256      text check (char_length(sealed_sha256) = 64),
  audit_file_path    text,
  tc_version         text not null,
  privacy_version    text not null,
  sent_at            timestamptz,
  completed_at       timestamptz,
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index envelopes_owner_status_updated_idx
  on public.envelopes (owner_id, status, updated_at desc);
create unique index envelopes_short_code_uniq on public.envelopes (short_code);

alter table public.envelopes enable row level security;

create trigger envelopes_set_updated_at
  before update on public.envelopes
  for each row execute function public.set_updated_at();
```

### 5.3 `envelope_signers`

The signer `id` is the "Signer Identifier" printed in the audit PDF and the watermark under each signature glyph. It is document-scoped — not linked to `auth.users`.

```sql
create table public.envelope_signers (
  id                   uuid primary key default gen_random_uuid(),
  envelope_id          uuid not null references public.envelopes(id) on delete cascade,
  contact_id           uuid references public.contacts(id) on delete set null,
  email                citext not null,
  name                 text not null check (char_length(name) between 1 and 200),
  color                text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  role                 signer_role not null default 'signatory',
  signing_order        integer not null default 1 check (signing_order >= 1),

  access_token_hash    text check (char_length(access_token_hash) = 64),
  access_token_sent_at timestamptz,
  verification_checks  jsonb not null default '[]'::jsonb,

  viewed_at            timestamptz,
  tc_accepted_at       timestamptz,
  signed_at            timestamptz,
  declined_at          timestamptz,
  decline_reason       text check (char_length(coalesce(decline_reason, '')) <= 500),

  signing_ip           inet,
  signing_user_agent   text,

  signature_format         signature_format,
  signature_image_path     text,
  signature_font           text,
  signature_stroke_count   integer,
  signature_source_filename text,

  created_at           timestamptz not null default now(),

  unique (envelope_id, email),
  check ((signed_at is null) or (tc_accepted_at is not null)),
  check ((signed_at is null) or (signature_format is not null)),
  check ((declined_at is null) or (signed_at is null))
);

create index envelope_signers_envelope_signed_idx on public.envelope_signers (envelope_id, signed_at);
create index envelope_signers_token_idx on public.envelope_signers (access_token_hash)
  where access_token_hash is not null;

alter table public.envelope_signers enable row level security;
```

### 5.4 `envelope_fields`

```sql
create table public.envelope_fields (
  id             uuid primary key default gen_random_uuid(),
  envelope_id    uuid not null references public.envelopes(id) on delete cascade,
  signer_id      uuid not null references public.envelope_signers(id) on delete cascade,
  kind           field_kind not null,
  page           integer not null check (page >= 1),
  x              numeric(7,4) not null check (x >= 0 and x <= 1),
  y              numeric(7,4) not null check (y >= 0 and y <= 1),
  width          numeric(7,4)          check (width is null or (width > 0 and width <= 1)),
  height         numeric(7,4)          check (height is null or (height > 0 and height <= 1)),
  required       boolean not null default true,
  link_id        text,
  value_text     text,
  value_boolean  boolean,
  filled_at      timestamptz,

  created_at     timestamptz not null default now()
);

create index envelope_fields_envelope_page_idx on public.envelope_fields (envelope_id, page);
create index envelope_fields_signer_idx on public.envelope_fields (signer_id);

alter table public.envelope_fields enable row level security;
```

### 5.5 `envelope_events` (append-only)

```sql
create table public.envelope_events (
  id           uuid primary key default gen_random_uuid(),
  envelope_id  uuid not null references public.envelopes(id) on delete cascade,
  signer_id    uuid references public.envelope_signers(id) on delete set null,
  actor_kind   actor_kind not null,
  event_type   event_type not null,
  ip           inet,
  user_agent   text,
  metadata     jsonb not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);

create index envelope_events_envelope_created_idx on public.envelope_events (envelope_id, created_at);

alter table public.envelope_events enable row level security;

-- No UPDATE grant; append-only at the app role level (backend as sole gate).
```

### 5.6 `envelope_jobs`

```sql
create table public.envelope_jobs (
  id            uuid primary key default gen_random_uuid(),
  envelope_id   uuid not null unique references public.envelopes(id) on delete cascade,
  kind          job_kind not null,
  status        job_status not null default 'pending',
  attempts      integer not null default 0,
  max_attempts  integer not null default 5,
  last_error    text,
  scheduled_for timestamptz not null default now(),
  started_at    timestamptz,
  finished_at   timestamptz,
  created_at    timestamptz not null default now()
);

create index envelope_jobs_pending_idx
  on public.envelope_jobs (scheduled_for)
  where status in ('pending','failed');

alter table public.envelope_jobs enable row level security;
```

### 5.7 `outbound_emails`

```sql
create table public.outbound_emails (
  id            uuid primary key default gen_random_uuid(),
  envelope_id   uuid references public.envelopes(id) on delete cascade,
  signer_id     uuid references public.envelope_signers(id) on delete set null,
  kind          email_kind not null,
  to_email      citext not null,
  to_name       text not null,
  payload       jsonb not null,
  status        email_status not null default 'pending',
  attempts      integer not null default 0,
  max_attempts  integer not null default 8,
  scheduled_for timestamptz not null default now(),
  sent_at       timestamptz,
  last_error    text,
  provider_id   text,
  source_event_id uuid references public.envelope_events(id) on delete set null,
  created_at    timestamptz not null default now(),

  unique (envelope_id, signer_id, kind, source_event_id)
);

create index outbound_emails_pending_idx
  on public.outbound_emails (scheduled_for)
  where status in ('pending','failed');

alter table public.outbound_emails enable row level security;
```

### 5.8 `idempotency_records`

```sql
create table public.idempotency_records (
  user_id         uuid not null,
  idempotency_key text not null,
  method          text not null,
  path            text not null,
  request_hash    text not null,
  response_status integer not null,
  response_body   jsonb not null,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default (now() + interval '24 hours'),
  primary key (user_id, idempotency_key)
);

create index idempotency_records_expires_idx on public.idempotency_records (expires_at);

alter table public.idempotency_records enable row level security;
```

### 5.9 `email_webhooks` (stub, post-MVP)

Schema lands in MVP so post-MVP handlers don't need a migration. No code writes to it yet.

```sql
create table public.email_webhooks (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  event_type   text not null,
  provider_id  text not null,
  payload      jsonb not null,
  received_at  timestamptz not null default now(),
  processed_at timestamptz
);
create index email_webhooks_provider_id_idx on public.email_webhooks (provider_id);
alter table public.email_webhooks enable row level security;
```

### 5.10 Storage layout

Bucket `envelopes` (private, RLS enabled):

```
envelopes/
  {envelope_id}/
    original.pdf
    signatures/
      {signer_id}.png             ← canonical 600x200 PNG regardless of capture mode
    sealed.pdf                    ← post-seal only
    audit.pdf                     ← post-seal only (or post-decline/expire for audit_only path)
```

All reads occur via 60–90 second signed URLs issued by the backend. No bucket paths are publicly readable.

### 5.11 Invariants enforced at the service layer

These are not DB constraints but are mandatory service-level checks. Tested exhaustively.

- Cannot transition from a terminal status (`completed`, `declined`, `expired`, `canceled`).
- Cannot `send` an envelope without: `original_file_path` set, ≥1 signer, ≥1 required signature-or-initials field per signer.
- Cannot place a field where `signer_id` doesn't belong to the same `envelope_id`.
- `tc_accepted_at` must predate `signed_at`.
- A signer cannot both sign and decline (DB check enforces).
- Fields on a non-draft envelope are read-only.
- Signers on a non-draft envelope are read-only.

---

## 6. API

All error responses are JSON `{ "error": "<slug>" }`. The slug is stable and enumerated per endpoint.

### 6.1 Sender API (`AuthGuard`, Supabase JWT)

All routes scoped by `owner_id = user.id`. Cross-owner → 404 `envelope_not_found` (no existence leak).

| Verb | Path | Body / Params | Success | Notable errors |
|---|---|---|---|---|
| `POST` | `/envelopes` | `{ title }` | `201` envelope shell | `400 validation_error` |
| `POST` | `/envelopes/:id/upload` | multipart `file` ≤ 25 MB | `200 { pages, sha256 }` | `404 envelope_not_found`, `409 envelope_not_draft`, `413 file_too_large`, `415 file_not_pdf`, `400 file_unreadable` |
| `GET` | `/envelopes/:id` | — | `200` full envelope (with signers + fields) | `404` |
| `GET` | `/envelopes/:id/original.pdf` | — | `302` signed URL | `404` |
| `GET` | `/envelopes` | `?status=&limit=&cursor=` | `200 { items, next_cursor }` | `400 invalid_cursor` |
| `PATCH` | `/envelopes/:id` | `{ title?, expires_at? }` | `200` envelope | `404`, `409 envelope_not_draft`, `400` |
| `DELETE` | `/envelopes/:id` | — | `204` | `404`, `409 envelope_not_draft` |
| `POST` | `/envelopes/:id/signers` | `{ contact_id }` | `201` signer | `404`, `404 contact_not_found`, `409 envelope_not_draft`, `409 signer_email_taken` |
| `DELETE` | `/envelopes/:id/signers/:signer_id` | — | `204` | `404`, `409 envelope_not_draft` |
| `PUT` | `/envelopes/:id/fields` | `{ fields: Field[] }` (full replace) | `200 { fields }` | `404`, `409 envelope_not_draft`, `400 signer_not_in_envelope` |
| `POST` | `/envelopes/:id/send` | — | `200` envelope (status: `awaiting_others`) | `404`, `409 envelope_not_draft`, `400 file_required`, `400 no_signers`, `400 no_fields`, `400 signer_without_signature_field` |
| `POST` | `/envelopes/:id/signers/:signer_id/remind` | — | `202` | `404`, `409 envelope_terminal`, `429 remind_throttled` |
| `POST` | `/envelopes/:id/duplicate` | `{ title? }` | `201` new draft envelope | `404` |
| `GET` | `/envelopes/:id/events` | — | `200 { events: Event[] }` | `404` |
| `GET` | `/envelopes/:id/sealed.pdf` | — | `302` signed URL | `404`, `409 envelope_not_sealed` |
| `GET` | `/envelopes/:id/audit.pdf` | — | `302` signed URL | `404`, `409 audit_not_ready` |

Mutating endpoints accept optional `Idempotency-Key` header (UUID). Stored for 24h per `(user_id, key)`. Replay returns the stored response.

Sender mutations accept optional `If-Match: <envelope.updated_at iso>` header. Mismatch → `409 stale_envelope`. Prevents silent overwrite across tabs.

### 6.2 Signer API (`SignerSessionGuard`, JWT-in-cookie)

The session cookie is issued by `POST /sign/start` and required for every subsequent `/sign/*` call.

| Verb | Path | Body | Success | Notable errors |
|---|---|---|---|---|
| `POST` | `/sign/start` | `{ envelope_id, token }` | `200 { envelope_id, signer_id, requires_tc_accept }` + `Set-Cookie seald_sign` | `401 invalid_token`, `410 envelope_terminal`, `409 already_signed`, `409 already_declined` |
| `GET` | `/sign/me` | — | `200 { envelope, signer, fields, other_signers, tc_version, privacy_version }` | `401 missing_signer_session`, `401 invalid_signer_session`, `410 envelope_terminal` |
| `GET` | `/sign/pdf` | — | `302` signed URL | `401`, `410` |
| `POST` | `/sign/accept-terms` | — | `204` | `401`, `410`, `409 already_accepted` |
| `POST` | `/sign/fields/:field_id` | `{ value_text?, value_boolean? }` | `200 { field }` | `401`, `410`, `404 field_not_found`, `400 wrong_field_kind` (no signature fields via this endpoint) |
| `POST` | `/sign/signature` | multipart: `image`, `format`, optional `font`, `stroke_count`, `source_filename` | `200 { signer }` | `401`, `410`, `413 image_too_large`, `415 image_not_png_or_jpeg`, `400 image_unreadable` |
| `POST` | `/sign/submit` | — | `200 { status: 'submitted', envelope_status }`, clears cookie | `401`, `412 tc_required`, `422 missing_fields`, `412 signature_required`, `410 envelope_terminal` |
| `POST` | `/sign/decline` | `{ reason? }` (≤500 chars) | `200 { status: 'declined' }`, clears cookie | `401`, `410 envelope_terminal`, `409 already_signed`, `409 already_declined`, `400 decline_reason_too_long` |

Session cookie attributes:

```
Set-Cookie: seald_sign=<JWT>;
            Path=/sign;
            HttpOnly;
            Secure;
            SameSite=Lax;
            Max-Age=1800
```

`SameSite=Lax` allows the email-link top-level navigation to attach the cookie on subsequent fetches. Renewed on every successful `/sign/me`.

Session JWT (HS256, `SIGNER_SESSION_SECRET`, distinct from Supabase JWT):

```json
{
  "iss": "seald.app/sign",
  "sub": "<signer_id>",
  "env": "<envelope_id>",
  "role": "signer",
  "iat": 1747578200,
  "exp": 1747580000
}
```

### 6.3 Public verification (no auth)

| Verb | Path | Success |
|---|---|---|
| `GET` | `/verify/:envelope_id` | `200 { status, short_code, created_at, completed_at?, declined_at?, expired_at?, signer_list: [{name_masked, email_masked, signed_at?}], original_sha256, sealed_sha256? }` |
| `GET` | `/verify/code/:short_code` | same payload, looked up by short code |

Rate limit: 60 req/hour per IP (rate-limiter-flexible, Postgres backend in prod).
Email masking: `a***@example.com`.

### 6.4 Internal endpoints (header-secret)

| Verb | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/internal/expire-envelopes` | `X-Cron-Secret: $CRON_SECRET` | Finds `awaiting_others` envelopes past `expires_at`, transitions to `expired`, enqueues audit_only job + emails. |
| `GET` | `/internal/metrics` | `X-Metrics-Secret: $METRICS_SECRET` | Prometheus-format metrics. |
| `POST` | `/internal/resend-webhook` | Resend signature verification | Stores webhook event in `email_webhooks`. Processor deferred to post-MVP. |

### 6.5 Shared wire types (`packages/shared/envelope-contract.ts`)

Canonical types + zod schemas consumed by both frontend and backend:

```ts
export interface Envelope {
  id: string;
  owner_id: string;
  title: string;
  short_code: string;
  status: EnvelopeStatus;
  delivery_mode: DeliveryMode;
  original_pages: number | null;
  original_sha256: string | null;
  sealed_sha256: string | null;
  sent_at: string | null;
  completed_at: string | null;
  expires_at: string;
  tc_version: string;
  privacy_version: string;
  signers: Signer[];
  fields: Field[];
  created_at: string;
  updated_at: string;
}
// ...plus Signer, Field, Event, EnvelopeStatus, DeliveryMode, FieldKind, SignerRole, SignatureFormat unions, each with a zod schema.
```

---

## 7. Core flows

### 7.1 Sender: compose and send a draft

```
1. POST /envelopes { title }                    → draft created, id returned
2. POST /envelopes/:id/upload (multipart)       → PDF stored, pages + sha256 set
3. POST /envelopes/:id/signers × N              → signers attached (contact snapshot)
4. PUT  /envelopes/:id/fields                   → all placements replaced
5. POST /envelopes/:id/send                     → transaction:
     • validate invariants
     • generate & hash per-signer tokens
     • insert outbound_emails (kind='invite') per signer
     • insert envelope_events: created (if first time) + sent (per signer)
     • update envelopes set status='awaiting_others', sent_at=now()
6. outbound_emails loop sends invites via Resend
7. FE polls GET /envelopes/:id for status
```

### 7.2 Signer: receive, consent, sign, submit

```
1. Invite email contains URL: seald.app/sign/{envelope_id}?t={token}
2. FE loads; reads t; POST /sign/start {envelope_id, token}
3. Backend: hash token, find signer, validate not-terminal + not-already-submitted,
   issue session JWT cookie, return { requires_tc_accept: true }
4. FE replaces URL to remove ?t via history.replaceState
5. FE renders T&C gate. User accepts → POST /sign/accept-terms
   → backend writes tc_accepted_at + envelope_events {tc_accepted, viewed}
6. FE fetches GET /sign/me (full view) + GET /sign/pdf (signed URL)
7. User fills date/text/checkbox/email fields → POST /sign/fields/:id per field
8. User signs → POST /sign/signature (multipart PNG, canonical output)
9. User clicks Submit → POST /sign/submit:
     BEGIN
       update envelope_signers set signed_at=now(), signing_ip, signing_user_agent
         where id=? and signed_at is null returning id;
       if lost: ROLLBACK, return 409 already_signed
       insert envelope_events {signed, signer_id}
       if this_is_the_last_signer:
         update envelopes set status='sealing' where status='awaiting_others' returning *;
         if lost: ROLLBACK, return 409 envelope_terminal
         insert envelope_events {all_signed}
         insert envelope_jobs {kind='seal', status='pending'}
     COMMIT
   Clear session cookie.
```

### 7.3 Signer: decline

```
1. POST /sign/decline { reason? }
2. BEGIN
     update envelopes set status='declined' where id=? and status='awaiting_others' returning *;
     if lost: ROLLBACK, return 409 envelope_terminal
     update envelope_signers set declined_at=now(), decline_reason, signing_ip, signing_user_agent
     insert envelope_events {declined, signer_id, metadata:{reason_provided, reason_length}}
     insert envelope_jobs {kind='audit_only', status='pending'}
     insert outbound_emails:
       - declined_to_sender (sender)
       - withdrawn_to_signer (other signers not yet signed)
       - withdrawn_after_sign (other signers who had signed)
   COMMIT
3. Clear session cookie.
```

Other signers' open tabs discover the change on their next API call (status re-read every request → `410 envelope_terminal`).

### 7.4 Cron: expire

Every 15 minutes an external scheduler hits `POST /internal/expire-envelopes`. The endpoint:

```
select id from envelopes
 where status='awaiting_others' and expires_at < now()
 for update skip locked;

for each:
  BEGIN
    update envelopes set status='expired' where id=? and status='awaiting_others';
    insert envelope_events {expired};
    insert envelope_jobs {kind='audit_only'};
    insert outbound_emails {expired_to_sender, expired_to_signer × remaining};
  COMMIT
```

### 7.5 Worker: seal

See §8 — the sealing pipeline in detail.

### 7.6 Verification by a third party (recipient's counsel, filing clerk, etc.)

```
1. Open sealed PDF → Acrobat (prod) shows ✅ + Seald's AATL-rooted cert + timestamp
2. Open audit PDF → SHA-256 of sealed and original listed
3. Either scan QR or enter short code at seald.app/verify/code/{code}
4. Endpoint returns same hashes + envelope timeline → verify bytes match
```

---

## 8. Sealing pipeline

One diagram, then the decisions that matter.

```
envelope_jobs row claimed (status=running) ─▶ [1] load context from Postgres
                                              [2] download originals from Storage
                                              [3] SHA-256 re-verify of original
                                              [4] pdf-lib burn-in:
                                                   • each field at denormalized (x,y,w,h)
                                                   • signature PNGs at signature fields
                                                   • ⎯ SIGNED VIA SEALD + signer_id ⎯ under each
                                              [5] @signpdf/signpdf PAdES-B-LT sign:
                                                   • reserve placeholder
                                                   • SHA-256 bytes to sign
                                                   • PdfSigner.sign(hash) → CMS blob
                                                      (LocalP12Signer dev / SslComEsignerSigner prod)
                                                   • embed CMS (includes RFC 3161 timestamp)
                                              [6] SHA-256 of sealed bytes → sealed_sha256
                                              [7] generate audit.pdf (§8.3)
                                              [8] upload sealed.pdf + audit.pdf to Storage
                                              [9] transaction:
                                                   • update envelopes (status=completed, paths, hashes, completed_at)
                                                   • insert envelope_events {sealed}
                                                   • insert outbound_emails {completed} per sender + signer
                                                   • update envelope_jobs (status=done)
```

### 8.1 Determinism

Retries must produce identical output.

- Signing time = `max(signers.signed_at)` read from DB, not `now()`.
- Fonts bundled in `apps/api/assets/fonts/` (Inter, Caveat). No runtime fetch.
- Watermark positioning derived from field bounds deterministically.
- Audit PDF event order: `envelope_events` rows sorted by `(created_at asc, id asc)`.

### 8.2 Idempotency on failure

- Stuck-row cleanup: every 60s the worker looks for `status='running' AND started_at < now() - '10 minutes'`, resets to `pending`.
- Steps 1–8 produce bytes only; step 9 is the only commit.
- On retry, the output of steps 1–8 is byte-identical (§8.1), so re-uploading `sealed.pdf` is harmless.

### 8.3 Audit PDF structure

Three pages, produced with `pdf-lib` directly (no HTML-to-PDF dependency):

**Page 1**
- Header band: "Seald Audit Trail"
- Envelope box: title, proposer (sender name + email), created, completed/declined/expired, sender IP at send, request identifier (envelope_id), delivery mode, signer count, status badge
- Hashes box: `ORIGINAL DOCUMENTS HASH (SHA-256)` + `SIGNED DOCUMENTS HASH (SHA-256)` (the latter omitted for declined/expired)
- Verify QR (bottom-left): linking `seald.app/verify/{envelope_id}`; URL + 13-char short code printed alongside

**Page 2+ — one per participant (may span pages)**
- Name + role badge (Sender / Signatory)
- Email, Verification checks (`email_link`, plus `account_auth` if the signer was logged in)
- Embedded signature preview (80×40px canonical PNG)
- Metadata: Signature format, Signer Identifier
- Event table: Action | IP | Timestamp (UTC) from `envelope_events` filtered to this signer
- For declined envelopes: "Declined" row with reason text (sender-only PDF)

**Last page — Terms definitions**
- ~12 Seald-voiced definitions (audit trail, request, proposer, signatory, signer identifier, verification check, signature format, events, hash, timestamp)
- Link: `seald.app/legal/signature-definitions` for authoritative version

All timestamps render as ISO8601 with explicit `(UTC)` suffix.

### 8.4 `PdfSigner` port

```ts
export abstract class PdfSigner {
  abstract sign(unsignedPdf: Buffer, opts: PdfSigningOptions): Promise<Buffer>;
}

export interface PdfSigningOptions {
  signerCommonName: string;        // 'Seald Signing Service'
  reason: string;                  // 'Sealed by Seald for envelope <short_code>'
  location: string;                // 'seald.app'
  signingTime: Date;               // DB-sourced
  contactInfo: string;             // 'support@seald.app'
  timestampAuthorityUrl: string;   // from env
}
```

**Adapter selection:**

```
PDF_SIGNING_PROVIDER=local      # dev + tests (LocalP12Signer)
PDF_SIGNING_PROVIDER=sslcom     # production (SslComEsignerSigner)
```

Provider-specific env vars are required only when that provider is selected (zod refinement at boot).

`LocalP12Signer` reads `PDF_SIGNING_LOCAL_P12_PATH` + `PDF_SIGNING_LOCAL_P12_PASS`. A `scripts/gen-dev-cert.sh` script produces a self-signed `.p12` in 30 seconds.

`SslComEsignerSigner` reads `PDF_SIGNING_SSLCOM_CLIENT_ID`, `PDF_SIGNING_SSLCOM_CLIENT_SECRET`, `PDF_SIGNING_SSLCOM_CERT_ID`. Makes the OAuth2 + hash-sign REST calls. Private key never leaves SSL.com's HSM. SSL.com embeds the RFC 3161 timestamp automatically.

### 8.5 Audit-only path (declined / expired)

Same worker, different branch in `EnvelopeJobProcessor`:

```
if kind='audit_only' and envelope.status in ('declined','expired'):
  [1] load context
  [2] download original.pdf + any signature PNGs (for signers who did sign before decline)
  [3] SHA-256 verify original
  [4] generate audit.pdf (status badge: DECLINED | EXPIRED)
  [5] upload audit.pdf
  [6] transaction:
        update envelopes set audit_file_path=?
        update envelope_jobs set status='done'
```

No sealed.pdf is produced. Signers who had signed before the decline have their signatures documented in the audit PDF labeled "Signature captured but not applied to a sealed document."

---

## 9. Email delivery

### 9.1 Templates (MVP set of 8)

| Kind | Recipient | Trigger |
|---|---|---|
| `invite` | each signer | envelope sent |
| `reminder` | specific signer | sender clicks "remind" |
| `completed` | sender + each signer | seal job completes |
| `declined_to_sender` | sender | signer declines |
| `withdrawn_to_signer` | other signers not yet signed | signer declines |
| `withdrawn_after_sign` | other signers who had signed | signer declines |
| `expired_to_sender` | sender | cron marks expired |
| `expired_to_signer` | signers not yet signed | cron marks expired |

Stored as MJML + `.txt` siblings in `apps/api/src/email/templates/`. Compiled at boot, cached. Variables interpolated via a small mustache-style helper (no Handlebars dep).

### 9.2 `EmailSender` port

```ts
export abstract class EmailSender {
  abstract send(msg: {
    to: { email: string; name: string };
    from: { email: string; name: string };
    subject: string;
    html: string;
    text: string;
    headers?: Record<string, string>;
    idempotencyKey: string;           // = outbound_emails.id
  }): Promise<{ providerId: string }>;
}
```

Adapters:
- `ResendEmailSender` — prod. Uses Resend REST with `Idempotency-Key` header; stores returned message id in `outbound_emails.provider_id`.
- `LoggingEmailSender` — dev + tests. Writes rendered HTML + text to `.seald-mail/{timestamp}-{kind}-{to}.html`. No network.
- `SmtpEmailSender` — optional third adapter for generic SMTP via `nodemailer`. Not wired in MVP by default; documented.

Selection: `EMAIL_PROVIDER=resend|logging|smtp`.

### 9.3 Retry policy

Exponential backoff on `outbound_emails`:
- 1 min, 5 min, 30 min, 2 h, 6 h, 24 h (then `failed` permanent)
- `max_attempts = 8`
- Only retry transient failures: 429, 5xx, timeouts, network errors.
- Permanent failures (validation 4xx, hard bounce 4xx) skip retry.

Business state never blocks on email success. Envelope transitions commit; emails are retried independently.

### 9.4 Deliverability prerequisites

Not code — flagged in §12.

- `seald.app` domain with Resend-verified DKIM records
- SPF record including `include:amazonses.com` or Resend's spf record
- DMARC record (`v=DMARC1; p=quarantine; rua=mailto:dmarc@seald.app`)
- Sending `From: noreply@seald.app`; `Reply-To: support@seald.app`

---

## 10. Frontend contract

### 10.1 Shape transformation

Backend returns `Envelope` (see §6.5). Frontend's existing `AppDocument` type stays; a thin adapter (`apps/web/src/lib/api/adapters/envelope.ts`, ~80 lines) maps wire ↔ app shapes.

Key mappings:

| Frontend field | Backend field | Notes |
|---|---|---|
| `code` | `short_code` | Rename only |
| `status` | `status` | `sealing → awaiting-others` from FE perspective (invisible intermediate); `expired` added to FE union |
| `totalPages` | `original_pages` | Rename only |
| `file` (local File) | n/a | FE holds during compose; post-send, FE fetches via `/envelopes/:id/original.pdf` |
| `updatedAt` | `updated_at` | Case |
| Signer statuses | derived | FE computes from `signed_at`, `viewed_at`, `declined_at` fields |

### 10.2 Field coordinates

Backend stores normalized `[0..1]` top-left-origin. Frontend transforms at two moments:

**On save (`PUT /envelopes/:id/fields`)**
```
x_norm = field.x_px / pdfJsPageRect.width
y_norm = field.y_px / pdfJsPageRect.height
w_norm = field.width_px / pdfJsPageRect.width
h_norm = field.height_px / pdfJsPageRect.height
```

**On load (rehydrate for editing)**
```
x_px = envelope.field.x * currentPdfJsPageRect.width
```

**Y-axis flip:** Backend receives top-left-origin; the worker flips y to bottom-left when calling `pdf-lib` at seal time (`y_pdf = pageHeight - y_norm * pageHeight - height_pdf`). Documented once here; backend handles the flip.

### 10.3 Upload flow

Two steps — create draft, then upload.

```
1. POST /envelopes { title }        → 201 { id }
2. POST /envelopes/:id/upload       → 200 { pages, sha256 }
```

Multipart field name: `file`. Max 25 MB enforced by Nest `MulterModule` via `Content-Length` header rejection before streaming.

Rejected because:
- `413 file_too_large` (>25MB)
- `415 file_not_pdf` (magic bytes ≠ `%PDF-`)
- `400 file_unreadable` (pdf-lib parse failed)
- `409 envelope_not_draft` (already sent; upload is immutable post-draft)

### 10.4 Signature image contract

Multipart to `POST /sign/signature`:

| Field | Type | Required | Notes |
|---|---|---|---|
| `image` | File (PNG or JPEG) | yes | ≤ 512 KB |
| `format` | `drawn` \| `typed` \| `upload` | yes | |
| `font` | string | when `format=typed` | e.g. `caveat` |
| `stroke_count` | int | when `format=drawn` | for audit metadata |
| `source_filename` | string | when `format=upload` | for audit metadata |

Server pipeline:
1. Reject >512 KB
2. Reject non-PNG/JPEG magic bytes → `415 image_not_png_or_jpeg`
3. `sharp().resize(600, 200, { fit: 'inside' }).png()` → canonical PNG
4. Upload to `envelopes/{id}/signatures/{signer_id}.png`
5. Update signer row: `signature_format`, `signature_image_path`, `signature_font?`, `signature_stroke_count?`, `signature_source_filename?`

All three capture modes converge on one canonical PNG in storage. Simplifies burn-in at seal time.

### 10.5 Minimum frontend changes

Required for swap from mockApi to real API:

1. `apps/web/src/lib/api/envelopes.ts` — typed network functions
2. `apps/web/src/lib/api/adapters/envelope.ts` — wire ↔ app transformer + coord normalization
3. `apps/web/src/pages/SignPage/` — entirely new (guest signer flow, token handshake)
4. Replace `fetchDocuments()` callers with `listEnvelopes()` and `fetchDocumentById()` with `getEnvelope()`
5. Extend FE status union to include `'expired'`
6. Upload error UX for new error slugs
7. Re-wire `CreateSignatureRequestDialog` to `addSigner` / `removeSigner` endpoints

Unchanged: field placement UI, signature pad, PDF rendering, mockApi types file (stays as reference + Storybook fixture).

### 10.6 Idempotency

Frontend generates `crypto.randomUUID()` idempotency keys on these mutations:

- `POST /envelopes`
- `POST /envelopes/:id/upload`
- `POST /envelopes/:id/send`
- `POST /envelopes/:id/signers/:signer_id/remind`
- `POST /envelopes/:id/duplicate`
- `POST /sign/submit`
- `POST /sign/decline`

Stored 24h server-side; replay returns cached response. Eliminates double-click hazards on expensive operations.

### 10.7 ETags / If-Match

Sender mutations (`PATCH`, `PUT fields`, `DELETE`, `POST send`) SHOULD include `If-Match: <envelope.updated_at iso>`. Server returns `409 stale_envelope` on mismatch; frontend reloads and prompts user. Prevents silent cross-tab overwrite.

---

## 11. Risks & mitigations

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| R1 | `@signpdf/signpdf` fragility; TSA flakes; AATL integration subtleties | high | `PdfSigner` port isolates; integration tests run VeraPDF against every sealed artifact in CI |
| R2 | Seal-time latency at scale (5–10s per envelope) | medium | `FOR UPDATE SKIP LOCKED` scales to multiple worker replicas; metrics emit queue depth |
| R3 | Supabase Storage egress costs exceed free tier with 25MB files | medium | Signed URLs cached FE-side; metric alert on monthly projection; escape hatch = Cloudflare R2 |
| R4 | Poor email deliverability — stranger-to-stranger to `seald.app` | high | DNS SPF/DKIM/DMARC prereq; Resend reputation; branded templates; short-code verification in email body |
| R5 | Token leak via email forwarding | medium | IP+UA captured in audit; 30-min session window; schema ready for OTP upgrade via `auth_mode` column (deferred) |
| R6 | Timezone bugs in audit | high (legal) | All timestamps `timestamptz` in UTC; audit PDF renders explicit `(UTC)` suffix; no local-time anywhere |
| R7 | Cross-tab field edit race | low | `If-Match` header + `409 stale_envelope` |
| R8 | Concurrent submit / decline race | high | Row-conditional UPDATE guards every terminal transition |
| R9 | Jurisdictional legal gaps | high | Spec flags as P6 prerequisite: legal review before paying customers |
| R10 | AATL procurement blocking ship | medium | Dev + staging run `LocalP12Signer`; procurement parallelizes with build |
| R11 | Signature image bombs / ZIP-of-death style abuse | medium | `sharp` pixel-limit enforced; bounded file size; magic-byte check |
| R12 | Worker crash mid-seal | medium | Stuck-row cleanup resets to `pending`; seal output deterministic (§8.1) |
| R13 | Resend API key leak | medium | `.env` gitignored; documented rotation procedure; 3-day grace for rotation |

---

## 12. Prerequisites (out of code scope)

| # | Prerequisite | Required before | Owner |
|---|---|---|---|
| P1 | Seald legal entity (LLC / Ltd / GmbH) incorporated | P3 | User |
| P2 | `seald.app` domain live with DNS control | P5 | User |
| P3 | AATL cert procured from SSL.com (~$249/yr, 3–14 days lead time) | First production deploy with real recipients | User |
| P4 | Production Resend account with `seald.app` verified sending domain | First real-recipient email | User |
| P5 | SPF + DKIM + DMARC records live on `seald.app` | First real-recipient email | User |
| P6 | Legal review of email templates, T&C acceptance copy, audit PDF boilerplate | First paying customer | User + counsel |
| P7 | Privacy policy + T&C at `seald.app/legal/*` referenced by `tc_version` / `privacy_version` | First envelope sent | User |
| P8 | Production hosting decision (Fly.io / Railway / Render / AWS ECS; **NOT Vercel** — worker must be always-on) | First deploy | User |
| P9 | TSA URL choice for production (FreeTSA for dev; DigiCert for prod) | First production seal | User |
| P10 | Supabase Storage bucket `envelopes` created (private, RLS enabled) | Task 3a.1 of plan | Me, part of impl |
| P11 | Rotation of the Resend API key shared in brainstorming chat | Before prod use | User |

MVP-blocking: P8, P7, P10. Others parallelize with development.

---

## 13. Build sequencing

The `writing-plans` skill will decompose this into discrete tasks. High-level order:

- **3a. Foundation** — migrations, storage bucket, shared contract package, `EnvelopesRepository` port+adapter
- **3b. Sender draft flow** — create/read/list/patch/delete envelope, upload, add/remove signers, place fields
- **3c. Send flow** — token generation, `EmailSender` port + adapters + templates, `POST /send`, `POST /remind`, events stream
- **3d. Signer flow** — session guard + JWT, `/sign/start`, `/sign/me`, `/sign/pdf`, `/sign/accept-terms`, `/sign/fields/:id`, `/sign/signature`, `/sign/submit`, `/sign/decline`
- **3e. Worker + sealing** — worker process, job loops, `PdfSigner` port + `LocalP12Signer`, seal pipeline, audit PDF, `audit_only` path
- **3f. Public verification + expiration + polish** — `/verify/*`, cron endpoint, duplicate, idempotency middleware, metrics, `If-Match`, README

Post-MVP (tracked in plan but not tasked):
- `SslComEsignerSigner` adapter (after AATL cert — P3)
- Resend domain switch (P4–P5)
- Retention sweep cron
- Resend bounce webhook processor
- GDPR erasure endpoint

---

## 14. Definition of Done (MVP)

Code:
- [ ] All migrations applied to Supabase `seald` project via MCP; verified via `list_migrations` + `list_tables`
- [ ] `pnpm -r typecheck` clean
- [ ] `pnpm -r lint` clean
- [ ] `pnpm -r test` green (envelope repo unit tests via pg-mem, service unit tests via fakes, DTO tests)
- [ ] `pnpm --filter api test:e2e` green (full envelope + sign + seal round-trip with `LocalP12Signer` + `LoggingEmailSender`)
- [ ] `pnpm --filter web build` green (no regressions)
- [ ] VeraPDF validates every sealed artifact produced by the e2e tests as PDF/A-2B compliant
- [ ] Acrobat Reader opens a sample sealed PDF and displays the signature panel (even if dev: "signer not verified" is acceptable for dev artifacts)
- [ ] README documents worker deployment, env vars, smoke checklist, prerequisite list

Prerequisites (non-code):
- [ ] Storage bucket `envelopes` created
- [ ] `.env.example` lists all new vars: `SIGNER_SESSION_SECRET`, `CRON_SECRET`, `METRICS_SECRET`, `EMAIL_PROVIDER`, `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`, `PDF_SIGNING_PROVIDER`, `PDF_SIGNING_LOCAL_P12_PATH`, `PDF_SIGNING_LOCAL_P12_PASS`, `PDF_SIGNING_TSA_URL`, `STORAGE_BUCKET` (default `envelopes`)
- [ ] Manual smoke: send envelope to self from UI, sign as each recipient, inspect sealed.pdf + audit.pdf; record in PR body

Production gates (not MVP task — tracked):
- [ ] AATL cert installed and `PDF_SIGNING_PROVIDER=sslcom`
- [ ] `seald.app` DNS configured for Resend
- [ ] Legal review sign-off on template copy + T&C

---

## 15. Open questions

None blocking the plan. Items that would benefit from future discussion:

1. **Signer T&C versioning** — when `tc_version` is bumped, do in-flight envelopes keep their original version (my assumption) or upgrade? Current design: original version, because signers already accepted the old one.
2. **Reminder cadence** — sender clicks "remind", throttled to 1/hour per signer. If a sender wants to remind every day, they'd have to click 24 times. Good enough for MVP; post-MVP feature candidate: automated cadence.
3. **Signature image retention** — captured-but-not-sealed PNGs (signer signed, then envelope declined): keep for same 7-year window as envelope. Reconfirm with legal pre-customer.
4. **Short code length** — 13 chars = 58^13 ≈ 10^22 collision space, vastly more than needed. Chose 13 for readability parity with iLovePDF. Could drop to 8 (58^8 ≈ 10^14) if anyone complains. Not worth changing now.

---

## 16. Appendix A — Out-of-spec library picks

Committed here so the plan moves fast. Speak up if any of these is wrong:

| Purpose | Library | Version |
|---|---|---|
| PDF manipulation | `pdf-lib` | 1.17 |
| PAdES signing | `@signpdf/signpdf` + `@signpdf/signer-p12` | 3.x |
| Image normalization | `sharp` | 0.33 |
| MJML | `mjml` (build-time compile) | 5.x |
| QR code | `qrcode` | 1.5 |
| Short code generation | `nanoid` | 5.x |
| JWT (reuse) | `jose` | 5.x |
| Cookie parsing | `cookie` | 1.x |
| Rate limiting | `rate-limiter-flexible` | 5.x |
| Structured logging | `pino` + `pino-pretty` | 9.x |
| Cert parsing (dev) | `node-forge` (transitive via signpdf) | — |
| Coord precision | `numeric(7,4)` in DB; 4 decimals on wire | — |
| Short code alphabet | 58-char base62 minus `0O1Il`; length 13 | — |

---

## 17. Appendix B — Env vars summary

| Var | Who uses | Required when | Example |
|---|---|---|---|
| `DATABASE_URL` | all | always | `postgres://...` |
| `SUPABASE_URL` | all | always | `https://x.supabase.co` |
| `SUPABASE_JWT_AUDIENCE` | API | always | `authenticated` |
| `CORS_ORIGIN` | API | always | `http://localhost:5173` |
| `SUPABASE_SERVICE_ROLE_KEY` | worker, storage | always | `eyJ...` |
| `STORAGE_BUCKET` | all | always | `envelopes` |
| `SIGNER_SESSION_SECRET` | API, worker | always (non-test) | random 32B hex |
| `CRON_SECRET` | API, cron caller | always (non-test) | random 32B hex |
| `METRICS_SECRET` | API, scraper | always (non-test) | random 32B hex |
| `EMAIL_PROVIDER` | API, worker | always | `resend` \| `logging` \| `smtp` |
| `RESEND_API_KEY` | worker | when `EMAIL_PROVIDER=resend` | `re_...` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | worker | when `EMAIL_PROVIDER=smtp` | — |
| `EMAIL_FROM_ADDRESS` | worker | always | `noreply@seald.app` |
| `EMAIL_FROM_NAME` | worker | always | `Seald` |
| `PDF_SIGNING_PROVIDER` | worker | always | `local` \| `sslcom` |
| `PDF_SIGNING_LOCAL_P12_PATH` | worker | when `PDF_SIGNING_PROVIDER=local` | `./secrets/dev-cert.p12` |
| `PDF_SIGNING_LOCAL_P12_PASS` | worker | when `PDF_SIGNING_PROVIDER=local` | `devpass` |
| `PDF_SIGNING_TSA_URL` | worker | always | `https://freetsa.org/tsr` |
| `PDF_SIGNING_SSLCOM_CLIENT_ID` | worker | when `PDF_SIGNING_PROVIDER=sslcom` | — |
| `PDF_SIGNING_SSLCOM_CLIENT_SECRET` | worker | when `PDF_SIGNING_PROVIDER=sslcom` | — |
| `PDF_SIGNING_SSLCOM_CERT_ID` | worker | when `PDF_SIGNING_PROVIDER=sslcom` | — |
| `ENVELOPE_RETENTION_YEARS` | future retention cron | optional | `7` |
| `TC_VERSION` | API | always | `2026-04-24` |
| `PRIVACY_VERSION` | API | always | `2026-04-24` |
| `APP_PUBLIC_URL` | API, worker | always | `https://seald.app` |

All required vars validated at boot by the existing zod schema. Provider-specific vars enforced conditionally via zod refinement.
