import {
  type CanActivate,
  type ExecutionContext,
  GoneException,
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
      throw new GoneException('envelope_terminal');
    }
    if (signer.signed_at !== null || signer.declined_at !== null) {
      throw new GoneException('envelope_terminal');
    }

    req.signerSession = { envelope, signer };
    return true;
  }
}
