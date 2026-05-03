import { z } from 'zod';

export const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
    PORT: z.coerce.number().int().positive().default(3000),

    SUPABASE_URL: z.string().url(),
    SUPABASE_JWT_AUDIENCE: z.string().min(1).default('authenticated'),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

    CORS_ORIGIN: z.string().min(1).default('http://localhost:5173'),
    APP_PUBLIC_URL: z.string().url().default('http://localhost:5173'),

    DATABASE_URL: z
      .string()
      .min(1)
      .refine((v) => /^postgres(ql)?:\/\//.test(v), {
        message: 'DATABASE_URL must be a postgres:// or postgresql:// URL',
      }),

    STORAGE_BUCKET: z.string().min(1).default('envelopes'),

    TC_VERSION: z.string().min(1).default('2026-04-24'),
    PRIVACY_VERSION: z.string().min(1).default('2026-04-24'),

    SIGNER_SESSION_SECRET: z.string().optional(),
    CRON_SECRET: z.string().optional(),
    METRICS_SECRET: z.string().optional(),

    EMAIL_PROVIDER: z.enum(['resend', 'logging', 'smtp']).default('logging'),
    PDF_SIGNING_PROVIDER: z.enum(['local', 'kms', 'sslcom']).default('local'),

    // Email provider-specific
    RESEND_API_KEY: z.string().optional(),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().positive().optional(),
    SMTP_USER: z.string().optional(),
    SMTP_PASS: z.string().optional(),
    EMAIL_FROM_ADDRESS: z.string().email().default('onboarding@resend.dev'),
    EMAIL_FROM_NAME: z.string().min(1).default('Seald'),
    /**
     * Legal-footer fields injected into every outbound email template. The
     * values render inside the `<div class="foot">` block of each
     * `apps/api/src/email/templates/*\/body.html`. Defaults reflect Seald's
     * pre-incorporation posture; override in production once the entity
     * filing is complete (CAN-SPAM § 5(a)(5) requires a valid postal
     * address; CASL § 6(2)(c) and EU consumer-protection law similarly).
     */
    EMAIL_LEGAL_ENTITY: z.string().min(1).default('Seald, Inc.'),
    EMAIL_LEGAL_POSTAL: z
      .string()
      .min(1)
      .default('Postal address available on request — write to legal@seald.nromomentum.com.'),
    EMAIL_PRIVACY_URL: z.string().url().default('https://seald.nromomentum.com/legal/privacy'),
    EMAIL_PREFERENCES_URL: z
      .string()
      .min(1)
      .default('mailto:privacy@seald.nromomentum.com?subject=Email%20preferences'),

    // PDF signing provider-specific
    PDF_SIGNING_LOCAL_P12_PATH: z.string().optional(),
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

    ENVELOPE_RETENTION_YEARS: z.coerce.number().int().positive().default(7),

    /**
     * Enables the in-process background worker (poll envelope_jobs, seal
     * PDFs, send completed emails). Defaults to false so tests don't race
     * the worker; production deploys set WORKER_ENABLED=true explicitly
     * (the single-node docker-compose template does this by default). A
     * horizontally-scaled deploy can run dedicated worker nodes while
     * keeping API nodes worker-disabled.
     */
    WORKER_ENABLED: z.coerce.boolean().default(false),

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
    GDRIVE_API_RATE_PER_USER: z.coerce.number().int().positive().optional(),
    GDRIVE_API_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().optional(),
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
    if (env.NODE_ENV !== 'test') {
      for (const key of ['SIGNER_SESSION_SECRET', 'CRON_SECRET', 'METRICS_SECRET'] as const) {
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
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return result.data;
}
