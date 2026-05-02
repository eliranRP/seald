import { Readable } from 'node:stream';
import type { AuthUser } from '../auth/auth-user';
import type { ContactsRepository } from '../contacts/contacts.repository';
import type { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import type { EnvelopesRepository } from '../envelopes/envelopes.repository';
import type { StorageService } from '../storage/storage.service';
import type { TemplatesRepository } from '../templates/templates.repository';
import type { IdempotencyRepository } from './idempotency.repository';
import { MeService } from './me.service';
import type { SupabaseAdminClient } from './supabase-admin.client';
import type { TombstonesRepository } from './tombstones.repository';

/**
 * Extra coverage for MeService that the original spec didn't reach:
 *
 *   - `exportAll` storage-failure path → warnings logged, export still
 *     resolves (warnings are NOT in the wire shape on the non-streamed
 *     path; the log line is the only signal)
 *   - `exportAllStream` envelope-disappeared race → warnings[] gets a
 *     `envelope_disappeared` entry and the row is dropped (no crash)
 *   - `collectEnvelopeIds` walks pagination via decodeCursorOrThrow
 *   - `collectEnvelopeIds` undecodable cursor → returns ids gathered so
 *     far, doesn't crash the export
 */
const USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'maya@example.com',
  provider: 'email',
};

function emptyEnvelope(id: string) {
  return {
    id,
    owner_id: USER.id,
    title: `e-${id}`,
    short_code: `code-${id}`,
    signers: [{ id: 's1', email: 'a@x', name: 'A' }],
    fields: [],
  };
}

function makeMocks(envelopesRepoOverrides: Partial<EnvelopesRepository> = {}) {
  const contactsRepo = {
    findAllByOwner: jest.fn(async () => []),
    deleteAllByOwner: jest.fn(async () => 0),
  } as unknown as ContactsRepository;
  const templatesRepo = {
    findAllByOwner: jest.fn(async () => []),
    deleteAllByOwner: jest.fn(async () => 0),
  } as unknown as TemplatesRepository;
  const baseEnvelopesRepo = {
    listByOwner: jest.fn(async () => ({ items: [{ id: 'env-1' }], next_cursor: null })),
    findByIdWithAll: jest.fn(async (id: string) => emptyEnvelope(id)),
    listEventsForEnvelope: jest.fn(async () => []),
    getFilePaths: jest.fn(async () => ({
      original_file_path: 'env/env-1/original.pdf',
      sealed_file_path: null,
      audit_file_path: null,
    })),
    listSignerImagePaths: jest.fn(async () => []),
    purgeOwnedDataForAccountDeletion: jest.fn(async () => ({
      drafts_deleted: 0,
      envelopes_preserved: 0,
      signers_anonymized: 0,
      retention_events_appended: 0,
    })),
    decodeCursorOrThrow: jest.fn(() => ({ updated_at: '2026-01-01T00:00:00Z', id: 'x' })),
    ...envelopesRepoOverrides,
  } as unknown as EnvelopesRepository;
  const outboundEmailsRepo = {
    listByEnvelope: jest.fn(async () => []),
  } as unknown as OutboundEmailsRepository;
  const idempotencyRepo = {
    deleteByUser: jest.fn(async () => 0),
  } as unknown as IdempotencyRepository;
  const supabaseAdmin = {
    deleteUser: jest.fn(async () => undefined),
  } as unknown as SupabaseAdminClient;
  const tombstonesRepo = {
    recordDeletion: jest.fn(async () => undefined),
  } as unknown as TombstonesRepository;
  const storage = {
    createSignedUrl: jest.fn(async (path: string) => `https://signed.test/${path}`),
  } as unknown as StorageService;
  return {
    contactsRepo,
    envelopesRepo: baseEnvelopesRepo,
    templatesRepo,
    outboundEmailsRepo,
    idempotencyRepo,
    supabaseAdmin,
    storage,
    tombstonesRepo,
  };
}

function build(m: ReturnType<typeof makeMocks>): MeService {
  return new MeService(
    m.contactsRepo,
    m.envelopesRepo,
    m.templatesRepo,
    m.outboundEmailsRepo,
    m.idempotencyRepo,
    m.supabaseAdmin,
    m.storage,
    m.tombstonesRepo,
  );
}

async function drainStream(stream: Readable): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

describe('MeService.exportAll — storage warning log path', () => {
  it('logs (does not throw) when signed-URL generation fails on the non-streamed path', async () => {
    const m = makeMocks();
    (m.envelopesRepo.getFilePaths as jest.Mock).mockResolvedValueOnce({
      original_file_path: 'env/env-1/original.pdf',
      sealed_file_path: 'env/env-1/sealed.pdf',
      audit_file_path: null,
    });
    (m.storage.createSignedUrl as jest.Mock).mockImplementation(async (path: string) => {
      if (path === 'env/env-1/sealed.pdf') throw new Error('storage_blip');
      return `https://signed.test/${path}`;
    });
    const svc = build(m);
    const out = await svc.exportAll(USER);
    // Warning is logged, not surfaced — wire shape is frozen on the
    // non-streamed path. The sealed URL falls back to null.
    expect(out.envelopes[0]?.files.sealed_pdf_url).toBeNull();
    expect(out.envelopes[0]?.files.original_pdf_url).toBe(
      'https://signed.test/env/env-1/original.pdf',
    );
  });

  it('storage error surfaces a string when err is not an Error instance', async () => {
    const m = makeMocks();
    // Throwing a non-Error so the `String(err)` fallback path runs.
    (m.storage.createSignedUrl as jest.Mock).mockImplementation(async () => {
      // eslint-disable-next-line no-throw-literal, @typescript-eslint/no-throw-literal
      throw 'plain_string_error';
    });
    const svc = build(m);
    const out = await svc.exportAll(USER);
    expect(out.envelopes[0]?.files.original_pdf_url).toBeNull();
  });
});

describe('MeService.exportAllStream — disappearance race', () => {
  it('drops envelopes that disappear mid-stream and records a `envelope_disappeared` warning', async () => {
    const m = makeMocks({
      listByOwner: jest.fn(async () => ({
        items: [{ id: 'env-1' }, { id: 'env-2' }],
        next_cursor: null,
      })) as unknown as EnvelopesRepository['listByOwner'],
    });
    // env-1 hydrates fine, env-2 raced a delete.
    (m.envelopesRepo.findByIdWithAll as jest.Mock).mockImplementation(async (id: string) =>
      id === 'env-2' ? null : emptyEnvelope(id),
    );
    const svc = build(m);
    const stream = await svc.exportAllStream(USER);
    const payload = (await drainStream(stream)) as {
      envelopes: ReadonlyArray<unknown>;
      warnings: ReadonlyArray<{ code: string; detail: string }>;
    };
    expect(payload.envelopes).toHaveLength(1);
    expect(payload.warnings.some((w) => w.code === 'envelope_disappeared')).toBe(true);
    expect(payload.warnings.find((w) => w.code === 'envelope_disappeared')?.detail).toContain(
      'env-2',
    );
  });
});

describe('MeService.collectEnvelopeIds (via exportAll)', () => {
  it('walks paginated cursors and concatenates ids across pages', async () => {
    const m = makeMocks();
    let call = 0;
    (m.envelopesRepo.listByOwner as jest.Mock).mockImplementation(async () => {
      call += 1;
      if (call === 1) return { items: [{ id: 'env-1' }, { id: 'env-2' }], next_cursor: 'cur-1' };
      if (call === 2) return { items: [{ id: 'env-3' }], next_cursor: null };
      return { items: [], next_cursor: null };
    });
    const svc = build(m);
    const out = await svc.exportAll(USER);
    expect(out.envelopes.map((e) => e.envelope.id).sort()).toEqual(['env-1', 'env-2', 'env-3']);
    expect(m.envelopesRepo.decodeCursorOrThrow).toHaveBeenCalledWith('cur-1');
  });

  it('stops cleanly when the cursor format is undecodable (defensive branch)', async () => {
    const m = makeMocks();
    let call = 0;
    (m.envelopesRepo.listByOwner as jest.Mock).mockImplementation(async () => {
      call += 1;
      if (call === 1) return { items: [{ id: 'env-1' }], next_cursor: 'broken' };
      // Should never be called — the decoder throws, so pagination halts.
      return { items: [{ id: 'never' }], next_cursor: null };
    });
    (m.envelopesRepo.decodeCursorOrThrow as jest.Mock).mockImplementation(() => {
      throw new Error('cursor_format_changed');
    });
    const svc = build(m);
    const out = await svc.exportAll(USER);
    // Got the first page only; no crash.
    expect(out.envelopes).toHaveLength(1);
    expect(out.envelopes[0]?.envelope.id).toBe('env-1');
  });
});
