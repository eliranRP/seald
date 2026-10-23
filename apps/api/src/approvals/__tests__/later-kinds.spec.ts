import { ConflictException } from '@nestjs/common';
import type { Envelope, McpEventMetadata } from 'shared';
import { computeSubjectHash } from '../subject-hash';
import type { ApprovalExecuteContext } from '../kinds/approval-kind';
import type { EnvelopeKindServices } from '../kinds/envelope-kinds';
import { envelopeChangeExpiryKind, envelopeFixSignerKind } from '../kinds/later-kinds';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const ENVELOPE = '11111111-1111-4111-8111-111111111111';
const SIGNER = '33333333-3333-4333-8333-333333333333';
const OTHER_SIGNER = '33333333-3333-4333-8333-333333333334';
const NOW = new Date('2026-10-02T12:00:00.000Z');
const MCP: McpEventMetadata = {
  auth: 'api_key',
  key_id: '99999999-9999-4999-8999-999999999999',
  key_prefix: 'seald_live_abcd',
  key_name: 'Key 2',
  oauth_client_id: null,
  oauth_grant_id: null,
  acting_for_user_id: OWNER,
  acting_for_email: 'owner@example.com',
  tool: 'envelopes_fix_signer',
  approval: 'email',
  approved_by_session: true,
};

function envelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    id: ENVELOPE,
    title: 'Lease',
    status: 'awaiting_others',
    expires_at: '2026-10-30T00:00:00.000Z',
    original_sha256: 'a'.repeat(64),
    original_pages: 2,
    fields: [],
    signers: [
      {
        id: SIGNER,
        name: 'Ada',
        email: 'Ada@Example.com',
        signed_at: null,
        declined_at: null,
      },
      {
        id: OTHER_SIGNER,
        name: 'Bob',
        email: 'bob@example.com',
        signed_at: null,
        declined_at: null,
      },
    ],
    ...overrides,
  } as unknown as Envelope;
}

function services(env: Envelope = envelope()) {
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const record =
    <T>(method: string, result: T) =>
    async (...args: unknown[]): Promise<T> => {
      calls.push({ method, args });
      return result;
    };
  const svc = {
    envelopes: {
      getById: record('getById', env),
      checkFixSigner: async (...args: unknown[]) => {
        calls.push({ method: 'checkFixSigner', args });
        const signer = env.signers.find((s) => s.id === args[2]);
        if (!signer) throw new Error('signer_not_found');
        if (signer.signed_at !== null) throw new ConflictException('signer_already_signed');
        return { envelope: env, signer };
      },
      fixSigner: record('fixSigner', {
        signer: { id: SIGNER },
        email_changed: true,
      }),
      checkChangeExpiry: record('checkChangeExpiry', env),
      changeExpiry: record('changeExpiry', {
        previous_expires_at: env.expires_at,
        expires_at: '2026-11-20T07:00:00.000Z',
      }),
    },
    documents: { list: record('list', [{ original_sha256: 'b'.repeat(64), original_pages: 2 }]) },
    guard: {},
    accessAuth: {},
  } as unknown as EnvelopeKindServices;
  return { svc, calls };
}

const ctx = { ownerId: OWNER, ownerEmail: 'owner@example.com', now: NOW, apiKeyId: MCP.key_id };
const execCtx = (mcp?: McpEventMetadata): ApprovalExecuteContext => ({
  ...ctx,
  approvalId: '44444444-4444-4444-8444-444444444444',
  audit: { ip: '203.0.113.9', user_agent: 'UA' },
  ...(mcp ? { mcp } : {}),
});

describe('envelope_fix_signer', () => {
  it('is high-risk and names the corrected signer as the recipient', async () => {
    const { svc } = services();
    const kind = envelopeFixSignerKind(svc);
    const args = kind.args.parse({
      envelope_id: ENVELOPE,
      signer_id: SIGNER,
      email: 'Ada@New.test',
    });
    expect(kind.highRisk(args)).toBe(true);
    expect(kind.ready).toBe(true);
    const subject = await kind.describe(args, ctx);
    expect(subject).toMatchObject({
      subjectKey: `envelope:${ENVELOPE}:signer:${SIGNER}`,
      envelopeId: ENVELOPE,
      recipients: [{ name: 'Ada', email: 'ada@new.test' }],
      pageCount: 2,
      extra: {
        signer_id: SIGNER,
        previous_email: 'ada@example.com',
        new_email: 'ada@new.test',
        previous_name: 'Ada',
        new_name: 'Ada',
      },
    });
  });

  it('binds the subject hash to the change and to who the signer is now', async () => {
    const args = envelopeFixSignerKind(services().svc).args.parse({
      envelope_id: ENVELOPE,
      signer_id: SIGNER,
      name: 'Ada L',
    });
    const hash = async (env: Envelope, a = args) => {
      const kind = envelopeFixSignerKind(services(env).svc);
      const d = await kind.describe(a, ctx);
      return computeSubjectHash({
        kind: 'envelope_fix_signer',
        recipients: d.recipients,
        pageCount: d.pageCount,
        keyName: 'Key 2',
        approverEmail: 'owner@example.com',
        destination: d.destination,
        files: d.files,
        fields: d.fields,
        ...(d.extra ? { extra: d.extra } : {}),
      });
    };
    const base = await hash(envelope());
    expect(await hash(envelope())).toBe(base);
    // The signer was renamed by someone else after the request: the approval is stale.
    const renamed = envelope();
    const signers = renamed.signers.map((s) => (s.id === SIGNER ? { ...s, name: 'Adeline' } : s));
    expect(await hash({ ...renamed, signers })).not.toBe(base);
    // A different change is a different subject.
    const other = envelopeFixSignerKind(services().svc).args.parse({
      envelope_id: ENVELOPE,
      signer_id: SIGNER,
      name: 'Ada M',
    });
    expect(await hash(envelope(), other)).not.toBe(base);
  });

  it('refuses the account’s own mailbox and a signer who signed', async () => {
    const { svc } = services();
    const kind = envelopeFixSignerKind(svc);
    await expect(
      kind.describe(
        kind.args.parse({ envelope_id: ENVELOPE, signer_id: SIGNER, email: 'OWNER@example.com' }),
        ctx,
      ),
    ).rejects.toThrow('signer_is_account_owner');
    const signed = envelope();
    const done = services({
      ...signed,
      signers: signed.signers.map((s) =>
        s.id === SIGNER ? { ...s, signed_at: NOW.toISOString() } : s,
      ),
    });
    await expect(
      envelopeFixSignerKind(done.svc).describe(
        kind.args.parse({ envelope_id: ENVELOPE, signer_id: SIGNER, name: 'X' }),
        ctx,
      ),
    ).rejects.toThrow('signer_already_signed');
  });

  it('needs at least one of name and email, and rejects unknown keys', () => {
    const kind = envelopeFixSignerKind(services().svc);
    expect(kind.args.safeParse({ envelope_id: ENVELOPE, signer_id: SIGNER }).success).toBe(false);
    expect(
      kind.args.safeParse({ envelope_id: ENVELOPE, signer_id: SIGNER, name: 'A', extra: 1 })
        .success,
    ).toBe(false);
  });

  it('execute runs the service with the decision’s audit, attribution and time', async () => {
    const { svc, calls } = services();
    const kind = envelopeFixSignerKind(svc);
    const args = kind.args.parse({ envelope_id: ENVELOPE, signer_id: SIGNER, name: 'Ada L' });
    expect(await kind.execute(args, execCtx(MCP))).toEqual({
      signer_id: SIGNER,
      email_changed: true,
    });
    const call = calls.find((c) => c.method === 'fixSigner');
    expect(call?.args).toEqual([
      OWNER,
      ENVELOPE,
      SIGNER,
      { name: 'Ada L', email: undefined },
      { ip: '203.0.113.9', user_agent: 'UA' },
      { mcp: MCP },
      NOW,
    ]);
  });
});

describe('envelope_change_expiry', () => {
  it('is high-risk and lists every signer, bound to the old and the new time', async () => {
    const { svc } = services();
    const kind = envelopeChangeExpiryKind(svc);
    const args = kind.args.parse({
      envelope_id: ENVELOPE,
      expires_at: '2026-11-20T09:00:00+02:00',
    });
    expect(kind.highRisk(args)).toBe(true);
    const subject = await kind.describe(args, ctx);
    expect(subject).toMatchObject({
      subjectKey: `envelope:${ENVELOPE}:expiry`,
      recipients: [
        { name: 'Ada', email: 'Ada@Example.com' },
        { name: 'Bob', email: 'bob@example.com' },
      ],
      extra: {
        previous_expires_at: '2026-10-30T00:00:00.000Z',
        expires_at: '2026-11-20T07:00:00.000Z',
      },
    });
  });

  it('execute moves the expiry with attribution', async () => {
    const { svc, calls } = services();
    const kind = envelopeChangeExpiryKind(svc);
    const args = kind.args.parse({ envelope_id: ENVELOPE, expires_at: '2026-11-20T07:00:00.000Z' });
    const mcp = { ...MCP, tool: 'envelopes_change_expiry' };
    expect(await kind.execute(args, execCtx(mcp))).toEqual({
      expires_at: '2026-11-20T07:00:00.000Z',
    });
    expect(calls.find((c) => c.method === 'changeExpiry')?.args).toEqual([
      OWNER,
      ENVELOPE,
      '2026-11-20T07:00:00.000Z',
      { ip: '203.0.113.9', user_agent: 'UA' },
      { mcp },
      NOW,
    ]);
  });

  it('rejects a time that is not ISO 8601', () => {
    const kind = envelopeChangeExpiryKind(services().svc);
    expect(kind.args.safeParse({ envelope_id: ENVELOPE, expires_at: 'tomorrow' }).success).toBe(
      false,
    );
  });
});
