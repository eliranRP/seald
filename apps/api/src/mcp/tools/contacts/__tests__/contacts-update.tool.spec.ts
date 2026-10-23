import { OTHER_OWNER, OWNER, err, ok, write } from '../../__tests__/write-harness';
import { callStep, stepWorld } from './step-world';

const mk = (w: ReturnType<typeof stepWorld>, owner: string, name: string, email: string) =>
  w.contacts.create({ owner_id: owner, name, email, color: '#112233' });

describe('contacts_update', () => {
  it('changes only the fields given', async () => {
    const w = stepWorld();
    const c = await mk(w, OWNER, 'Ada', 'ada@example.com');
    const out = ok(
      await callStep(w, 'contacts_update', write({ contact_id: c.id, name: 'Ada L.' })),
    );
    expect(out).toEqual({ id: c.id, name: 'Ada L.', email: 'ada@example.com', color: '#112233' });
    const moved = ok(
      await callStep(
        w,
        'contacts_update',
        write({ contact_id: c.id, email: 'New@Example.com', color: '#445566' }),
      ),
    );
    expect(moved).toMatchObject({ name: 'Ada L.', email: 'new@example.com', color: '#445566' });
  });

  it('keeps owners apart, maps a taken email, and a dry run writes nothing', async () => {
    const w = stepWorld();
    const a = await mk(w, OWNER, 'Ada', 'ada@example.com');
    await mk(w, OWNER, 'Bob', 'bob@example.com');
    const theirs = await mk(w, OTHER_OWNER, 'Eve', 'eve@example.com');
    expect(
      err(await callStep(w, 'contacts_update', write({ contact_id: theirs.id, name: 'Hax' }))).slug,
    ).toBe('contact_not_found');
    expect((await w.contacts.findOneByOwner(OTHER_OWNER, theirs.id))?.name).toBe('Eve');
    expect(
      err(
        await callStep(w, 'contacts_update', write({ contact_id: a.id, email: 'bob@example.com' })),
      ).slug,
    ).toBe('email_taken');
    const dry = ok(
      await callStep(w, 'contacts_update', {
        idempotency_key: 'dry-00000003',
        dry_run: true,
        contact_id: a.id,
        name: 'Nope',
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { name: 'Nope' } });
    expect((await w.contacts.findOneByOwner(OWNER, a.id))?.name).toBe('Ada');
  });

  it('needs a change and contacts:write', async () => {
    const w = stepWorld();
    const c = await mk(w, OWNER, 'Ada', 'ada@example.com');
    expect(err(await callStep(w, 'contacts_update', write({ contact_id: c.id }))).slug).toBe(
      'validation_error',
    );
    expect(
      err(
        await callStep(w, 'contacts_update', write({ contact_id: c.id, name: 'X' }), {
          scopes: ['contacts:read'],
        }),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
