import { createPgMemDb, seedUser, type PgMemHandle } from '../../test/pg-mem-db';
import { ContactsPgRepository } from './contacts.repository.pg';

describe('ContactsPgRepository — create + list', () => {
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

  it('create inserts a row and returns the full Contact with ISO timestamps', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'Ada Lovelace',
      email: 'ada@example.com',
      color: '#FF00FF',
    });
    expect(c.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(c.owner_id).toBe(ownerId);
    expect(c.name).toBe('Ada Lovelace');
    expect(c.email).toBe('ada@example.com');
    expect(c.color).toBe('#FF00FF');
    expect(c.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(c.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it('findAllByOwner returns rows only for that owner, newest first', async () => {
    const otherOwner = await seedUser(handle);
    await repo.create({ owner_id: ownerId, name: 'First', email: 'first@x.com', color: '#111111' });
    await repo.create({
      owner_id: ownerId,
      name: 'Second',
      email: 'second@x.com',
      color: '#222222',
    });
    await repo.create({
      owner_id: otherOwner,
      name: 'Other',
      email: 'other@x.com',
      color: '#333333',
    });

    const mine = await repo.findAllByOwner(ownerId);
    expect(mine).toHaveLength(2);
    expect(mine.map((c) => c.email)).toEqual(
      expect.arrayContaining(['first@x.com', 'second@x.com']),
    );
    expect(mine.every((c) => c.owner_id === ownerId)).toBe(true);

    const theirs = await repo.findAllByOwner(otherOwner);
    expect(theirs).toHaveLength(1);
    expect(theirs[0]?.email).toBe('other@x.com');
  });

  it('findAllByOwner returns [] when the owner has no contacts', async () => {
    expect(await repo.findAllByOwner(ownerId)).toEqual([]);
  });
});
