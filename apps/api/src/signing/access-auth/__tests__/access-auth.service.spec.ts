import { HttpException } from '@nestjs/common';
import { ACCESS_CODE_POLICY } from 'shared';
import type { AppEnv } from '../../../config/env.schema';
import type { Envelope, EnvelopeSigner } from '../../../envelopes/envelopes.repository';
import { InMemoryAccessAuthRepository } from '../../../../test/in-memory-access-auth-repository';
import { InMemoryEnvelopesRepository } from '../../../../test/in-memory-envelopes-repository';
import { InMemoryOutboundEmailsRepository } from '../../../../test/in-memory-outbound-emails-repository';
import { setFlag } from '../../../../test/pades-e2e-harness';
import { AccessAuthService, AccessCodeThrottledException } from '../access-auth.service';
import { AccessCodeMinter } from '../access-code-minter.service';

const OWNER = '00000000-0000-4000-8000-00000000000a';
const ENV = {
  APP_PUBLIC_URL: 'https://seald.example',
  SIGNER_OTP_KEY: 'o'.repeat(48),
} as AppEnv;

async function slug(p: Promise<unknown>): Promise<{ status: number; slug: string }> {
  try {
    await p;
  } catch (err) {
    if (err instanceof HttpException) {
      return { status: err.getStatus(), slug: String(err.message) };
    }
    throw err;
  }
  throw new Error('expected a rejection');
}

describe('AccessAuthService — code lifecycle (WP-10)', () => {
  let envelopes: InMemoryEnvelopesRepository;
  let outbound: InMemoryOutboundEmailsRepository;
  let repo: InMemoryAccessAuthRepository;
  let svc: AccessAuthService;
  let minter: AccessCodeMinter;
  let envelope: Envelope;
  let signer: EnvelopeSigner;

  beforeAll(() => setFlag('signerAccessAuth', true));
  afterAll(() => setFlag('signerAccessAuth', undefined));
  afterEach(() => jest.useRealTimers());

  beforeEach(async () => {
    envelopes = new InMemoryEnvelopesRepository();
    outbound = new InMemoryOutboundEmailsRepository();
    repo = new InMemoryAccessAuthRepository(envelopes);
    svc = new AccessAuthService(repo, envelopes, outbound, ENV);
    minter = new AccessCodeMinter(repo, ENV);
    const draft = await envelopes.createDraft({
      owner_id: OWNER,
      title: 'Lease',
      short_code: `sc${Math.random().toString(36).slice(2, 13)}`,
      tc_version: 't',
      privacy_version: 'p',
      expires_at: new Date(Date.now() + 7 * 86400_000).toISOString(),
    });
    await envelopes.addSigner(draft.id, {
      email: 'jane@example.com',
      name: 'Jane',
      color: '#112233',
    });
    await svc.patchSettings(OWNER, draft.id, {
      access_auth: 'email_otp',
      action_auth: 'email_otp',
    });
    const sent = await envelopes.sendDraft({
      envelope_id: draft.id,
      sender_email: 'owner@example.com',
      sender_name: 'Owner',
    });
    if (!sent) throw new Error('send failed');
    envelope = sent;
    signer = sent.signers[0]!;
  });

  /** Queue a code, then dispatch it the way the worker does. */
  async function sendAndDispatch(purpose: 'access' | 'action' = 'access'): Promise<string> {
    await svc.sendCode(envelope, signer, purpose, '203.0.113.5', 'jest');
    const row = outbound.rows[outbound.rows.length - 1]!;
    const minted = await minter.mint(row);
    if (!minted) throw new Error('mint refused');
    return String(minted['code']);
  }

  function wrong(code: string): string {
    return code === '000000' ? '000001' : '000000';
  }

  async function eventTypes(): Promise<string[]> {
    return (await envelopes.listEventsForEnvelope(envelope.id)).map((e) => e.event_type);
  }

  it('stores no code at rest: the outbox holds the challenge id, the table an HMAC', async () => {
    const code = await sendAndDispatch();
    const row = outbound.rows[0]!;
    expect(row.kind).toBe('access_code');
    expect(row.to_email).toBe('jane@example.com');
    expect(JSON.stringify(row.payload)).not.toContain(code);
    expect(row.payload['challenge_id']).toBe(repo.challenges[0]!.id);
    expect(repo.challenges[0]!.code_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(repo.challenges[0]!.code_hash).not.toContain(code);
    expect(await eventTypes()).toContain('access_code_sent');
    const sentEvent = (await envelopes.listEventsForEnvelope(envelope.id)).find(
      (e) => e.event_type === 'access_code_sent',
    );
    expect(sentEvent?.metadata).toEqual({
      method: 'email_otp',
      purpose: 'access',
      to_masked: 'j***@example.com',
    });
  });

  it('accepts the right code once, records it, and refuses a replay', async () => {
    const code = await sendAndDispatch();
    await expect(svc.verifyCode(envelope, signer, 'access', code, null, null)).resolves.toBe(
      undefined,
    );
    expect(repo.verificationChecks.get(signer.id)).toEqual(['email_otp']);
    expect(await eventTypes()).toContain('access_code_verified');
    expect(await slug(svc.verifyCode(envelope, signer, 'access', code, null, null))).toEqual({
      status: 409,
      slug: 'access_code_not_requested',
    });
  });

  it('refuses a code before one was sent', async () => {
    expect(await slug(svc.verifyCode(envelope, signer, 'access', '123456', null, null))).toEqual({
      status: 409,
      slug: 'access_code_not_requested',
    });
  });

  it('expires a code after 10 minutes', async () => {
    const code = await sendAndDispatch();
    repo.age(signer.id, ACCESS_CODE_POLICY.ttlSeconds * 1000);
    expect(await slug(svc.verifyCode(envelope, signer, 'access', code, null, null))).toEqual({
      status: 410,
      slug: 'access_code_expired',
    });
  });

  it('locks after 5 wrong codes; even the right code then needs a new send', async () => {
    const code = await sendAndDispatch();
    for (let i = 1; i < ACCESS_CODE_POLICY.maxAttempts; i++) {
      expect(
        await slug(svc.verifyCode(envelope, signer, 'access', wrong(code), null, null)),
      ).toEqual({ status: 422, slug: 'access_code_invalid' });
    }
    expect(await slug(svc.verifyCode(envelope, signer, 'access', wrong(code), null, null))).toEqual(
      {
        status: 423,
        slug: 'access_code_locked',
      },
    );
    expect(await slug(svc.verifyCode(envelope, signer, 'access', code, null, null))).toEqual({
      status: 423,
      slug: 'access_code_locked',
    });
    const failed = (await envelopes.listEventsForEnvelope(envelope.id)).filter(
      (e) => e.event_type === 'access_code_failed',
    );
    expect(failed).toHaveLength(ACCESS_CODE_POLICY.maxAttempts);
    expect(failed[failed.length - 1]!.metadata).toMatchObject({ reason: 'locked', attempts: 5 });

    // A new code (after the cooldown) works.
    repo.age(signer.id, 61_000);
    const fresh = await sendAndDispatch();
    await expect(svc.verifyCode(envelope, signer, 'access', fresh, null, null)).resolves.toBe(
      undefined,
    );
  });

  it('a new send replaces the old code', async () => {
    const first = await sendAndDispatch();
    repo.age(signer.id, 61_000);
    const second = await sendAndDispatch();
    if (first !== second) {
      expect(await slug(svc.verifyCode(envelope, signer, 'access', first, null, null))).toEqual({
        status: 422,
        slug: 'access_code_invalid',
      });
    }
    await expect(svc.verifyCode(envelope, signer, 'access', second, null, null)).resolves.toBe(
      undefined,
    );
    // The replaced challenge can no longer be minted (a late retry of its mail is skipped).
    expect(await minter.mint(outbound.rows[0]!)).toBeNull();
  });

  it('enforces the resend cooldown and the hourly cap with Retry-After seconds', async () => {
    await svc.sendCode(envelope, signer, 'access', null, null);
    const cooldown = await svc.sendCode(envelope, signer, 'access', null, null).catch((e) => e);
    expect(cooldown).toBeInstanceOf(AccessCodeThrottledException);
    expect(cooldown.getStatus()).toBe(429);
    expect(cooldown.message).toBe('access_code_cooldown');
    expect(cooldown.retryAfterSeconds).toBeGreaterThan(0);
    for (let i = 1; i < ACCESS_CODE_POLICY.maxSendsPerHour; i++) {
      repo.age(signer.id, 61_000);
      await svc.sendCode(envelope, signer, i % 2 ? 'action' : 'access', null, null);
    }
    repo.age(signer.id, 61_000);
    const capped = await svc.sendCode(envelope, signer, 'access', null, null).catch((e) => e);
    expect(capped).toBeInstanceOf(AccessCodeThrottledException);
    expect(capped.message).toBe('access_code_rate_limited');
    expect(outbound.rows).toHaveLength(ACCESS_CODE_POLICY.maxSendsPerHour);
  });

  it('keeps access and action codes apart', async () => {
    const access = await sendAndDispatch('access');
    repo.age(signer.id, 61_000);
    const action = await sendAndDispatch('action');
    await expect(svc.verifyCode(envelope, signer, 'action', action, null, null)).resolves.toBe(
      undefined,
    );
    await expect(svc.verifyCode(envelope, signer, 'access', access, null, null)).resolves.toBe(
      undefined,
    );
  });

  it('assertActionCode: 428 without a code, passes with a fresh one', async () => {
    expect(await slug(svc.assertActionCode(envelope, signer, undefined, null, null))).toEqual({
      status: 428,
      slug: 'access_code_required',
    });
    const code = await sendAndDispatch('action');
    await expect(svc.assertActionCode(envelope, signer, code, null, null)).resolves.toBe(undefined);
  });

  it('does not mint once the signer can no longer sign', async () => {
    await svc.sendCode(envelope, signer, 'access', null, null);
    const env = envelopes.envelopes.get(envelope.id)!;
    envelopes.envelopes.set(envelope.id, { ...env, status: 'canceled' });
    expect(await minter.mint(outbound.rows[0]!)).toBeNull();
  });

  it('refuses a send for a signer that needs no code', async () => {
    const env = envelopes.envelopes.get(envelope.id)!;
    envelopes.envelopes.set(envelope.id, { ...env, status: 'draft' });
    await svc.patchSettings(OWNER, envelope.id, {
      signers: [{ signer_id: signer.id, access_auth: 'none', action_auth: 'none' }],
    });
    envelopes.envelopes.set(envelope.id, { ...env, status: 'awaiting_others' });
    expect(await slug(svc.sendCode(envelope, signer, 'access', null, null))).toEqual({
      status: 409,
      slug: 'access_auth_not_required',
    });
    await expect(svc.assertActionCode(envelope, signer, undefined, null, null)).resolves.toBe(
      undefined,
    );
  });

  it('settings: draft only, unknown signer rejected, null inherits', async () => {
    expect(await slug(svc.patchSettings(OWNER, envelope.id, { access_auth: 'none' }))).toEqual({
      status: 409,
      slug: 'envelope_not_draft',
    });
    const env = envelopes.envelopes.get(envelope.id)!;
    envelopes.envelopes.set(envelope.id, { ...env, status: 'draft' });
    expect(
      await slug(
        svc.patchSettings(OWNER, envelope.id, {
          signers: [{ signer_id: OWNER, access_auth: 'none' }],
        }),
      ),
    ).toEqual({ status: 400, slug: 'validation_error' });
    const out = await svc.patchSettings(OWNER, envelope.id, {
      access_auth: 'none',
      signers: [{ signer_id: signer.id, access_auth: 'email_otp' }],
    });
    expect(out.signers[0]).toEqual({
      signer_id: signer.id,
      access_auth: 'email_otp',
      action_auth: null,
      effective_access_auth: 'email_otp',
      effective_action_auth: 'email_otp',
    });
    const cleared = await svc.patchSettings(OWNER, envelope.id, {
      signers: [{ signer_id: signer.id, access_auth: null }],
    });
    expect(cleared.signers[0]?.effective_access_auth).toBe('none');
    expect(
      await slug(svc.getSettings('00000000-0000-4000-8000-0000000000bb', envelope.id)),
    ).toEqual({ status: 404, slug: 'envelope_not_found' });
  });

  it('is inert while the flag is off', async () => {
    setFlag('signerAccessAuth', false);
    try {
      expect(await svc.requires(envelope, signer, 'access')).toBe(false);
      await expect(svc.assertActionCode(envelope, signer, undefined, null, null)).resolves.toBe(
        undefined,
      );
    } finally {
      setFlag('signerAccessAuth', true);
    }
  });

  it('answers 503 without SIGNER_OTP_KEY', async () => {
    const keyless = new AccessAuthService(repo, envelopes, outbound, {
      ...ENV,
      SIGNER_OTP_KEY: undefined,
    } as AppEnv);
    expect(await slug(keyless.sendCode(envelope, signer, 'access', null, null))).toEqual({
      status: 503,
      slug: 'access_code_unavailable',
    });
  });
});
