import { Global, Module } from '@nestjs/common';
import { SignerSessionService } from './signer-session.service';
import { SigningTokenService } from './signing-token.service';

/**
 * @Global() so the envelopes service (sender-side) + signing service
 * (recipient-side) + session guard all share these primitives without
 * importing SigningModule.
 */
@Global()
@Module({
  providers: [SigningTokenService, SignerSessionService],
  exports: [SigningTokenService, SignerSessionService],
})
export class SigningModule {}
