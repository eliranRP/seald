import 'reflect-metadata';
import type { Request, Response } from 'express';
import type { AppEnv } from '../../config/env.schema';
import type { Envelope, EnvelopeField, EnvelopeSigner } from '../../envelopes/envelopes.repository';
import { makeEnvelope, makeField, makeSigner } from '../../../test/factories';
import { DeclineDto } from '../dto/decline.dto';
import { EsignDisclosureDto } from '../dto/esign-disclosure.dto';
import { FillFieldDto } from '../dto/fill-field.dto';
import { SignatureMetaDto } from '../dto/signature-meta.dto';
import { StartSessionDto } from '../dto/start-session.dto';
import { SIGNER_SESSION_COOKIE, type SignerSessionService } from '../signer-session.service';
import type { SignerSessionContext } from '../signer-session.guard';
import { SigningController } from '../signing.controller';
import type { SigningService } from '../signing.service';

/**
 * Controller-level unit tests. The wired-up HTTP behavior is exhaustively
 * covered by `test/envelopes-signer.e2e-spec.ts` (924 lines, real Nest app
 * with ValidationPipe + guard); this spec drills the controller methods
 * directly so every cookie-set / parameter-pass / fallback line is reached
 * in the unit-test coverage report.
 */

const ENV_ID = '00000000-0000-0000-0000-0000000000aa';
const SIGNER_ID = '00000000-0000-0000-0000-0000000000bb';

interface ResSpy {
  headers: Record<string, unknown>;
}

function fakeRes(): { res: Response; spy: ResSpy } {
  const spy: ResSpy = { headers: {} };
  const res = {
    setHeader(name: string, value: unknown) {
      spy.headers[name.toLowerCase()] = value;
      return this;
    },
  } as unknown as Response;
  return { res, spy };
}

function fakeReq(extras: Partial<Request> = {}): Request {
  return {
    headers: { 'user-agent': 'jest-ua' },
    ip: '203.0.113.7',
    socket: { remoteAddress: '203.0.113.7' },
    ...extras,
  } as unknown as Request;
}

function envContext(overrides: Partial<Envelope> = {}): SignerSessionContext {
  const envelope = makeEnvelope({
    id: ENV_ID,
    status: 'awaiting_others',
    ...overrides,
  });
  const signer: EnvelopeSigner = makeSigner({ id: SIGNER_ID });
  return { envelope, signer };
}

function buildController(opts: {
  svc?: Partial<SigningService>;
  session?: Partial<SignerSessionService>;
  env?: Partial<AppEnv>;
}): SigningController {
  const svc: Partial<SigningService> = opts.svc ?? {};
  const session: Partial<SignerSessionService> = {
    cookieMaxAgeSeconds: 1800,
    ...opts.session,
  };
  const env = {
    NODE_ENV: 'test',
    APP_PUBLIC_URL: 'https://app.example.com',
    ...opts.env,
  } as AppEnv;
  return new SigningController(svc as SigningService, session as SignerSessionService, env);
}

describe('SigningController.start', () => {
  it('issues a non-Secure cookie in test env, returns the result body', async () => {
    const ctrl = buildController({
      svc: {
        async startSession(envelope_id, token) {
          expect(envelope_id).toBe(ENV_ID);
          expect(token).toBe('A'.repeat(43));
          return {
            envelope_id,
            signer_id: SIGNER_ID,
            requires_tc_accept: true,
            session_jwt: 'jwt.token.here',
          };
        },
      },
    });
    const dto = Object.assign(new StartSessionDto(), {
      envelope_id: ENV_ID,
      token: 'A'.repeat(43),
    });
    const { res, spy } = fakeRes();
    const out = await ctrl.start(dto, res);
    expect(out).toEqual({
      envelope_id: ENV_ID,
      signer_id: SIGNER_ID,
      requires_tc_accept: true,
    });
    const cookie = spy.headers['set-cookie'] as string;
    expect(cookie).toContain(`${SIGNER_SESSION_COOKIE}=jwt.token.here`);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).toMatch(/Path=\/sign/);
    expect(cookie).not.toMatch(/Secure/i);
  });

  it('issues a Secure cookie when NODE_ENV=production', async () => {
    const ctrl = buildController({
      env: { NODE_ENV: 'production' },
      svc: {
        async startSession() {
          return {
            envelope_id: ENV_ID,
            signer_id: SIGNER_ID,
            requires_tc_accept: true,
            session_jwt: 'jwt.token.here',
          };
        },
      },
    });
    const dto = Object.assign(new StartSessionDto(), {
      envelope_id: ENV_ID,
      token: 'A'.repeat(43),
    });
    const { res, spy } = fakeRes();
    await ctrl.start(dto, res);
    const cookie = spy.headers['set-cookie'] as string;
    expect(cookie).toMatch(/Secure/i);
  });
});

describe('SigningController.me', () => {
  it('delegates to svc.me with the session envelope + signer', () => {
    const session = envContext();
    const ctrl = buildController({
      svc: {
        me(env, signer) {
          expect(env.id).toBe(ENV_ID);
          expect(signer.id).toBe(SIGNER_ID);
          return {
            envelope: {
              id: env.id,
              title: env.title,
              short_code: env.short_code,
              status: env.status,
              original_pages: env.original_pages,
              expires_at: env.expires_at,
              tc_version: env.tc_version,
              privacy_version: env.privacy_version,
            },
            signer: {
              id: signer.id,
              email: signer.email,
              name: signer.name,
              color: signer.color,
              role: signer.role,
              status: signer.status,
              viewed_at: signer.viewed_at,
              tc_accepted_at: signer.tc_accepted_at,
              signed_at: signer.signed_at,
              declined_at: signer.declined_at,
            },
            fields: [],
            other_signers: [],
          };
        },
      },
    });
    const out = ctrl.me(session);
    expect(out.envelope.id).toBe(ENV_ID);
  });
});

describe('SigningController.pdf', () => {
  it('returns the signed URL as JSON (not a 302 redirect)', async () => {
    const session = envContext();
    const ctrl = buildController({
      svc: {
        async getOriginalPdfSignedUrl(env) {
          expect(env.id).toBe(ENV_ID);
          return 'https://signed.example/pdf?sig=stub';
        },
      },
    });
    const out = await ctrl.pdf(session);
    expect(out).toEqual({ url: 'https://signed.example/pdf?sig=stub' });
  });
});

describe('SigningController.acceptTerms', () => {
  it('passes IP + UA from request through to the service', async () => {
    const session = envContext();
    let captured: { ip: string | null; ua: string | null } = { ip: null, ua: null };
    const ctrl = buildController({
      svc: {
        async acceptTerms(_env, _signer, ip, ua) {
          captured = { ip, ua };
        },
      },
    });
    await ctrl.acceptTerms(session, fakeReq());
    expect(captured.ip).toBe('203.0.113.7');
    expect(captured.ua).toBe('jest-ua');
  });

  it('passes null UA when header is missing', async () => {
    const session = envContext();
    let captured: { ua: string | null } = { ua: 'unset' };
    const ctrl = buildController({
      svc: {
        async acceptTerms(_env, _signer, _ip, ua) {
          captured = { ua };
        },
      },
    });
    await ctrl.acceptTerms(session, fakeReq({ headers: {} }));
    expect(captured.ua).toBeNull();
  });
});

describe('SigningController.esignDisclosure', () => {
  it('forwards the disclosure_version + ip + ua to the service', async () => {
    const session = envContext();
    let captured: { version: string | null; ip: string | null; ua: string | null } = {
      version: null,
      ip: null,
      ua: null,
    };
    const ctrl = buildController({
      svc: {
        async acknowledgeEsignDisclosure(_env, _signer, version, ip, ua) {
          captured = { version, ip, ua };
        },
      },
    });
    const dto = Object.assign(new EsignDisclosureDto(), { disclosure_version: 'esign_v0.2' });
    await ctrl.esignDisclosure(session, dto, fakeReq());
    expect(captured).toEqual({
      version: 'esign_v0.2',
      ip: '203.0.113.7',
      ua: 'jest-ua',
    });
  });
});

describe('SigningController.intentToSign', () => {
  it('forwards the IP + UA to the service (no body)', async () => {
    const session = envContext();
    const calls: Array<{ ip: string | null; ua: string | null }> = [];
    const ctrl = buildController({
      svc: {
        async confirmIntentToSign(_env, _signer, ip, ua) {
          calls.push({ ip, ua });
        },
      },
    });
    await ctrl.intentToSign(session, fakeReq());
    expect(calls).toEqual([{ ip: '203.0.113.7', ua: 'jest-ua' }]);
  });
});

describe('SigningController.withdrawConsent', () => {
  it('clears the session cookie + returns the service result', async () => {
    const session = envContext();
    const ctrl = buildController({
      svc: {
        async withdrawConsent(_env, _signer, reason) {
          expect(reason).toBe('changed mind');
          return { status: 'declined', envelope_status: 'declined' };
        },
      },
    });
    const dto = Object.assign(new DeclineDto(), { reason: 'changed mind' });
    const { res, spy } = fakeRes();
    const out = await ctrl.withdrawConsent(session, dto, fakeReq(), res);
    expect(out).toEqual({ status: 'declined', envelope_status: 'declined' });
    const cookie = spy.headers['set-cookie'] as string;
    expect(cookie).toMatch(/Max-Age=0/i);
  });

  it('passes null when DTO omits reason', async () => {
    const session = envContext();
    let observed: string | null = 'unset';
    const ctrl = buildController({
      svc: {
        async withdrawConsent(_env, _signer, reason) {
          observed = reason;
          return { status: 'declined', envelope_status: 'declined' };
        },
      },
    });
    const dto = new DeclineDto();
    const { res } = fakeRes();
    await ctrl.withdrawConsent(session, dto, fakeReq(), res);
    expect(observed).toBeNull();
  });
});

describe('SigningController.fillField', () => {
  it('forwards both value_text + value_boolean when set, drops undefineds', async () => {
    const session = envContext();
    let captured: {
      field_id: string;
      body: { value_text?: string; value_boolean?: boolean };
    } | null = null;
    const ctrl = buildController({
      svc: {
        async fillField(_env, _signer, field_id, body): Promise<EnvelopeField> {
          captured = { field_id, body: { ...body } };
          return makeField({ id: field_id });
        },
      },
    });
    const dto = Object.assign(new FillFieldDto(), {
      value_text: 'hi',
      value_boolean: true,
    });
    const fid = '11111111-1111-4111-8111-111111111111';
    await ctrl.fillField(session, fid, dto, fakeReq());
    expect(captured).not.toBeNull();
    expect(captured!.field_id).toBe(fid);
    expect(captured!.body).toEqual({ value_text: 'hi', value_boolean: true });
  });

  it('omits value_text from body when undefined', async () => {
    const session = envContext();
    let observed: { value_text?: string; value_boolean?: boolean } = {};
    const ctrl = buildController({
      svc: {
        async fillField(_e, _s, field_id, body) {
          observed = body;
          return makeField({ id: field_id });
        },
      },
    });
    const dto = Object.assign(new FillFieldDto(), { value_boolean: false });
    const fid = '11111111-1111-4111-8111-111111111111';
    await ctrl.fillField(session, fid, dto, fakeReq());
    expect(observed).toEqual({ value_boolean: false });
    expect(observed).not.toHaveProperty('value_text');
  });
});

describe('SigningController.submit', () => {
  it('clears session cookie + returns service result', async () => {
    const session = envContext();
    const ctrl = buildController({
      svc: {
        async submit() {
          return { status: 'submitted', envelope_status: 'sealing' };
        },
      },
    });
    const { res, spy } = fakeRes();
    const out = await ctrl.submit(session, fakeReq(), res);
    expect(out).toEqual({ status: 'submitted', envelope_status: 'sealing' });
    expect(spy.headers['set-cookie']).toMatch(/Max-Age=0/i);
  });

  it('issues Secure clearing cookie in production', async () => {
    const session = envContext();
    const ctrl = buildController({
      env: { NODE_ENV: 'production' },
      svc: {
        async submit() {
          return { status: 'submitted', envelope_status: 'sealing' };
        },
      },
    });
    const { res, spy } = fakeRes();
    await ctrl.submit(session, fakeReq(), res);
    expect(spy.headers['set-cookie']).toMatch(/Secure/i);
  });
});

describe('SigningController.decline', () => {
  it('clears the session cookie + returns service result', async () => {
    const session = envContext();
    const ctrl = buildController({
      svc: {
        async decline(_env, _signer, reason) {
          expect(reason).toBe('no thanks');
          return { status: 'declined', envelope_status: 'declined' };
        },
      },
    });
    const dto = Object.assign(new DeclineDto(), { reason: 'no thanks' });
    const { res, spy } = fakeRes();
    const out = await ctrl.decline(session, dto, fakeReq(), res);
    expect(out).toEqual({ status: 'declined', envelope_status: 'declined' });
    expect(spy.headers['set-cookie']).toMatch(/Max-Age=0/i);
  });
});

describe('SigningController.signature', () => {
  it('400 image_unreadable when no file attached', async () => {
    const session = envContext();
    const ctrl = buildController({});
    const meta = Object.assign(new SignatureMetaDto(), { format: 'drawn' });
    await expect(ctrl.signature(session, undefined, meta)).rejects.toThrow(/image_unreadable/);
  });

  it('400 image_unreadable when file buffer is empty', async () => {
    const session = envContext();
    const ctrl = buildController({});
    const meta = Object.assign(new SignatureMetaDto(), { format: 'drawn' });
    const file = {
      buffer: Buffer.alloc(0),
      originalname: 's.png',
    } as Express.Multer.File;
    await expect(ctrl.signature(session, file, meta)).rejects.toThrow(/image_unreadable/);
  });

  it('forwards meta defaults (kind=signature, font=null, stroke_count=null, source_filename=null) when omitted', async () => {
    const session = envContext();
    let observed: { meta: Record<string, unknown> } = { meta: {} };
    const ctrl = buildController({
      svc: {
        async setSignature(_env, _signer, _bytes, meta): Promise<EnvelopeSigner> {
          observed = { meta: { ...meta } };
          return makeSigner({ id: SIGNER_ID });
        },
      },
    });
    const meta = Object.assign(new SignatureMetaDto(), { format: 'drawn' });
    const file = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      originalname: 's.png',
    } as Express.Multer.File;
    await ctrl.signature(session, file, meta);
    expect(observed.meta).toMatchObject({
      kind: 'signature',
      format: 'drawn',
      font: null,
      stroke_count: null,
      source_filename: null,
    });
  });

  it('forwards explicit metadata to the service', async () => {
    const session = envContext();
    let observed: { meta: Record<string, unknown> } = { meta: {} };
    const ctrl = buildController({
      svc: {
        async setSignature(_env, _signer, _bytes, meta) {
          observed = { meta: { ...meta } };
          return makeSigner({ id: SIGNER_ID });
        },
      },
    });
    const meta = Object.assign(new SignatureMetaDto(), {
      format: 'typed',
      kind: 'initials',
      font: 'Caveat',
      stroke_count: 11,
      source_filename: 'init.png',
    });
    const file = {
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      originalname: 'init.png',
    } as Express.Multer.File;
    await ctrl.signature(session, file, meta);
    expect(observed.meta).toMatchObject({
      kind: 'initials',
      format: 'typed',
      font: 'Caveat',
      stroke_count: 11,
      source_filename: 'init.png',
    });
  });
});
