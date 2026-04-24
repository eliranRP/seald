import {
  ConflictException,
  GoneException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Envelope, EnvelopeSigner } from '../envelopes/envelopes.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { SignerSessionService } from './signer-session.service';
import { SigningTokenService } from './signing-token.service';

export interface StartSessionResult {
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly requires_tc_accept: boolean;
  /** The session JWT to set as an HttpOnly cookie on the response. */
  readonly session_jwt: string;
}

/**
 * Recipient-side orchestration for `/sign/*` routes. This service is the
 * counterpart to EnvelopesService (sender) but operates on narrowly-scoped
 * signer sessions rather than full owner context.
 *
 * Only `startSession` lives here for Task 17. `acceptTerms`, `fillField`,
 * `setSignature`, `submit`, and `decline` land in subsequent tasks.
 */
@Injectable()
export class SigningService {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly tokens: SigningTokenService,
    private readonly session: SignerSessionService,
  ) {}

  async startSession(envelope_id: string, token: string): Promise<StartSessionResult> {
    // Hash at the boundary; plaintext never persists.
    const hash = this.tokens.hash(token);
    const found = await this.repo.findSignerByAccessTokenHash(hash);
    if (!found) {
      throw new UnauthorizedException('invalid_token');
    }
    const { envelope, signer } = found;

    // Guard against token-guess across envelopes: the token must belong to
    // the envelope in the request body. The hash lookup alone is sufficient
    // (hashes are collision-free for our purposes) but this double-check
    // surfaces mismatched URLs clearly.
    if (envelope.id !== envelope_id) {
      throw new UnauthorizedException('invalid_token');
    }

    assertStillSignable(envelope, signer);

    const session_jwt = await this.session.mint({
      envelope_id: envelope.id,
      signer_id: signer.id,
    });

    return {
      envelope_id: envelope.id,
      signer_id: signer.id,
      // Always true at start for MVP. /sign/accept-terms is idempotent, so
      // a re-click is a no-op; /sign/me (Task 18) will return the authoritative
      // tc state so the FE can skip the gate if already accepted.
      requires_tc_accept: true,
      session_jwt,
    };
  }
}

function assertStillSignable(envelope: Envelope, signer: EnvelopeSigner): void {
  if (envelope.status !== 'awaiting_others') {
    throw new GoneException('envelope_terminal');
  }
  if (signer.signed_at !== null) {
    throw new ConflictException('already_signed');
  }
  if (signer.declined_at !== null) {
    throw new ConflictException('already_declined');
  }
}
