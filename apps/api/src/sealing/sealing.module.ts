import { Module } from '@nestjs/common';
import { EmailModule } from '../email/email.module';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { NoopPadesSigner, PadesSigner } from './pades-signer';
import { SealingService } from './sealing.service';
import { WorkerService } from './worker.service';

/**
 * Sealing module — orchestrates the background pipeline that turns
 * `sealing` envelopes into `completed` ones (with a PAdES-signed sealed.pdf
 * and an audit.pdf). Depends on EnvelopesRepository + StorageService +
 * OutboundEmailsRepository from other modules, all of which are provided as
 * @Global().
 *
 * PadesSigner defaults to NoopPadesSigner. Swap in a P12-backed impl via a
 * provider override once a production keypair is provisioned.
 */
@Module({
  imports: [EnvelopesModule, EmailModule],
  providers: [SealingService, WorkerService, { provide: PadesSigner, useClass: NoopPadesSigner }],
  exports: [SealingService, PadesSigner],
})
export class SealingModule {}
