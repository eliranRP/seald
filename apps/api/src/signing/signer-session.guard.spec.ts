import { type ExecutionContext, GoneException, UnauthorizedException } from '@nestjs/common';
import type { AppEnv } from '../config/env.schema';
import type { Envelope, EnvelopesRepository } from '../envelopes/envelopes.repository';
import { makeEnvelope, makeSigner } from '../../test/factories';
import { SIGNER_SESSION_COOKIE, SignerSessionService } from './signer-session.service';
import { type RequestWithSignerSession, SignerSessionGuard } from './signer-session.guard';

/**
 * SignerSessionGuard unit tests — every failure mode + the happy path.
 *
 * The guard is doubly-defensive: even after the JWT validates, it re-reads
 * the envelope/signer state on every request because terminal-state
 * transitions can happen in-flight (cancel, decline, expire). These tests
 * pin every branch of that re-read.
 */

const ENV_ID = '00000000-0000-0000-0000-0000000000aa';
const SIGNER_ID = '00000000-0000-0000-0000-0000000000bb';

const SECRET_ENV: AppEnv = {
  SIGNER_SESSION_SECRET: 'x'.repeat(64),
} as AppEnv;

function freshEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return makeEnvelope({
    id: ENV_ID,
    status: 'awaiting_others',
    signers: [
      makeSigner({
        id: SIGNER_ID,
        signed_at: null,
        declined_at: null,
      }),
    ],
    ...overrides,
  });
}

function makeContext(headers: Record<string, string>): {
  ctx: ExecutionContext;
  req: RequestWithSignerSession;
} {
  const req = { headers } as unknown as RequestWithSignerSession;
  const ctx = {
    switchToHttp: () => ({ getRequest: <T>() => req as unknown as T }),
  } as unknown as ExecutionContext;
  return { ctx, req };
}

function buildGuard(opts: {
  findByIdWithAll?: EnvelopesRepository['findByIdWithAll'];
  session?: SignerSessionService;
}): { guard: SignerSessionGuard; session: SignerSessionService } {
  const session = opts.session ?? new SignerSessionService(SECRET_ENV);
  const repo: Partial<EnvelopesRepository> = {
    async findByIdWithAll(envelope_id: string) {
      return opts.findByIdWithAll ? opts.findByIdWithAll(envelope_id) : null;
    },
  };
  const guard = new SignerSessionGuard(session, repo as EnvelopesRepository);
  return { guard, session };
}

async function mintCookie(session: SignerSessionService): Promise<string> {
  const jwt = await session.mint({ envelope_id: ENV_ID, signer_id: SIGNER_ID });
  return `${SIGNER_SESSION_COOKIE}=${jwt}`;
}

describe('SignerSessionGuard', () => {
  it('401 missing_signer_session when no Cookie header is present', async () => {
    const { guard } = buildGuard({});
    const { ctx } = makeContext({});
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 missing_signer_session when the seald_sign cookie is absent from the jar', async () => {
    const { guard } = buildGuard({});
    const { ctx } = makeContext({ cookie: 'other=cookie; foo=bar' });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 invalid_signer_session when the JWT is malformed', async () => {
    const { guard } = buildGuard({});
    const { ctx } = makeContext({
      cookie: `${SIGNER_SESSION_COOKIE}=not.a.real.jwt`,
    });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 invalid_signer_session when the envelope referenced in the claims no longer exists', async () => {
    const session = new SignerSessionService(SECRET_ENV);
    const { guard } = buildGuard({
      session,
      async findByIdWithAll() {
        return null;
      },
    });
    const cookie = await mintCookie(session);
    const { ctx } = makeContext({ cookie });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('401 invalid_signer_session when the signer referenced in the claims is missing', async () => {
    const session = new SignerSessionService(SECRET_ENV);
    const { guard } = buildGuard({
      session,
      async findByIdWithAll() {
        return makeEnvelope({
          id: ENV_ID,
          status: 'awaiting_others',
          signers: [makeSigner({ id: '11111111-1111-4111-8111-111111111111' })],
        });
      },
    });
    const cookie = await mintCookie(session);
    const { ctx } = makeContext({ cookie });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('410 envelope_terminal when the envelope status is no longer awaiting_others', async () => {
    const session = new SignerSessionService(SECRET_ENV);
    const { guard } = buildGuard({
      session,
      async findByIdWithAll() {
        return freshEnvelope({ status: 'declined' });
      },
    });
    const cookie = await mintCookie(session);
    const { ctx } = makeContext({ cookie });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(GoneException);
  });

  it('410 envelope_terminal when the signer has already signed mid-session', async () => {
    const session = new SignerSessionService(SECRET_ENV);
    const { guard } = buildGuard({
      session,
      async findByIdWithAll() {
        return freshEnvelope({
          signers: [makeSigner({ id: SIGNER_ID, signed_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    const cookie = await mintCookie(session);
    const { ctx } = makeContext({ cookie });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(GoneException);
  });

  it('410 envelope_terminal when the signer has already declined mid-session', async () => {
    const session = new SignerSessionService(SECRET_ENV);
    const { guard } = buildGuard({
      session,
      async findByIdWithAll() {
        return freshEnvelope({
          signers: [makeSigner({ id: SIGNER_ID, declined_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    const cookie = await mintCookie(session);
    const { ctx } = makeContext({ cookie });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(GoneException);
  });

  it('happy path — attaches { envelope, signer } to req.signerSession and returns true', async () => {
    const session = new SignerSessionService(SECRET_ENV);
    const env = freshEnvelope();
    const { guard } = buildGuard({
      session,
      async findByIdWithAll() {
        return env;
      },
    });
    const cookie = await mintCookie(session);
    const { ctx, req } = makeContext({ cookie });
    const ok = await guard.canActivate(ctx);
    expect(ok).toBe(true);
    expect(req.signerSession).toBeDefined();
    expect(req.signerSession?.envelope.id).toBe(ENV_ID);
    expect(req.signerSession?.signer.id).toBe(SIGNER_ID);
  });

  it('rethrows non-SignerSessionVerifyError errors raised by the verifier untouched', async () => {
    // Construct a session service whose verify() throws an arbitrary
    // non-SignerSessionVerifyError so the guard's catch path falls through.
    class ExplodingSession extends SignerSessionService {
      override async verify(): Promise<never> {
        throw new Error('boom');
      }
    }
    const session = new ExplodingSession(SECRET_ENV);
    const { guard } = buildGuard({
      session,
      async findByIdWithAll() {
        return freshEnvelope();
      },
    });
    const cookie = await mintCookie(new SignerSessionService(SECRET_ENV));
    const { ctx } = makeContext({ cookie });
    await expect(guard.canActivate(ctx)).rejects.toThrow('boom');
  });
});
