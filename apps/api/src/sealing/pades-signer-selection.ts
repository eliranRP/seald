import { existsSync } from 'node:fs';
import { Logger } from '@nestjs/common';
import type { AppEnv } from '../config/env.schema';
import { KmsPadesSigner, NoopPadesSigner, P12PadesSigner, type PadesSigner } from './pades-signer';
import type { TsaClient } from './tsa-client';

/** Minimal logger surface so tests can capture the selection log lines. */
export interface SignerSelectionLogger {
  log(message: string): void;
  warn(message: string): void;
}

/**
 * Pick the PadesSigner for this process (rule S.1). Order:
 *
 *   1. `PDF_SIGNING_PROVIDER=kms`    → KmsPadesSigner. Key id, region and a
 *      cert (inline PEM or path) are all required; a missing one throws.
 *   2. `PDF_SIGNING_PROVIDER=local`  → P12PadesSigner. The P12 path and
 *      password are required and the file must exist; otherwise it throws.
 *   3. `PDF_SIGNING_PROVIDER=sslcom` → throws (not implemented). The enum
 *      value stays because env.schema.ts accepts it.
 *   4. `PDF_SIGNING_PROVIDER` unset  → NoopPadesSigner. In production this
 *      also needs `PDF_SIGNING_ALLOW_NOOP=true`, or startup throws.
 *
 * A misconfigured provider never falls through to a weaker signer. The one
 * exception is the e2e harness: with `NODE_ENV=test`, `local` with neither
 * a P12 path nor a password is treated like "unset" (Noop), the same carve-
 * out env.schema.ts makes for those two vars. A P12 path that is set but
 * missing on disk still throws in every environment.
 */
export function selectPadesSigner(
  env: AppEnv,
  tsa: TsaClient,
  logger: SignerSelectionLogger = new Logger('SealingModule'),
): PadesSigner {
  const tsaReady = tsa.configured;
  const tsaLabel = tsaReady ? 'enabled, PAdES-B-T and B-LTA' : 'disabled, PAdES-B-B only';
  const provider = env.PDF_SIGNING_PROVIDER;

  if (provider === 'kms') {
    const missing: string[] = [];
    if (!env.PDF_SIGNING_KMS_KEY_ID) missing.push('PDF_SIGNING_KMS_KEY_ID');
    if (!env.PDF_SIGNING_KMS_REGION) missing.push('PDF_SIGNING_KMS_REGION');
    if (!env.PDF_SIGNING_KMS_CERT_PEM && !env.PDF_SIGNING_KMS_CERT_PEM_PATH) {
      missing.push('PDF_SIGNING_KMS_CERT_PEM or PDF_SIGNING_KMS_CERT_PEM_PATH');
    }
    if (missing.length > 0) {
      throw new Error(`PDF_SIGNING_PROVIDER=kms but ${missing.join(', ')} not set`);
    }
    logger.log(
      `PadesSigner: KmsPadesSigner (key=${env.PDF_SIGNING_KMS_KEY_ID} region=${env.PDF_SIGNING_KMS_REGION}; TSA=${tsaLabel})`,
    );
    return new KmsPadesSigner(env, tsaReady ? tsa : null);
  }

  if (provider === 'local') {
    const p12Path = env.PDF_SIGNING_LOCAL_P12_PATH;
    const p12Inline = env.PDF_SIGNING_LOCAL_P12_BASE64;
    const p12Pass = env.PDF_SIGNING_LOCAL_P12_PASS;
    if (!p12Path && !p12Inline && !p12Pass && env.NODE_ENV === 'test') {
      logger.warn(
        'PadesSigner: NoopPadesSigner (NODE_ENV=test, PDF_SIGNING_PROVIDER=local with no P12 configured)',
      );
      return new NoopPadesSigner();
    }
    if ((!p12Path && !p12Inline) || !p12Pass) {
      const missing: string[] = [];
      if (!p12Path && !p12Inline) {
        missing.push('PDF_SIGNING_LOCAL_P12_PATH or PDF_SIGNING_LOCAL_P12_BASE64');
      }
      if (!p12Pass) missing.push('PDF_SIGNING_LOCAL_P12_PASS');
      throw new Error(`PDF_SIGNING_PROVIDER=local but ${missing.join(', ')} not set`);
    }
    if (!p12Inline && p12Path && !existsSync(p12Path)) {
      throw new Error(`PDF_SIGNING_PROVIDER=local but the P12 file ${p12Path} does not exist`);
    }
    const source = p12Inline ? 'PDF_SIGNING_LOCAL_P12_BASE64' : p12Path;
    logger.log(`PadesSigner: P12PadesSigner (p12=${source}; TSA=${tsaLabel})`);
    return new P12PadesSigner(env, tsaReady ? tsa : null);
  }

  if (provider === 'sslcom') {
    throw new Error('PDF_SIGNING_PROVIDER=sslcom is not implemented');
  }

  if (env.NODE_ENV === 'production' && !env.PDF_SIGNING_ALLOW_NOOP) {
    throw new Error(
      'PDF_SIGNING_PROVIDER is not set. Production refuses to seal without a CMS signature: set PDF_SIGNING_PROVIDER=kms, or PDF_SIGNING_ALLOW_NOOP=true on a host that may seal unsigned (staging only).',
    );
  }
  logger.warn(
    'PadesSigner: NoopPadesSigner (PDF_SIGNING_PROVIDER unset — sealed.pdf will have burn-in + sha256 but no CMS signature)',
  );
  return new NoopPadesSigner();
}
