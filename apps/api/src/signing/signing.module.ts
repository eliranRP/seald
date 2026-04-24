import { Global, Module } from '@nestjs/common';
import { SigningTokenService } from './signing-token.service';

/**
 * @Global() so both the envelopes service (sender-side — generates tokens
 * at `/envelopes/:id/send` time) and the signing service (Phase 3d, signer
 * session handling) can inject SigningTokenService without importing
 * SigningModule.
 *
 * Additional members (SignerSessionService, SignerSessionGuard) will land
 * here in Phase 3d.
 */
@Global()
@Module({
  providers: [SigningTokenService],
  exports: [SigningTokenService],
})
export class SigningModule {}
