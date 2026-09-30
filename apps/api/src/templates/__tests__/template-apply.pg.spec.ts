import { PDFDocument } from 'pdf-lib';
import type { AppEnv } from '../../config/env.schema';
import type { ContactsRepository } from '../../contacts/contacts.repository';
import { EnvelopesService } from '../../envelopes/envelopes.service';
import { EnvelopesPgRepository } from '../../envelopes/envelopes.repository.pg';
import type { OutboundEmailsRepository } from '../../email/outbound-emails.repository';
import type { GdriveEnvelopeExportsRepository } from '../../integrations/gdrive/gdrive-envelope-exports.repository';
import type { GdriveExportService } from '../../integrations/gdrive/gdrive-export.service';
import type { GDriveService } from '../../integrations/gdrive/gdrive.service';
import type { SigningTokenService } from '../../signing/signing-token.service';
import type { StorageService } from '../../storage/storage.service';
import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { TemplateApplyService, TemplateRoleUnmappedError } from '../template-apply.service';
import { TemplatesPgRepository } from '../templates.repository.pg';
import { TemplatesService } from '../templates.service';

/**
 * Real `replaceFields` against pg-mem. Proves legacy 560-grid pixels
 * land inside the `envelope_fields` 0–1 checks, and that `uses_count`
 * moves only after that write.
 */
describe('TemplateApplyService (pg-mem)', () => {
  let handle: PgMemHandle;

  beforeEach(() => {
    handle = createPgMemDb();
  });

  afterEach(async () => {
    await handle.close();
  });

  it('writes normalized coordinates that satisfy the envelope_fields checks', async () => {
    const ownerId = await seedUser(handle);
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 100]);
    const pdfBytes = Buffer.from(await pdf.save());

    const envelopesRepo = new EnvelopesPgRepository(handle.db);
    const templatesRepo = new TemplatesPgRepository(handle.db);
    const storage = { download: async () => pdfBytes } as unknown as StorageService;
    const envelopes = new EnvelopesService(
      envelopesRepo,
      {} as ContactsRepository,
      storage,
      {} as OutboundEmailsRepository,
      {} as SigningTokenService,
      {} as AppEnv,
      { listAccounts: async () => [] } as unknown as GDriveService,
      {} as GdriveExportService,
      { findLatestByEnvelope: async () => null } as unknown as GdriveEnvelopeExportsRepository,
    );
    const templates = new TemplatesService(templatesRepo, storage);
    const apply = new TemplateApplyService(templates, envelopes);

    const template = await templatesRepo.create({
      owner_id: ownerId,
      title: 'NDA',
      description: null,
      cover_color: null,
      last_signers: [{ id: 'role-1', name: 'Ada', email: 'ada@example.com', color: '#112233' }],
      field_layout: [
        {
          type: 'signature',
          pageRule: 'first',
          x: 280,
          y: 140,
          signerRoleId: 'role-1',
        },
        {
          type: 'email',
          pageRule: 'first',
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.1,
          coordVersion: 2,
          signerRoleId: 'role-1',
        },
      ],
    });
    const envelope = await envelopesRepo.createDraft({
      owner_id: ownerId,
      title: 'Draft',
      short_code: 'SC00000000001',
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await envelopesRepo.addSigner(envelope.id, {
      email: 'ada@example.com',
      name: 'Ada',
      color: '#112233',
    });
    await envelopesRepo.setOriginalFile(envelope.id, {
      file_path: `${envelope.id}/original.pdf`,
      sha256: 'ab'.repeat(32),
      pages: 1,
    });

    const result = await apply.apply(ownerId, template.id, envelope.id);

    expect(result.uses_count).toBe(1);
    const rows = await handle.db
      .selectFrom('envelope_fields')
      .select(['kind', 'x', 'y', 'width', 'height'])
      .where('envelope_id', '=', envelope.id)
      .orderBy('kind', 'asc')
      .execute();
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      const x = Number(row.x);
      const y = Number(row.y);
      const width = Number(row.width);
      const height = Number(row.height);
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(1);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(1);
      expect(width).toBeGreaterThan(0);
      expect(width).toBeLessThanOrEqual(1);
      expect(height).toBeGreaterThan(0);
      expect(height).toBeLessThanOrEqual(1);
    }
    const email = rows.find((row) => row.kind === 'email');
    const signature = rows.find((row) => row.kind === 'signature');
    expect(email).toBeDefined();
    expect(Number(email?.x)).toBeCloseTo(0.1, 4);
    expect(Number(email?.y)).toBeCloseTo(0.2, 4);
    expect(Number(email?.width)).toBeCloseTo(0.3, 4);
    expect(Number(email?.height)).toBeCloseTo(0.1, 4);
    // 200×100 page → grid height 280. 280/560 = 0.5, 140/280 = 0.5.
    // Signature defaults are 200×54 px.
    expect(Number(signature?.x)).toBeCloseTo(0.5, 4);
    expect(Number(signature?.y)).toBeCloseTo(0.5, 4);
    expect(Number(signature?.width)).toBeCloseTo(200 / 560, 4);
    expect(Number(signature?.height)).toBeCloseTo(54 / 280, 4);

    const reloaded = await templatesRepo.findOneByOwner(ownerId, template.id);
    expect(reloaded?.uses_count).toBe(1);
  });

  it('does not increment uses_count when the signer role does not match', async () => {
    const ownerId = await seedUser(handle);
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 100]);
    const pdfBytes = Buffer.from(await pdf.save());
    const envelopesRepo = new EnvelopesPgRepository(handle.db);
    const templatesRepo = new TemplatesPgRepository(handle.db);
    const storage = { download: async () => pdfBytes } as unknown as StorageService;
    const envelopes = new EnvelopesService(
      envelopesRepo,
      {} as ContactsRepository,
      storage,
      {} as OutboundEmailsRepository,
      {} as SigningTokenService,
      {} as AppEnv,
      { listAccounts: async () => [] } as unknown as GDriveService,
      {} as GdriveExportService,
      { findLatestByEnvelope: async () => null } as unknown as GdriveEnvelopeExportsRepository,
    );
    const apply = new TemplateApplyService(new TemplatesService(templatesRepo, storage), envelopes);

    const template = await templatesRepo.create({
      owner_id: ownerId,
      title: 'NDA',
      description: null,
      cover_color: null,
      last_signers: [{ id: 'role-1', name: 'Ada', email: 'ada@example.com', color: '#112233' }],
      field_layout: [
        { type: 'signature', pageRule: 'first', x: 280, y: 140, signerRoleId: 'role-1' },
      ],
    });
    const envelope = await envelopesRepo.createDraft({
      owner_id: ownerId,
      title: 'Draft',
      short_code: 'SC00000000002',
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await envelopesRepo.addSigner(envelope.id, {
      email: 'someone-else@example.com',
      name: 'Bea',
      color: '#445566',
    });
    await envelopesRepo.setOriginalFile(envelope.id, {
      file_path: `${envelope.id}/original.pdf`,
      sha256: 'cd'.repeat(32),
      pages: 1,
    });

    await expect(apply.apply(ownerId, template.id, envelope.id)).rejects.toBeInstanceOf(
      TemplateRoleUnmappedError,
    );
    const reloaded = await templatesRepo.findOneByOwner(ownerId, template.id);
    expect(reloaded?.uses_count).toBe(0);
    const fields = await handle.db
      .selectFrom('envelope_fields')
      .selectAll()
      .where('envelope_id', '=', envelope.id)
      .execute();
    expect(fields).toHaveLength(0);
  });

  it('rejects a raw coordinate outside 0–1 on the real replaceFields path', async () => {
    const ownerId = await seedUser(handle);
    const envelopesRepo = new EnvelopesPgRepository(handle.db);
    const envelope = await envelopesRepo.createDraft({
      owner_id: ownerId,
      title: 'Draft',
      short_code: 'SC00000000003',
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const signer = await envelopesRepo.addSigner(envelope.id, {
      email: 'ada@example.com',
      name: 'Ada',
      color: '#112233',
    });
    await expect(
      envelopesRepo.replaceFields(envelope.id, [
        { signer_id: signer.id, kind: 'signature', page: 1, x: 2, y: 0.5 },
      ]),
    ).rejects.toThrow();
  });
});
