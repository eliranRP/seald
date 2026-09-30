import { PDFDocument } from 'pdf-lib';
import type { AppEnv } from '../../config/env.schema';
import { ContactsPgRepository } from '../../contacts/contacts.repository.pg';
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
    const ada = await new ContactsPgRepository(handle.db).create({
      owner_id: ownerId,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
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
      last_signers: [{ id: ada.id, name: 'Ada', email: 'ada@example.com', color: '#112233' }],
      field_layout: [
        {
          type: 'signature',
          pageRule: 'first',
          x: 280,
          y: 140,
          signerRoleId: ada.id,
        },
        {
          type: 'email',
          pageRule: 'first',
          x: 0.1,
          y: 0.2,
          width: 0.3,
          height: 0.1,
          coordVersion: 2,
          signerRoleId: ada.id,
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
      contact_id: ada.id,
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

  it('does not increment uses_count when a field has no signer role', async () => {
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
      field_layout: [{ type: 'signature', pageRule: 'first', x: 280, y: 140 }],
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

  it('writes the MSA fixture as real rows inside the 0–1 checks', async () => {
    const ownerId = await seedUser(handle);
    const pdf = await PDFDocument.create();
    pdf.addPage([612, 792]);
    pdf.addPage([612, 792]);
    pdf.addPage([612, 792]);
    const pdfBytes = Buffer.from(await pdf.save());
    const envelopesRepo = new EnvelopesPgRepository(handle.db);
    const templatesRepo = new TemplatesPgRepository(handle.db);
    const contact = await new ContactsPgRepository(handle.db).create({
      owner_id: ownerId,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
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
    const gridHeight = 560 * (792 / 612);
    const msa = [
      { type: 'initial' as const, pageRule: 'all' as const, x: 522, y: 50 },
      { type: 'date' as const, pageRule: 'last' as const, x: 60, y: 488 },
      { type: 'signature' as const, pageRule: 'last' as const, x: 60, y: 540 },
      { type: 'signature' as const, pageRule: 'last' as const, x: 320, y: 540 },
      { type: 'text' as const, pageRule: 'last' as const, x: 60, y: 612, label: 'Print name' },
      { type: 'text' as const, pageRule: 'last' as const, x: 320, y: 612, label: 'Print name' },
      { type: 'text' as const, pageRule: 'last' as const, x: 60, y: 672, label: 'Title' },
      { type: 'text' as const, pageRule: 'last' as const, x: 320, y: 672, label: 'Title' },
    ];
    const template = await templatesRepo.create({
      owner_id: ownerId,
      title: 'MSA',
      description: null,
      cover_color: null,
      last_signers: [{ id: contact.id, name: 'Ada', email: 'ada@example.com', color: '#112233' }],
      field_layout: msa.map((field) => ({ ...field, signerRoleId: contact.id })),
    });
    const envelope = await envelopesRepo.createDraft({
      owner_id: ownerId,
      title: 'Draft',
      short_code: 'SC00000000004',
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const signer = await envelopesRepo.addSigner(envelope.id, {
      contact_id: contact.id,
      email: 'ada@example.com',
      name: 'Ada',
      color: '#112233',
    });
    await envelopesRepo.setOriginalFile(envelope.id, {
      file_path: `${envelope.id}/original.pdf`,
      sha256: 'ef'.repeat(32),
      pages: 3,
    });

    const result = await apply.apply(ownerId, template.id, envelope.id);

    expect(result.uses_count).toBe(1);
    const rows = await handle.db
      .selectFrom('envelope_fields')
      .select(['kind', 'page', 'x', 'y', 'width', 'height', 'signer_id', 'link_id'])
      .where('envelope_id', '=', envelope.id)
      .execute();
    // initial on all 3 pages, plus 7 fields on the last page.
    expect(rows).toHaveLength(10);
    const defaults: Record<string, { w: number; h: number }> = {
      initials: { w: 80, h: 54 },
      date: { w: 140, h: 36 },
      signature: { w: 200, h: 54 },
      text: { w: 240, h: 36 },
    };
    for (const row of rows) {
      expect(row.signer_id).toBe(signer.id);
      expect(Number(row.x)).toBeGreaterThan(0);
      expect(Number(row.x)).toBeLessThanOrEqual(1);
      expect(Number(row.y)).toBeGreaterThan(0);
      expect(Number(row.y)).toBeLessThanOrEqual(1);
      const size = defaults[row.kind];
      expect(size).toBeDefined();
      expect(Number(row.width)).toBeCloseTo(size!.w / 560, 3);
      expect(Number(row.height)).toBeCloseTo(size!.h / gridHeight, 3);
    }
    const initials = rows.filter((row) => row.kind === 'initials');
    expect(initials.map((row) => row.page).sort()).toEqual([1, 2, 3]);
    expect(new Set(initials.map((row) => row.link_id)).size).toBe(1);
    expect(initials[0]?.link_id).toEqual(expect.any(String));
    const untouched = msa.map((field) => ({ ...field }));
    const bare = await templatesRepo.create({
      owner_id: ownerId,
      title: 'MSA bare',
      description: null,
      cover_color: null,
      last_signers: [{ id: contact.id, name: 'Ada', email: 'ada@example.com', color: '#112233' }],
      field_layout: untouched,
    });
    const bareEnvelope = await envelopesRepo.createDraft({
      owner_id: ownerId,
      title: 'Draft',
      short_code: 'SC00000000005',
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    await envelopesRepo.addSigner(bareEnvelope.id, {
      contact_id: contact.id,
      email: 'bea@example.com',
      name: 'Bea',
      color: '#445566',
    });
    await envelopesRepo.setOriginalFile(bareEnvelope.id, {
      file_path: `${bareEnvelope.id}/original.pdf`,
      sha256: 'ab'.repeat(32),
      pages: 3,
    });
    await expect(apply.apply(ownerId, bare.id, bareEnvelope.id)).rejects.toBeInstanceOf(
      TemplateRoleUnmappedError,
    );
    const bareRows = await handle.db
      .selectFrom('envelope_fields')
      .selectAll()
      .where('envelope_id', '=', bareEnvelope.id)
      .execute();
    expect(bareRows).toHaveLength(0);
    const bareTemplate = await templatesRepo.findOneByOwner(ownerId, bare.id);
    expect(bareTemplate?.uses_count).toBe(0);
  });

  it('keeps a signer who is still on the envelope and drops a removed role', async () => {
    const ownerId = await seedUser(handle);
    const pdf = await PDFDocument.create();
    pdf.addPage([200, 100]);
    const pdfBytes = Buffer.from(await pdf.save());
    const envelopesRepo = new EnvelopesPgRepository(handle.db);
    const templatesRepo = new TemplatesPgRepository(handle.db);
    const contacts = new ContactsPgRepository(handle.db);
    const bea = await contacts.create({
      owner_id: ownerId,
      name: 'Bea',
      email: 'bea@example.com',
      color: '#445566',
    });
    const cam = await contacts.create({
      owner_id: ownerId,
      name: 'Cam',
      email: 'cam@example.com',
      color: '#778899',
    });
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
      last_signers: [
        { id: 'role-ada', name: 'Ada', email: 'ada@example.com', color: '#112233' },
        { id: bea.id, name: 'Bea', email: 'bea@example.com', color: '#445566' },
        { id: cam.id, name: 'Cam', email: 'cam@example.com', color: '#778899' },
      ],
      field_layout: [
        { type: 'signature', pageRule: 'first', x: 40, y: 20, signerRoleId: bea.id },
        { type: 'date', pageRule: 'first', x: 80, y: 40, signerRoleId: cam.id },
      ],
    });
    const envelope = await envelopesRepo.createDraft({
      owner_id: ownerId,
      title: 'Draft',
      short_code: 'SC00000000006',
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const signer = await envelopesRepo.addSigner(envelope.id, {
      contact_id: bea.id,
      email: 'bea@example.com',
      name: 'Bea',
      color: '#445566',
    });
    await envelopesRepo.setOriginalFile(envelope.id, {
      file_path: `${envelope.id}/original.pdf`,
      sha256: 'cd'.repeat(32),
      pages: 1,
    });

    const result = await apply.apply(ownerId, template.id, envelope.id);

    expect(result.uses_count).toBe(1);
    const rows = await handle.db
      .selectFrom('envelope_fields')
      .select(['kind', 'signer_id'])
      .where('envelope_id', '=', envelope.id)
      .execute();
    expect(rows).toEqual([{ kind: 'signature', signer_id: signer.id }]);
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
        {
          signer_id: signer.id,
          kind: 'signature',
          page: 1,
          x: 2,
          y: 0.5,
          width: null,
          height: null,
          required: true,
          link_id: null,
        },
      ]),
    ).rejects.toThrow();
  });
});
