import { Module } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailModule } from '../email/email.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { DssInjector } from './dss-injector';
import { PadesSigner } from './pades-signer';
import { selectPadesSigner } from './pades-signer-selection';
import { RevocationFetcher } from './revocation-fetcher';
import { SealSweepPgRepository } from './seal-sweep.repository.pg';
import { SealSweepRepository, SealSweepService } from './seal-sweep.service';
import { SealingService } from './sealing.service';
import { TsaClient } from './tsa-client';
import { WorkerService } from './worker.service';

// Signer selection lives in its own file so the seal-worker Edge Function
// can use it without pulling in this module's imports.
export { selectPadesSigner, type SignerSelectionLogger } from './pades-signer-selection';

/**
 * Sealing module — orchestrates the background pipeline that turns
 * `sealing` envelopes into `completed` ones (with a PAdES-signed sealed.pdf
 * and an audit.pdf). Depends on EnvelopesRepository + StorageService +
 * OutboundEmailsRepository from other modules, all of which are provided as
 * @Global().
 *
 * PadesSigner selection is runtime-config-driven and fails loudly on a
 * misconfiguration; see `selectPadesSigner`. Production deploys MUST use
 * the KMS path (cryptography-expert §8 — private keys stay in HSM-backed
 * KMS).
 */
@Module({
  imports: [EnvelopesModule, EmailModule],
  providers: [
    SealingService,
    WorkerService,
    SealSweepService,
    { provide: SealSweepRepository, useClass: SealSweepPgRepository },
    TsaClient,
    RevocationFetcher,
    DssInjector,
    {
      provide: PadesSigner,
      useFactory: (env: AppEnv, tsa: TsaClient) => selectPadesSigner(env, tsa),
      inject: [APP_ENV, TsaClient],
    },
  ],
  exports: [
    SealingService,
    SealSweepService,
    PadesSigner,
    TsaClient,
    DssInjector,
    RevocationFetcher,
  ],
})
export class SealingModule {}
