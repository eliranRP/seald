import { ConflictException, NotFoundException } from '@nestjs/common';
import type { Contact } from './contact.entity';
import { ContactsService } from './contacts.service';
import {
  ContactEmailTakenError,
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from './contacts.repository';

class FakeRepo extends ContactsRepository {
  store = new Map<string, Contact>();
  throwEmailTakenOnCreate = false;
  throwEmailTakenOnUpdate = false;

  async create(input: CreateContactInput): Promise<Contact> {
    if (this.throwEmailTakenOnCreate) throw new ContactEmailTakenError();
    const now = new Date().toISOString();
    const c: Contact = {
      id: `c_${this.store.size + 1}`,
      owner_id: input.owner_id,
      name: input.name,
      email: input.email,
      color: input.color,
      created_at: now,
      updated_at: now,
    };
    this.store.set(c.id, c);
    return c;
  }
  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>> {
    return [...this.store.values()].filter((c) => c.owner_id === owner_id);
  }
  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const c = this.store.get(id);
    return c && c.owner_id === owner_id ? c : null;
  }
  async update(owner_id: string, id: string, patch: UpdateContactPatch): Promise<Contact | null> {
    if (this.throwEmailTakenOnUpdate) throw new ContactEmailTakenError();
    const existing = await this.findOneByOwner(owner_id, id);
    if (!existing) return null;
    const next: Contact = { ...existing, ...patch, updated_at: new Date().toISOString() };
    this.store.set(id, next);
    return next;
  }
  async delete(owner_id: string, id: string): Promise<boolean> {
    const c = await this.findOneByOwner(owner_id, id);
    if (!c) return false;
    this.store.delete(id);
    return true;
  }
  async deleteAllByOwner(owner_id: string): Promise<number> {
    let n = 0;
    for (const [id, c] of [...this.store]) {
      if (c.owner_id === owner_id) {
        this.store.delete(id);
        n++;
      }
    }
    return n;
  }
}

describe('ContactsService', () => {
  const OWNER = 'user-1';
  const OTHER = 'user-2';
  let repo: FakeRepo;
  let svc: ContactsService;

  beforeEach(() => {
    repo = new FakeRepo();
    svc = new ContactsService(repo);
  });

  it('create: happy path returns Contact', async () => {
    const c = await svc.create(OWNER, { name: 'A', email: 'a@x.com', color: '#000000' });
    expect(c.owner_id).toBe(OWNER);
  });

  it('create: ContactEmailTakenError → ConflictException("email_taken")', async () => {
    repo.throwEmailTakenOnCreate = true;
    await expect(
      svc.create(OWNER, { name: 'A', email: 'a@x.com', color: '#000000' }),
    ).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'email_taken',
    });
  });

  it('list: passes owner_id through', async () => {
    await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    await repo.create({ owner_id: OTHER, name: 'B', email: 'b@x.com', color: '#111111' });
    const rows = await svc.list(OWNER);
    expect(rows.map((r) => r.email)).toEqual(['a@x.com']);
  });

  it('get: missing row → NotFoundException("contact_not_found")', async () => {
    await expect(svc.get(OWNER, 'missing')).rejects.toMatchObject({
      constructor: NotFoundException,
      message: 'contact_not_found',
    });
  });

  it('get: owned row returns Contact', async () => {
    const c = await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    const got = await svc.get(OWNER, c.id);
    expect(got.id).toBe(c.id);
  });

  it('update: missing row → NotFoundException', async () => {
    await expect(svc.update(OWNER, 'missing', { name: 'X' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('update: ContactEmailTakenError → ConflictException("email_taken")', async () => {
    const c = await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    repo.throwEmailTakenOnUpdate = true;
    await expect(svc.update(OWNER, c.id, { email: 'b@x.com' })).rejects.toMatchObject({
      constructor: ConflictException,
      message: 'email_taken',
    });
  });

  it('update: drops undefined DTO fields so they do not overwrite existing values', async () => {
    // ValidationPipe + class-transformer creates own `email: undefined` on the
    // DTO instance when @Transform is decorated (even if the request body
    // omitted email). If the service forwarded that as-is, the real PG adapter
    // would set email = NULL. The service must strip undefined keys.
    const c = await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    const dirty = { name: 'A2', email: undefined, color: undefined } as unknown as Parameters<
      typeof svc.update
    >[2];
    const updated = await svc.update(OWNER, c.id, dirty);
    expect(updated.email).toBe('a@x.com');
    expect(updated.color).toBe('#000000');
    expect(updated.name).toBe('A2');
  });

  it('remove: missing row → NotFoundException', async () => {
    await expect(svc.remove(OWNER, 'missing')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('remove: owned row → resolves void', async () => {
    const c = await repo.create({ owner_id: OWNER, name: 'A', email: 'a@x.com', color: '#000000' });
    await expect(svc.remove(OWNER, c.id)).resolves.toBeUndefined();
    expect(await svc.list(OWNER)).toEqual([]);
  });
});
