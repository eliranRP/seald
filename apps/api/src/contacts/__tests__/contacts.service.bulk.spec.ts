import { InMemoryContactsRepository } from '../../../test/in-memory-contacts-repository';
import { ContactsService } from '../contacts.service';

const OWNER = '00000000-0000-0000-0000-00000000000a';

describe('ContactsService — bulk add', () => {
  let repo: InMemoryContactsRepository;
  let svc: ContactsService;

  beforeEach(() => {
    repo = new InMemoryContactsRepository();
    svc = new ContactsService(repo);
  });

  it('creates a contact per valid address with a guessed name and a palette colour', async () => {
    const res = await svc.createMany(OWNER, ['Hannah.Wills@Quill.vc', ' nora@acme.co ']);
    expect(res.invalid).toEqual([]);
    expect(res.skipped_duplicate).toEqual([]);
    expect(res.created.map((c) => [c.name, c.email])).toEqual([
      ['Hannah Wills', 'hannah.wills@quill.vc'],
      ['Nora', 'nora@acme.co'],
    ]);
    expect(res.created.every((c) => /^#[0-9A-F]{6}$/i.test(c.color))).toBe(true);
    expect(new Set(res.created.map((c) => c.color)).size).toBe(2);
  });

  it('reports invalid tokens and skips addresses already saved or repeated in the paste', async () => {
    await svc.create(OWNER, { name: 'Alex', email: 'alex@quill.vc', color: '#000000' });
    const res = await svc.createMany(OWNER, [
      'alex@quill.vc',
      'bad@@acme',
      'tom@acme.co',
      'TOM@acme.co',
      '',
    ]);
    expect(res.created.map((c) => c.email)).toEqual(['tom@acme.co']);
    expect(res.skipped_duplicate).toEqual(['alex@quill.vc', 'tom@acme.co']);
    expect(res.invalid).toEqual(['bad@@acme']);
  });

  it('skips an address another request added first', async () => {
    const create = jest.spyOn(repo, 'create');
    const { ContactEmailTakenError } = await import('../contacts.repository');
    create.mockRejectedValueOnce(new ContactEmailTakenError());
    const res = await svc.createMany(OWNER, ['race@acme.co']);
    expect(res.created).toEqual([]);
    expect(res.skipped_duplicate).toEqual(['race@acme.co']);
  });

  it('rethrows an unexpected repository failure', async () => {
    jest.spyOn(repo, 'create').mockRejectedValueOnce(new Error('db down'));
    await expect(svc.createMany(OWNER, ['a@acme.co'])).rejects.toThrow('db down');
  });
});

describe('ContactsService — delete many + restore', () => {
  let repo: InMemoryContactsRepository;
  let svc: ContactsService;

  beforeEach(() => {
    repo = new InMemoryContactsRepository();
    svc = new ContactsService(repo);
  });

  it('removeMany soft-deletes the owned ids and restore brings them back', async () => {
    const a = await svc.create(OWNER, { name: 'A', email: 'a@x.com', color: '#000000' });
    const b = await svc.create(OWNER, { name: 'B', email: 'b@x.com', color: '#000000' });
    const res = await svc.removeMany(OWNER, [a.id, b.id, '00000000-0000-0000-0000-000000000099']);
    expect(res.deleted.sort()).toEqual([a.id, b.id].sort());
    expect(await svc.list(OWNER)).toEqual([]);
    const restored = await svc.restore(OWNER, [a.id]);
    expect(restored.map((c) => c.id)).toEqual([a.id]);
    expect((await svc.list(OWNER)).map((c) => c.id)).toEqual([a.id]);
  });

  it('list adds zero stats when the repository has no envelope data', async () => {
    await svc.create(OWNER, { name: 'A', email: 'a@x.com', color: '#000000' });
    const [row] = await svc.list(OWNER);
    expect(row).toMatchObject({ docs_count: 0, last_sent_at: null });
  });
});
