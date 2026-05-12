import { randomUUID } from 'node:crypto';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../../test/pg-mem-db';
import { EnvelopesPgRepository } from '../../../envelopes/envelopes.repository.pg';
import { GdriveEnvelopeExportsPgRepository } from '../gdrive-envelope-exports.repository.pg';

let shortCodeCounter = 0;
function nextShortCode(): string {
  shortCodeCounter += 1;
  return `SC${String(shortCodeCounter).padStart(11, '0')}`;
}

async function seedEnvelope(handle: PgMemHandle, ownerId: string): Promise<string> {
  const repo = new EnvelopesPgRepository(handle.db);
  const e = await repo.createDraft({
    owner_id: ownerId,
    title: 'Export target',
    short_code: nextShortCode(),
    tc_version: 'tc-v1',
    privacy_version: 'pp-v1',
    expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
  });
  return e.id;
}

function seedGdriveAccount(handle: PgMemHandle, ownerId: string): string {
  const id = randomUUID();
  // pg-mem stores bytea as text bytes; a literal placeholder is fine for
  // a FK-only seed (nothing decrypts it here).
  handle.mem.public.none(`
    insert into public.gdrive_accounts
      (id, user_id, google_user_id, google_email, refresh_token_ciphertext,
       refresh_token_kms_key_arn, scope)
    values ('${id}', '${ownerId}', 'g-${id}', 'a-${id}@example.com', 'ciphertext',
            'arn:stub', 'https://www.googleapis.com/auth/drive.file');
  `);
  return id;
}

describe('GdriveEnvelopeExportsPgRepository', () => {
  let handle: PgMemHandle;
  let repo: GdriveEnvelopeExportsPgRepository;
  let ownerId: string;
  let envelopeId: string;
  let accountId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new GdriveEnvelopeExportsPgRepository(handle.db);
    ownerId = await seedUser(handle);
    envelopeId = await seedEnvelope(handle, ownerId);
    accountId = seedGdriveAccount(handle, ownerId);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('upsert inserts a fresh row, then updates it on the (envelope, account) conflict', async () => {
    const first = await repo.upsert({
      envelopeId,
      accountId,
      folderId: 'folder-X',
      folderName: 'Clients/Acme',
      sealedFileId: 'sealed-1',
      auditFileId: 'audit-1',
    });
    expect(first.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(first.envelopeId).toBe(envelopeId);
    expect(first.accountId).toBe(accountId);
    expect(first.folderId).toBe('folder-X');
    expect(first.folderName).toBe('Clients/Acme');
    expect(first.sealedFileId).toBe('sealed-1');
    expect(first.auditFileId).toBe('audit-1');
    expect(first.lastPushedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    const second = await repo.upsert({
      envelopeId,
      accountId,
      folderId: 'folder-Y',
      folderName: 'New',
      sealedFileId: 'sealed-2',
      auditFileId: null,
    });
    expect(second.id).toBe(first.id); // same row updated, not a new insert
    expect(second.folderId).toBe('folder-Y');
    expect(second.folderName).toBe('New');
    expect(second.sealedFileId).toBe('sealed-2');
    expect(second.auditFileId).toBeNull();
  });

  it('findByEnvelopeAndAccount returns the row or null', async () => {
    expect(await repo.findByEnvelopeAndAccount(envelopeId, accountId)).toBeNull();
    await repo.upsert({
      envelopeId,
      accountId,
      folderId: 'folder-X',
      folderName: null,
      sealedFileId: null,
      auditFileId: null,
    });
    const found = await repo.findByEnvelopeAndAccount(envelopeId, accountId);
    expect(found?.folderId).toBe('folder-X');
    expect(await repo.findByEnvelopeAndAccount(envelopeId, randomUUID())).toBeNull();
  });

  it('findLatestByEnvelope returns the most recently pushed row across accounts', async () => {
    const otherAccount = seedGdriveAccount(handle, ownerId);
    await repo.upsert({
      envelopeId,
      accountId,
      folderId: 'folder-old',
      folderName: null,
      sealedFileId: null,
      auditFileId: null,
    });
    // Small delay so last_pushed_at differs (now() resolution is fine in
    // pg-mem; force a distinct value just in case).
    await new Promise((r) => setTimeout(r, 5));
    await repo.upsert({
      envelopeId,
      accountId: otherAccount,
      folderId: 'folder-new',
      folderName: 'Latest',
      sealedFileId: null,
      auditFileId: null,
    });
    const latest = await repo.findLatestByEnvelope(envelopeId);
    expect(latest?.folderId).toBe('folder-new');
  });
});
