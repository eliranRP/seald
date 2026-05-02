import { BadRequestException, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Template, TemplateField } from 'shared';
import { StorageService } from '../storage/storage.service';
import {
  TemplatesRepository,
  type CreateTemplateInput,
  type UpdateTemplatePatch,
} from './templates.repository';
import { TemplatesService } from './templates.service';

const SAMPLE_FIELDS: ReadonlyArray<TemplateField> = [
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'date', pageRule: 'last', x: 320, y: 540 },
];

class FakeTemplatesRepo extends TemplatesRepository {
  rows = new Map<string, Template>();
  examplePaths = new Map<string, string | null>();
  // For asserting the exact patch the service forwarded after stripping
  // undefined keys (the most common service-layer bug — forwarding
  // `field: undefined` would clobber the column).
  lastUpdatePatch: UpdateTemplatePatch | null = null;
  // Force the repo's setExamplePdfPath to return null so we can hit the
  // "race lost between findOneByOwner and setExamplePdfPath" branch
  // (deleted concurrently → NotFoundException after upload).
  failSetExamplePath = false;

  async create(input: CreateTemplateInput): Promise<Template> {
    const now = new Date().toISOString();
    const t: Template = {
      id: randomUUID(),
      owner_id: input.owner_id,
      title: input.title,
      description: input.description,
      cover_color: input.cover_color,
      field_layout: input.field_layout,
      tags: input.tags ?? [],
      last_signers: input.last_signers ?? [],
      has_example_pdf: false,
      uses_count: 0,
      last_used_at: null,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(t.id, t);
    return t;
  }

  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Template>> {
    return [...this.rows.values()].filter((r) => r.owner_id === owner_id);
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Template | null> {
    const r = this.rows.get(id);
    return r && r.owner_id === owner_id ? r : null;
  }

  async update(owner_id: string, id: string, patch: UpdateTemplatePatch): Promise<Template | null> {
    this.lastUpdatePatch = patch;
    const r = this.rows.get(id);
    if (!r || r.owner_id !== owner_id) return null;
    const next: Template = { ...r, ...patch, updated_at: new Date().toISOString() };
    this.rows.set(id, next);
    return next;
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const r = this.rows.get(id);
    if (!r || r.owner_id !== owner_id) return false;
    this.rows.delete(id);
    return true;
  }

  async deleteAllByOwner(owner_id: string): Promise<number> {
    let n = 0;
    for (const [id, r] of [...this.rows]) {
      if (r.owner_id === owner_id) {
        this.rows.delete(id);
        n++;
      }
    }
    return n;
  }

  async incrementUseCount(owner_id: string, id: string): Promise<Template | null> {
    const r = this.rows.get(id);
    if (!r || r.owner_id !== owner_id) return null;
    const now = new Date().toISOString();
    const next: Template = {
      ...r,
      uses_count: r.uses_count + 1,
      last_used_at: now,
      updated_at: now,
    };
    this.rows.set(id, next);
    return next;
  }

  async setExamplePdfPath(
    owner_id: string,
    id: string,
    path: string | null,
  ): Promise<Template | null> {
    if (this.failSetExamplePath) return null;
    const r = this.rows.get(id);
    if (!r || r.owner_id !== owner_id) return null;
    this.examplePaths.set(id, path);
    const next: Template = {
      ...r,
      has_example_pdf: path !== null,
      updated_at: new Date().toISOString(),
    };
    this.rows.set(id, next);
    return next;
  }

  async getExamplePdfPath(owner_id: string, id: string): Promise<string | null> {
    const r = this.rows.get(id);
    if (!r || r.owner_id !== owner_id) return null;
    return this.examplePaths.get(id) ?? null;
  }
}

class FakeStorage extends StorageService {
  uploads: Array<{ path: string; bytes: Buffer; contentType: string }> = [];
  downloads = new Map<string, Buffer>();
  // Throw on download to surface service-layer error propagation when
  // configured; default false so the happy path also exercises this fake.
  throwOnDownload: Error | null = null;

  async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    this.uploads.push({ path, bytes: Buffer.from(body), contentType });
  }
  async download(path: string): Promise<Buffer> {
    if (this.throwOnDownload) throw this.throwOnDownload;
    return this.downloads.get(path) ?? Buffer.from('default-bytes');
  }
  async remove(_paths: string[]): Promise<void> {}
  async createSignedUrl(path: string, _exp: number): Promise<string> {
    return `https://test.invalid/${path}`;
  }
  async exists(path: string): Promise<boolean> {
    return this.downloads.has(path);
  }
}

describe('TemplatesService', () => {
  const OWNER = '11111111-1111-4111-8111-111111111111';
  const OTHER = '22222222-2222-4222-8222-222222222222';
  let repo: FakeTemplatesRepo;
  let storage: FakeStorage;
  let svc: TemplatesService;

  beforeEach(() => {
    repo = new FakeTemplatesRepo();
    storage = new FakeStorage();
    svc = new TemplatesService(repo, storage);
  });

  describe('list', () => {
    it('returns only the caller owner_id rows', async () => {
      await repo.create({
        owner_id: OWNER,
        title: 'Mine',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await repo.create({
        owner_id: OTHER,
        title: 'Theirs',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      const list = await svc.list(OWNER);
      expect(list.map((t) => t.title)).toEqual(['Mine']);
    });

    it('returns an empty array (not null) when the owner has no templates', async () => {
      // Empty list must be a real array — controllers must not 404 / 500
      // when a brand-new account has no templates.
      const list = await svc.list(OWNER);
      expect(list).toEqual([]);
    });
  });

  describe('get', () => {
    it('returns the row for the owner', async () => {
      const created = await repo.create({
        owner_id: OWNER,
        title: 't',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      const got = await svc.get(OWNER, created.id);
      expect(got.id).toBe(created.id);
    });

    it('throws NotFoundException("template_not_found") when row is missing', async () => {
      await expect(svc.get(OWNER, randomUUID())).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'template_not_found',
      });
    });

    it('throws NotFoundException for a row owned by another user (no leak of existence)', async () => {
      // Service surfaces "not found" rather than "forbidden" so that an
      // attacker cannot enumerate existing template ids by probing 404
      // vs 403 (timing/code oracle).
      const row = await repo.create({
        owner_id: OTHER,
        title: 'Theirs',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await expect(svc.get(OWNER, row.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('create', () => {
    it('forwards the dto into the repo with default tags + last_signers', async () => {
      const out = await svc.create(OWNER, {
        title: 'Made via service',
        field_layout: SAMPLE_FIELDS,
      } as never);
      expect(out.title).toBe('Made via service');
      expect(out.tags).toEqual([]);
      expect(out.last_signers).toEqual([]);
      expect(out.description).toBeNull();
      expect(out.cover_color).toBeNull();
    });

    it('preserves a unicode title verbatim', async () => {
      const out = await svc.create(OWNER, {
        title: 'NDA — שלום 🌍',
        field_layout: SAMPLE_FIELDS,
      } as never);
      expect(out.title).toBe('NDA — שלום 🌍');
    });

    it('allows two templates with the same title (templates are not unique by name)', async () => {
      const a = await svc.create(OWNER, {
        title: 'Same name',
        field_layout: SAMPLE_FIELDS,
      } as never);
      const b = await svc.create(OWNER, {
        title: 'Same name',
        field_layout: SAMPLE_FIELDS,
      } as never);
      expect(a.id).not.toBe(b.id);
      expect(a.title).toBe(b.title);
    });

    it('forwards explicit tags + last_signers when provided', async () => {
      const out = await svc.create(OWNER, {
        title: 'With roster',
        field_layout: SAMPLE_FIELDS,
        tags: ['Legal'],
        last_signers: [{ id: 'c-1', name: 'Ada', email: 'ada@x.com', color: '#000000' }],
      } as never);
      expect(out.tags).toEqual(['Legal']);
      expect(out.last_signers).toHaveLength(1);
    });
  });

  describe('update', () => {
    it('strips undefined dto keys so they do not clobber existing values', async () => {
      // class-transformer hangs `field: undefined` on the DTO instance for
      // every absent optional. Forwarding undefined would set the column
      // to "do nothing" in some adapters and to NULL in others — the
      // service must filter them out so partial-update semantics hold.
      const created = await repo.create({
        owner_id: OWNER,
        title: 'Original',
        description: 'keep me',
        cover_color: '#FFFBEB',
        field_layout: SAMPLE_FIELDS,
      });
      const dirty = {
        title: 'Renamed',
        description: undefined,
        cover_color: undefined,
        field_layout: undefined,
      } as unknown as Parameters<typeof svc.update>[2];
      const out = await svc.update(OWNER, created.id, dirty);
      expect(out.title).toBe('Renamed');
      expect(out.description).toBe('keep me');
      expect(out.cover_color).toBe('#FFFBEB');
      // The patch the repo actually saw contained ONLY `title`.
      expect(repo.lastUpdatePatch).toEqual({ title: 'Renamed' });
    });

    it('throws NotFoundException when the row is missing', async () => {
      await expect(svc.update(OWNER, randomUUID(), { title: 'X' } as never)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFoundException when the row is owned by another user', async () => {
      const row = await repo.create({
        owner_id: OTHER,
        title: 'theirs',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await expect(
        svc.update(OWNER, row.id, { title: 'attacker' } as never),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('forwards explicit null on description / cover_color (clearing them)', async () => {
      // Distinguish "absent" (undefined → drop) from "explicit null"
      // (clear). The service only drops undefined; null must be
      // preserved so the user can erase the cover color or description.
      const created = await repo.create({
        owner_id: OWNER,
        title: 't',
        description: 'desc',
        cover_color: '#FFFBEB',
        field_layout: SAMPLE_FIELDS,
      });
      const out = await svc.update(OWNER, created.id, {
        description: null,
        cover_color: null,
      } as never);
      expect(out.description).toBeNull();
      expect(out.cover_color).toBeNull();
      expect(repo.lastUpdatePatch).toEqual({ description: null, cover_color: null });
    });
  });

  describe('remove', () => {
    it('returns void on success', async () => {
      const created = await repo.create({
        owner_id: OWNER,
        title: 't',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await expect(svc.remove(OWNER, created.id)).resolves.toBeUndefined();
      // Idempotency check — deleting again should now 404, not 500.
      await expect(svc.remove(OWNER, created.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when row is missing', async () => {
      await expect(svc.remove(OWNER, randomUUID())).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'template_not_found',
      });
    });

    it('throws NotFoundException when row belongs to another user', async () => {
      const row = await repo.create({
        owner_id: OTHER,
        title: 'theirs',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await expect(svc.remove(OWNER, row.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('use', () => {
    it('returns the bumped row (uses_count + last_used_at)', async () => {
      const created = await repo.create({
        owner_id: OWNER,
        title: 't',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      const out = await svc.use(OWNER, created.id);
      expect(out.uses_count).toBe(1);
      expect(out.last_used_at).not.toBeNull();
    });

    it('throws NotFoundException for missing row', async () => {
      await expect(svc.use(OWNER, randomUUID())).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'template_not_found',
      });
    });

    it('throws NotFoundException when row belongs to another user', async () => {
      const row = await repo.create({
        owner_id: OTHER,
        title: 'theirs',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await expect(svc.use(OWNER, row.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('attachExamplePdf', () => {
    const PDF_BYTES = Buffer.from('%PDF-1.4\n% test\n%%EOF', 'utf8');

    async function createOwned(): Promise<string> {
      const r = await repo.create({
        owner_id: OWNER,
        title: 't',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      return r.id;
    }

    it('rejects an empty buffer with example_pdf_empty', async () => {
      const id = await createOwned();
      await expect(
        svc.attachExamplePdf(OWNER, id, undefined, 'application/pdf'),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'example_pdf_empty',
      });
      await expect(
        svc.attachExamplePdf(OWNER, id, Buffer.alloc(0), 'application/pdf'),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'example_pdf_empty',
      });
    });

    it('rejects a wrong mime type with example_pdf_wrong_type', async () => {
      const id = await createOwned();
      await expect(svc.attachExamplePdf(OWNER, id, PDF_BYTES, 'text/plain')).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'example_pdf_wrong_type',
      });
      // Missing mime is also rejected.
      await expect(svc.attachExamplePdf(OWNER, id, PDF_BYTES, undefined)).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'example_pdf_wrong_type',
      });
    });

    it('rejects oversized buffers with example_pdf_too_large', async () => {
      const id = await createOwned();
      // 25MB + 1 byte. Buffer.alloc is sparse-ish — fine for the size check.
      const tooBig = Buffer.alloc(25 * 1024 * 1024 + 1);
      await expect(
        svc.attachExamplePdf(OWNER, id, tooBig, 'application/pdf'),
      ).rejects.toMatchObject({
        constructor: BadRequestException,
        message: 'example_pdf_too_large',
      });
    });

    it('throws NotFoundException BEFORE writing to storage when caller does not own the row', async () => {
      // Must not touch the bucket for a wrong-tenant caller — the
      // ownership check has to happen before storage.upload.
      const row = await repo.create({
        owner_id: OTHER,
        title: 'theirs',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await expect(
        svc.attachExamplePdf(OWNER, row.id, PDF_BYTES, 'application/pdf'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.uploads).toHaveLength(0);
    });

    it('throws NotFoundException for a missing template before writing to storage', async () => {
      await expect(
        svc.attachExamplePdf(OWNER, randomUUID(), PDF_BYTES, 'application/pdf'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.uploads).toHaveLength(0);
    });

    it('uploads to a stable per-template path and flips has_example_pdf', async () => {
      const id = await createOwned();
      const out = await svc.attachExamplePdf(OWNER, id, PDF_BYTES, 'application/pdf');
      expect(out.has_example_pdf).toBe(true);
      expect(storage.uploads).toHaveLength(1);
      expect(storage.uploads[0]?.path).toBe(`templates/${OWNER}/${id}/example.pdf`);
      expect(storage.uploads[0]?.contentType).toBe('application/pdf');
      expect(storage.uploads[0]?.bytes.equals(PDF_BYTES)).toBe(true);
    });

    it('throws NotFoundException when the row vanishes between ownership check and persistence', async () => {
      // Race: setExamplePdfPath returns null even though the earlier
      // findOneByOwner resolved. The service must surface 404 rather
      // than returning a half-baked Template.
      const id = await createOwned();
      repo.failSetExamplePath = true;
      await expect(
        svc.attachExamplePdf(OWNER, id, PDF_BYTES, 'application/pdf'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('readExamplePdf', () => {
    it('throws NotFoundException("template_example_not_found") when no PDF is attached', async () => {
      const created = await repo.create({
        owner_id: OWNER,
        title: 't',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      await expect(svc.readExamplePdf(OWNER, created.id)).rejects.toMatchObject({
        constructor: NotFoundException,
        message: 'template_example_not_found',
      });
    });

    it('throws NotFoundException when caller does not own the row', async () => {
      // getExamplePdfPath already scopes by owner — same 404 contract as
      // findOneByOwner so attackers cannot distinguish "doesn't exist"
      // from "exists but not yours".
      const row = await repo.create({
        owner_id: OTHER,
        title: 'theirs',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      repo.examplePaths.set(row.id, `templates/${OTHER}/${row.id}/example.pdf`);
      await expect(svc.readExamplePdf(OWNER, row.id)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('returns the bytes from storage for the owner', async () => {
      const created = await repo.create({
        owner_id: OWNER,
        title: 't',
        description: null,
        cover_color: null,
        field_layout: SAMPLE_FIELDS,
      });
      const path = `templates/${OWNER}/${created.id}/example.pdf`;
      repo.examplePaths.set(created.id, path);
      const bytes = Buffer.from('%PDF-1.4 hello %%EOF', 'utf8');
      storage.downloads.set(path, bytes);
      const got = await svc.readExamplePdf(OWNER, created.id);
      expect(got.equals(bytes)).toBe(true);
    });
  });
});
