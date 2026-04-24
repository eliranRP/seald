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
    PDF_SIGNING_PROVIDER: z.enum(['local', 'sslcom']).default('local'),

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

    /**
     * Enables the in-process background worker (poll envelope_jobs, seal
     * PDFs, send completed emails). Defaults to false so tests don't race
     * the worker; production deploys set WORKER_ENABLED=true explicitly
     * (the single-node docker-compose template does this by default). A
     * horizontally-scaled deploy can run dedicated worker nodes while
     * keeping API nodes worker-disabled.
     */
    WORKER_ENABLED: z.coerce.boolean().default(false),
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
