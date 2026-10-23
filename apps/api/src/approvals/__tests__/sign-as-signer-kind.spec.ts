import { ESIGN_DISCLOSURE_VERSION, type Envelope } from 'shared';
import type { EnvelopeDocumentsService } from '../../envelopes/documents/envelope-documents.service';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import type { AccessAuthService } from '../../signing/access-auth/access-auth.service';
import type { SigningService } from '../../signing/signing.service';
import type { ApprovalExecuteContext } from '../kinds/approval-kind';
import {
  decodeSignatureImage,
  envelopeSignAsSignerKind,
  planSignature,
  signingDate,
} from '../kinds/sign-as-signer-kind';

const OWNER = '00000000-0000-4000-8000-0000000000a1';
const ENV_ID = '11111111-1111-4111-8111-111111111111';
const ME = '33333333-3333-4333-8333-333333333333';
const ADA = '44444444-4444-4444-8444-444444444444';
const NOW = new Date('2026-10-23T12:00:00.000Z');
const OWNER_EMAIL = 'owner@example.com';
const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(16),
]).toString('base64');

type Field = Envelope['fields'][number];

function field(id: string, signer: string, kind: Field['kind'], over: Partial<Field> = {}): Field {
  return { id, signer_id: signer, kind, page: 1, x: 0.1, y: 0.1, required: true, ...over } as Field;
}

function signer(id: string, email: string, over: Partial<Envelope['signers'][number]> = {}) {
  return {
    id,
    email,
    name: id === ME ? 'Maya Owner' : 'Ada',
    color: '#112233',
    role: 'signatory' as const,
    signing_order: 1,
    status: 'awaiting' as const,
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
    ...over,
  };
}

function envelope(over: Partial<Envelope> = {}): Envelope {
  return {
    id: ENV_ID,
    owner_id: OWNER,
    title: 'NDA',
    status: 'awaiting_others',
    delivery_mode: 'parallel',
    original_pages: 1,
    original_sha256: 'a'.repeat(64),
    date_format: null,
    timezone: null,
    signers: [signer(ME, 'Owner@Example.com'), signer(ADA, 'ada@example.com')],
    fields: [
      field('f-sig', ME, 'signature'),
      field('f-date', ME, 'date'),
      field('f-ada', ADA, 'signature'),
    ],
    ...over,
  } as Envelope;
}

function world(env: Envelope = envelope(), access = { access: 'none', action: 'none' }) {
  const calls: Array<[string, Record<string, unknown> | undefined]> = [];
  let current = env;
  const meta = (args: unknown[]): Record<string, unknown> | undefined =>
    args.find(
      (a): a is Record<string, unknown> =>
        typeof a === 'object' && a !== null && 'via' in (a as Record<string, unknown>),
    );
  const signing = new Proxy(
    {},
    {
      get:
        (_t, method: string) =>
        async (...args: unknown[]) => {
          calls.push([method, meta(args)]);
          if (method === 'acceptTerms') {
            current = {
              ...current,
              signers: current.signers.map((s) =>
                s.id === ME ? { ...s, tc_accepted_at: NOW.toISOString() } : s,
              ),
            };
          }
          if (method === 'submit') return { status: 'submitted', envelope_status: 'sealing' };
          return undefined;
        },
    },
  ) as unknown as SigningService;
  const kind = envelopeSignAsSignerKind({
    envelopes: { getById: async () => current } as unknown as EnvelopesService,
    documents: { list: async () => [] } as unknown as EnvelopeDocumentsService,
    accessAuth: { effectiveFor: async () => access } as unknown as AccessAuthService,
    signing,
  });
  return { kind, calls };
}

const ctx = { ownerId: OWNER, ownerEmail: OWNER_EMAIL, now: NOW, apiKeyId: 'k' };
const consent = {
  esign_disclosure_version: ESIGN_DISCLOSURE_VERSION,
  record_access: true as const,
  intent_to_sign: true as const,
  signature: { image_base64: PNG, format: 'typed' as const, font: 'Caveat' },
};

describe('envelope_sign_as_signer kind (WP-45)', () => {
  it('describes only the account owner’s own signer row, session-only, 10-minute sign-in', async () => {
    const { kind } = world();
    const d = await kind.describe({ envelope_id: ENV_ID, signer_id: ME }, ctx);
    expect(d).toMatchObject({ signerId: ME, envelopeId: ENV_ID, recipients: [] });
    expect(d.facts?.[0]).toEqual({ label: 'Signing as', value: 'Maya Owner <Owner@Example.com>' });
    expect(kind.highRisk({ envelope_id: ENV_ID, signer_id: ME })).toBe(true);
    expect(kind.freshSignInSeconds).toBe(600);
    await expect(kind.describe({ envelope_id: ENV_ID, signer_id: ADA }, ctx)).rejects.toThrow(
      'signer_not_account_owner',
    );
  });

  it('refuses a signed, declined, terminal, out-of-turn or access-code signer', async () => {
    const args = { envelope_id: ENV_ID, signer_id: ME };
    const cases: Array<[Envelope, string]> = [
      [envelope({ status: 'completed' }), 'envelope_terminal'],
      [
        envelope({ signers: [signer(ME, OWNER_EMAIL, { signed_at: NOW.toISOString() })] }),
        'already_signed',
      ],
      [
        envelope({ signers: [signer(ME, OWNER_EMAIL, { declined_at: NOW.toISOString() })] }),
        'already_declined',
      ],
      [
        envelope({
          delivery_mode: 'sequential',
          signers: [
            signer(ADA, 'ada@example.com', { signing_order: 1 }),
            signer(ME, OWNER_EMAIL, { signing_order: 2 }),
          ],
        }),
        'not_your_turn',
      ],
    ];
    for (const [env, slug] of cases) {
      await expect(world(env).kind.describe(args, ctx)).rejects.toThrow(slug);
    }
    await expect(
      world(envelope(), { access: 'email_otp', action: 'none' }).kind.describe(args, ctx),
    ).rejects.toThrow('signer_access_code_required');
  });

  it('fills date, name and email itself; a required answer only the signer can give refuses', () => {
    const env = envelope({
      fields: [
        field('s', ME, 'initials'),
        field('d', ME, 'date'),
        field('n', ME, 'name'),
        field('e', ME, 'email'),
        field('t', ME, 'text', { required: false }),
      ],
    });
    const plan = planSignature(env, env.signers[0]!, NOW);
    expect(plan).toMatchObject({ needsSignature: false, needsInitials: true });
    expect(plan.autoFills.map((a) => [a.field.id, a.value])).toEqual([
      ['d', '2026-10-23'],
      ['n', 'Maya Owner'],
      ['e', 'Owner@Example.com'],
    ]);
    for (const kind of ['text', 'checkbox', 'number', 'radio', 'dropdown'] as const) {
      const blocked = envelope({ fields: [field('s', ME, 'signature'), field('x', ME, kind)] });
      expect(() => planSignature(blocked, blocked.signers[0]!, NOW)).toThrow(
        'sign_as_signer_needs_input',
      );
    }
    // A read-only field with a default is filled with that default.
    const ro = envelope({
      fields: [
        field('s', ME, 'signature'),
        field('x', ME, 'text', { meta: { read_only: true, default: 'ACME' } }),
      ],
    });
    expect(planSignature(ro, ro.signers[0]!, NOW).autoFills.map((a) => a.value)).toEqual(['ACME']);
  });

  it('dates in the envelope format and time zone', () => {
    expect(
      signingDate(envelope({ date_format: 'dd/MM/yyyy', timezone: 'Pacific/Kiritimati' }), NOW),
    ).toBe('24/10/2026');
  });

  it('Approve needs the signer consent and the images, checked before anything is recorded', async () => {
    const { kind, calls } = world();
    const args = { envelope_id: ENV_ID, signer_id: ME };
    await expect(kind.checkApproveBody!(args, {}, ctx)).rejects.toThrow('consent_required');
    await expect(
      kind.checkApproveBody!(args, { ...consent, esign_disclosure_version: 'esign_v0.0' }, ctx),
    ).rejects.toThrow('consent_required');
    const { signature: _s, ...noImage } = consent;
    await expect(kind.checkApproveBody!(args, noImage, ctx)).rejects.toThrow('signature_required');
    await expect(
      kind.checkApproveBody!(
        args,
        { ...consent, signature: { image_base64: 'R0lGODlhAQAB', format: 'upload' } },
        ctx,
      ),
    ).rejects.toThrow('image_not_png_or_jpeg');
    await expect(kind.checkApproveBody!(args, consent, ctx)).resolves.toBeUndefined();
    expect(calls).toEqual([]);
  });

  it('Approve signs as the signer through the signing service, every row marked via=mcp_approval', async () => {
    const { kind, calls } = world();
    const out = await kind.execute({ envelope_id: ENV_ID, signer_id: ME }, {
      ...ctx,
      approvalId: 'appr-1',
      audit: { ip: '203.0.113.9', user_agent: 'Browser/1' },
      body: consent,
    } as ApprovalExecuteContext);
    expect(out).toEqual({ envelope_id: ENV_ID, signer_id: ME, envelope_status: 'sealing' });
    const via = { via: 'mcp_approval', approval_id: 'appr-1' };
    expect(calls).toEqual([
      ['acceptTerms', via],
      ['acknowledgeEsignDisclosure', via],
      ['setSignature', undefined],
      ['fillField', via],
      ['confirmIntentToSign', via],
      ['submit', via],
    ]);
  });

  it('decodes only PNG or JPEG images', () => {
    expect(decodeSignatureImage({ image_base64: PNG, format: 'drawn' }).length).toBe(24);
    expect(() => decodeSignatureImage({ image_base64: 'AAAAAAAA', format: 'drawn' })).toThrow(
      'image_not_png_or_jpeg',
    );
  });
});
