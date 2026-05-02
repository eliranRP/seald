import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
  PayloadTooLargeException,
  PreconditionFailedException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import type { AppEnv } from '../config/env.schema';
import type {
  InsertOutboundEmailInput,
  OutboundEmailRow,
  OutboundEmailsRepository,
} from '../email/outbound-emails.repository';
import type {
  Envelope,
  EnvelopeEvent,
  EnvelopeSigner,
  EnvelopesRepository,
  EventInput,
  SetSignerSignatureInput,
  SubmitResult,
} from '../envelopes/envelopes.repository';
import type { StorageService } from '../storage/storage.service';
import { makeEnvelope, makeEvent, makeField, makeSigner } from '../../test/factories';
import { SignerSessionService } from './signer-session.service';
import { SigningTokenService } from './signing-token.service';
import { SigningService } from './signing.service';

/**
 * SigningService unit tests — the e2e suite (envelopes-signer.e2e-spec.ts)
 * exercises the controller wiring; this spec drives the service directly
 * with stub repos so every conditional branch is reachable in a fast
 * unit-test run. Together they bring `src/signing/**` past the
 * 85% coverage gate set by the audit.
 *
 * Stub strategy: Pick<EnvelopesRepository, ...> intersection types — we
 * only stub the methods the service touches per branch, rather than
 * shipping a full in-memory adapter. The service never inspects the repo
 * beyond the documented surface so a partial stub is faithful.
 */

const ENV_ID = '00000000-0000-0000-0000-0000000000aa';
const SIGNER_ID = '00000000-0000-0000-0000-0000000000bb';
const FIELD_ID = '00000000-0000-0000-0000-0000000000cc';

interface RepoSpy {
  events: EventInput[];
  jobs: Array<{ envelope_id: string; kind: 'seal' | 'audit_only' }>;
  acceptTermsCalls: string[];
  recordSignerViewedCalls: Array<{ id: string; ip: string | null; ua: string | null }>;
  fillFieldCalls: Array<{
    field_id: string;
    signer_id: string;
    value: { value_text?: string | null; value_boolean?: boolean | null };
  }>;
  submitSignerCalls: Array<{ id: string; ip: string | null; ua: string | null }>;
  declineSignerCalls: Array<{
    id: string;
    reason: string | null;
    ip: string | null;
    ua: string | null;
  }>;
  setSignerSignatureCalls: Array<{ signer_id: string; input: SetSignerSignatureInput }>;
  storageUploads: Array<{ path: string; bytes: Buffer; contentType: string }>;
  signedUrlPaths: string[];
  outboundInserts: InsertOutboundEmailInput[];
}

function emptySpy(): RepoSpy {
  return {
    events: [],
    jobs: [],
    acceptTermsCalls: [],
    recordSignerViewedCalls: [],
    fillFieldCalls: [],
    submitSignerCalls: [],
    declineSignerCalls: [],
    setSignerSignatureCalls: [],
    storageUploads: [],
    signedUrlPaths: [],
    outboundInserts: [],
  };
}

interface BuildOptions {
  readonly findSignerByAccessTokenHash?: EnvelopesRepository['findSignerByAccessTokenHash'];
  readonly fillField?: EnvelopesRepository['fillField'];
  readonly submitSigner?: EnvelopesRepository['submitSigner'];
  readonly declineSigner?: EnvelopesRepository['declineSigner'];
  readonly findByIdWithAll?: EnvelopesRepository['findByIdWithAll'];
  readonly setSignerSignature?: EnvelopesRepository['setSignerSignature'];
  readonly env?: Partial<AppEnv>;
  readonly sessionSecret?: string | null;
}

function buildService(spy: RepoSpy, opts: BuildOptions = {}): SigningService {
  const repo: Partial<EnvelopesRepository> = {
    async findSignerByAccessTokenHash(hash: string) {
      if (opts.findSignerByAccessTokenHash) {
        return opts.findSignerByAccessTokenHash(hash);
      }
      return null;
    },
    async appendEvent(input: EventInput): Promise<EnvelopeEvent> {
      spy.events.push(input);
      return makeEvent({
        envelope_id: input.envelope_id,
        signer_id: input.signer_id ?? null,
        actor_kind: input.actor_kind,
        event_type: input.event_type,
      });
    },
    async enqueueJob(envelope_id: string, kind: 'seal' | 'audit_only'): Promise<string> {
      spy.jobs.push({ envelope_id, kind });
      return 'job-1';
    },
    async acceptTerms(signer_id: string): Promise<EnvelopeSigner> {
      spy.acceptTermsCalls.push(signer_id);
      return makeSigner({ id: signer_id, tc_accepted_at: new Date().toISOString() });
    },
    async recordSignerViewed(
      signer_id: string,
      ip: string | null,
      ua: string | null,
    ): Promise<EnvelopeSigner> {
      spy.recordSignerViewedCalls.push({ id: signer_id, ip, ua });
      return makeSigner({ id: signer_id, viewed_at: new Date().toISOString() });
    },
    async fillField(field_id, signer_id, value) {
      spy.fillFieldCalls.push({ field_id, signer_id, value });
      if (opts.fillField) return opts.fillField(field_id, signer_id, value);
      return makeField({
        id: field_id,
        signer_id,
        value_text: value.value_text,
        value_boolean: value.value_boolean,
        filled_at: new Date().toISOString(),
      });
    },
    async submitSigner(signer_id, ip, ua) {
      spy.submitSignerCalls.push({ id: signer_id, ip, ua });
      if (opts.submitSigner) return opts.submitSigner(signer_id, ip, ua);
      return null;
    },
    async declineSigner(signer_id, reason, ip, ua) {
      spy.declineSignerCalls.push({ id: signer_id, reason, ip, ua });
      if (opts.declineSigner) return opts.declineSigner(signer_id, reason, ip, ua);
      return null;
    },
    async setSignerSignature(signer_id, input) {
      spy.setSignerSignatureCalls.push({ signer_id, input });
      if (opts.setSignerSignature) return opts.setSignerSignature(signer_id, input);
      return makeSigner({ id: signer_id });
    },
    async findByIdWithAll(envelope_id) {
      if (opts.findByIdWithAll) return opts.findByIdWithAll(envelope_id);
      return null;
    },
  };
  const storage: Pick<StorageService, 'upload' | 'createSignedUrl'> = {
    async upload(path, bytes, contentType) {
      spy.storageUploads.push({ path, bytes: Buffer.from(bytes), contentType });
    },
    async createSignedUrl(path) {
      spy.signedUrlPaths.push(path);
      return `https://signed.example/${path}?sig=stub`;
    },
  };
  const outbound: Pick<OutboundEmailsRepository, 'insert'> = {
    async insert(input) {
      spy.outboundInserts.push(input);
      return {
        id: `email-${spy.outboundInserts.length}`,
        envelope_id: input.envelope_id ?? null,
        signer_id: input.signer_id ?? null,
        kind: input.kind,
        to_email: input.to_email,
        to_name: input.to_name,
        payload: input.payload,
        status: 'pending',
        attempts: 0,
        max_attempts: input.max_attempts ?? 5,
        scheduled_for: input.scheduled_for ?? new Date().toISOString(),
        sent_at: null,
        last_error: null,
        provider_id: null,
        source_event_id: input.source_event_id ?? null,
        created_at: new Date().toISOString(),
      } as OutboundEmailRow;
    },
  };
  const env: AppEnv = {
    APP_PUBLIC_URL: 'https://app.example.com/',
    NODE_ENV: 'test',
    SIGNER_SESSION_SECRET:
      opts.sessionSecret === undefined ? 'x'.repeat(64) : (opts.sessionSecret ?? undefined),
    ...opts.env,
  } as AppEnv;
  const tokens = new SigningTokenService();
  const session = new SignerSessionService(env);
  return new SigningService(
    repo as EnvelopesRepository,
    tokens,
    session,
    storage as StorageService,
    outbound as OutboundEmailsRepository,
    env,
  );
}

function envelopeAwaitingOthers(overrides: Partial<Envelope> = {}): Envelope {
  return makeEnvelope({
    id: ENV_ID,
    status: 'awaiting_others',
    sender_email: 'sender@example.com',
    sender_name: 'Sender',
    sent_at: '2026-04-25T10:00:00.000Z',
    ...overrides,
  });
}

function freshSigner(overrides: Partial<EnvelopeSigner> = {}): EnvelopeSigner {
  return makeSigner({
    id: SIGNER_ID,
    viewed_at: null,
    tc_accepted_at: null,
    signed_at: null,
    declined_at: null,
    ...overrides,
  });
}

async function tinyPng(): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 16,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
}

async function tinyJpeg(): Promise<Buffer> {
  return sharp({
    create: {
      width: 32,
      height: 16,
      channels: 3,
      background: { r: 255, g: 255, b: 255 },
    },
  })
    .jpeg()
    .toBuffer();
}

describe('SigningService.startSession', () => {
  it('returns claims + a JWT for a valid token', async () => {
    const spy = emptySpy();
    const env = envelopeAwaitingOthers();
    const signer = freshSigner();
    const svc = buildService(spy, {
      async findSignerByAccessTokenHash() {
        return { envelope: env, signer };
      },
    });
    const result = await svc.startSession(ENV_ID, 'A'.repeat(43));
    expect(result.envelope_id).toBe(ENV_ID);
    expect(result.signer_id).toBe(SIGNER_ID);
    expect(result.requires_tc_accept).toBe(true);
    expect(result.session_jwt.split('.')).toHaveLength(3);
  });

  it('throws 401 invalid_token when the token hash does not match any signer', async () => {
    const svc = buildService(emptySpy(), {
      async findSignerByAccessTokenHash() {
        return null;
      },
    });
    await expect(svc.startSession(ENV_ID, 'A'.repeat(43))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it('throws 401 invalid_token when token belongs to a different envelope', async () => {
    const env = envelopeAwaitingOthers({ id: '99999999-9999-4999-8999-999999999999' });
    const signer = freshSigner();
    const svc = buildService(emptySpy(), {
      async findSignerByAccessTokenHash() {
        return { envelope: env, signer };
      },
    });
    await expect(svc.startSession(ENV_ID, 'A'.repeat(43))).rejects.toThrow(/invalid_token/);
  });

  it('throws 410 envelope_terminal when envelope is no longer awaiting_others', async () => {
    const env = envelopeAwaitingOthers({ status: 'declined' });
    const signer = freshSigner();
    const svc = buildService(emptySpy(), {
      async findSignerByAccessTokenHash() {
        return { envelope: env, signer };
      },
    });
    await expect(svc.startSession(ENV_ID, 'A'.repeat(43))).rejects.toBeInstanceOf(GoneException);
  });

  it('throws 409 already_signed when the signer has already signed', async () => {
    const env = envelopeAwaitingOthers();
    const signer = freshSigner({ signed_at: '2026-04-25T10:00:00.000Z' });
    const svc = buildService(emptySpy(), {
      async findSignerByAccessTokenHash() {
        return { envelope: env, signer };
      },
    });
    await expect(svc.startSession(ENV_ID, 'A'.repeat(43))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('throws 409 already_declined when the signer has already declined', async () => {
    const env = envelopeAwaitingOthers();
    const signer = freshSigner({ declined_at: '2026-04-25T10:00:00.000Z' });
    const svc = buildService(emptySpy(), {
      async findSignerByAccessTokenHash() {
        return { envelope: env, signer };
      },
    });
    await expect(svc.startSession(ENV_ID, 'A'.repeat(43))).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});

describe('SigningService.me', () => {
  it('returns the signer-scoped envelope view, masks co-signer names, filters fields', () => {
    const otherSignerId = '11111111-1111-4111-8111-111111111111';
    const env = envelopeAwaitingOthers({
      signers: [
        freshSigner(),
        makeSigner({
          id: otherSignerId,
          name: 'Bob Hamilton',
          email: 'bob@example.com',
        }),
      ],
      fields: [
        makeField({ id: FIELD_ID, signer_id: SIGNER_ID }),
        makeField({ id: '22222222-2222-4222-8222-222222222222', signer_id: otherSignerId }),
      ],
    });
    const svc = buildService(emptySpy());
    const out = svc.me(env, freshSigner());
    expect(out.envelope.id).toBe(ENV_ID);
    expect(out.fields).toHaveLength(1);
    expect(out.fields[0]!.signer_id).toBe(SIGNER_ID);
    expect(out.other_signers).toHaveLength(1);
    expect(out.other_signers[0]!.id).toBe(otherSignerId);
    // Mask: "Bob Hamilton" → "B***b H***n"
    expect(out.other_signers[0]!.name_masked).toBe('B***b H***n');
    // Email of co-signer is NOT exposed.
    expect(out.other_signers[0]).not.toHaveProperty('email');
  });

  it('masks short and 2-character name parts as documented', () => {
    const env = envelopeAwaitingOthers({
      signers: [
        freshSigner(),
        makeSigner({ id: '33333333-3333-4333-8333-333333333333', name: 'Al X Q' }),
      ],
    });
    const svc = buildService(emptySpy());
    const out = svc.me(env, freshSigner());
    // "Al X Q" → "A* X Q" (2-char becomes "A*"; 1-char stays as-is)
    expect(out.other_signers[0]!.name_masked).toBe('A* X Q');
  });
});

describe('SigningService.getOriginalPdfSignedUrl', () => {
  it('mints a signed URL at the deterministic original.pdf path', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    const url = await svc.getOriginalPdfSignedUrl(envelopeAwaitingOthers());
    expect(url).toContain(`${ENV_ID}/original.pdf`);
    expect(spy.signedUrlPaths).toEqual([`${ENV_ID}/original.pdf`]);
  });
});

describe('SigningService.acceptTerms', () => {
  it('emits both tc_accepted + viewed events on first acceptance', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.acceptTerms(envelopeAwaitingOthers(), freshSigner(), '1.2.3.4', 'agent-x');
    expect(spy.acceptTermsCalls).toEqual([SIGNER_ID]);
    expect(spy.recordSignerViewedCalls).toHaveLength(1);
    const types = spy.events.map((e) => e.event_type).sort();
    expect(types).toEqual(['tc_accepted', 'viewed']);
    const tc = spy.events.find((e) => e.event_type === 'tc_accepted')!;
    expect(tc.metadata).toEqual(
      expect.objectContaining({
        tc_version: expect.any(String),
        privacy_version: expect.any(String),
        esign_disclosure_version: expect.any(String),
        signer_auth_tier: expect.any(String),
      }),
    );
    expect(tc.ip).toBe('1.2.3.4');
    expect(tc.user_agent).toBe('agent-x');
  });

  it('skips the tc_accepted event when signer already accepted (idempotent)', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.acceptTerms(
      envelopeAwaitingOthers(),
      freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }),
      null,
      null,
    );
    expect(spy.events.map((e) => e.event_type).sort()).toEqual(['viewed']);
  });

  it('skips the viewed event when signer already viewed', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.acceptTerms(
      envelopeAwaitingOthers(),
      freshSigner({ viewed_at: '2026-04-25T10:00:00.000Z' }),
      null,
      null,
    );
    expect(spy.events.map((e) => e.event_type).sort()).toEqual(['tc_accepted']);
  });
});

describe('SigningService.acknowledgeEsignDisclosure', () => {
  it('appends an esign_disclosure_acknowledged event with the given version', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.acknowledgeEsignDisclosure(
      envelopeAwaitingOthers(),
      freshSigner(),
      'esign_v0.2',
      '5.6.7.8',
      'ua',
    );
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0]!.event_type).toBe('esign_disclosure_acknowledged');
    expect(spy.events[0]!.metadata).toEqual({
      esign_disclosure_version: 'esign_v0.2',
      demonstrated_ability: true,
    });
  });
});

describe('SigningService.confirmIntentToSign', () => {
  it('appends an intent_to_sign_confirmed event', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.confirmIntentToSign(envelopeAwaitingOthers(), freshSigner(), '1.1.1.1', 'ua');
    expect(spy.events).toHaveLength(1);
    expect(spy.events[0]!.event_type).toBe('intent_to_sign_confirmed');
  });
});

describe('SigningService.fillField', () => {
  it('404s when field does not exist on this envelope', async () => {
    const env = envelopeAwaitingOthers({ fields: [] });
    const svc = buildService(emptySpy());
    await expect(
      svc.fillField(env, freshSigner(), FIELD_ID, { value_text: 'x' }, null, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('404s when field belongs to a different signer', async () => {
    const env = envelopeAwaitingOthers({
      fields: [
        makeField({
          id: FIELD_ID,
          signer_id: '99999999-9999-4999-8999-999999999999',
          kind: 'date',
        }),
      ],
    });
    const svc = buildService(emptySpy());
    await expect(
      svc.fillField(env, freshSigner(), FIELD_ID, { value_text: '2026-04-24' }, null, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('400 wrong_field_kind for signature/initials kinds', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const svc = buildService(emptySpy());
    await expect(
      svc.fillField(env, freshSigner(), FIELD_ID, { value_text: 'x' }, null, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 wrong_field_kind when checkbox receives non-boolean payload', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'checkbox' })],
    });
    const svc = buildService(emptySpy());
    await expect(
      svc.fillField(env, freshSigner(), FIELD_ID, { value_text: 'oops' }, null, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('400 wrong_field_kind when text-bearing field receives non-string payload', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'date' })],
    });
    const svc = buildService(emptySpy());
    await expect(
      svc.fillField(env, freshSigner(), FIELD_ID, { value_boolean: true }, null, null),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('happy path — text field updates row and writes a field_filled event', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'date' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy);
    const out = await svc.fillField(
      env,
      freshSigner(),
      FIELD_ID,
      { value_text: '2026-04-24' },
      '9.9.9.9',
      'ua',
    );
    expect(out.value_text).toBe('2026-04-24');
    expect(spy.fillFieldCalls).toHaveLength(1);
    expect(spy.fillFieldCalls[0]!.value).toEqual({ value_text: '2026-04-24', value_boolean: null });
    expect(spy.events.map((e) => e.event_type)).toEqual(['field_filled']);
    expect(spy.events[0]!.metadata).toEqual({ field_id: FIELD_ID, kind: 'date' });
  });

  it('happy path — checkbox field uses value_boolean payload', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'checkbox' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.fillField(env, freshSigner(), FIELD_ID, { value_boolean: true }, null, null);
    expect(spy.fillFieldCalls[0]!.value).toEqual({ value_text: null, value_boolean: true });
  });

  it('404 field_not_found when the repo returns null (lost race / concurrent delete)', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'date' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async fillField() {
        return null;
      },
    });
    await expect(
      svc.fillField(env, freshSigner(), FIELD_ID, { value_text: 'x' }, null, null),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('SigningService.submit', () => {
  it('412 tc_required when terms not accepted', async () => {
    const env = envelopeAwaitingOthers();
    const svc = buildService(emptySpy());
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: null }), null, null),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('412 signature_required when no signature/initials field exists', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'date' })],
    });
    const svc = buildService(emptySpy());
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('422 missing_fields when a required non-signature field is unfilled', async () => {
    const env = envelopeAwaitingOthers({
      fields: [
        makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' }),
        makeField({
          id: '00000000-0000-0000-0000-000000000ddd',
          signer_id: SIGNER_ID,
          kind: 'date',
          required: true,
          filled_at: null,
        }),
      ],
    });
    const svc = buildService(emptySpy());
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null),
    ).rejects.toBeInstanceOf(UnprocessableEntityException);
  });

  it('happy path single signer — emits signed + all_signed and enqueues seal job', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async submitSigner(): Promise<SubmitResult> {
        return {
          signer: freshSigner({ signed_at: '2026-04-26T10:00:00.000Z' }),
          all_signed: true,
          envelope_status: 'sealing',
        };
      },
    });
    const out = await svc.submit(
      env,
      freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }),
      '1.1.1.1',
      'ua',
    );
    expect(out).toEqual({ status: 'submitted', envelope_status: 'sealing' });
    expect(spy.events.map((e) => e.event_type)).toEqual(['signed', 'all_signed']);
    expect(spy.jobs).toEqual([{ envelope_id: ENV_ID, kind: 'seal' }]);
  });

  it('happy path multi-signer (this signer is not last) — emits signed only, no seal job', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async submitSigner(): Promise<SubmitResult> {
        return {
          signer: freshSigner({ signed_at: '2026-04-26T10:00:00.000Z' }),
          all_signed: false,
          envelope_status: 'awaiting_others',
        };
      },
    });
    await svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null);
    expect(spy.events.map((e) => e.event_type)).toEqual(['signed']);
    expect(spy.jobs).toHaveLength(0);
  });

  it('410 envelope_terminal when repo race-loses and re-read shows non-awaiting state', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async submitSigner() {
        return null;
      },
      async findByIdWithAll() {
        return makeEnvelope({ id: ENV_ID, status: 'declined' });
      },
    });
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null),
    ).rejects.toBeInstanceOf(GoneException);
  });

  it('409 already_signed when re-read shows signer.signed_at populated', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async submitSigner() {
        return null;
      },
      async findByIdWithAll() {
        return makeEnvelope({
          id: ENV_ID,
          status: 'awaiting_others',
          signers: [freshSigner({ signed_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('409 already_declined when re-read shows signer.declined_at populated', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async submitSigner() {
        return null;
      },
      async findByIdWithAll() {
        return makeEnvelope({
          id: ENV_ID,
          status: 'awaiting_others',
          signers: [freshSigner({ declined_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('412 signature_required when re-read shows envelope still awaiting + signer not yet finalised', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async submitSigner() {
        return null;
      },
      async findByIdWithAll() {
        return makeEnvelope({
          id: ENV_ID,
          status: 'awaiting_others',
          signers: [freshSigner()],
        });
      },
    });
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null),
    ).rejects.toBeInstanceOf(PreconditionFailedException);
  });

  it('410 envelope_terminal when fresh re-read returns null', async () => {
    const env = envelopeAwaitingOthers({
      fields: [makeField({ id: FIELD_ID, signer_id: SIGNER_ID, kind: 'signature' })],
    });
    const svc = buildService(emptySpy(), {
      async submitSigner() {
        return null;
      },
      async findByIdWithAll() {
        return null;
      },
    });
    await expect(
      svc.submit(env, freshSigner({ tc_accepted_at: '2026-04-25T10:00:00.000Z' }), null, null),
    ).rejects.toBeInstanceOf(GoneException);
  });
});

describe('SigningService.decline', () => {
  function declinedEnvelope(otherSigners: EnvelopeSigner[] = []): Envelope {
    return envelopeAwaitingOthers({
      status: 'declined',
      signers: [freshSigner({ declined_at: '2026-04-26T10:00:00.000Z' }), ...otherSigners],
    });
  }

  it('happy path — appends declined event with reason metadata, enqueues audit_only job', async () => {
    const env = envelopeAwaitingOthers();
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return declinedEnvelope();
      },
    });
    const result = await svc.decline(env, freshSigner(), 'changed mind', '1.1.1.1', 'ua');
    expect(result).toEqual({ status: 'declined', envelope_status: 'declined' });
    const declined = spy.events.find((e) => e.event_type === 'declined')!;
    expect(declined.metadata).toMatchObject({
      reason_provided: true,
      reason_length: 'changed mind'.length,
    });
    expect(spy.jobs).toEqual([{ envelope_id: ENV_ID, kind: 'audit_only' }]);
  });

  it('emits declined_to_sender email when sender_email is present on the envelope', async () => {
    const env = envelopeAwaitingOthers();
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return declinedEnvelope();
      },
    });
    await svc.decline(env, freshSigner(), 'because', null, null);
    const senderMail = spy.outboundInserts.find((i) => i.kind === 'declined_to_sender');
    expect(senderMail).toBeDefined();
    expect(senderMail?.to_email).toBe('sender@example.com');
    expect(senderMail?.payload).toMatchObject({
      envelope_title: 'Spec Envelope',
      reason_provided: true,
      reason: 'because',
    });
  });

  it('skips the sender email when sender_email is null (legacy envelope)', async () => {
    const env = envelopeAwaitingOthers({ sender_email: null });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return declinedEnvelope();
      },
    });
    await svc.decline(env, freshSigner(), null, null, null);
    expect(spy.outboundInserts.find((i) => i.kind === 'declined_to_sender')).toBeUndefined();
    expect(spy.events.find((e) => e.event_type === 'declined')!.metadata).toMatchObject({
      reason_provided: false,
      reason_length: 0,
    });
  });

  it('multi-signer: emits withdrawn_to_signer for unsigned co-signers + session_invalidated_by_decline events', async () => {
    const otherUnsigned = makeSigner({
      id: '11111111-1111-4111-8111-111111111111',
      email: 'b@example.com',
      name: 'Bob',
    });
    const env = envelopeAwaitingOthers();
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return declinedEnvelope([otherUnsigned]);
      },
    });
    await svc.decline(env, freshSigner(), 'no', null, null);
    const sessionEvents = spy.events.filter(
      (e) => e.event_type === 'session_invalidated_by_decline',
    );
    expect(sessionEvents).toHaveLength(1);
    expect(sessionEvents[0]!.signer_id).toBe(otherUnsigned.id);
    const withdraw = spy.outboundInserts.find((i) => i.kind === 'withdrawn_to_signer');
    expect(withdraw?.to_email).toBe('b@example.com');
  });

  it('multi-signer: co-signer who already signed gets withdrawn_after_sign with timeline_html', async () => {
    const otherSigned = makeSigner({
      id: '22222222-2222-4222-8222-222222222222',
      email: 'c@example.com',
      name: 'Carla',
      signed_at: '2026-04-25T11:00:00.000Z',
    });
    const env = envelopeAwaitingOthers();
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return declinedEnvelope([otherSigned]);
      },
    });
    await svc.decline(env, freshSigner(), 'no', null, null);
    const after = spy.outboundInserts.find((i) => i.kind === 'withdrawn_after_sign');
    expect(after?.to_email).toBe('c@example.com');
    expect(after?.payload).toEqual(
      expect.objectContaining({
        timeline_html: expect.any(String),
        signed_at_readable: expect.stringMatching(/2026-04-25 11:00 UTC/),
      }),
    );
    // The withdrawn_to_signer email is NOT used for already-signed recipients.
    expect(spy.outboundInserts.find((i) => i.kind === 'withdrawn_to_signer')).toBeUndefined();
  });

  it('410 envelope_terminal when repo race-loses and re-read returns null', async () => {
    const env = envelopeAwaitingOthers();
    const svc = buildService(emptySpy(), {
      async declineSigner() {
        return null;
      },
      async findByIdWithAll() {
        return null;
      },
    });
    await expect(svc.decline(env, freshSigner(), null, null, null)).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('409 already_signed when repo race-loses and re-read shows signer signed', async () => {
    const env = envelopeAwaitingOthers();
    const svc = buildService(emptySpy(), {
      async declineSigner() {
        return null;
      },
      async findByIdWithAll() {
        return makeEnvelope({
          id: ENV_ID,
          status: 'awaiting_others',
          signers: [freshSigner({ signed_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    await expect(svc.decline(env, freshSigner(), null, null, null)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('409 already_declined when repo race-loses and re-read shows signer declined', async () => {
    const env = envelopeAwaitingOthers();
    const svc = buildService(emptySpy(), {
      async declineSigner() {
        return null;
      },
      async findByIdWithAll() {
        return makeEnvelope({
          id: ENV_ID,
          status: 'awaiting_others',
          signers: [freshSigner({ declined_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    await expect(svc.decline(env, freshSigner(), null, null, null)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('410 envelope_terminal when re-read shows status awaiting_others but signer untouched (no race resolution)', async () => {
    const env = envelopeAwaitingOthers();
    const svc = buildService(emptySpy(), {
      async declineSigner() {
        return null;
      },
      async findByIdWithAll() {
        return makeEnvelope({
          id: ENV_ID,
          status: 'awaiting_others',
          signers: [freshSigner()],
        });
      },
    });
    await expect(svc.decline(env, freshSigner(), null, null, null)).rejects.toBeInstanceOf(
      GoneException,
    );
  });

  it('uses APP_PUBLIC_URL stripped of trailing slash in email payloads', async () => {
    const env = envelopeAwaitingOthers();
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return declinedEnvelope();
      },
      env: { APP_PUBLIC_URL: 'https://app.example.com/' },
    });
    await svc.decline(env, freshSigner(), null, null, null);
    const senderMail = spy.outboundInserts.find((i) => i.kind === 'declined_to_sender');
    expect(senderMail?.payload).toMatchObject({ public_url: 'https://app.example.com' });
  });

  it('falls back to sender_email for sender_name when sender_name is null in copy', async () => {
    const env = envelopeAwaitingOthers({ sender_name: null });
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return declinedEnvelope();
      },
    });
    await svc.decline(env, freshSigner(), null, null, null);
    const senderMail = spy.outboundInserts.find((i) => i.kind === 'declined_to_sender');
    expect(senderMail?.payload).toMatchObject({ sender_name: 'sender@example.com' });
  });
});

describe('SigningService.withdrawConsent', () => {
  it('appends consent_withdrawn event then chains into decline pipeline', async () => {
    const env = envelopeAwaitingOthers();
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner() {
        return envelopeAwaitingOthers({
          status: 'declined',
          signers: [freshSigner({ declined_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    const out = await svc.withdrawConsent(env, freshSigner(), 'no thanks', '1.1.1.1', 'ua');
    expect(out).toEqual({ status: 'declined', envelope_status: 'declined' });
    const types = spy.events.map((e) => e.event_type);
    // consent_withdrawn precedes the declined event so the audit reads in order.
    expect(types[0]).toBe('consent_withdrawn');
    expect(types).toContain('declined');
    expect(spy.events[0]!.metadata).toMatchObject({
      reason_provided: true,
      reason_length: 'no thanks'.length,
    });
  });

  it('synthesises a default reason when caller passes null', async () => {
    const env = envelopeAwaitingOthers();
    const spy = emptySpy();
    const svc = buildService(spy, {
      async declineSigner(_signer_id, reason) {
        // Default reason is forwarded into declineSigner.
        expect(reason).toMatch(/withdrew consent/i);
        return envelopeAwaitingOthers({
          status: 'declined',
          signers: [freshSigner({ declined_at: '2026-04-26T10:00:00.000Z' })],
        });
      },
    });
    await svc.withdrawConsent(env, freshSigner(), null, null, null);
  });
});

describe('SigningService.setSignature', () => {
  it('400 image_unreadable when buffer is empty', async () => {
    const svc = buildService(emptySpy());
    await expect(
      svc.setSignature(envelopeAwaitingOthers(), freshSigner(), Buffer.alloc(0), {
        format: 'drawn',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('413 image_too_large when buffer exceeds 512 KB', async () => {
    const svc = buildService(emptySpy());
    // Fill with PNG magic so the size check trips before MIME detection.
    const buf = Buffer.alloc(512 * 1024 + 1, 0);
    buf.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
    await expect(
      svc.setSignature(envelopeAwaitingOthers(), freshSigner(), buf, { format: 'drawn' }),
    ).rejects.toBeInstanceOf(PayloadTooLargeException);
  });

  it('415 image_not_png_or_jpeg when bytes are neither PNG nor JPEG', async () => {
    const svc = buildService(emptySpy());
    await expect(
      svc.setSignature(
        envelopeAwaitingOthers(),
        freshSigner(),
        Buffer.from('definitely not an image'),
        { format: 'drawn' },
      ),
    ).rejects.toBeInstanceOf(UnsupportedMediaTypeException);
  });

  it('accepts a valid PNG and uploads to the signature path', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.setSignature(envelopeAwaitingOthers(), freshSigner(), await tinyPng(), {
      format: 'drawn',
    });
    expect(spy.storageUploads).toHaveLength(1);
    expect(spy.storageUploads[0]!.path).toBe(`${ENV_ID}/signatures/${SIGNER_ID}.png`);
    expect(spy.storageUploads[0]!.contentType).toBe('image/png');
    expect(spy.setSignerSignatureCalls[0]!.input.kind).toBe('signature');
  });

  it("accepts kind='initials' and writes to the initials path", async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.setSignature(envelopeAwaitingOthers(), freshSigner(), await tinyPng(), {
      format: 'drawn',
      kind: 'initials',
    });
    expect(spy.storageUploads[0]!.path).toBe(`${ENV_ID}/signatures/${SIGNER_ID}-initials.png`);
    expect(spy.setSignerSignatureCalls[0]!.input.kind).toBe('initials');
  });

  it('accepts a valid JPEG and re-encodes it to PNG via sharp', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    const jpeg = await tinyJpeg();
    await svc.setSignature(envelopeAwaitingOthers(), freshSigner(), jpeg, {
      format: 'upload',
    });
    expect(spy.storageUploads).toHaveLength(1);
    // Service forces PNG output regardless of input format.
    expect(spy.storageUploads[0]!.contentType).toBe('image/png');
    expect(spy.storageUploads[0]!.bytes.subarray(0, 8)).toEqual(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });

  it('400 image_unreadable when sharp rejects the bytes (corrupt PNG header)', async () => {
    const svc = buildService(emptySpy());
    // Has the PNG magic so it passes the sniff, but is otherwise garbage so
    // sharp's parse throws — we map to BadRequestException image_unreadable.
    const corrupt = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      Buffer.from('totally not a real PNG body, sharp will choke on this'),
    ]);
    await expect(
      svc.setSignature(envelopeAwaitingOthers(), freshSigner(), corrupt, { format: 'drawn' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('forwards optional metadata (font, stroke_count, source_filename) to the repo', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.setSignature(envelopeAwaitingOthers(), freshSigner(), await tinyPng(), {
      format: 'typed',
      font: 'Caveat',
      stroke_count: 3,
      source_filename: 'sig.png',
    });
    expect(spy.setSignerSignatureCalls[0]!.input).toMatchObject({
      signature_format: 'typed',
      signature_font: 'Caveat',
      signature_stroke_count: 3,
      signature_source_filename: 'sig.png',
    });
  });

  it('null-coalesces optional metadata fields when omitted', async () => {
    const spy = emptySpy();
    const svc = buildService(spy);
    await svc.setSignature(envelopeAwaitingOthers(), freshSigner(), await tinyPng(), {
      format: 'drawn',
    });
    expect(spy.setSignerSignatureCalls[0]!.input).toMatchObject({
      signature_font: null,
      signature_stroke_count: null,
      signature_source_filename: null,
    });
  });
});
