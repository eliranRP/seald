import { ServiceUnavailableException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import type { AuthUser } from '../../auth/auth-user';
import type { ContactsRepository } from '../../contacts/contacts.repository';
import type { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { EnvelopesRepository } from '../../envelopes/envelopes.repository';
import type { StorageService } from '../../storage/storage.service';
import type { TemplatesRepository } from '../../templates/templates.repository';
import type { IdempotencyRepository } from '../idempotency.repository';
import { MeService } from '../me.service';
import { SupabaseAdminClient, SupabaseAdminError } from '../supabase-admin.client';
import type { TombstonesRepository } from '../tombstones.repository';

const USER: AuthUser = {
  id: '11111111-1111-1111-1111-111111111111',
  email: 'maya@example.com',
  provider: 'email',
};

function makeMocks() {
  const calls: string[] = [];
  const contactsRepo = {
    findAllByOwner: jest.fn(async () => [{ id: 'c1', name: 'A', email: 'a@x' }]),
    deleteAllByOwner: jest.fn(async () => {
      calls.push('contacts.deleteAllByOwner');
      return 1;
    }),
  } as unknown as ContactsRepository;
  const templatesRepo = {
    findAllByOwner: jest.fn(async () => [{ id: 't1', title: 'T1' }]),
    deleteAllByOwner: jest.fn(async () => {
      calls.push('templates.deleteAllByOwner');
      return 1;
    }),
  } as unknown as TemplatesRepository;
  const envelopesRepo = {
    listByOwner: jest.fn(async () => ({
      items: [{ id: 'env-1' }],
      next_cursor: null,
    })),
    findByIdWithAll: jest.fn(async (id: string) => ({
      id,
      owner_id: USER.id,
      title: 'NDA',
      short_code: 'aaaaaaaaaaaaa',
      signers: [{ id: 's1', email: 'a@x', name: 'A' }],
      fields: [],
    })),
    listEventsForEnvelope: jest.fn(async () => [{ id: 'e1', event_type: 'created' }]),
    // Issue #46 — surfaces the file paths the export attaches signed
    // URLs to. Default returns one of each; tests override to exercise
    // the null-degrades-cleanly path and the storage-failure path.
    getFilePaths: jest.fn(async () => ({
      original_file_path: 'env/env-1/original.pdf',
      sealed_file_path: 'env/env-1/sealed.pdf',
      audit_file_path: 'env/env-1/audit.pdf',
    })),
    listSignerImagePaths: jest.fn(async () => [
      {
        signer_id: 's1',
        signature_image_path: 'env/env-1/sigs/s1.png',
        initials_image_path: 'env/env-1/sigs/s1-initials.png',
      },
    ]),
    // Issues #38/#43 — atomic envelopes purge for account deletion.
    // Default returns realistic counts so call-order assertions work
    // without each test rewiring it.
    purgeOwnedDataForAccountDeletion: jest.fn(async () => {
      calls.push('envelopes.purgeOwnedDataForAccountDeletion');
      return {
        drafts_deleted: 2,
        envelopes_preserved: 3,
        signers_anonymized: 4,
        retention_events_appended: 3,
      };
    }),
  } as unknown as EnvelopesRepository;
  const outboundEmailsRepo = {
    listByEnvelope: jest.fn(async () => [{ id: 'oe1', kind: 'invite' }]),
  } as unknown as OutboundEmailsRepository;
  const idempotencyRepo = {
    deleteByUser: jest.fn(async () => {
      calls.push('idempotency.deleteByUser');
      return 3;
    }),
  } as unknown as IdempotencyRepository;
  const supabaseAdmin = {
    deleteUser: jest.fn(async () => {
      calls.push('supabaseAdmin.deleteUser');
    }),
  } as unknown as SupabaseAdminClient;
  const tombstonesRepo = {
    recordDeletion: jest.fn(async () => {
      calls.push('tombstones.recordDeletion');
    }),
  } as unknown as TombstonesRepository;
  // Default storage stub returns a deterministic signed URL per path so
  // tests can assert wiring; failure mode is opt-in via mockRejectedValueOnce.
  const storage = {
    createSignedUrl: jest.fn(
      async (path: string, ttl: number) => `https://signed.test/${path}?ttl=${ttl}`,
    ),
  } as unknown as StorageService;
  return {
    calls,
    contactsRepo,
    templatesRepo,
    envelopesRepo,
    outboundEmailsRepo,
    idempotencyRepo,
    supabaseAdmin,
    storage,
    tombstonesRepo,
  };
}

function build(mocks: ReturnType<typeof makeMocks>): MeService {
  return new MeService(
    mocks.contactsRepo,
    mocks.envelopesRepo,
    mocks.templatesRepo,
    mocks.outboundEmailsRepo,
    mocks.idempotencyRepo,
    mocks.supabaseAdmin,
    mocks.storage,
    mocks.tombstonesRepo,
  );
}

const EXPECTED_EMAIL_HASH = createHash('sha256').update(USER.email!.toLowerCase()).digest('hex');

/** Drain a Readable JSON stream to a parsed object. */
async function drainStream(stream: Readable): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(String(c)));
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

describe('MeService.exportAll', () => {
  it('builds an AccountExport with meta + counts + nested envelope bundles', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    const out = await svc.exportAll(USER);
    expect(out.meta.format_version).toBe('1.0');
    expect(out.meta.user).toEqual({ id: USER.id, email: USER.email });
    // Issue #46 — flipped to true now that storage URLs are attached.
    expect(out.meta.includes_files).toBe(true);
    expect(out.meta.counts).toEqual({
      contacts: 1,
      envelopes: 1,
      templates: 1,
      outbound_emails: 1,
    });
    expect(out.contacts).toHaveLength(1);
    expect(out.templates).toHaveLength(1);
    expect(out.envelopes).toHaveLength(1);
    expect(out.envelopes[0]?.envelope.id).toBe('env-1');
    expect(out.envelopes[0]?.events).toHaveLength(1);
    expect(out.envelopes[0]?.outbound_emails).toHaveLength(1);
  });

  it('skips envelopes that disappear mid-flight rather than crashing', async () => {
    const mocks = makeMocks();
    (mocks.envelopesRepo.findByIdWithAll as jest.Mock).mockResolvedValueOnce(null);
    const svc = build(mocks);
    const out = await svc.exportAll(USER);
    expect(out.envelopes).toHaveLength(0);
    expect(out.meta.counts.envelopes).toBe(0);
  });

  // Issue #46 — every storage path on the envelope row plus every signer
  // image path becomes a 1-hour signed URL on the envelope's `files`
  // block. Null paths (e.g. an unsealed draft) emit `null` URLs without
  // a warning.
  it('attaches signed URLs for every envelope/signer storage path with 1h TTL', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    const out = await svc.exportAll(USER);
    const files = out.envelopes[0]?.files;
    expect(files?.original_pdf_url).toBe('https://signed.test/env/env-1/original.pdf?ttl=3600');
    expect(files?.sealed_pdf_url).toBe('https://signed.test/env/env-1/sealed.pdf?ttl=3600');
    expect(files?.audit_pdf_url).toBe('https://signed.test/env/env-1/audit.pdf?ttl=3600');
    expect(files?.signers).toHaveLength(1);
    expect(files?.signers[0]).toEqual({
      signer_id: 's1',
      signature_image_url: 'https://signed.test/env/env-1/sigs/s1.png?ttl=3600',
      initials_image_url: 'https://signed.test/env/env-1/sigs/s1-initials.png?ttl=3600',
    });
    expect(mocks.storage.createSignedUrl).toHaveBeenCalledWith('env/env-1/sealed.pdf', 60 * 60);
  });

  it('emits null URLs without warnings when a storage path is absent', async () => {
    const mocks = makeMocks();
    (mocks.envelopesRepo.getFilePaths as jest.Mock).mockResolvedValueOnce({
      original_file_path: 'env/env-1/original.pdf',
      sealed_file_path: null, // not yet sealed
      audit_file_path: null, // no audit yet
    });
    (mocks.envelopesRepo.listSignerImagePaths as jest.Mock).mockResolvedValueOnce([
      { signer_id: 's1', signature_image_path: null, initials_image_path: null },
    ]);
    const svc = build(mocks);
    const out = await svc.exportAll(USER);
    const files = out.envelopes[0]?.files;
    expect(files?.original_pdf_url).toBe('https://signed.test/env/env-1/original.pdf?ttl=3600');
    expect(files?.sealed_pdf_url).toBeNull();
    expect(files?.audit_pdf_url).toBeNull();
    expect(files?.signers[0]?.signature_image_url).toBeNull();
    expect(files?.signers[0]?.initials_image_url).toBeNull();
    // Storage was only invoked for the path that actually existed.
    expect(mocks.storage.createSignedUrl).toHaveBeenCalledTimes(1);
  });
});

describe('MeService.exportAllStream', () => {
  // Issue #46 — failed signed-URL generation must surface as a
  // `meta.warnings[]` entry keyed by the failing storage path; the URL
  // field degrades to null and the rest of the export continues.
  it('surfaces storage failures in warnings[] without aborting the stream', async () => {
    const mocks = makeMocks();
    (mocks.storage.createSignedUrl as jest.Mock).mockImplementation(async (path: string) => {
      if (path === 'env/env-1/sealed.pdf') throw new Error('storage_sign_failed_500: bucket gone');
      return `https://signed.test/${path}`;
    });
    const svc = build(mocks);
    const stream = await svc.exportAllStream(USER);
    const payload = (await drainStream(stream)) as {
      meta: { includes_files: boolean };
      envelopes: ReadonlyArray<{ files: { sealed_pdf_url: string | null } }>;
      warnings: ReadonlyArray<{ code: string; detail: string }>;
    };
    expect(payload.meta.includes_files).toBe(true);
    expect(payload.envelopes[0]?.files.sealed_pdf_url).toBeNull();
    expect(payload.warnings).toHaveLength(1);
    expect(payload.warnings[0]?.code).toBe('storage_url_failed');
    expect(payload.warnings[0]?.detail).toContain('env/env-1/sealed.pdf');
    expect(payload.warnings[0]?.detail).toContain('bucket gone');
  });
});

describe('MeService.deleteAccount', () => {
  it('runs the soft-delete pipeline in the legally-required order', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    await svc.deleteAccount(USER);
    // Order matters — see MeService.deleteAccount docstring.
    //   1. idempotency wipe (FK doesn't cascade)
    //   2. contacts hard-delete (working state)
    //   3. templates hard-delete (working state)
    //   4. envelopes purge (drafts deleted, sealed preserved + anonymized)
    //   5. tombstone recorded BEFORE supabase admin so a partial
    //      failure still leaves a forensic breadcrumb
    //   6. supabase admin call last
    expect(mocks.calls).toEqual([
      'idempotency.deleteByUser',
      'contacts.deleteAllByOwner',
      'templates.deleteAllByOwner',
      'envelopes.purgeOwnedDataForAccountDeletion',
      'tombstones.recordDeletion',
      'supabaseAdmin.deleteUser',
    ]);
    expect(mocks.idempotencyRepo.deleteByUser).toHaveBeenCalledWith(USER.id);
    expect(mocks.contactsRepo.deleteAllByOwner).toHaveBeenCalledWith(USER.id);
    expect(mocks.templatesRepo.deleteAllByOwner).toHaveBeenCalledWith(USER.id);
    expect(mocks.supabaseAdmin.deleteUser).toHaveBeenCalledWith(USER.id);
  });

  it('records a tombstone with sha256(lowercase(email)) before supabase admin', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    await svc.deleteAccount(USER);
    expect(mocks.tombstonesRepo.recordDeletion).toHaveBeenCalledWith({
      user_id: USER.id,
      email_hash: EXPECTED_EMAIL_HASH,
    });
    // tombstone runs strictly before the supabase admin call so a
    // partial failure still leaves a forensic record.
    const tombstoneIdx = mocks.calls.indexOf('tombstones.recordDeletion');
    const supabaseIdx = mocks.calls.indexOf('supabaseAdmin.deleteUser');
    expect(tombstoneIdx).toBeGreaterThan(-1);
    expect(supabaseIdx).toBeGreaterThan(tombstoneIdx);
  });

  it('lower-cases the email before hashing so case-variants tombstone identically', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    await svc.deleteAccount({ ...USER, email: 'MAYA@Example.COM' });
    expect(mocks.tombstonesRepo.recordDeletion).toHaveBeenCalledWith({
      user_id: USER.id,
      email_hash: EXPECTED_EMAIL_HASH,
    });
  });

  it('preserves sealed envelopes by calling the purge port, not a cascade', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    await svc.deleteAccount(USER);
    // The purge port is what guarantees sealed envelopes survive.
    // ESIGN §7001(d) / GDPR Art. 17(3)(b/e) compliance hinges on this
    // call existing — if a future refactor drops it, the test fails.
    expect(mocks.envelopesRepo.purgeOwnedDataForAccountDeletion).toHaveBeenCalledWith({
      owner_id: USER.id,
      email: USER.email,
      email_hash: EXPECTED_EMAIL_HASH,
    });
  });

  it('hashes empty string when AuthUser.email is null (defensive)', async () => {
    const mocks = makeMocks();
    const svc = build(mocks);
    const expectedNullHash = createHash('sha256').update('').digest('hex');
    await svc.deleteAccount({ ...USER, email: null });
    expect(mocks.tombstonesRepo.recordDeletion).toHaveBeenCalledWith({
      user_id: USER.id,
      email_hash: expectedNullHash,
    });
    expect(mocks.envelopesRepo.purgeOwnedDataForAccountDeletion).toHaveBeenCalledWith({
      owner_id: USER.id,
      email: null,
      email_hash: expectedNullHash,
    });
  });

  it('maps SupabaseAdminError to a 503 (ServiceUnavailableException)', async () => {
    const mocks = makeMocks();
    (mocks.supabaseAdmin.deleteUser as jest.Mock).mockRejectedValueOnce(
      new SupabaseAdminError('SUPABASE_SERVICE_ROLE_KEY is not configured'),
    );
    const svc = build(mocks);
    await expect(svc.deleteAccount(USER)).rejects.toBeInstanceOf(ServiceUnavailableException);
    // Every preceding step ran (they're all idempotent so retry is safe).
    expect(mocks.idempotencyRepo.deleteByUser).toHaveBeenCalledWith(USER.id);
    expect(mocks.contactsRepo.deleteAllByOwner).toHaveBeenCalledWith(USER.id);
    expect(mocks.templatesRepo.deleteAllByOwner).toHaveBeenCalledWith(USER.id);
    expect(mocks.envelopesRepo.purgeOwnedDataForAccountDeletion).toHaveBeenCalled();
    expect(mocks.tombstonesRepo.recordDeletion).toHaveBeenCalled();
  });

  it('rethrows non-SupabaseAdminError errors verbatim', async () => {
    const mocks = makeMocks();
    const boom = new Error('boom');
    (mocks.supabaseAdmin.deleteUser as jest.Mock).mockRejectedValueOnce(boom);
    const svc = build(mocks);
    await expect(svc.deleteAccount(USER)).rejects.toBe(boom);
  });
});
