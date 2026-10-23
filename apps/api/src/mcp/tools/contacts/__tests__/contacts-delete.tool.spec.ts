import { OTHER_OWNER, OWNER, err, ok, write } from '../../__tests__/write-harness';
import { callStep, stepWorld } from './step-world';

describe('contacts_delete', () => {
  it('deletes the contact, is destructive, and never touches another owner', async () => {
    const w = stepWorld();
    const mine = await w.contacts.create({
      owner_id: OWNER,
      name: 'Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
    const theirs = await w.contacts.create({
      owner_id: OTHER_OWNER,
      name: 'Eve',
      email: 'eve@example.com',
      color: '#112233',
    });
    expect(err(await callStep(w, 'contacts_delete', write({ contact_id: theirs.id }))).slug).toBe(
      'contact_not_found',
    );
    expect(await w.contacts.findOneByOwner(OTHER_OWNER, theirs.id)).not.toBeNull();

    const dry = ok(
      await callStep(w, 'contacts_delete', {
        idempotency_key: 'dry-00000004',
        dry_run: true,
        contact_id: mine.id,
      }),
    );
    expect(dry).toMatchObject({ dry_run: true });
    expect(await w.contacts.findOneByOwner(OWNER, mine.id)).not.toBeNull();

    expect(ok(await callStep(w, 'contacts_delete', write({ contact_id: mine.id })))).toEqual({
      removed: true,
    });
    expect(await w.contacts.findOneByOwner(OWNER, mine.id)).toBeNull();
  });

  it('needs contacts:write', async () => {
    const w = stepWorld();
    expect(
      err(
        await callStep(
          w,
          'contacts_delete',
          write({ contact_id: '11111111-1111-4111-8111-111111111111' }),
          { scopes: ['contacts:read'] },
        ),
      ).slug,
    ).toBe('insufficient_scope');
  });
});
