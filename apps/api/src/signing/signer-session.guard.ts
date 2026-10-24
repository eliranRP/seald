import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { parse as parseCookies } from 'cookie';
import type { Request } from 'express';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import type { Envelope, EnvelopeSigner } from '../envelopes/envelopes.repository';
import {
  SIGNER_SESSION_COOKIE,
  SignerSessionService,
  SignerSessionVerifyError,
} from './signer-session.service';
import { isSignersTurn } from './signing-order';
import { notYourTurn, terminalGone } from './link-state';

/**
 * Shape attached to `req` after successful authentication. Signer endpoints
 * read `req.signerSession` via a small helper decorator in the controller.
 */
export interface SignerSessionContext {
  readonly envelope: Envelope;
  readonly signer: EnvelopeSigner;
}

export interface RequestWithSignerSession extends Request {
  signerSession?: SignerSessionContext;
}

/**
 * Guards every `/sign/*` route except `POST /sign/start` (the exchange that
 * ISSUES the cookie). Validates cookie JWT, re-reads envelope + signer state
 * on every request (cheap — can't afford to cache given our state-machine
 * invariants), and maps each failure to a precise 4xx.
 *
 * Failure mapping:
 *   missing cookie                  → 401 missing_signer_session
 *   bad/expired JWT                 → 401 invalid_signer_session
 *   claims reference missing rows   → 401 invalid_signer_session
 *   envelope now terminal           → 410 envelope_terminal
 *   signer already signed/declined  → 410 envelope_terminal
 *   sequential step not active yet  → 409 not_your_turn (WP-05)
 */
@Injectable()
export class SignerSessionGuard implements CanActivate {
  constructor(
    private readonly session: SignerSessionService,
    private readonly repo: EnvelopesRepository,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<RequestWithSignerSession>();
    const cookieHeader = req.headers['cookie'];
    if (!cookieHeader) {
      throw new UnauthorizedException('missing_signer_session');
    }
    const jar = parseCookies(cookieHeader);
    const jwt = jar[SIGNER_SESSION_COOKIE];
    if (!jwt) {
      throw new UnauthorizedException('missing_signer_session');
    }

    let claims: { envelope_id: string; signer_id: string };
    try {
      claims = await this.session.verify(jwt);
    } catch (err) {
      if (err instanceof SignerSessionVerifyError) {
        throw new UnauthorizedException('invalid_signer_session');
      }
      throw err;
    }

    const envelope = await this.repo.findByIdWithAll(claims.envelope_id);
    if (!envelope) {
      throw new UnauthorizedException('invalid_signer_session');
    }
    const signer = envelope.signers.find((s) => s.id === claims.signer_id);
    if (!signer) {
      throw new UnauthorizedException('invalid_signer_session');
    }
    if (envelope.status !== 'awaiting_others') {
      throw terminalGone(envelope, signer);
    }
    if (signer.signed_at !== null || signer.declined_at !== null) {
      throw terminalGone(envelope, signer);
    }
    // WP-05: a later sequential step cannot act before its turn.
    if (!isSignersTurn(envelope.delivery_mode, envelope.signers, signer.id)) {
      throw notYourTurn(envelope);
    }

    req.signerSession = { envelope, signer };
    return true;
  }
}
