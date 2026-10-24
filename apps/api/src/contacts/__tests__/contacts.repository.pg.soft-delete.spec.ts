import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { ContactsPgRepository } from '../contacts.repository.pg';

describe('ContactsPgRepository — soft delete + restore', () => {
  let handle: PgMemHandle;
  let repo: ContactsPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new ContactsPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  const make = (email: string) =>
    repo.create({ owner_id: ownerId, name: email, email, color: '#000000' });

  it('deleteMany hides the rows from every read and returns the removed ids', async () => {
    const a = await make('a@x.com');
    const b = await make('b@x.com');
    const keep = await make('keep@x.com');
    const removed = await repo.deleteMany(ownerId, [
      a.id,
      b.id,
      '00000000-0000-0000-0000-000000000000',
    ]);
    expect([...removed].sort()).toEqual([a.id, b.id].sort());
    expect((await repo.findAllByOwner(ownerId)).map((c) => c.id)).toEqual([keep.id]);
    expect(await repo.findOneByOwner(ownerId, a.id)).toBeNull();
    expect(await repo.update(ownerId, a.id, { name: 'x' })).toBeNull();
    expect(await repo.delete(ownerId, a.id)).toBe(false);
  });

  it('deleteMany with no ids removes nothing', async () => {
    await make('a@x.com');
    expect(await repo.deleteMany(ownerId, [])).toEqual([]);
    expect(await repo.findAllByOwner(ownerId)).toHaveLength(1);
  });

  it('a deleted contact frees its email for a new contact', async () => {
    const a = await make('a@x.com');
    await repo.delete(ownerId, a.id);
    await expect(make('a@x.com')).resolves.toMatchObject({ email: 'a@x.com' });
  });

  it('restoreMany brings a deleted contact back', async () => {
    const a = await make('a@x.com');
    await repo.delete(ownerId, a.id);
    const restored = await repo.restoreMany(ownerId, [a.id]);
    expect(restored.map((c) => c.id)).toEqual([a.id]);
    expect(await repo.findOneByOwner(ownerId, a.id)).not.toBeNull();
  });

  it('restoreMany skips a contact whose email was re-added and restores the rest', async () => {
    const a = await make('a@x.com');
    const b = await make('b@x.com');
    await repo.deleteMany(ownerId, [a.id, b.id]);
    await make('a@x.com');
    const restored = await repo.restoreMany(ownerId, [a.id, b.id]);
    expect(restored.map((c) => c.id)).toEqual([b.id]);
  });

  it('restoreMany ignores live rows and another owner', async () => {
    const other = await seedUser(handle);
    const a = await make('a@x.com');
    expect(await repo.restoreMany(ownerId, [a.id])).toEqual([]);
    await repo.delete(ownerId, a.id);
    expect(await repo.restoreMany(other, [a.id])).toEqual([]);
  });

  it('deleteMany purges rows soft-deleted more than 24 hours ago', async () => {
    const a = await make('a@x.com');
    await repo.delete(ownerId, a.id);
    const old = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    await handle.db
      .updateTable('contacts')
      .set({ deleted_at: old })
      .where('id', '=', a.id)
      .execute();
    await repo.deleteMany(ownerId, []);
    expect(await handle.db.selectFrom('contacts').select('id').execute()).toEqual([]);
  });
});

describe('ContactsPgRepository — listWithStats', () => {
  let handle: PgMemHandle;
  let repo: ContactsPgRepository;
  let ownerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new ContactsPgRepository(handle.db);
    ownerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  async function envelope(owner: string, short: string, sentAt: string | null, emails: string[]) {
    const env = await handle.db
      .insertInto('envelopes')
      .values({
        owner_id: owner,
        title: short,
        short_code: short,
        tc_version: 'v1',
        privacy_version: 'v1',
        expires_at: '2030-01-01T00:00:00.000Z',
        sent_at: sentAt,
      })
      .returning(['id'])
      .executeTakeFirstOrThrow();
    for (const email of emails) {
      await handle.db
        .insertInto('envelope_signers')
        .values({ envelope_id: env.id, email, name: email, color: '#112233' })
        .execute();
    }
  }

  it('returns [] with no contacts', async () => {
    expect(await repo.listWithStats(ownerId)).toEqual([]);
  });

  it('counts sent envelopes per email (case-insensitive) with the latest send time', async () => {
    await repo.create({ owner_id: ownerId, name: 'H', email: 'h@x.com', color: '#000000' });
    await repo.create({ owner_id: ownerId, name: 'N', email: 'never@x.com', color: '#000000' });
    await envelope(ownerId, 'aaaaaaaaaaaa1', '2026-01-01T10:00:00.000Z', ['H@X.com']);
    await envelope(ownerId, 'aaaaaaaaaaaa2', '2026-02-01T10:00:00.000Z', [
      'h@x.com',
      'other@x.com',
    ]);
    // A draft (never sent) and someone else's envelope do not count.
    await envelope(ownerId, 'aaaaaaaaaaaa3', null, ['h@x.com']);
    const otherOwner = await seedUser(handle);
    await envelope(otherOwner, 'aaaaaaaaaaaa4', '2026-03-01T10:00:00.000Z', ['h@x.com']);

    const list = await repo.listWithStats(ownerId);
    const h = list.find((c) => c.email === 'h@x.com');
    const never = list.find((c) => c.email === 'never@x.com');
    expect(h?.docs_count).toBe(2);
    expect(h?.last_sent_at).toBe('2026-02-01T10:00:00.000Z');
    expect(never).toMatchObject({ docs_count: 0, last_sent_at: null });
  });
});
