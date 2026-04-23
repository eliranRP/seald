# Envelopes (Phase 3) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the "send PDF for signature" feature end-to-end: a sender uploads a PDF, chooses contacts as signers, places fields, sends invites; each signer opens a token-gated browser surface, accepts T&C, signs, submits; when the last signer finishes, a background worker burns-in signatures, applies a PAdES-B-LT seal with RFC 3161 timestamp, generates an audit PDF, and emails both artifacts to everyone.

**Architecture:** Two Nest processes from one codebase (HTTP + worker) share DI via `AppModule`. Five new tables (envelopes, signers, fields, events, jobs) plus email queue. Supabase Storage for artifacts. Ports for `PdfSigner` (dev `LocalP12`, prod `SslComEsigner`) and `EmailSender` (dev `Logging`, prod `Resend`). Row-conditional `UPDATE ... WHERE status = X` for every terminal transition. `FOR UPDATE SKIP LOCKED` for queue workers. Design matches `docs/superpowers/specs/2026-04-24-envelopes-design.md`.

**Tech Stack:** NestJS 10, Kysely + pg, pdf-lib, @signpdf/signpdf + @signpdf/signer-p12, sharp, mjml (build-time), qrcode, nanoid, jose, cookie, rate-limiter-flexible, pino, Supabase Storage, Resend REST, zod, pg-mem (tests), VeraPDF (integration validation).

**Reference spec:** `docs/superpowers/specs/2026-04-24-envelopes-design.md` — authoritative. When this plan is ambiguous, the spec wins.

**Commit style (copy from Phase 2):** `feat(api): …`, `fix(api): …`, `test(api): …`, `docs(api): …`, `feat(shared): …`, `feat(web): …`. HEREDOC commit messages with trailer `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`.

**Non-blocking prerequisites (user handles out-of-band — tasks do NOT wait on these):**
- P1 Seald legal entity incorporated
- P3 AATL cert procured (needed only for prod — dev uses `LocalP12Signer`)
- P4, P5 Resend domain verification + DNS (needed only for real recipients)
- P6, P7 Legal review, T&C pages (referenced by `tc_version` / `privacy_version`)
- P8 Production hosting decision

---

## File Structure

New files, grouped by phase. Exact paths. Each file has one clear responsibility.

### Shared contract (`packages/shared/src/`)

- `envelope-contract.ts` — wire types + zod schemas used by FE + BE. Single source of truth.
- `index.ts` — append `export * from './envelope-contract'`.

### API source (`apps/api/src/`)

**Envelopes module** (`envelopes/`):
- `envelopes.module.ts` — Nest module
- `envelope.entity.ts` — domain Envelope type + Signer + Field + Event
- `envelopes.repository.ts` — port (abstract class)
- `envelopes.repository.pg.ts` — Kysely adapter
- `envelopes.service.ts` — business logic, state machine guards
- `envelopes.controller.ts` — sender routes under `/envelopes`
- `dto/create-envelope.dto.ts`
- `dto/patch-envelope.dto.ts`
- `dto/add-signer.dto.ts`
- `dto/place-fields.dto.ts`
- `coord.ts` — normalize/denormalize coord helpers
- `short-code.ts` — nanoid-based short_code generator + collision retry

**Signing module** (`signing/`):
- `signing.module.ts`
- `signing.service.ts` — token exchange, session issuance, submit/decline orchestration
- `signing.controller.ts` — signer routes under `/sign`
- `signer-session.service.ts` — JWT mint + verify (session token)
- `signer-session.guard.ts` — guard that reads cookie, loads envelope + signer, attaches to request
- `signing-token.service.ts` — opaque token generation + SHA-256 hashing
- `dto/start-session.dto.ts`
- `dto/fill-field.dto.ts`
- `dto/decline.dto.ts`

**Verification module** (`verification/`):
- `verification.module.ts`
- `verification.controller.ts` — public `/verify/*`

**Worker** (`worker/`):
- `worker.main.ts` — process entry point
- `worker.module.ts`
- `worker.service.ts` — boot + coordinate loops
- `envelope-job.processor.ts` — runs `seal | audit_only`
- `outbound-email.processor.ts` — drains `outbound_emails`
- `cleanup.service.ts` — resets stuck `running` rows

**PDF signing port** (`pdf-signing/`):
- `pdf-signing.module.ts` — selects adapter by env
- `pdf-signer.ts` — abstract port
- `local-p12-signer.ts` — dev/test adapter
- `sslcom-esigner-signer.ts` — prod adapter (scaffolded, not activated in MVP tasks)

**Sealing pipeline** (`sealing/`):
- `sealing.module.ts`
- `seal.service.ts` — orchestration
- `burn-in.ts` — pdf-lib field placement + signature glyph + watermark
- `audit-pdf.ts` — 3-page audit PDF generator

**Storage adapter** (`storage/`):
- `storage.module.ts`
- `storage.service.ts` — Supabase Storage wrapper (upload, downloadBytes, createSignedUrl)

**Email** (`email/`):
- `email.module.ts`
- `email-sender.ts` — port
- `resend-email-sender.ts`
- `logging-email-sender.ts`
- `smtp-email-sender.ts` (scaffold, optional, not in MVP code paths by default)
- `template.service.ts` — MJML compile + mustache interpolation
- `templates/invite.mjml` + `invite.txt`
- `templates/reminder.mjml` + `reminder.txt`
- `templates/completed.mjml` + `completed.txt`
- `templates/declined-to-sender.mjml` + `.txt`
- `templates/withdrawn-to-signer.mjml` + `.txt`
- `templates/withdrawn-after-sign.mjml` + `.txt`
- `templates/expired-to-sender.mjml` + `.txt`
- `templates/expired-to-signer.mjml` + `.txt`

**Common middleware/filters/utilities** (`common/`):
- `idempotency/idempotency.service.ts`
- `idempotency/idempotency.middleware.ts`
- `etag/envelope-etag.ts` — serialize/parse If-Match
- `rate-limit/rate-limit.module.ts`
- `rate-limit/rate-limit.service.ts`
- `metrics/metrics.service.ts`
- `metrics/metrics.controller.ts` — `/internal/metrics`
- `cron/expire-envelopes.controller.ts` — `/internal/expire-envelopes`
- `logger/pino-logger.service.ts` (optional in MVP if @nestjs/common Logger is enough)

**Db schema** (`db/schema.ts`):
- Extend with 7 new tables. Don't replace — append.

**Env schema** (`src/config/env.schema.ts`):
- Add all new env vars with conditional refinements per `EMAIL_PROVIDER` / `PDF_SIGNING_PROVIDER`.

### Migrations (`apps/api/db/migrations/`)

- `0002_envelopes.sql` — envelopes + signers + fields + events + jobs + enums
- `0003_outbound_emails.sql` — outbound_emails + idempotency_records + email_webhooks
- Applied to live Supabase via MCP `apply_migration` as part of the tasks.

### Tests

Unit tests colocate with source files (`*.spec.ts`). E2E tests live in `apps/api/test/`:
- `apps/api/test/in-memory-envelopes-repository.ts`
- `apps/api/test/envelopes-sender.e2e-spec.ts` — sender draft + send
- `apps/api/test/envelopes-signer.e2e-spec.ts` — signer happy path
- `apps/api/test/envelopes-decline.e2e-spec.ts` — decline race + cascade
- `apps/api/test/envelopes-seal.e2e-spec.ts` — full round-trip with LocalP12Signer
- `apps/api/test/envelopes-verify.e2e-spec.ts` — public verification + rate limit

### Assets

- `apps/api/assets/fonts/Inter-Regular.ttf` — embedded in sealed + audit PDFs
- `apps/api/assets/fonts/Caveat-Regular.ttf` — for typed signatures
- `apps/api/scripts/gen-dev-cert.sh` — produces `secrets/dev-cert.p12`

### Frontend (deferred — tracked but not tasked in MVP plan)

Frontend wire-up is explicitly **out of this plan**. Plan covers the backend contract fully; the `packages/shared/envelope-contract.ts` file is the handoff. Frontend tasks are a follow-up plan after MVP backend ships.

---

## Phase ordering

Tasks are strictly ordered. Do not skip ahead — later tasks assume earlier ones committed.

- **Phase 3a** (Tasks 1–5): Foundation. Schema + contract + repo port.
- **Phase 3b** (Tasks 6–12): Sender draft flow.
- **Phase 3c** (Tasks 13–17): Send flow + email infrastructure.
- **Phase 3d** (Tasks 18–23): Signer flow.
- **Phase 3e** (Tasks 24–28): Worker + sealing.
- **Phase 3f** (Tasks 29–32): Verification + cron + polish + README.

---

## Phase 3a — Foundation

### Task 1: Install new dependencies

**Files:**
- Modify: `apps/api/package.json`

- [ ] **Step 1: Add runtime deps to `apps/api`**

```bash
pnpm --filter api add pdf-lib@^1.17 @signpdf/signpdf@^3 @signpdf/signer-p12@^3 @signpdf/utils@^3 @signpdf/placeholder-plain@^3 sharp@^0.33 qrcode@^1.5 nanoid@^5 cookie@^1 rate-limiter-flexible@^5 mjml@^5 prom-client@^15 pino@^9
```

- [ ] **Step 2: Add dev deps**

```bash
pnpm --filter api add -D @types/qrcode @types/mjml @types/cookie
```

- [ ] **Step 3: Verify install cleanly**

Run: `pnpm install` at repo root.
Expected: no errors.
Run: `pnpm --filter api typecheck`.
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json pnpm-lock.yaml
git commit -m "$(cat <<'EOF'
feat(api): add envelopes phase 3 dependencies

pdf-lib + signpdf for PDF manipulation and PAdES signing,
sharp for image normalization, mjml for email templates,
nanoid for short codes, rate-limiter-flexible for abuse control,
prom-client + pino for observability.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add env vars to schema

**Files:**
- Modify: `apps/api/src/config/env.schema.ts`
- Modify: `apps/api/src/config/env.schema.spec.ts`
- Modify: `apps/api/.env.example`

- [ ] **Step 1: Write failing test for new env vars**

Append to `apps/api/src/config/env.schema.spec.ts` (inside the existing `describe`):

```ts
  it('requires signer session secret, cron secret, metrics secret', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'test',
        SUPABASE_URL: 'https://x.supabase.co',
        DATABASE_URL: 'postgres://u:p@h:5432/d?sslmode=disable',
        EMAIL_PROVIDER: 'logging',
        PDF_SIGNING_PROVIDER: 'local',
        APP_PUBLIC_URL: 'http://localhost:5173',
        TC_VERSION: '2026-04-24',
        PRIVACY_VERSION: '2026-04-24',
        STORAGE_BUCKET: 'envelopes',
      }),
    ).toThrow(/SIGNER_SESSION_SECRET/);
  });

  it('requires resend api key when EMAIL_PROVIDER=resend', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_x',
        DATABASE_URL: 'postgres://u:p@h:5432/d?sslmode=require',
        EMAIL_PROVIDER: 'resend',
        EMAIL_FROM_ADDRESS: 'noreply@seald.app',
        EMAIL_FROM_NAME: 'Seald',
        PDF_SIGNING_PROVIDER: 'local',
        PDF_SIGNING_LOCAL_P12_PATH: './a.p12',
        PDF_SIGNING_LOCAL_P12_PASS: 'x',
        PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
        APP_PUBLIC_URL: 'https://seald.app',
        TC_VERSION: '2026-04-24',
        PRIVACY_VERSION: '2026-04-24',
        STORAGE_BUCKET: 'envelopes',
        SIGNER_SESSION_SECRET: '0'.repeat(64),
        CRON_SECRET: '1'.repeat(64),
        METRICS_SECRET: '2'.repeat(64),
      }),
    ).toThrow(/RESEND_API_KEY/);
  });

  it('requires sslcom creds when PDF_SIGNING_PROVIDER=sslcom', () => {
    expect(() =>
      parseEnv({
        NODE_ENV: 'production',
        SUPABASE_URL: 'https://x.supabase.co',
        SUPABASE_SERVICE_ROLE_KEY: 'sb_x',
        DATABASE_URL: 'postgres://u:p@h:5432/d?sslmode=require',
        EMAIL_PROVIDER: 'logging',
        PDF_SIGNING_PROVIDER: 'sslcom',
        PDF_SIGNING_TSA_URL: 'https://freetsa.org/tsr',
        APP_PUBLIC_URL: 'https://seald.app',
        TC_VERSION: '2026-04-24',
        PRIVACY_VERSION: '2026-04-24',
        STORAGE_BUCKET: 'envelopes',
        SIGNER_SESSION_SECRET: '0'.repeat(64),
        CRON_SECRET: '1'.repeat(64),
        METRICS_SECRET: '2'.repeat(64),
      }),
    ).toThrow(/PDF_SIGNING_SSLCOM/);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter api test -- --testPathPattern env.schema`
Expected: three new tests fail (schema does not yet know new vars).

- [ ] **Step 3: Extend `env.schema.ts` with new fields and refinements**

Replace the file content with:

```ts
import { z } from 'zod';

const providerSelector = {
  EMAIL_PROVIDER: z.enum(['resend', 'logging', 'smtp']).default('logging'),
  PDF_SIGNING_PROVIDER: z.enum(['local', 'sslcom']).default('local'),
} as const;

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    SUPABASE_URL: z.string().url(),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    APP_PUBLIC_URL: z.string().url(),

    DATABASE_URL: z
      .string()
      .min(1)
      .refine((v) => /^postgres(ql)?:\/\//.test(v), {
        message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
      }),

    STORAGE_BUCKET: z.string().min(1).default('envelopes'),

    TC_VERSION: z.string().min(1),
    PRIVACY_VERSION: z.string().min(1),

    SIGNER_SESSION_SECRET: z.string().min(32),
    CRON_SECRET: z.string().min(32),
    METRICS_SECRET: z.string().min(32),

    ...providerSelector,

    // Email provider-specific
    RESEND_API_KEY: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().email().default('onboarding@resend.dev'),
    EMAIL_FROM_NAME: z.string().min(1).default('Seald'),

    // PDF signing provider-specific
    PDF_SIGNING_LOCAL_P12_PATH: z.string().optional(),
    PDF_SIGNING_LOCAL_P12_PASS: z.string().optional(),
    PDF_SIGNING_SSLCOM_CLIENT_ID: z.string().optional(),
    PDF_SIGNING_SSLCOM_CLIENT_SECRET: z.string().optional(),
    PDF_SIGNING_SSLCOM_CERT_ID: z.string().optional(),
    PDF_SIGNING_TSA_URL: z.string().url().default('https://freetsa.org/tsr'),

    ENVELOPE_RETENTION_YEARS: z.coerce.number().int().positive().default(7),
  })
  .superRefine((env, ctx) => {
    // Secrets required when NODE_ENV !== 'test'
    if (env.NODE_ENV !== 'test') {
      for (const key of ['SIGNER_SESSION_SECRET', 'CRON_SECRET', 'METRICS_SECRET'] as const) {
        if (!env[key] || env[key].length < 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} required (>=32 chars) when NODE_ENV!=test`,
          });
        }
      }
    }

    if (env.EMAIL_PROVIDER === 'resend') {
      if (!env.RESEND_API_KEY) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['RESEND_API_KEY'],
          message: 'RESEND_API_KEY required when EMAIL_PROVIDER=resend',
        });
      }
    }

    if (env.EMAIL_PROVIDER === 'smtp') {
      for (const key of ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} required when EMAIL_PROVIDER=smtp`,
          });
        }
      }
    }

    if (env.PDF_SIGNING_PROVIDER === 'local' && env.NODE_ENV !== 'test') {
      for (const key of ['PDF_SIGNING_LOCAL_P12_PATH', 'PDF_SIGNING_LOCAL_P12_PASS'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} required when PDF_SIGNING_PROVIDER=local and NODE_ENV!=test`,
          });
        }
      }
    }

    if (env.PDF_SIGNING_PROVIDER === 'sslcom') {
      for (const key of [
        'PDF_SIGNING_SSLCOM_CLIENT_ID',
        'PDF_SIGNING_SSLCOM_CLIENT_SECRET',
        'PDF_SIGNING_SSLCOM_CERT_ID',
      ] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} required when PDF_SIGNING_PROVIDER=sslcom`,
          });
        }
      }
    }
  });

export type AppEnv = z.infer<typeof envSchema>;

export function parseEnv(raw: NodeJS.ProcessEnv | Record<string, string | undefined>): AppEnv {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter api test -- --testPathPattern env.schema`
Expected: all tests pass.

- [ ] **Step 5: Update `.env.example`**

Replace `apps/api/.env.example` with:

```
# Runtime
NODE_ENV=development
PORT=3000

# Supabase Auth
SUPABASE_URL=https://<your-project>.supabase.co
SUPABASE_JWT_AUDIENCE=authenticated

# Supabase service role (used by worker for Storage uploads)
# SUPABASE_SERVICE_ROLE_KEY=eyJ...

# CORS + public URL
CORS_ORIGIN=http://localhost:5173
APP_PUBLIC_URL=http://localhost:5173

# Database
DATABASE_URL=postgres://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres?sslmode=require

# Storage
STORAGE_BUCKET=envelopes

# Legal versioning — envelopes snapshot these at send time
TC_VERSION=2026-04-24
PRIVACY_VERSION=2026-04-24

# Secrets (generate with: openssl rand -hex 32)
SIGNER_SESSION_SECRET=<hex-64>
CRON_SECRET=<hex-64>
METRICS_SECRET=<hex-64>

# Email
EMAIL_PROVIDER=logging    # logging | resend | smtp
# RESEND_API_KEY=re_...
# SMTP_HOST=smtp.gmail.com
# SMTP_PORT=587
# SMTP_USER=you@gmail.com
# SMTP_PASS=<app-password>
EMAIL_FROM_ADDRESS=onboarding@resend.dev
EMAIL_FROM_NAME=Seald

# PDF signing
PDF_SIGNING_PROVIDER=local   # local | sslcom
PDF_SIGNING_LOCAL_P12_PATH=./secrets/dev-cert.p12
PDF_SIGNING_LOCAL_P12_PASS=devpass
PDF_SIGNING_TSA_URL=https://freetsa.org/tsr
# PDF_SIGNING_SSLCOM_CLIENT_ID=
# PDF_SIGNING_SSLCOM_CLIENT_SECRET=
# PDF_SIGNING_SSLCOM_CERT_ID=

# Retention (years)
ENVELOPE_RETENTION_YEARS=7
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/config/env.schema.ts apps/api/src/config/env.schema.spec.ts apps/api/.env.example
git commit -m "$(cat <<'EOF'
feat(api): extend env schema for envelopes phase 3

Adds vars for provider selection (email + pdf signing), secrets
(signer session, cron, metrics), T&C versioning, storage bucket, and
public URL. Refinements require provider-specific vars only when that
provider is selected.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Shared wire contract (`packages/shared/envelope-contract.ts`)

**Files:**
- Create: `packages/shared/src/envelope-contract.ts`
- Modify: `packages/shared/src/index.ts`
- Create: `packages/shared/src/envelope-contract.spec.ts`

- [ ] **Step 1: Write failing contract parse tests**

Create `packages/shared/src/envelope-contract.spec.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  EnvelopeSchema,
  FieldSchema,
  SignerSchema,
  ENVELOPE_STATUSES,
  FIELD_KINDS,
  PlaceFieldsRequestSchema,
} from './envelope-contract';

describe('EnvelopeSchema', () => {
  const sample = {
    id: '00000000-0000-0000-0000-000000000001',
    owner_id: '00000000-0000-0000-0000-000000000002',
    title: 'NDA',
    short_code: 'abc23456789de',
    status: 'draft',
    delivery_mode: 'parallel',
    original_pages: null,
    original_sha256: null,
    sealed_sha256: null,
    sent_at: null,
    completed_at: null,
    expires_at: '2026-05-24T00:00:00.000Z',
    tc_version: '2026-04-24',
    privacy_version: '2026-04-24',
    signers: [],
    fields: [],
    created_at: '2026-04-24T00:00:00.000Z',
    updated_at: '2026-04-24T00:00:00.000Z',
  };

  it('parses a valid draft envelope', () => {
    const parsed = EnvelopeSchema.parse(sample);
    expect(parsed.title).toBe('NDA');
  });

  it('rejects unknown status', () => {
    expect(() => EnvelopeSchema.parse({ ...sample, status: 'nope' })).toThrow();
  });

  it('enumerates all 7 statuses', () => {
    expect(ENVELOPE_STATUSES).toEqual([
      'draft',
      'awaiting_others',
      'sealing',
      'completed',
      'declined',
      'expired',
      'canceled',
    ]);
  });

  it('enumerates all 6 field kinds', () => {
    expect(FIELD_KINDS).toEqual(['signature', 'initials', 'date', 'text', 'checkbox', 'email']);
  });
});

describe('FieldSchema', () => {
  it('rejects coords outside [0,1]', () => {
    expect(() =>
      FieldSchema.parse({
        id: '00000000-0000-0000-0000-000000000003',
        signer_id: '00000000-0000-0000-0000-000000000004',
        kind: 'signature',
        page: 1,
        x: 1.5,
        y: 0.5,
        required: true,
      }),
    ).toThrow();
  });

  it('accepts minimal signature field', () => {
    const f = FieldSchema.parse({
      id: '00000000-0000-0000-0000-000000000003',
      signer_id: '00000000-0000-0000-0000-000000000004',
      kind: 'signature',
      page: 1,
      x: 0.1,
      y: 0.1,
      required: true,
    });
    expect(f.kind).toBe('signature');
  });
});

describe('SignerSchema', () => {
  it('parses a signer with hex color', () => {
    const s = SignerSchema.parse({
      id: '00000000-0000-0000-0000-000000000005',
      email: 'a@b.com',
      name: 'Ada',
      color: '#FF00AA',
      role: 'signatory',
      signing_order: 1,
      status: 'awaiting',
      viewed_at: null,
      signed_at: null,
      declined_at: null,
    });
    expect(s.color).toBe('#FF00AA');
  });

  it('rejects bad color', () => {
    expect(() =>
      SignerSchema.parse({
        id: '00000000-0000-0000-0000-000000000005',
        email: 'a@b.com',
        name: 'Ada',
        color: 'red',
        role: 'signatory',
        signing_order: 1,
        status: 'awaiting',
        viewed_at: null,
        signed_at: null,
        declined_at: null,
      }),
    ).toThrow();
  });
});

describe('PlaceFieldsRequestSchema', () => {
  it('accepts empty field list', () => {
    expect(PlaceFieldsRequestSchema.parse({ fields: [] }).fields).toEqual([]);
  });
});
```

- [ ] **Step 2: Check `packages/shared` test runner**

Run: `pnpm --filter shared test` (or equivalent). If `vitest` is not installed in `packages/shared`, install it:

```bash
pnpm --filter shared add -D vitest
```

Add to `packages/shared/package.json` scripts (if missing): `"test": "vitest run"`.

Run test again: `pnpm --filter shared test`. Expected: fails — `envelope-contract.ts` does not exist.

- [ ] **Step 3: Create `envelope-contract.ts`**

```ts
import { z } from 'zod';

export const ENVELOPE_STATUSES = [
  'draft',
  'awaiting_others',
  'sealing',
  'completed',
  'declined',
  'expired',
  'canceled',
] as const;
export type EnvelopeStatus = (typeof ENVELOPE_STATUSES)[number];

export const DELIVERY_MODES = ['parallel', 'sequential'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];

export const SIGNER_ROLES = ['proposer', 'signatory', 'validator', 'witness'] as const;
export type SignerRole = (typeof SIGNER_ROLES)[number];

export const FIELD_KINDS = [
  'signature',
  'initials',
  'date',
  'text',
  'checkbox',
  'email',
] as const;
export type FieldKind = (typeof FIELD_KINDS)[number];

export const SIGNATURE_FORMATS = ['drawn', 'typed', 'upload'] as const;
export type SignatureFormat = (typeof SIGNATURE_FORMATS)[number];

export const ACTOR_KINDS = ['sender', 'signer', 'system'] as const;
export type ActorKind = (typeof ACTOR_KINDS)[number];

export const EVENT_TYPES = [
  'created',
  'sent',
  'viewed',
  'tc_accepted',
  'field_filled',
  'signed',
  'all_signed',
  'sealed',
  'declined',
  'expired',
  'canceled',
  'reminder_sent',
  'session_invalidated_by_decline',
  'job_failed',
  'retention_deleted',
] as const;
export type EventType = (typeof EVENT_TYPES)[number];

// Derived signer status for UI convenience — computed from timestamps.
export const SIGNER_UI_STATUSES = [
  'awaiting',
  'viewing',
  'completed',
  'declined',
] as const;
export type SignerUiStatus = (typeof SIGNER_UI_STATUSES)[number];

export const uuid = z.string().uuid();
export const iso = z.string().datetime();
export const sha256 = z.string().regex(/^[0-9a-f]{64}$/);
export const hexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const SignerSchema = z.object({
  id: uuid,
  email: z.string().email(),
  name: z.string().min(1).max(200),
  color: hexColor,
  role: z.enum(SIGNER_ROLES),
  signing_order: z.number().int().min(1),
  status: z.enum(SIGNER_UI_STATUSES),
  viewed_at: iso.nullable(),
  signed_at: iso.nullable(),
  declined_at: iso.nullable(),
});
export type Signer = z.infer<typeof SignerSchema>;

export const FieldSchema = z.object({
  id: uuid,
  signer_id: uuid,
  kind: z.enum(FIELD_KINDS),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1).nullable().optional(),
  height: z.number().min(0).max(1).nullable().optional(),
  required: z.boolean(),
  link_id: z.string().nullable().optional(),
  value_text: z.string().nullable().optional(),
  value_boolean: z.boolean().nullable().optional(),
  filled_at: iso.nullable().optional(),
});
export type Field = z.infer<typeof FieldSchema>;

export const EnvelopeSchema = z.object({
  id: uuid,
  owner_id: uuid,
  title: z.string().min(1).max(200),
  short_code: z.string().length(13),
  status: z.enum(ENVELOPE_STATUSES),
  delivery_mode: z.enum(DELIVERY_MODES),
  original_pages: z.number().int().positive().nullable(),
  original_sha256: sha256.nullable(),
  sealed_sha256: sha256.nullable(),
  sent_at: iso.nullable(),
  completed_at: iso.nullable(),
  expires_at: iso,
  tc_version: z.string().min(1),
  privacy_version: z.string().min(1),
  signers: z.array(SignerSchema),
  fields: z.array(FieldSchema),
  created_at: iso,
  updated_at: iso,
});
export type Envelope = z.infer<typeof EnvelopeSchema>;

export const EnvelopeEventSchema = z.object({
  id: uuid,
  envelope_id: uuid,
  signer_id: uuid.nullable(),
  actor_kind: z.enum(ACTOR_KINDS),
  event_type: z.enum(EVENT_TYPES),
  ip: z.string().nullable(),
  user_agent: z.string().nullable(),
  metadata: z.record(z.string(), z.unknown()),
  created_at: iso,
});
export type EnvelopeEvent = z.infer<typeof EnvelopeEventSchema>;

// Request DTOs
export const CreateEnvelopeRequestSchema = z.object({
  title: z.string().min(1).max(200),
});
export type CreateEnvelopeRequest = z.infer<typeof CreateEnvelopeRequestSchema>;

export const PatchEnvelopeRequestSchema = z
  .object({
    title: z.string().min(1).max(200).optional(),
    expires_at: iso.optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: 'empty_patch' });
export type PatchEnvelopeRequest = z.infer<typeof PatchEnvelopeRequestSchema>;

export const AddSignerRequestSchema = z.object({
  contact_id: uuid,
});
export type AddSignerRequest = z.infer<typeof AddSignerRequestSchema>;

const FieldPlacementInputSchema = z.object({
  signer_id: uuid,
  kind: z.enum(FIELD_KINDS),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1).nullable().optional(),
  height: z.number().min(0).max(1).nullable().optional(),
  required: z.boolean().default(true),
  link_id: z.string().max(100).nullable().optional(),
});
export const PlaceFieldsRequestSchema = z.object({
  fields: z.array(FieldPlacementInputSchema),
});
export type PlaceFieldsRequest = z.infer<typeof PlaceFieldsRequestSchema>;

export const SignStartRequestSchema = z.object({
  envelope_id: uuid,
  token: z.string().min(20),
});
export type SignStartRequest = z.infer<typeof SignStartRequestSchema>;

export const FillFieldRequestSchema = z
  .object({
    value_text: z.string().max(500).nullable().optional(),
    value_boolean: z.boolean().nullable().optional(),
  })
  .refine((v) => v.value_text != null || v.value_boolean != null, {
    message: 'value_required',
  });
export type FillFieldRequest = z.infer<typeof FillFieldRequestSchema>;

export const DeclineRequestSchema = z.object({
  reason: z.string().max(500).optional(),
});
export type DeclineRequest = z.infer<typeof DeclineRequestSchema>;

// Response DTOs
export const EnvelopeListItemSchema = EnvelopeSchema.pick({
  id: true,
  title: true,
  short_code: true,
  status: true,
  original_pages: true,
  sent_at: true,
  completed_at: true,
  expires_at: true,
  created_at: true,
  updated_at: true,
});
export type EnvelopeListItem = z.infer<typeof EnvelopeListItemSchema>;

export const EnvelopeListResponseSchema = z.object({
  items: z.array(EnvelopeListItemSchema),
  next_cursor: z.string().nullable(),
});
export type EnvelopeListResponse = z.infer<typeof EnvelopeListResponseSchema>;

export const VerifyResponseSchema = z.object({
  status: z.enum(ENVELOPE_STATUSES),
  short_code: z.string().length(13),
  created_at: iso,
  completed_at: iso.nullable(),
  declined_at: iso.nullable(),
  expired_at: iso.nullable(),
  signer_list: z.array(
    z.object({
      name_masked: z.string(),
      email_masked: z.string(),
      signed_at: iso.nullable(),
    }),
  ),
  original_sha256: sha256.nullable(),
  sealed_sha256: sha256.nullable(),
});
export type VerifyResponse = z.infer<typeof VerifyResponseSchema>;

export const ErrorSlugs = [
  'envelope_not_found',
  'envelope_not_draft',
  'envelope_terminal',
  'envelope_not_sealed',
  'audit_not_ready',
  'file_required',
  'file_too_large',
  'file_not_pdf',
  'file_unreadable',
  'no_signers',
  'no_fields',
  'signer_without_signature_field',
  'signer_not_in_envelope',
  'signer_email_taken',
  'stale_envelope',
  'remind_throttled',
  'invalid_token',
  'already_signed',
  'already_declined',
  'already_accepted',
  'missing_signer_session',
  'invalid_signer_session',
  'wrong_field_kind',
  'image_too_large',
  'image_not_png_or_jpeg',
  'image_unreadable',
  'tc_required',
  'signature_required',
  'missing_fields',
  'decline_reason_too_long',
  'contact_not_found',
  'validation_error',
  'invalid_cursor',
  'field_not_found',
] as const;
export type ErrorSlug = (typeof ErrorSlugs)[number];
```

- [ ] **Step 4: Append to `packages/shared/src/index.ts`**

```ts
export * from './signer';
export * from './envelope-contract';
```

- [ ] **Step 5: Run tests and verify pass**

Run: `pnpm --filter shared test`
Expected: all 7 contract tests pass.

Run: `pnpm -r typecheck`
Expected: clean (api + web reference `shared` via workspace:*).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/envelope-contract.ts packages/shared/src/envelope-contract.spec.ts packages/shared/src/index.ts packages/shared/package.json
git commit -m "$(cat <<'EOF'
feat(shared): envelope wire contract with zod schemas

Canonical types + zod schemas for envelopes, signers, fields, events,
request/response DTOs, and error slugs. Single source of truth shared
between apps/api and apps/web.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Migration `0002_envelopes.sql` — tables, enums, indexes

**Files:**
- Create: `apps/api/db/migrations/0002_envelopes.sql`
- Modify: `apps/api/db/schema.ts` (add Kysely table interfaces)
- Modify: `apps/api/test/pg-mem-db.ts` (apply the new migration too)

- [ ] **Step 1: Create migration SQL**

Create `apps/api/db/migrations/0002_envelopes.sql`:

```sql
-- 0002_envelopes.sql
-- Envelopes + signers + fields + events + jobs for the signing flow.
-- Scoped by owner_id -> auth.users(id). RLS enabled with no policies.
-- Backend is the sole gate (admin role bypasses RLS). Default-deny.

create extension if not exists "citext";

-- Enums
create type envelope_status as enum (
  'draft','awaiting_others','sealing','completed','declined','expired','canceled'
);
create type delivery_mode as enum ('parallel','sequential');
create type signer_role as enum ('proposer','signatory','validator','witness');
create type field_kind as enum ('signature','initials','date','text','checkbox','email');
create type signature_format as enum ('drawn','typed','upload');
create type actor_kind as enum ('sender','signer','system');
create type event_type as enum (
  'created','sent','viewed','tc_accepted','field_filled',
  'signed','all_signed','sealed','declined','expired','canceled',
  'reminder_sent','session_invalidated_by_decline','job_failed','retention_deleted'
);
create type job_kind as enum ('seal','audit_only');
create type job_status as enum ('pending','running','done','failed');

-- envelopes
create table public.envelopes (
  id                 uuid primary key default gen_random_uuid(),
  owner_id           uuid not null references auth.users(id) on delete cascade,
  title              text not null check (char_length(title) between 1 and 200),
  short_code         text not null unique check (char_length(short_code) = 13),
  status             envelope_status not null default 'draft',
  delivery_mode      delivery_mode   not null default 'parallel',
  original_file_path text,
  original_sha256    text check (original_sha256 is null or char_length(original_sha256) = 64),
  original_pages     integer check (original_pages is null or original_pages > 0),
  sealed_file_path   text,
  sealed_sha256      text check (sealed_sha256 is null or char_length(sealed_sha256) = 64),
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

alter table public.envelopes enable row level security;

create trigger envelopes_set_updated_at
  before update on public.envelopes
  for each row execute function public.set_updated_at();

-- envelope_signers
create table public.envelope_signers (
  id                         uuid primary key default gen_random_uuid(),
  envelope_id                uuid not null references public.envelopes(id) on delete cascade,
  contact_id                 uuid references public.contacts(id) on delete set null,
  email                      citext not null,
  name                       text not null check (char_length(name) between 1 and 200),
  color                      text not null check (color ~ '^#[0-9A-Fa-f]{6}$'),
  role                       signer_role not null default 'signatory',
  signing_order              integer not null default 1 check (signing_order >= 1),

  access_token_hash          text check (access_token_hash is null or char_length(access_token_hash) = 64),
  access_token_sent_at       timestamptz,
  verification_checks        jsonb not null default '[]'::jsonb,

  viewed_at                  timestamptz,
  tc_accepted_at             timestamptz,
  signed_at                  timestamptz,
  declined_at                timestamptz,
  decline_reason             text check (decline_reason is null or char_length(decline_reason) <= 500),

  signing_ip                 inet,
  signing_user_agent         text,

  signature_format           signature_format,
  signature_image_path       text,
  signature_font             text,
  signature_stroke_count     integer,
  signature_source_filename  text,

  created_at                 timestamptz not null default now(),

  unique (envelope_id, email),
  check ((signed_at is null) or (tc_accepted_at is not null)),
  check ((signed_at is null) or (signature_format is not null)),
  check ((declined_at is null) or (signed_at is null))
);

create index envelope_signers_envelope_signed_idx on public.envelope_signers (envelope_id, signed_at);
create index envelope_signers_token_idx on public.envelope_signers (access_token_hash) where access_token_hash is not null;

alter table public.envelope_signers enable row level security;

-- envelope_fields
create table public.envelope_fields (
  id             uuid primary key default gen_random_uuid(),
  envelope_id    uuid not null references public.envelopes(id) on delete cascade,
  signer_id      uuid not null references public.envelope_signers(id) on delete cascade,
  kind           field_kind not null,
  page           integer not null check (page >= 1),
  x              numeric(7,4) not null check (x >= 0 and x <= 1),
  y              numeric(7,4) not null check (y >= 0 and y <= 1),
  width          numeric(7,4) check (width is null or (width > 0 and width <= 1)),
  height         numeric(7,4) check (height is null or (height > 0 and height <= 1)),
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

-- envelope_events (append-only at app level)
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

-- envelope_jobs
create table public.envelope_jobs (
  id             uuid primary key default gen_random_uuid(),
  envelope_id    uuid not null unique references public.envelopes(id) on delete cascade,
  kind           job_kind not null,
  status         job_status not null default 'pending',
  attempts       integer not null default 0,
  max_attempts   integer not null default 5,
  last_error     text,
  scheduled_for  timestamptz not null default now(),
  started_at     timestamptz,
  finished_at    timestamptz,
  created_at     timestamptz not null default now()
);

create index envelope_jobs_pending_idx on public.envelope_jobs (scheduled_for)
  where status in ('pending','failed');

alter table public.envelope_jobs enable row level security;
```

- [ ] **Step 2: Extend Kysely schema**

Replace `apps/api/db/schema.ts` with:

```ts
import type { ColumnType, Generated } from 'kysely';

export interface Database {
  contacts: ContactsTable;
  envelopes: EnvelopesTable;
  envelope_signers: EnvelopeSignersTable;
  envelope_fields: EnvelopeFieldsTable;
  envelope_events: EnvelopeEventsTable;
  envelope_jobs: EnvelopeJobsTable;
}

export interface ContactsTable {
  id: Generated<string>;
  owner_id: string;
  name: string;
  email: string;
  color: string;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export type EnvelopeStatusDb =
  | 'draft'
  | 'awaiting_others'
  | 'sealing'
  | 'completed'
  | 'declined'
  | 'expired'
  | 'canceled';
export type DeliveryModeDb = 'parallel' | 'sequential';
export type SignerRoleDb = 'proposer' | 'signatory' | 'validator' | 'witness';
export type FieldKindDb = 'signature' | 'initials' | 'date' | 'text' | 'checkbox' | 'email';
export type SignatureFormatDb = 'drawn' | 'typed' | 'upload';
export type ActorKindDb = 'sender' | 'signer' | 'system';
export type EventTypeDb =
  | 'created'
  | 'sent'
  | 'viewed'
  | 'tc_accepted'
  | 'field_filled'
  | 'signed'
  | 'all_signed'
  | 'sealed'
  | 'declined'
  | 'expired'
  | 'canceled'
  | 'reminder_sent'
  | 'session_invalidated_by_decline'
  | 'job_failed'
  | 'retention_deleted';
export type JobKindDb = 'seal' | 'audit_only';
export type JobStatusDb = 'pending' | 'running' | 'done' | 'failed';

export interface EnvelopesTable {
  id: Generated<string>;
  owner_id: string;
  title: string;
  short_code: string;
  status: ColumnType<EnvelopeStatusDb, EnvelopeStatusDb | undefined, EnvelopeStatusDb | undefined>;
  delivery_mode: ColumnType<DeliveryModeDb, DeliveryModeDb | undefined, never>;
  original_file_path: string | null;
  original_sha256: string | null;
  original_pages: number | null;
  sealed_file_path: string | null;
  sealed_sha256: string | null;
  audit_file_path: string | null;
  tc_version: string;
  privacy_version: string;
  sent_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  completed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  expires_at: ColumnType<Date, string, string | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string | undefined>;
}

export interface EnvelopeSignersTable {
  id: Generated<string>;
  envelope_id: string;
  contact_id: string | null;
  email: string;
  name: string;
  color: string;
  role: ColumnType<SignerRoleDb, SignerRoleDb | undefined, SignerRoleDb | undefined>;
  signing_order: ColumnType<number, number | undefined, number | undefined>;

  access_token_hash: string | null;
  access_token_sent_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  verification_checks: ColumnType<string[], string | undefined, string | undefined>;

  viewed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  tc_accepted_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  signed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  declined_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  decline_reason: string | null;

  signing_ip: string | null;
  signing_user_agent: string | null;

  signature_format: SignatureFormatDb | null;
  signature_image_path: string | null;
  signature_font: string | null;
  signature_stroke_count: number | null;
  signature_source_filename: string | null;

  created_at: ColumnType<Date, string | undefined, never>;
}

export interface EnvelopeFieldsTable {
  id: Generated<string>;
  envelope_id: string;
  signer_id: string;
  kind: FieldKindDb;
  page: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  required: ColumnType<boolean, boolean | undefined, boolean | undefined>;
  link_id: string | null;
  value_text: string | null;
  value_boolean: boolean | null;
  filled_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface EnvelopeEventsTable {
  id: Generated<string>;
  envelope_id: string;
  signer_id: string | null;
  actor_kind: ActorKindDb;
  event_type: EventTypeDb;
  ip: string | null;
  user_agent: string | null;
  metadata: ColumnType<Record<string, unknown>, string | undefined, string | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface EnvelopeJobsTable {
  id: Generated<string>;
  envelope_id: string;
  kind: JobKindDb;
  status: ColumnType<JobStatusDb, JobStatusDb | undefined, JobStatusDb | undefined>;
  attempts: ColumnType<number, number | undefined, number | undefined>;
  max_attempts: ColumnType<number, number | undefined, number | undefined>;
  last_error: string | null;
  scheduled_for: ColumnType<Date, string | undefined, string | undefined>;
  started_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  finished_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  created_at: ColumnType<Date, string | undefined, never>;
}
```

- [ ] **Step 3: Extend pg-mem harness to load the new migration**

Read `apps/api/test/pg-mem-db.ts` to understand its current patching. Append 0002 application.

Add this block to `pg-mem-db.ts` after the existing 0001 application (inside `createPgMemDb`), before `return { db, mem, pool, close }`:

```ts
  const migration0002Path = resolve(__dirname, '../db/migrations/0002_envelopes.sql');
  let migration0002 = readFileSync(migration0002Path, 'utf8');
  // Same patches pg-mem needs: strip citext extension, strip RLS alters, etc.
  migration0002 = migration0002
    .replace(/create extension if not exists "citext";\s*/i, '')
    .replace(/\bcitext\b/g, 'text')
    .replace(/alter table [^;]+ enable row level security;\s*/gi, '');
  mem.public.none(migration0002);
```

(If the existing file uses a different pattern, follow it — inspect, extend.)

- [ ] **Step 4: Run repo tests to verify pg-mem still bootstraps**

Run: `pnpm --filter api test -- --testPathPattern pg-mem-db`
Expected: pass.

Run full api unit suite: `pnpm --filter api test`
Expected: 63+ tests still green.

- [ ] **Step 5: Apply migration to live Supabase via MCP**

Use the `mcp__e0a7ce39-d625-4171-a7fb-d55508089c1f__apply_migration` tool (whatever the current Supabase MCP tool name is) with:
- `project_id`: `hsjlihhcwvjvybpszjsa`
- `name`: `0002_envelopes`
- `query`: full contents of `0002_envelopes.sql`

Verify with the MCP `list_tables` tool. Expect 6 public tables (contacts + 5 new).

- [ ] **Step 6: Commit**

```bash
git add apps/api/db/migrations/0002_envelopes.sql apps/api/db/schema.ts apps/api/test/pg-mem-db.ts
git commit -m "$(cat <<'EOF'
feat(api): migration 0002 — envelopes, signers, fields, events, jobs

Five new tables with enums, indexes, RLS-enabled-no-policies (backend
is sole gate). Constraints enforce signed-after-tc, signed-xor-declined,
coord range [0,1], color regex. pg-mem harness updated to load 0002.

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Migration `0003_outbound_emails.sql` + idempotency + webhook stub

**Files:**
- Create: `apps/api/db/migrations/0003_outbound_emails.sql`
- Modify: `apps/api/db/schema.ts` (append tables)
- Modify: `apps/api/test/pg-mem-db.ts`

- [ ] **Step 1: Create migration SQL**

Create `apps/api/db/migrations/0003_outbound_emails.sql`:

```sql
-- 0003_outbound_emails.sql
-- Email outbox + idempotency + webhook stub for envelopes phase 3.

create type email_kind as enum (
  'invite','reminder','completed','declined_to_sender',
  'withdrawn_to_signer','withdrawn_after_sign',
  'expired_to_sender','expired_to_signer'
);
create type email_status as enum ('pending','sending','sent','failed');

create table public.outbound_emails (
  id              uuid primary key default gen_random_uuid(),
  envelope_id     uuid references public.envelopes(id) on delete cascade,
  signer_id       uuid references public.envelope_signers(id) on delete set null,
  kind            email_kind not null,
  to_email        citext not null,
  to_name         text not null,
  payload         jsonb not null,
  status          email_status not null default 'pending',
  attempts        integer not null default 0,
  max_attempts    integer not null default 8,
  scheduled_for   timestamptz not null default now(),
  sent_at         timestamptz,
  last_error      text,
  provider_id     text,
  source_event_id uuid references public.envelope_events(id) on delete set null,
  created_at      timestamptz not null default now(),
  unique (envelope_id, signer_id, kind, source_event_id)
);

create index outbound_emails_pending_idx on public.outbound_emails (scheduled_for)
  where status in ('pending','failed');

alter table public.outbound_emails enable row level security;

-- Idempotency records for mutating endpoints
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

-- Webhook events (stub; post-MVP processor)
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

- [ ] **Step 2: Extend `schema.ts`**

Append to the `Database` interface in `apps/api/db/schema.ts`:

```ts
  outbound_emails: OutboundEmailsTable;
  idempotency_records: IdempotencyRecordsTable;
  email_webhooks: EmailWebhooksTable;
```

Add the table interfaces at the bottom of the file:

```ts
export type EmailKindDb =
  | 'invite'
  | 'reminder'
  | 'completed'
  | 'declined_to_sender'
  | 'withdrawn_to_signer'
  | 'withdrawn_after_sign'
  | 'expired_to_sender'
  | 'expired_to_signer';
export type EmailStatusDb = 'pending' | 'sending' | 'sent' | 'failed';

export interface OutboundEmailsTable {
  id: Generated<string>;
  envelope_id: string | null;
  signer_id: string | null;
  kind: EmailKindDb;
  to_email: string;
  to_name: string;
  payload: ColumnType<Record<string, unknown>, string, string | undefined>;
  status: ColumnType<EmailStatusDb, EmailStatusDb | undefined, EmailStatusDb | undefined>;
  attempts: ColumnType<number, number | undefined, number | undefined>;
  max_attempts: ColumnType<number, number | undefined, number | undefined>;
  scheduled_for: ColumnType<Date, string | undefined, string | undefined>;
  sent_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
  last_error: string | null;
  provider_id: string | null;
  source_event_id: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface IdempotencyRecordsTable {
  user_id: string;
  idempotency_key: string;
  method: string;
  path: string;
  request_hash: string;
  response_status: number;
  response_body: ColumnType<Record<string, unknown>, string, never>;
  created_at: ColumnType<Date, string | undefined, never>;
  expires_at: ColumnType<Date, string | undefined, never>;
}

export interface EmailWebhooksTable {
  id: Generated<string>;
  provider: string;
  event_type: string;
  provider_id: string;
  payload: ColumnType<Record<string, unknown>, string, never>;
  received_at: ColumnType<Date, string | undefined, never>;
  processed_at: ColumnType<Date | null, string | null | undefined, string | null | undefined>;
}
```

- [ ] **Step 3: Extend pg-mem harness**

Add to `apps/api/test/pg-mem-db.ts` after the 0002 block:

```ts
  const migration0003Path = resolve(__dirname, '../db/migrations/0003_outbound_emails.sql');
  let migration0003 = readFileSync(migration0003Path, 'utf8');
  migration0003 = migration0003
    .replace(/\bcitext\b/g, 'text')
    .replace(/alter table [^;]+ enable row level security;\s*/gi, '');
  mem.public.none(migration0003);
```

- [ ] **Step 4: Verify pg-mem bootstrap**

Run: `pnpm --filter api test -- --testPathPattern pg-mem-db`
Expected: pass.

Run: `pnpm --filter api test`
Expected: clean.

- [ ] **Step 5: Apply migration to live Supabase via MCP**

Tool: `apply_migration`, name `0003_outbound_emails`, query = file contents.

Verify with `list_tables`: expect 9 public tables total.

- [ ] **Step 6: Commit**

```bash
git add apps/api/db/migrations/0003_outbound_emails.sql apps/api/db/schema.ts apps/api/test/pg-mem-db.ts
git commit -m "$(cat <<'EOF'
feat(api): migration 0003 — outbound_emails + idempotency + webhooks

Email outbox with (envelope_id, signer_id, kind, source_event_id)
uniqueness for at-most-once send guarantee. Idempotency records for
mutating endpoints, 24h TTL. Webhook event log (stub; processor deferred).

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>
EOF
)"
```

---
