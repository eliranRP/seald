import { createPgMemDb, seedUser, type PgMemHandle } from '../../../test/pg-mem-db';
import { ContactsPgRepository } from '../contacts.repository.pg';
import { ContactEmailTakenError } from '../contacts.repository';

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

describe('ContactsPgRepository — findOne / update / delete', () => {
  let handle: PgMemHandle;
  let repo: ContactsPgRepository;
  let ownerId: string;
  let otherOwnerId: string;

  beforeEach(async () => {
    handle = createPgMemDb();
    repo = new ContactsPgRepository(handle.db);
    ownerId = await seedUser(handle);
    otherOwnerId = await seedUser(handle);
  });
  afterEach(async () => {
    await handle.close();
  });

  it('findOneByOwner returns the row when owned', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    const got = await repo.findOneByOwner(ownerId, c.id);
    expect(got?.id).toBe(c.id);
  });

  it('findOneByOwner returns null when id belongs to another owner', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    const got = await repo.findOneByOwner(otherOwnerId, c.id);
    expect(got).toBeNull();
  });

  it('findOneByOwner returns null for an unknown id', async () => {
    const got = await repo.findOneByOwner(ownerId, '00000000-0000-0000-0000-000000000000');
    expect(got).toBeNull();
  });

  it('update with a non-empty patch mutates the owned row and returns it', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    const got = await repo.update(ownerId, c.id, { name: 'A2', color: '#FFFFFF' });
    expect(got?.name).toBe('A2');
    expect(got?.color).toBe('#FFFFFF');
    expect(got?.email).toBe('a@x.com');
  });

  it('update with an empty patch returns the current row without erroring', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    const got = await repo.update(ownerId, c.id, {});
    expect(got?.id).toBe(c.id);
    expect(got?.name).toBe('A');
  });

  it('update returns null when owner does not match', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    const got = await repo.update(otherOwnerId, c.id, { name: 'hacked' });
    expect(got).toBeNull();
    const fresh = await repo.findOneByOwner(ownerId, c.id);
    expect(fresh?.name).toBe('A');
  });

  it('delete returns true and removes an owned row', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    expect(await repo.delete(ownerId, c.id)).toBe(true);
    expect(await repo.findOneByOwner(ownerId, c.id)).toBeNull();
  });

  it('delete returns false when owner does not match', async () => {
    const c = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    expect(await repo.delete(otherOwnerId, c.id)).toBe(false);
    expect(await repo.findOneByOwner(ownerId, c.id)).not.toBeNull();
  });

  it('delete returns false for an unknown id', async () => {
    expect(await repo.delete(ownerId, '00000000-0000-0000-0000-000000000000')).toBe(false);
  });
});

describe('ContactsPgRepository — unique-violation mapping', () => {
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

  it('create throws ContactEmailTakenError on (owner_id, email) collision', async () => {
    await repo.create({ owner_id: ownerId, name: 'A', email: 'dup@x.com', color: '#000000' });
    await expect(
      repo.create({ owner_id: ownerId, name: 'B', email: 'dup@x.com', color: '#111111' }),
    ).rejects.toBeInstanceOf(ContactEmailTakenError);
  });

  it('create succeeds for the same email under a different owner', async () => {
    const otherOwner = await seedUser(handle);
    await repo.create({ owner_id: ownerId, name: 'A', email: 'dup@x.com', color: '#000000' });
    await expect(
      repo.create({ owner_id: otherOwner, name: 'B', email: 'dup@x.com', color: '#111111' }),
    ).resolves.toMatchObject({ email: 'dup@x.com' });
  });

  it('update throws ContactEmailTakenError when switching to an existing email', async () => {
    const a = await repo.create({
      owner_id: ownerId,
      name: 'A',
      email: 'a@x.com',
      color: '#000000',
    });
    await repo.create({ owner_id: ownerId, name: 'B', email: 'b@x.com', color: '#111111' });
    await expect(repo.update(ownerId, a.id, { email: 'b@x.com' })).rejects.toBeInstanceOf(
      ContactEmailTakenError,
    );
  });
});
