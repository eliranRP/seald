import { forwardRef, Global, Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { AccessAuthSettingsController } from './access-auth/access-auth-settings.controller';
import { AccessAuthRepository } from './access-auth/access-auth.repository';
import { AccessAuthPgRepository } from './access-auth/access-auth.repository.pg';
import { AccessAuthService } from './access-auth/access-auth.service';
import { AccessCodeMinter } from './access-auth/access-code-minter.service';
import { AccessCodeSessionGuard } from './access-auth/access-code-session.guard';
import { AccessCodeController } from './access-auth/access-code.controller';
import { AccessPendingSessionService } from './access-auth/access-pending-session.service';
import { SignerSessionGuard } from './signer-session.guard';
import { SignerSessionService } from './signer-session.service';
import { SigningController } from './signing.controller';
import { SigningOrderController } from './signing-order.controller';
import { SigningOrderService } from './signing-order.service';
import { SigningService } from './signing.service';
import { SigningTokenService } from './signing-token.service';
import { StepSweepPgRepository } from './step-sweep.repository.pg';
import { StepSweepRepository, StepSweepService } from './step-sweep.service';

/**
 * @Global() so the envelopes service (sender-side) + signing service
 * (recipient-side) + session guard all share the session + token
 * primitives without importing SigningModule.
 *
 * EnvelopesModule is imported (forwardRef because EnvelopesModule consumes
 * SigningTokenService via @Global — Nest handles the cycle cleanly with
 * forwardRef) so the guard + signing service can inject
 * EnvelopesRepository to re-validate state on every request.
 */
@Global()
@Module({
  imports: [forwardRef(() => EnvelopesModule)],
  controllers: [
    SigningController,
    SigningOrderController,
    // WP-10, dark behind `signerAccessAuth`.
    AccessAuthSettingsController,
    AccessCodeController,
  ],
  providers: [
    SigningTokenService,
    SignerSessionService,
    SignerSessionGuard,
    SigningService,
    SigningOrderService,
    // WP-05 backstop for sequential steps whose invites were lost.
    StepSweepService,
    { provide: StepSweepRepository, useClass: StepSweepPgRepository },
    // WP-10 signer access code.
    AccessAuthService,
    AccessCodeMinter,
    AccessPendingSessionService,
    AccessCodeSessionGuard,
    { provide: AccessAuthRepository, useClass: AccessAuthPgRepository },
  ],
  exports: [
    SigningTokenService,
    SignerSessionService,
    SignerSessionGuard,
    SigningService,
    SigningOrderService,
    StepSweepService,
    AccessAuthService,
    AccessCodeMinter,
    AccessAuthRepository,
  ],
})
export class SigningModule {}
