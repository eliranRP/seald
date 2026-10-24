import { NotFoundException } from '@nestjs/common';
import type { TemplateField } from 'shared';
import { InMemoryTemplatesRepository } from '../../../test/in-memory-templates-repository';
import { StorageService } from '../../storage/storage.service';
import { TemplatesService } from '../templates.service';

const OWNER = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';

const FIELDS: ReadonlyArray<TemplateField> = [
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'date', pageRule: 'last', x: 320, y: 540 },
];

class FakeStorage extends StorageService {
  uploads: Array<{ path: string; bytes: Buffer; contentType: string }> = [];
  files = new Map<string, Buffer>();
  failUpload = false;

  async upload(path: string, body: Buffer, contentType: string): Promise<void> {
    if (this.failUpload) throw new Error('storage down');
    this.uploads.push({ path, bytes: Buffer.from(body), contentType });
    this.files.set(path, Buffer.from(body));
  }
  async download(path: string): Promise<Buffer> {
    const f = this.files.get(path);
    if (!f) throw new Error('missing');
    return f;
  }
  async remove(_paths: string[]): Promise<void> {}
  async createSignedUrl(path: string, _exp: number): Promise<string> {
    return `https://test.invalid/${path}`;
  }
  async exists(path: string): Promise<boolean> {
    return this.files.has(path);
  }
}

describe('TemplatesService — duplicate, soft delete, restore', () => {
  let repo: InMemoryTemplatesRepository;
  let storage: FakeStorage;
  let svc: TemplatesService;

  beforeEach(() => {
    repo = new InMemoryTemplatesRepository();
    storage = new FakeStorage();
    svc = new TemplatesService(repo, storage);
  });

  async function seed(title = 'NDA') {
    return svc.create(OWNER, {
      title,
      field_layout: FIELDS,
      tags: ['Legal'],
      last_signers: [{ id: 's-1', name: 'Hannah', email: 'h@x.com', color: '#112233' }],
    } as never);
  }

  it('duplicate copies layout, tags and roster as "NAME copy" with a fresh use count', async () => {
    const src = await seed();
    await svc.use(OWNER, src.id);
    const copy = await svc.duplicate(OWNER, src.id);
    expect(copy.id).not.toBe(src.id);
    expect(copy.title).toBe('NDA copy');
    expect(copy.field_layout).toEqual(FIELDS);
    expect(copy.tags).toEqual(['Legal']);
    expect(copy.last_signers).toHaveLength(1);
    expect(copy.uses_count).toBe(0);
    expect(copy.last_used_at).toBeNull();
    expect(copy.has_example_pdf).toBe(false);
  });

  it('duplicate truncates a title that would pass the 200 character limit', async () => {
    const src = await seed('x'.repeat(200));
    const copy = await svc.duplicate(OWNER, src.id);
    expect(copy.title).toHaveLength(200);
  });

  it('duplicate copies the saved example PDF to the copy’s own storage path', async () => {
    const src = await seed();
    await svc.attachExamplePdf(OWNER, src.id, Buffer.from('%PDF-1.4 body'), 'application/pdf');
    const copy = await svc.duplicate(OWNER, src.id);
    expect(copy.has_example_pdf).toBe(true);
    const copied = await svc.readExamplePdf(OWNER, copy.id);
    expect(copied.toString()).toBe('%PDF-1.4 body');
    expect(storage.uploads.map((u) => u.path)).toContain(
      `templates/${OWNER}/${copy.id}/example.pdf`,
    );
  });

  it('duplicate removes the half-made copy when the PDF cannot be copied', async () => {
    const src = await seed();
    await svc.attachExamplePdf(OWNER, src.id, Buffer.from('%PDF-1.4 body'), 'application/pdf');
    storage.failUpload = true;
    await expect(svc.duplicate(OWNER, src.id)).rejects.toThrow('storage down');
    expect(await svc.list(OWNER)).toHaveLength(1);
  });

  it('duplicate of a missing or foreign template is a 404', async () => {
    const src = await seed();
    await expect(svc.duplicate(OTHER, src.id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove hides the template everywhere and restore brings it back', async () => {
    const src = await seed();
    await svc.remove(OWNER, src.id);
    expect(await svc.list(OWNER)).toEqual([]);
    await expect(svc.get(OWNER, src.id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.use(OWNER, src.id)).rejects.toBeInstanceOf(NotFoundException);
    const back = await svc.restore(OWNER, src.id);
    expect(back.id).toBe(src.id);
    expect(await svc.list(OWNER)).toHaveLength(1);
  });

  it('restore of a live, foreign or missing template is a 404', async () => {
    const src = await seed();
    await expect(svc.restore(OWNER, src.id)).rejects.toBeInstanceOf(NotFoundException);
    await svc.remove(OWNER, src.id);
    await expect(svc.restore(OTHER, src.id)).rejects.toBeInstanceOf(NotFoundException);
  });
});
