import type { TemplateField } from 'shared';
import { createPgMemDb, type PgMemHandle, seedUser } from '../../../test/pg-mem-db';
import { TemplatesPgRepository } from '../templates.repository.pg';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

const FIELDS: ReadonlyArray<TemplateField> = [
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
];

describe('TemplatesPgRepository — soft delete + restore (pg-mem)', () => {
  let handle: PgMemHandle;
  let repo: TemplatesPgRepository;

  beforeEach(async () => {
    handle = createPgMemDb();
    await seedUser(handle, OWNER_A);
    await seedUser(handle, OWNER_B);
    repo = new TemplatesPgRepository(handle.db);
  });
  afterEach(async () => {
    await handle.close();
  });

  const make = (title: string) =>
    repo.create({
      owner_id: OWNER_A,
      title,
      description: null,
      cover_color: null,
      field_layout: FIELDS,
    });

  it('delete hides the row from every read and write, and a second delete is false', async () => {
    const t = await make('NDA');
    const keep = await make('Keep');
    expect(await repo.delete(OWNER_A, t.id)).toBe(true);
    expect((await repo.findAllByOwner(OWNER_A)).map((r) => r.id)).toEqual([keep.id]);
    expect(await repo.findOneByOwner(OWNER_A, t.id)).toBeNull();
    expect(await repo.update(OWNER_A, t.id, { title: 'x' })).toBeNull();
    expect(await repo.incrementUseCount(OWNER_A, t.id)).toBeNull();
    expect(await repo.setExamplePdfPath(OWNER_A, t.id, 'p')).toBeNull();
    expect(await repo.getExamplePdfPath(OWNER_A, t.id)).toBeNull();
    expect(await repo.delete(OWNER_A, t.id)).toBe(false);
  });

  it('delete is scoped to the owner', async () => {
    const t = await make('NDA');
    expect(await repo.delete(OWNER_B, t.id)).toBe(false);
    expect(await repo.findOneByOwner(OWNER_A, t.id)).not.toBeNull();
  });

  it('restore brings a deleted template back with its data, once', async () => {
    const t = await make('NDA');
    await repo.delete(OWNER_A, t.id);
    const back = await repo.restore(OWNER_A, t.id);
    expect(back?.id).toBe(t.id);
    expect(back?.title).toBe('NDA');
    expect(await repo.restore(OWNER_A, t.id)).toBeNull();
  });

  it('restore returns null for another owner', async () => {
    const t = await make('NDA');
    await repo.delete(OWNER_A, t.id);
    expect(await repo.restore(OWNER_B, t.id)).toBeNull();
  });

  it('delete purges this owner’s rows soft-deleted more than 24 hours ago', async () => {
    const old = await make('Old');
    const fresh = await make('Fresh');
    await repo.delete(OWNER_A, old.id);
    await handle.db
      .updateTable('templates')
      .set({ deleted_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString() })
      .where('id', '=', old.id)
      .execute();
    await repo.delete(OWNER_A, fresh.id);
    const left = await handle.db.selectFrom('templates').select('id').execute();
    expect(left.map((r) => r.id)).toEqual([fresh.id]);
  });
});
