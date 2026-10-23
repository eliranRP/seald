import { OTHER_OWNER, OWNER, err, ok } from '../../__tests__/write-harness';
import { callStep, stepWorld } from './step-world';

describe('contacts_search', () => {
  it('matches a substring of name or email, case-insensitively, for this owner only', async () => {
    const w = stepWorld();
    const mk = (owner: string, name: string, email: string) =>
      w.contacts.create({ owner_id: owner, name, email, color: '#112233' });
    await mk(OWNER, 'Ada Lovelace', 'ada@analytical.test');
    await mk(OWNER, 'Grace Hopper', 'grace@navy.test');
    await mk(OWNER, 'Bob', 'bob@ADA-corp.test'.toLowerCase());
    await mk(OTHER_OWNER, 'Ada Other', 'ada@other.test');

    const byName = ok(await callStep(w, 'contacts_search', { q: 'LOVE' }));
    expect((byName['contacts'] as Array<{ email: string }>).map((c) => c.email)).toEqual([
      'ada@analytical.test',
    ]);
    const byEmail = ok(await callStep(w, 'contacts_search', { q: 'ada' }));
    expect((byEmail['contacts'] as unknown[]).length).toBe(2);
    expect(JSON.stringify(byEmail)).not.toContain('other.test');
  });

  it('pages with a cursor and rejects an empty query or a bad cursor', async () => {
    const w = stepWorld();
    for (let i = 0; i < 3; i++) {
      await w.contacts.create({
        owner_id: OWNER,
        name: `Match ${i}`,
        email: `m${i}@example.com`,
        color: '#112233',
      });
    }
    const page = ok(await callStep(w, 'contacts_search', { q: 'match', limit: 2 }));
    expect((page['contacts'] as unknown[]).length).toBe(2);
    const rest = ok(
      await callStep(w, 'contacts_search', { q: 'match', limit: 2, cursor: page['next_cursor'] }),
    );
    expect((rest['contacts'] as unknown[]).length).toBe(1);
    expect(err(await callStep(w, 'contacts_search', { q: '' })).slug).toBe('validation_error');
    expect(err(await callStep(w, 'contacts_search', { q: 'a', cursor: '@@' })).slug).toBe(
      'invalid_cursor',
    );
    expect(
      err(await callStep(w, 'contacts_search', { q: 'a' }, { scopes: ['contacts:write'] })).slug,
    ).toBe('insufficient_scope');
  });
});
