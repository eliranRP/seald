import {
  BadRequestException,
  ConflictException,
  HttpException,
  NotFoundException,
} from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../../auth/auth-user';
import {
  DrivePermissionDeniedError,
  DriveUpstreamError,
  GdriveNotConnectedError,
  TokenExpiredError,
} from '../../integrations/gdrive/dto/error-codes';
import { RateLimitedError } from '../../integrations/gdrive/rate-limiter';
import { EnvelopesController } from '../envelopes.controller';
import type { EnvelopesService } from '../envelopes.service';
import type { Envelope } from '../envelopes.repository';

/**
 * Pure controller-level coverage. Every route is invoked directly with a
 * mocked `EnvelopesService`, focusing on the controller's own logic:
 *  - argument unpacking + threading to the service
 *  - audit metadata (ip + user_agent extraction)
 *  - per-route validation that lives in the controller (`parseStatuses`,
 *    `download` kind switch, `upload` empty-body guard, `send` no-email
 *    guard, etc.)
 *  - response-shape adapters (`events`, `placeFields`, `upload`).
 *
 * The full HTTP integration is exercised by `apps/api/test/envelopes-sender.e2e-spec.ts`
 * — these unit tests are the cheap, fast safety net for the controller as
 * a thin layer.
 */
describe('EnvelopesController', () => {
  const USER: AuthUser = {
    id: '00000000-0000-0000-0000-00000000000a',
    email: 'sender@example.com',
    provider: 'email',
  };

  let svc: jest.Mocked<EnvelopesService>;
  let controller: EnvelopesController;

  beforeEach(() => {
    svc = {
      createDraft: jest.fn(),
      list: jest.fn(),
      getById: jest.fn(),
      patchDraft: jest.fn(),
      deleteDraft: jest.fn(),
      uploadOriginal: jest.fn(),
      send: jest.fn(),
      cancel: jest.fn(),
      remindSigner: jest.fn(),
      addSigner: jest.fn(),
      removeSigner: jest.fn(),
      replaceFields: jest.fn(),
      listEvents: jest.fn(),
      getDownloadUrl: jest.fn(),
      saveToGoogleDrive: jest.fn(),
    } as unknown as jest.Mocked<EnvelopesService>;
    controller = new EnvelopesController(svc);
  });

  function makeRequest(opts?: {
    ip?: string;
    forwardedFor?: string;
    userAgent?: string | null;
  }): Request {
    const headers: Record<string, string | undefined> = {
      'user-agent': opts?.userAgent === null ? undefined : (opts?.userAgent ?? 'jest/1.0'),
    };
    if (opts?.forwardedFor) headers['x-forwarded-for'] = opts.forwardedFor;
    return {
      ip: opts?.ip ?? '203.0.113.7',
      headers,
      socket: { remoteAddress: opts?.ip ?? '203.0.113.7' },
    } as unknown as Request;
  }

  function makeEnvelope(overrides: Partial<Envelope> = {}): Envelope {
    return {
      id: 'env-1',
      owner_id: USER.id,
      title: 'NDA',
      short_code: 'AAAA-BBBB-CCCC',
      status: 'draft',
      delivery_mode: 'parallel',
      original_pages: null,
      original_sha256: null,
      sealed_sha256: null,
      sender_email: null,
      sender_name: null,
      sent_at: null,
      completed_at: null,
      expires_at: '2026-06-01T00:00:00.000Z',
      tc_version: '1',
      privacy_version: '1',
      signers: [],
      fields: [],
      created_at: '2026-05-01T00:00:00.000Z',
      updated_at: '2026-05-01T00:00:00.000Z',
      ...overrides,
    } as Envelope;
  }

  describe('POST /envelopes (create)', () => {
    it('forwards dto + audit metadata to service', async () => {
      const env = makeEnvelope();
      svc.createDraft.mockResolvedValue(env);
      const req = makeRequest({ userAgent: 'curl/8' });

      const out = await controller.create(USER, { title: 'NDA' }, req);

      expect(svc.createDraft).toHaveBeenCalledWith(
        USER.id,
        { title: 'NDA' },
        { ip: expect.any(String), user_agent: 'curl/8' },
      );
      expect(out).toBe(env);
    });

    it('coerces missing user_agent header to null', async () => {
      svc.createDraft.mockResolvedValue(makeEnvelope());
      const req = makeRequest({ userAgent: null });
      await controller.create(USER, { title: 'X' }, req);
      expect(svc.createDraft).toHaveBeenCalledWith(
        USER.id,
        { title: 'X' },
        { ip: expect.any(String), user_agent: null },
      );
    });
  });

  describe('GET /envelopes (list)', () => {
    it('parses comma-separated status query into array', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, 'draft,awaiting_others');
      expect(svc.list).toHaveBeenCalledWith(USER.id, {
        statuses: ['draft', 'awaiting_others'],
        viewerEmail: USER.email,
      });
    });

    it('drops empty/whitespace status segments', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, ' draft , , awaiting_others ');
      expect(svc.list).toHaveBeenCalledWith(USER.id, {
        statuses: ['draft', 'awaiting_others'],
        viewerEmail: USER.email,
      });
    });

    it('omits statuses when query is empty string', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, '');
      expect(svc.list).toHaveBeenCalledWith(USER.id, { viewerEmail: USER.email });
    });

    it('omits statuses when query is undefined', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER);
      expect(svc.list).toHaveBeenCalledWith(USER.id, { viewerEmail: USER.email });
    });

    it('omits statuses when only commas/whitespace', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, ' , , ');
      expect(svc.list).toHaveBeenCalledWith(USER.id, { viewerEmail: USER.email });
    });

    it('still forwards unknown status values verbatim (service re-validates)', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, 'bogus');
      expect(svc.list).toHaveBeenCalledWith(USER.id, {
        statuses: ['bogus'],
        viewerEmail: USER.email,
      });
    });

    it('parses limit query as integer', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, undefined, '50');
      expect(svc.list).toHaveBeenCalledWith(USER.id, { limit: 50, viewerEmail: USER.email });
    });

    it('drops non-numeric limit', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, undefined, 'abc');
      expect(svc.list).toHaveBeenCalledWith(USER.id, { viewerEmail: USER.email });
    });

    it('forwards cursor when present', async () => {
      svc.list.mockResolvedValue({ items: [], next_cursor: null });
      await controller.list(USER, undefined, undefined, 'opaque-cursor');
      expect(svc.list).toHaveBeenCalledWith(USER.id, {
        cursor: 'opaque-cursor',
        viewerEmail: USER.email,
      });
    });
  });

  describe('GET /envelopes/:id', () => {
    it('forwards owner + id to service', async () => {
      const env = makeEnvelope();
      svc.getById.mockResolvedValue(env);
      await expect(controller.get(USER, env.id)).resolves.toBe(env);
      expect(svc.getById).toHaveBeenCalledWith(USER.id, env.id);
    });
  });

  describe('PATCH /envelopes/:id', () => {
    it('forwards patch dto', async () => {
      const env = makeEnvelope({ title: 'New' });
      svc.patchDraft.mockResolvedValue(env);
      await expect(controller.patch(USER, env.id, { title: 'New' })).resolves.toBe(env);
      expect(svc.patchDraft).toHaveBeenCalledWith(USER.id, env.id, { title: 'New' });
    });
  });

  describe('DELETE /envelopes/:id', () => {
    it('returns void and forwards id', async () => {
      svc.deleteDraft.mockResolvedValue(undefined);
      await expect(controller.remove(USER, 'env-1')).resolves.toBeUndefined();
      expect(svc.deleteDraft).toHaveBeenCalledWith(USER.id, 'env-1');
    });
  });

  describe('POST /envelopes/:id/upload', () => {
    it('400 file_required when file is undefined', async () => {
      await expect(controller.upload(USER, 'env-1', undefined)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(svc.uploadOriginal).not.toHaveBeenCalled();
    });

    it('400 file_required when file buffer is empty', async () => {
      const file = { buffer: Buffer.alloc(0) } as Express.Multer.File;
      await expect(controller.upload(USER, 'env-1', file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('400 file_required when file buffer is missing', async () => {
      const file = {} as Express.Multer.File;
      await expect(controller.upload(USER, 'env-1', file)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('returns pages + sha on success', async () => {
      const env = makeEnvelope({ original_pages: 4, original_sha256: 'a'.repeat(64) });
      svc.uploadOriginal.mockResolvedValue(env);
      const file = { buffer: Buffer.from('%PDF-x') } as Express.Multer.File;
      const out = await controller.upload(USER, env.id, file);
      expect(out).toEqual({ pages: 4, sha256: 'a'.repeat(64) });
      expect(svc.uploadOriginal).toHaveBeenCalledWith(USER.id, env.id, file.buffer);
    });

    it('coerces null pages/sha to defaults', async () => {
      const env = makeEnvelope();
      svc.uploadOriginal.mockResolvedValue(env);
      const file = { buffer: Buffer.from('%PDF-y') } as Express.Multer.File;
      const out = await controller.upload(USER, env.id, file);
      expect(out).toEqual({ pages: 0, sha256: '' });
    });
  });

  describe('POST /envelopes/:id/send', () => {
    it('uses JWT email when present and ignores body sender_email (anti-spoof)', async () => {
      const env = makeEnvelope({ status: 'awaiting_others' });
      svc.send.mockResolvedValue(env);
      await controller.send(USER, 'env-1', makeRequest({ userAgent: 'Mozilla/5.0' }), {
        sender_email: 'evil@spoof.example',
        sender_name: 'Bad Actor',
      });
      expect(svc.send).toHaveBeenCalledWith(
        USER.id,
        'env-1',
        { email: USER.email, name: null },
        { ip: expect.any(String), user_agent: 'Mozilla/5.0' },
      );
    });

    it('falls back to body sender_email + name when JWT carries no email (anon/guest)', async () => {
      const anon: AuthUser = { id: USER.id, email: null, provider: 'anonymous' };
      const env = makeEnvelope({ status: 'awaiting_others' });
      svc.send.mockResolvedValue(env);
      await controller.send(anon, 'env-1', makeRequest({ userAgent: 'curl/8' }), {
        sender_email: 'guest@example.com',
        sender_name: 'Guest User',
      });
      expect(svc.send).toHaveBeenCalledWith(
        USER.id,
        'env-1',
        { email: 'guest@example.com', name: 'Guest User' },
        { ip: expect.any(String), user_agent: 'curl/8' },
      );
    });

    it('400 sender_email_missing when JWT has no email and body is empty', () => {
      const anon: AuthUser = { id: USER.id, email: null, provider: 'anonymous' };
      expect(() => controller.send(anon, 'env-1', makeRequest(), {})).toThrow(BadRequestException);
      expect(svc.send).not.toHaveBeenCalled();
    });

    it('threads sender email + audit metadata to service when JWT has email and body omitted', async () => {
      const env = makeEnvelope({ status: 'awaiting_others' });
      svc.send.mockResolvedValue(env);
      const req = makeRequest({ userAgent: 'Mozilla/5.0' });
      await controller.send(USER, 'env-1', req);
      expect(svc.send).toHaveBeenCalledWith(
        USER.id,
        'env-1',
        { email: USER.email, name: null },
        { ip: expect.any(String), user_agent: 'Mozilla/5.0' },
      );
    });
  });

  describe('POST /envelopes/:id/cancel', () => {
    it('forwards audit metadata to service', async () => {
      svc.cancel.mockResolvedValue({ status: 'canceled', envelope_status: 'canceled' });
      const out = await controller.cancel(USER, 'env-1', makeRequest({ userAgent: null }));
      expect(out).toEqual({ status: 'canceled', envelope_status: 'canceled' });
      expect(svc.cancel).toHaveBeenCalledWith(USER.id, 'env-1', {
        ip: expect.any(String),
        user_agent: null,
      });
    });
  });

  describe('POST /envelopes/:id/signers/:signer_id/remind', () => {
    it('400 sender_email_missing when JWT has no email and body is empty', async () => {
      const anon: AuthUser = { id: USER.id, email: null, provider: 'anonymous' };
      await expect(controller.remindSigner(anon, 'env-1', 'signer-1', {})).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(svc.remindSigner).not.toHaveBeenCalled();
    });

    it('returns queued and forwards sender email from JWT (ignores body)', async () => {
      svc.remindSigner.mockResolvedValue(undefined);
      const out = await controller.remindSigner(USER, 'env-1', 'signer-1', {
        sender_email: 'evil@spoof.example',
      });
      expect(out).toEqual({ status: 'queued' });
      expect(svc.remindSigner).toHaveBeenCalledWith(USER.id, 'env-1', 'signer-1', {
        email: USER.email,
        name: null,
      });
    });

    it('falls back to body sender_email + name when JWT carries no email (anon/guest)', async () => {
      svc.remindSigner.mockResolvedValue(undefined);
      const anon: AuthUser = { id: USER.id, email: null, provider: 'anonymous' };
      const out = await controller.remindSigner(anon, 'env-1', 'signer-1', {
        sender_email: 'guest@example.com',
        sender_name: 'Guest User',
      });
      expect(out).toEqual({ status: 'queued' });
      expect(svc.remindSigner).toHaveBeenCalledWith(USER.id, 'env-1', 'signer-1', {
        email: 'guest@example.com',
        name: 'Guest User',
      });
    });
  });

  describe('POST /envelopes/:id/signers (addSigner)', () => {
    it('forwards dto', async () => {
      const signer = { id: 's1', email: 'a@x', name: 'A', color: '#000' };
      svc.addSigner.mockResolvedValue(signer as never);
      await controller.addSigner(USER, 'env-1', { contact_id: 'c-1' });
      expect(svc.addSigner).toHaveBeenCalledWith(USER.id, 'env-1', { contact_id: 'c-1' });
    });
  });

  describe('DELETE /envelopes/:id/signers/:signer_id (removeSigner)', () => {
    it('forwards both ids', async () => {
      svc.removeSigner.mockResolvedValue(undefined);
      await controller.removeSigner(USER, 'env-1', 'signer-1');
      expect(svc.removeSigner).toHaveBeenCalledWith(USER.id, 'env-1', 'signer-1');
    });
  });

  describe('PUT /envelopes/:id/fields (placeFields)', () => {
    it('maps optional placement fields to nullable defaults', async () => {
      svc.replaceFields.mockResolvedValue([] as never);
      await controller.placeFields(USER, 'env-1', {
        fields: [
          {
            signer_id: 'signer-1',
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.2,
            // width/height/required/link_id omitted
          },
        ],
      } as never);
      expect(svc.replaceFields).toHaveBeenCalledWith(USER.id, 'env-1', [
        {
          signer_id: 'signer-1',
          kind: 'signature',
          page: 1,
          x: 0.1,
          y: 0.2,
          width: null,
          height: null,
          required: true,
          link_id: null,
        },
      ]);
    });

    it('preserves explicit width/height/required/link_id', async () => {
      svc.replaceFields.mockResolvedValue([] as never);
      await controller.placeFields(USER, 'env-1', {
        fields: [
          {
            signer_id: 'signer-1',
            kind: 'signature',
            page: 1,
            x: 0.1,
            y: 0.2,
            width: 0.3,
            height: 0.05,
            required: false,
            link_id: 'fld-7',
          },
        ],
      } as never);
      expect(svc.replaceFields).toHaveBeenCalledWith(USER.id, 'env-1', [
        {
          signer_id: 'signer-1',
          kind: 'signature',
          page: 1,
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.05,
          required: false,
          link_id: 'fld-7',
        },
      ]);
    });

    it('wraps service result as { fields }', async () => {
      const fields = [{ id: 'f1' }] as never;
      svc.replaceFields.mockResolvedValue(fields);
      const out = await controller.placeFields(USER, 'env-1', { fields: [] } as never);
      expect(out).toEqual({ fields });
    });
  });

  describe('GET /envelopes/:id/events', () => {
    it('wraps service result as { events }', async () => {
      const events = [{ id: 'ev1' }] as never;
      svc.listEvents.mockResolvedValue(events);
      const out = await controller.events(USER, 'env-1');
      expect(out).toEqual({ events });
      expect(svc.listEvents).toHaveBeenCalledWith(USER.id, 'env-1');
    });
  });

  describe('GET /envelopes/:id/download', () => {
    const reply = { url: 'https://signed.example/x', kind: 'sealed' as const };

    it('forwards undefined kind when query omitted (default sealed-or-original)', async () => {
      svc.getDownloadUrl.mockResolvedValue(reply);
      await controller.download(USER, 'env-1');
      expect(svc.getDownloadUrl).toHaveBeenCalledWith(USER.id, 'env-1', undefined);
    });

    it.each(['sealed', 'original', 'audit'] as const)('forwards kind=%s verbatim', async (kind) => {
      svc.getDownloadUrl.mockResolvedValue({ ...reply, kind });
      const out = await controller.download(USER, 'env-1', kind);
      expect(svc.getDownloadUrl).toHaveBeenCalledWith(USER.id, 'env-1', kind);
      expect(out.kind).toBe(kind);
    });

    it('400 invalid_kind on unsupported kind', () => {
      expect(() => controller.download(USER, 'env-1', 'evil')).toThrow(BadRequestException);
      expect(svc.getDownloadUrl).not.toHaveBeenCalled();
    });
  });

  describe('POST /envelopes/:id/gdrive/save', () => {
    function makeRes(): { status: jest.Mock } {
      return { status: jest.fn() };
    }

    const okResult = {
      folder: { id: 'f1', name: 'Acme', webViewLink: 'https://drive.google.com/drive/folders/f1' },
      files: [
        { kind: 'sealed' as const, fileId: 's1', name: 'X (sealed).pdf', webViewLink: 'l1' },
        { kind: 'audit' as const, fileId: 'a1', name: 'X (audit trail).pdf', webViewLink: 'l2' },
      ],
      pushedAt: '2026-05-12T00:00:00.000Z',
    };

    it('happy path returns the result and does not set a 207 status', async () => {
      svc.saveToGoogleDrive.mockResolvedValue(okResult);
      const res = makeRes();
      const out = await controller.saveToGdrive(
        USER,
        'env-1',
        { folderId: 'f1', folderName: 'Acme' },
        res,
      );
      expect(svc.saveToGoogleDrive).toHaveBeenCalledWith(USER.id, 'env-1', {
        folderId: 'f1',
        folderName: 'Acme',
      });
      expect(out).toBe(okResult);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('partial success sets status 207', async () => {
      svc.saveToGoogleDrive.mockResolvedValue({
        ...okResult,
        files: [okResult.files[0]!],
        error: { kind: 'audit', code: 'DriveUpstreamError' },
      });
      const res = makeRes();
      await controller.saveToGdrive(USER, 'env-1', { folderId: 'f1' }, res);
      expect(res.status).toHaveBeenCalledWith(207);
    });

    it.each<[Error, number, string]>([
      [new NotFoundException('envelope_not_found'), 404, 'envelope_not_found'],
      [new ConflictException('envelope_not_sealed'), 409, 'envelope_not_sealed'],
      [new GdriveNotConnectedError(), 409, 'gdrive_not_connected'],
      [new TokenExpiredError(), 409, 'reconnect_required'],
      [new DrivePermissionDeniedError(), 403, 'folder_not_writable'],
      [new DriveUpstreamError(), 502, 'drive_request_failed'],
    ])('maps %s → HTTP %i', async (thrown, status) => {
      svc.saveToGoogleDrive.mockRejectedValue(thrown);
      const res = makeRes();
      const caught = await controller
        .saveToGdrive(USER, 'env-1', { folderId: 'f1' }, res)
        .catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(status);
    });

    it('maps RateLimitedError → 429 with retryAfter in seconds', async () => {
      svc.saveToGoogleDrive.mockRejectedValue(new RateLimitedError(45_000));
      const res = makeRes();
      const caught = await controller
        .saveToGdrive(USER, 'env-1', { folderId: 'f1' }, res)
        .catch((e: unknown) => e);
      expect(caught).toBeInstanceOf(HttpException);
      expect((caught as HttpException).getStatus()).toBe(429);
      const body = (caught as HttpException).getResponse() as { code: string; retryAfter: number };
      expect(body.code).toBe('rate-limited');
      expect(body.retryAfter).toBe(45);
    });
  });
});
