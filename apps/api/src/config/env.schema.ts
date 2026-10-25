import { isFeatureEnabled } from 'shared';
import { z } from 'zod';
import { parseAutomationSecretsKey } from '../automations/actions/webhook/secret-box';
import { parsePreregisteredClients } from '../mcp/oauth/oauth-clients-env';
import { STRICT_BOOLEAN_STRING_MESSAGE, strictBooleanString } from './strict-boolean-string';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    SUPABASE_URL: z.string().url(),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    // Required at boot. The localhost defaults that previously lived
    // here silently masked a misconfigured prod container — when one
    // started without these set (e.g. a stale image kept alive by
    // `docker compose up -d --build`), it fell back to localhost and
    // baked `http://localhost:5173` into audit-trail QR codes, verify
    // links, and signing-invitation emails. Requiring them upfront
    // makes every container fail-fast on missing config regardless of
    // NODE_ENV. The production-only localhost guard below catches the
    // remaining case where these vars are explicitly set to localhost.
    CORS_ORIGIN: z.string().min(1),
    APP_PUBLIC_URL: z.string().url(),

    DATABASE_URL: z
      .string()
      .min(1)
      .refine((v) => /^postgres(ql)?:\/\//.test(v), {
        message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
      }),

    STORAGE_BUCKET: z.string().min(1).default('envelopes'),

    // 2026-09-30 (no suffix) is the v0.2 text from #363.
    // .2 is Terms v0.3 and the earlier Privacy v0.3 text.
    // .3 is Privacy v0.3.1 (Drive retention). Terms stay on .2.
    TC_VERSION: z.string().min(1).default('2026-09-30.2'),
    PRIVACY_VERSION: z.string().min(1).default('2026-09-30.3'),

    SIGNER_SESSION_SECRET: z.string().optional(),
    /**
     * WP-10 — HMAC key (pepper) for emailed signer one-time codes. Only
     * the HMAC of a code is stored; without this key the codes in
     * `signer_otp_challenges` cannot be tested offline. Required (>=32
     * chars) outside tests while `signerAccessAuth` is on; unset, the
     * access-code routes answer 503 `access_code_unavailable`.
     */
    SIGNER_OTP_KEY: z.string().min(32).optional(),
    /**
     * WP-21 — server key for the approval page's CSRF value
     * (`HMAC(key, approval_id || nonce)`). Required (>=32 chars) in
     * production while `mcpServer` or `publicApi` is on. Unset elsewhere,
     * the API draws a random key per process, so a restart only makes an
     * open Approve/Deny page reload.
     */
    APPROVAL_CSRF_KEY: z.string().min(32).optional(),
    /**
     * WP-21 — the mail provider's daily and monthly quota (Resend free
     * tier: 100 and 3000). Approval mail stops with `approval_limit` once
     * 80% of either is used today / this month, so signer mail keeps the
     * headroom. Optional; those defaults apply when unset.
     */
    EMAIL_PROVIDER_DAILY_QUOTA: z.coerce.number().int().positive().optional(),
    EMAIL_PROVIDER_MONTHLY_QUOTA: z.coerce.number().int().positive().optional(),
    CRON_SECRET: z.string().optional(),

    EMAIL_PROVIDER: z.enum(['resend', 'logging', 'smtp']).default('logging'),
    /**
     * No default (rule S.1): unset means "no CMS signer" (NoopPadesSigner),
     * which production refuses unless PDF_SIGNING_ALLOW_NOOP=true. A set
     * provider with missing config throws at startup in SealingModule.
     */
    PDF_SIGNING_PROVIDER: z.enum(['local', 'kms', 'sslcom']).optional(),
    /**
     * Escape hatch for a production host that may seal without a CMS
     * signature (staging). Only read when PDF_SIGNING_PROVIDER is unset.
     * Same strict parsing as `strictBooleanString` (the string "false"
     * stays false), but optional with no default so existing typed env
     * fixtures need no new key; unset reads as false.
     */
    PDF_SIGNING_ALLOW_NOOP: z
      .stringbool({
        truthy: ['true', '1'],
        falsy: ['false', '0'],
        case: 'sensitive',
        error: STRICT_BOOLEAN_STRING_MESSAGE,
      })
      .optional(),

    // Email provider-specific
    RESEND_API_KEY: z.string().optional(),
    // Svix signing secret of the Resend webhook (`whsec_...`). Unset: POST
    // /webhooks/resend answers 503 and bounces are not recorded.
    RESEND_WEBHOOK_SECRET: z.string().min(1).optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().email().default('onboarding@resend.dev'),
    EMAIL_FROM_NAME: z.string().min(1).default('Seald'),
    /**
     * Legal-footer fields injected into every outbound email template. The
     * values render inside the `<div class="foot">` block of each
     * `apps/api/src/email/templates/*\/body.html`. The default is the brand
     * name. There is no incorporated entity to print here; override this
     * when a legal name is chosen. CAN-SPAM 15 U.S.C. §7704(a)(5)(A)(iii)
     * requires a valid physical postal address.
     */
    EMAIL_LEGAL_ENTITY: z.string().min(1).default('Seald'),
    EMAIL_LEGAL_POSTAL: z.string().min(1).default('Chlenov 24, Tel Aviv-Yafo 6604806, Israel'),
    EMAIL_PRIVACY_URL: z.string().url().default('https://seald.nromomentum.com/legal/privacy'),
    EMAIL_PREFERENCES_URL: z
      .string()
      .min(1)
      .default('mailto:privacy@seald.nromomentum.com?subject=Email%20preferences'),

    // PDF signing provider-specific
    PDF_SIGNING_LOCAL_P12_PATH: z.string().optional(),
    /**
     * The same PKCS#12 file, base64-encoded, for hosts with no file to mount
     * (the Supabase Edge Function). Wins over PDF_SIGNING_LOCAL_P12_PATH,
     * like the inline KMS cert PEM wins over its path.
     */
    PDF_SIGNING_LOCAL_P12_BASE64: z.string().optional(),
    PDF_SIGNING_LOCAL_P12_PASS: z.string().optional(),
    PDF_SIGNING_SSLCOM_CLIENT_ID: z.string().optional(),
    PDF_SIGNING_SSLCOM_CLIENT_SECRET: z.string().optional(),
    PDF_SIGNING_SSLCOM_CERT_ID: z.string().optional(),
    /**
     * AWS KMS-backed sealing (PDF_SIGNING_PROVIDER=kms). The KMS key must be
     * an asymmetric SIGN_VERIFY key with KeySpec=RSA_3072 and KeyUsage=SIGN
     * (cryptography-expert §8). The signing certificate is the public-side
     * X.509 cert that pairs with that key — KMS itself does not issue or
     * store certs, so we provide it via PEM (inline or filesystem path).
     * For the no-CA-required MVP this is a self-signed cert pinning the
     * KMS public key; AATL-trusted issuance comes later.
     */
    PDF_SIGNING_KMS_KEY_ID: z.string().optional(),
    PDF_SIGNING_KMS_REGION: z.string().optional(),
    PDF_SIGNING_KMS_CERT_PEM: z.string().optional(),
    PDF_SIGNING_KMS_CERT_PEM_PATH: z.string().optional(),
    PDF_SIGNING_TSA_URL: z.string().url().default('https://freetsa.org/tsr'),
    /**
     * Comma-separated list of additional TSA endpoints to try if
     * PDF_SIGNING_TSA_URL fails. The client tries them left-to-right;
     * first successful round-trip wins. Optional — when unset, sealing
     * uses the single PDF_SIGNING_TSA_URL exactly as before.
     * (cryptography-expert §11.3, esignature-standards-expert §3.3.)
     */
    PDF_SIGNING_TSA_URLS: z.string().optional(),

    /**
     * Enables the in-process background worker (poll envelope_jobs, seal
     * PDFs, send completed emails). Parsed with `strictBooleanString` —
     * `z.coerce.boolean()` treats the string `"false"` as true and would
     * start the workers anyway. Defaults to false so tests don't race
     * the worker; production deploys set WORKER_ENABLED=true explicitly
     * (the single-node docker-compose template does this by default). A
     * horizontally-scaled deploy can run dedicated worker nodes while
     * keeping API nodes worker-disabled.
     */
    WORKER_ENABLED: strictBooleanString(false),

    /**
     * Shared secret between the Cloudflare Pages worker that proxies the API
     * hostname and the bridge Edge Function (src/edge/proxy-guard.ts). With
     * it set, only proxied requests may set the client IP, and direct calls
     * to the function URL are refused except health and cron. Required for
     * the bridge in production; unused by the Docker deploy.
     */
    EDGE_PROXY_SECRET: z.string().min(32).optional(),

    /**
     * Bulk send throttle (WP-36): most envelopes the bulk worker creates and
     * sends in any rolling minute, across all workers. Unset means 30. Each
     * envelope queues one invite per signer, so this also bounds the mail a
     * batch adds per minute against the email provider's quota.
     */
    BULK_SEND_ROWS_PER_MINUTE: z.coerce.number().int().positive().max(600).optional(),

    /**
     * Request-time kill switch for workflow automations (WP-28). `true`
     * makes the feature behave as if `workflowAutomations` were off: no
     * trigger rows, no matching, no worker, routes 404. No rebuild needed.
     * Optional in the parsed type so hand-built test envs need no change;
     * readers treat anything but `true` as "not disabled".
     */
    AUTOMATIONS_DISABLED: strictBooleanString(false).optional(),

    /**
     * 32-byte AES-GCM key (64 hex chars, or base64/base64url) that
     * encrypts webhook signing secrets and webhook URLs in
     * `automation_secrets` (WP-29, design doc § Data model). Lives only in
     * the environment, never in the database. Startup throws when it is
     * set but malformed, and when `workflowAutomations` is on (and not
     * killed by AUTOMATIONS_DISABLED) while it is unset. With the flag off
     * it is unread.
     */
    AUTOMATION_SECRETS_KEY: z.string().optional(),

    /**
     * Public origin of this API (no trailing slash), used for links in
     * email that hit the API directly, today the `email_copy` stop link
     * (WP-33). Unset: derived from APP_PUBLIC_URL (`api.` + its host, or
     * localhost:PORT in dev). Set it explicitly when the API lives elsewhere.
     */
    API_PUBLIC_URL: z.string().url().optional(),

    /**
     * Incident kill switch for the MCP surface (docs/design/mcp-server.md,
     * Transport). `true` makes `/mcp` 404 even while the `mcpServer` flag
     * is on, and turns off the key routes that only MCP keeps alive. It is
     * validated here at boot but read from `process.env` on every request
     * (`mcpDisabled()` in `mcp-disabled.ts`), so flipping it needs no
     * rebuild. Optional so hand-built test envs need no change.
     */
    MCP_DISABLED: strictBooleanString(false).optional(),

    /**
     * MCP OAuth 2.1 (WP-27). Unread while `mcpOauth` is off.
     *
     * - `MCP_OAUTH_ISSUER`: the authorization server's issuer and the base
     *   of the `/mcp` resource identifier. Unset: the API's public origin
     *   (API_PUBLIC_URL, else derived from APP_PUBLIC_URL).
     * - `MCP_OAUTH_CLIENTS`: pre-registered public clients, a JSON array
     *   of `{ "client_id", "client_name", "redirect_uris": [...] }`
     *   (https or loopback redirect URIs only). Startup throws when it is
     *   malformed. There is no dynamic registration; any other client must
     *   use an https client id metadata document (CIMD).
     * - `MCP_OAUTH_VERIFIED_CIMD_HOSTS`: CSV of hostnames whose CIMD
     *   clients the consent page does not label "unverified".
     */
    MCP_OAUTH_ISSUER: z.string().url().optional(),
    MCP_OAUTH_CLIENTS: z.string().optional(),
    MCP_OAUTH_VERIFIED_CIMD_HOSTS: z.string().optional(),

    /**
     * Google Drive integration (Phase 5 of the gdrive feature). Required
     * only when `feature.gdriveIntegration` is on. The KMS key is the
     * per-tenant CMK that wraps the per-row data key encrypting each
     * stored OAuth refresh token (red-flag row 3 — never plaintext).
     */
    GDRIVE_OAUTH_CLIENT_ID: z.string().optional(),
    GDRIVE_OAUTH_CLIENT_SECRET: z.string().optional(),
    GDRIVE_OAUTH_REDIRECT_URI: z.string().url().optional(),
    GDRIVE_TOKEN_KMS_KEY_ARN: z.string().optional(),
    GDRIVE_TOKEN_KMS_REGION: z.string().optional(),
    /**
     * Local AES-GCM key, 32 bytes (64 hex characters, or base64 of 32 bytes) that
     * wraps the per-row data keys instead of AWS KMS (AWS exit plan, WS-3).
     * When set, new tokens are wrapped with it; rows still wrapped by the
     * KMS key above decrypt through KMS while both are configured.
     */
    GDRIVE_TOKEN_WRAP_KEY: z.string().optional(),
    GDRIVE_API_RATE_PER_USER: z.coerce.number().int().positive().optional(),
    GDRIVE_API_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().optional(),
    /**
     * Google Picker API credentials. Vended to the SPA via
     * `GET /integrations/gdrive/picker-credentials` so the client can
     * construct a `google.picker.PickerBuilder` (Path A fix for the
     * empty Drive picker bug — staying on `drive.file` scope and using
     * Google's official picker UI which grants per-file access at
     * click time).
     *
     * `GDRIVE_PICKER_DEVELOPER_KEY` is a Google Cloud API key with the
     * Picker API enabled. Referrer-restricted in Google Cloud Console
     * (production: `seald.nromomentum.com`). Public-ish but kept
     * server-side so the SPA bundle does not bake it in and we can
     * rotate without a frontend redeploy.
     *
     * `GDRIVE_PICKER_APP_ID` is the Google Cloud project number
     * (numeric, e.g. `123456789012`). Required by the Picker API for
     * app identification — not a secret, but pulled from env for the
     * same rotation/decoupling reason.
     *
     * When either is unset, `/integrations/gdrive/picker-credentials`
     * returns 503 so the SPA can render a friendly "Drive picker not
     * configured on this server" notice instead of silently building
     * a broken picker call.
     */
    GDRIVE_PICKER_DEVELOPER_KEY: z.string().optional(),
    GDRIVE_PICKER_APP_ID: z.string().optional(),
    /**
     * WT-D Drive doc → PDF conversion. The Gotenberg sidecar is
     * network-isolated inside the docker-compose stack (NOT publicly
     * routed via Caddy); the API talks to it on the internal network
     * at `http://gotenberg:3000`. Override only when running outside
     * compose (e.g. integration tests or a separate sidecar host).
     */
    GDRIVE_GOTENBERG_URL: z.string().url().default('http://gotenberg:3000'),
    /**
     * Hard size cap for inbound Drive bytes + outbound Gotenberg PDFs.
     * Default 25 MiB matches the WT-A-1 contract (`file-too-large`
     * error code returned to the SPA at this threshold). Raising it
     * without re-checking the Gotenberg memory budget will OOM the
     * sidecar — change only with a deliberate runbook entry.
     */
    GDRIVE_CONVERSION_MAX_BYTES: z.coerce.number().int().positive().default(26_214_400),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production') {
      if (/localhost|127\.0\.0\.1/.test(env.APP_PUBLIC_URL)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['APP_PUBLIC_URL'],
          message:
            'APP_PUBLIC_URL must not contain localhost in production — set it to the public web origin (e.g. https://seald.nromomentum.com)',
        });
      }
      if (/localhost|127\.0\.0\.1/.test(env.CORS_ORIGIN)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['CORS_ORIGIN'],
          message:
            'CORS_ORIGIN must not contain localhost in production — set it to the public web origin (e.g. https://seald.nromomentum.com)',
        });
      }
    }

    if (env.NODE_ENV !== 'test') {
      for (const key of ['SIGNER_SESSION_SECRET', 'CRON_SECRET'] as const) {
        const value = env[key];
        if (!value || value.length < 32) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} required (>=32 chars) when NODE_ENV!=test`,
          });
        }
      }
    }

    if (env.NODE_ENV !== 'test' && isFeatureEnabled('signerAccessAuth') && !env.SIGNER_OTP_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['SIGNER_OTP_KEY'],
        message: 'SIGNER_OTP_KEY required (>=32 chars) while the signerAccessAuth flag is on',
      });
    }

    if (
      env.NODE_ENV === 'production' &&
      (isFeatureEnabled('mcpServer') || isFeatureEnabled('publicApi')) &&
      !env.APPROVAL_CSRF_KEY
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APPROVAL_CSRF_KEY'],
        message:
          'APPROVAL_CSRF_KEY required (>=32 chars) in production while mcpServer or publicApi is on',
      });
    }

    if (env.MCP_OAUTH_CLIENTS !== undefined) {
      try {
        parsePreregisteredClients(env.MCP_OAUTH_CLIENTS);
      } catch (err) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['MCP_OAUTH_CLIENTS'],
          message: err instanceof Error ? err.message : 'MCP_OAUTH_CLIENTS is invalid',
        });
      }
    }

    if (env.AUTOMATION_SECRETS_KEY !== undefined && env.AUTOMATION_SECRETS_KEY !== '') {
      if (!parseAutomationSecretsKey(env.AUTOMATION_SECRETS_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['AUTOMATION_SECRETS_KEY'],
          message:
            'AUTOMATION_SECRETS_KEY must be 32 bytes: 64 hex characters or base64 of 32 bytes',
        });
      }
    } else if (isFeatureEnabled('workflowAutomations') && env.AUTOMATIONS_DISABLED !== true) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['AUTOMATION_SECRETS_KEY'],
        message: 'AUTOMATION_SECRETS_KEY required (32 bytes) when workflowAutomations is on',
      });
    }

    if (env.GDRIVE_TOKEN_WRAP_KEY !== undefined && env.GDRIVE_TOKEN_WRAP_KEY !== '') {
      if (!parseAutomationSecretsKey(env.GDRIVE_TOKEN_WRAP_KEY)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['GDRIVE_TOKEN_WRAP_KEY'],
          message:
            'GDRIVE_TOKEN_WRAP_KEY must be 32 bytes: 64 hex characters or base64 of 32 bytes',
        });
      }
    }

    if (env.EMAIL_PROVIDER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['RESEND_API_KEY'],
        message: 'RESEND_API_KEY required when EMAIL_PROVIDER=resend',
      });
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
      if (!env.PDF_SIGNING_LOCAL_P12_PATH && !env.PDF_SIGNING_LOCAL_P12_BASE64) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PDF_SIGNING_LOCAL_P12_PATH'],
          message:
            'PDF_SIGNING_LOCAL_P12_PATH or PDF_SIGNING_LOCAL_P12_BASE64 required when PDF_SIGNING_PROVIDER=local and NODE_ENV!=test',
        });
      }
      if (!env.PDF_SIGNING_LOCAL_P12_PASS) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PDF_SIGNING_LOCAL_P12_PASS'],
          message:
            'PDF_SIGNING_LOCAL_P12_PASS required when PDF_SIGNING_PROVIDER=local and NODE_ENV!=test',
        });
      }
    }

    if (env.PDF_SIGNING_PROVIDER === 'kms' && env.NODE_ENV !== 'test') {
      for (const key of ['PDF_SIGNING_KMS_KEY_ID', 'PDF_SIGNING_KMS_REGION'] as const) {
        if (!env[key]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [key],
            message: `${key} required when PDF_SIGNING_PROVIDER=kms and NODE_ENV!=test`,
          });
        }
      }
      if (!env.PDF_SIGNING_KMS_CERT_PEM && !env.PDF_SIGNING_KMS_CERT_PEM_PATH) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['PDF_SIGNING_KMS_CERT_PEM'],
          message:
            'PDF_SIGNING_KMS_CERT_PEM or PDF_SIGNING_KMS_CERT_PEM_PATH required when PDF_SIGNING_PROVIDER=kms',
        });
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
  // Supabase Edge Functions refuse secrets named SUPABASE_* and inject the
  // legacy service_role JWT under that name, which does not work once a
  // project's legacy keys are disabled. SEALD_SERVICE_ROLE_KEY carries the
  // project's secret key (sb_secret_...) there and wins when set.
  const override = raw['SEALD_SERVICE_ROLE_KEY'];
  const source = override ? { ...raw, SUPABASE_SERVICE_ROLE_KEY: override } : raw;
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
