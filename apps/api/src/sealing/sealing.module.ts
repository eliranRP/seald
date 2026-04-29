import { existsSync } from 'node:fs';
import { Logger, Module } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailModule } from '../email/email.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { DssInjector } from './dss-injector';
import { KmsPadesSigner, NoopPadesSigner, P12PadesSigner, PadesSigner } from './pades-signer';
import { RevocationFetcher } from './revocation-fetcher';
import { SealingService } from './sealing.service';
import { TsaClient } from './tsa-client';
import { WorkerService } from './worker.service';

/**
 * Sealing module — orchestrates the background pipeline that turns
 * `sealing` envelopes into `completed` ones (with a PAdES-signed sealed.pdf
 * and an audit.pdf). Depends on EnvelopesRepository + StorageService +
 * OutboundEmailsRepository from other modules, all of which are provided as
 * @Global().
 *
 * PadesSigner selection is runtime-config-driven:
 *   - If PDF_SIGNING_PROVIDER=kms AND key + region + cert are set → KMS path.
 *   - Else if PDF_SIGNING_PROVIDER=local AND the P12 file exists → P12 path.
 *   - Otherwise → passthrough (NoopPadesSigner).
 *
 * This way a single image can start as passthrough in staging (no provider
 * provisioned) and flip to real signing by setting the env vars +
 * restarting. Production deploys MUST use the KMS path (cryptography-
 * expert §8 — private keys stay in HSM-backed KMS).
 */
@Module({
  imports: [EnvelopesModule, EmailModule],
  providers: [
    SealingService,
    WorkerService,
    TsaClient,
    RevocationFetcher,
    DssInjector,
    {
      provide: PadesSigner,
      useFactory: (env: AppEnv, tsa: TsaClient) => {
        const logger = new Logger('SealingModule');
        const tsaReady = tsa.configured;

        // KMS path takes precedence — production sealing uses an
        // HSM-backed KMS key. The local-P12 path remains available
        // for development / e2e harnesses that don't have AWS creds.
        if (
          env.PDF_SIGNING_PROVIDER === 'kms' &&
          env.PDF_SIGNING_KMS_KEY_ID &&
          env.PDF_SIGNING_KMS_REGION &&
          (env.PDF_SIGNING_KMS_CERT_PEM || env.PDF_SIGNING_KMS_CERT_PEM_PATH)
        ) {
          logger.log(
            `PadesSigner: KmsPadesSigner (key=${env.PDF_SIGNING_KMS_KEY_ID} region=${env.PDF_SIGNING_KMS_REGION}; TSA=${tsaReady ? 'enabled, PAdES-B-T' : 'disabled, PAdES-B-B only'})`,
          );
          return new KmsPadesSigner(env, tsaReady ? tsa : null);
        }

        const p12Path = env.PDF_SIGNING_LOCAL_P12_PATH;
        if (
          env.PDF_SIGNING_PROVIDER === 'local' &&
          p12Path &&
          env.PDF_SIGNING_LOCAL_P12_PASS &&
          existsSync(p12Path)
        ) {
          logger.log(
            `PadesSigner: P12PadesSigner (p12=${p12Path}; TSA=${tsaReady ? 'enabled, PAdES-B-T' : 'disabled, PAdES-B-B only'})`,
          );
          return new P12PadesSigner(env, tsaReady ? tsa : null);
        }
        logger.warn(
          'PadesSigner: NoopPadesSigner (no provider configured — sealed.pdf will have burn-in + sha256 but no CMS signature)',
        );
        return new NoopPadesSigner();
      },
      inject: [APP_ENV, TsaClient],
    },
  ],
  exports: [SealingService, PadesSigner, TsaClient, DssInjector, RevocationFetcher],
})
export class SealingModule {}
