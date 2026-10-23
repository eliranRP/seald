import { OWNER, err, ok, write } from '../../__tests__/write-harness';
import { callStep, stepWorld } from './step-world';

describe('contacts_create', () => {
  it('creates a contact (email normalised, a palette color when none is given)', async () => {
    const w = stepWorld();
    const out = ok(
      await callStep(w, 'contacts_create', write({ name: ' Ada ', email: ' Ada@Example.com ' })),
    );
    expect(out).toMatchObject({ name: 'Ada', email: 'ada@example.com' });
    expect(out['color']).toMatch(/^#[0-9A-F]{6}$/i);
    const given = ok(
      await callStep(
        w,
        'contacts_create',
        write({ name: 'Bob', email: 'bob@example.com', color: '#112233' }),
      ),
    );
    expect(given['color']).toBe('#112233');
    expect((await w.contacts.findAllByOwner(OWNER)).length).toBe(2);
  });

  it('refuses a repeat email, and a dry run sees it without writing', async () => {
    const w = stepWorld();
    ok(await callStep(w, 'contacts_create', write({ name: 'Ada', email: 'ada@example.com' })));
    expect(
      err(await callStep(w, 'contacts_create', write({ name: 'Ada 2', email: 'ada@example.com' })))
        .slug,
    ).toBe('email_taken');
    expect(
      err(
        await callStep(w, 'contacts_create', {
          idempotency_key: 'dry-00000001',
          dry_run: true,
          name: 'Ada 2',
          email: 'ada@example.com',
        }),
      ).slug,
    ).toBe('email_taken');
    const dry = ok(
      await callStep(w, 'contacts_create', {
        idempotency_key: 'dry-00000002',
        dry_run: true,
        name: 'Zed',
        email: 'zed@example.com',
      }),
    );
    expect(dry).toMatchObject({ dry_run: true, would: { email: 'zed@example.com' } });
    expect((await w.contacts.findAllByOwner(OWNER)).length).toBe(1);
  });

  it('needs contacts:write, an idempotency key and a valid email; the key replays', async () => {
    const w = stepWorld();
    const args = write({ name: 'Ada', email: 'ada@example.com' });
    expect(
      err(await callStep(w, 'contacts_create', args, { scopes: ['contacts:read'] })).slug,
    ).toBe('insufficient_scope');
    expect(
      err(await callStep(w, 'contacts_create', { name: 'Ada', email: 'ada@example.com' })).slug,
    ).toBe('validation_error');
    expect(
      err(await callStep(w, 'contacts_create', write({ name: 'Ada', email: 'not-an-email' }))).slug,
    ).toBe('validation_error');
    const first = ok(await callStep(w, 'contacts_create', args));
    expect(ok(await callStep(w, 'contacts_create', args))).toEqual(first);
    expect((await w.contacts.findAllByOwner(OWNER)).length).toBe(1);
  });
});
