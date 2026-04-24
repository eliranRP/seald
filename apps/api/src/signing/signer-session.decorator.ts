import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { RequestWithSignerSession, SignerSessionContext } from './signer-session.guard';

/**
 * Controller param shorthand — extracts `req.signerSession` placed there by
 * SignerSessionGuard. Any route using this decorator MUST also declare
 * `@UseGuards(SignerSessionGuard)` or the param will be undefined.
 */
export const SignerSession = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): SignerSessionContext => {
    const req = ctx.switchToHttp().getRequest<RequestWithSignerSession>();
    if (!req.signerSession) {
      // Defensive — guard should run first and throw.
      throw new Error('SignerSession decorator used without SignerSessionGuard');
    }
    return req.signerSession;
  },
);
