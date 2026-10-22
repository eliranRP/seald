import {
  type CanActivate,
  ConflictException,
  type ExecutionContext,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { parse as parseCookies } from 'cookie';
import { requireFlag } from '../../common/feature-flag.guard';
import { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import { SignerSessionGuard, type RequestWithSignerSession } from '../signer-session.guard';
import { isSignersTurn } from '../signing-order';
import {
  ACCESS_PENDING_COOKIE,
  AccessPendingSessionService,
} from './access-pending-session.service';

/**
 * Guards `/sign/access-code/*` (WP-10). Runs before the body pipe, so a
 * dark route is a plain 404.
 *
 *   - `purpose: 'action'` (re-verify before submit) needs a full signer
 *     session: it delegates to SignerSessionGuard.
 *   - anything else needs the pending cookie `/sign/start` set when it
 *     answered `access_code_required`. The envelope and signer are re-read
 *     with the same checks as SignerSessionGuard (terminal, already
 *     signed, sequential turn).
 *
 * Either way `req.signerSession` is set for the `@SignerSession()` param.
 */
@Injectable()
export class AccessCodeSessionGuard implements CanActivate {
  constructor(
    private readonly pending: AccessPendingSessionService,
    private readonly sessionGuard: SignerSessionGuard,
    private readonly repo: EnvelopesRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    requireFlag('signerAccessAuth');
    const req = ctx.switchToHttp().getRequest<RequestWithSignerSession>();
    const body: unknown = req.body;
    const purpose =
      body !== null && typeof body === 'object'
        ? (body as Record<string, unknown>)['purpose']
        : undefined;
    if (purpose === 'action') return this.sessionGuard.canActivate(ctx);

    const header = req.headers['cookie'];
    const jwt = header ? parseCookies(header)[ACCESS_PENDING_COOKIE] : undefined;
    if (!jwt) throw new UnauthorizedException('missing_signer_session');
    const claims = await this.pending.verify(jwt);
    if (!claims) throw new UnauthorizedException('invalid_signer_session');

    const envelope = await this.repo.findByIdWithAll(claims.envelope_id);
    const signer = envelope?.signers.find((s) => s.id === claims.signer_id);
    if (!envelope || !signer) throw new UnauthorizedException('invalid_signer_session');
    if (envelope.status !== 'awaiting_others') throw new GoneException('envelope_terminal');
    if (signer.signed_at !== null || signer.declined_at !== null) {
      throw new GoneException('envelope_terminal');
    }
    if (!isSignersTurn(envelope.delivery_mode, envelope.signers, signer.id)) {
      throw new ConflictException('not_your_turn');
    }
    req.signerSession = { envelope, signer };
    return true;
  }
}
