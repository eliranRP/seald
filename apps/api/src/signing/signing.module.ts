import { forwardRef, Global, Module } from '@nestjs/common';
import { EnvelopesModule } from '../envelopes/envelopes.module';
import { SignerSessionGuard } from './signer-session.guard';
import { SignerSessionService } from './signer-session.service';
import { SigningController } from './signing.controller';
import { SigningOrderController } from './signing-order.controller';
import { SigningOrderService } from './signing-order.service';
import { SigningService } from './signing.service';
import { SigningTokenService } from './signing-token.service';

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
  controllers: [SigningController, SigningOrderController],
  providers: [
    SigningTokenService,
    SignerSessionService,
    SignerSessionGuard,
    SigningService,
    SigningOrderService,
  ],
  exports: [
    SigningTokenService,
    SignerSessionService,
    SignerSessionGuard,
    SigningService,
    SigningOrderService,
  ],
})
export class SigningModule {}
