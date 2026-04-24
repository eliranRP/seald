import { existsSync } from 'node:fs';
import { Logger, Module } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailModule } from '../email/email.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { NoopPadesSigner, P12PadesSigner, PadesSigner } from './pades-signer';
import { SealingService } from './sealing.service';
import { WorkerService } from './worker.service';

/**
 * Sealing module — orchestrates the background pipeline that turns
 * `sealing` envelopes into `completed` ones (with a PAdES-signed sealed.pdf
 * and an audit.pdf). Depends on EnvelopesRepository + StorageService +
 * OutboundEmailsRepository from other modules, all of which are provided as
 * @Global().
 *
 * PadesSigner selection is runtime-config-driven:
 *   - If PDF_SIGNING_PROVIDER=local AND the P12 file exists → real signing.
 *   - Otherwise → passthrough (NoopPadesSigner).
 *
 * This way a single image can start as passthrough in staging (no P12
 * provisioned) and flip to real signing by dropping the P12 file in +
 * restarting.
 */
@Module({
  imports: [EnvelopesModule, EmailModule],
  providers: [
    SealingService,
    WorkerService,
    {
      provide: PadesSigner,
      useFactory: (env: AppEnv) => {
        const logger = new Logger('SealingModule');
        const p12Path = env.PDF_SIGNING_LOCAL_P12_PATH;
        if (
          env.PDF_SIGNING_PROVIDER === 'local' &&
          p12Path &&
          env.PDF_SIGNING_LOCAL_P12_PASS &&
          existsSync(p12Path)
        ) {
          logger.log(`PadesSigner: P12PadesSigner (p12=${p12Path})`);
          return new P12PadesSigner(env);
        }
        logger.warn(
          'PadesSigner: NoopPadesSigner (PDF_SIGNING_LOCAL_P12_* unset or file missing — sealed.pdf will have burn-in + sha256 but no CMS signature)',
        );
        return new NoopPadesSigner();
      },
      inject: [APP_ENV],
    },
  ],
  exports: [SealingService, PadesSigner],
})
export class SealingModule {}
