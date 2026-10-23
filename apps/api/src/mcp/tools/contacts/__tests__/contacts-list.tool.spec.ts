import { OTHER_OWNER, OWNER, err, ok } from '../../__tests__/write-harness';
import { callStep, stepWorld } from './step-world';

async function seed(w: ReturnType<typeof stepWorld>, owner: string, n: number): Promise<void> {
  for (let i = 0; i < n; i++) {
    await w.contacts.create({
      owner_id: owner,
      name: `Person ${String(i).padStart(2, '0')}`,
      email: `p${i}-${owner.slice(-2)}@example.com`,
      color: '#112233',
    });
  }
}

describe('contacts_list', () => {
  it('lists only this owner, by name, with an opaque cursor', async () => {
    const w = stepWorld();
    await seed(w, OWNER, 5);
    await seed(w, OTHER_OWNER, 2);
    const first = ok(await callStep(w, 'contacts_list', { limit: 2 }));
    expect((first['contacts'] as Array<{ name: string }>).map((c) => c.name)).toEqual([
      'Person 00',
      'Person 01',
    ]);
    expect(first['next_cursor']).toEqual(expect.any(String));
    const second = ok(
      await callStep(w, 'contacts_list', { limit: 10, cursor: first['next_cursor'] }),
    );
    expect((second['contacts'] as unknown[]).length).toBe(3);
    expect(second['next_cursor']).toBeNull();
    // No owner id or timestamps leave the server.
    expect(Object.keys((first['contacts'] as object[])[0] ?? {}).sort()).toEqual([
      'color',
      'email',
      'id',
      'name',
    ]);
  });

  it('rejects a bad cursor, a missing scope and unknown fields', async () => {
    const w = stepWorld();
    expect(err(await callStep(w, 'contacts_list', { cursor: 'not-a-cursor' })).slug).toBe(
      'invalid_cursor',
    );
    expect(err(await callStep(w, 'contacts_list', {}, { scopes: ['envelopes:read'] })).slug).toBe(
      'insufficient_scope',
    );
    expect(err(await callStep(w, 'contacts_list', { x: 1 })).slug).toBe('validation_error');
  });
});
