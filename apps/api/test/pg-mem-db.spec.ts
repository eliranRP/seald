import { createPgMemDb, seedUser } from './pg-mem-db';

describe('pg-mem-db helper', () => {
  it('applies the migration and supports insert + select on contacts', async () => {
    const handle = createPgMemDb();
    try {
      const ownerId = await seedUser(handle);

      const inserted = await handle.db
        .insertInto('contacts')
        .values({
          owner_id: ownerId,
          name: 'Ada Lovelace',
          email: 'ada@example.com',
          color: '#FF00FF',
        })
        .returningAll()
        .executeTakeFirstOrThrow();

      expect(inserted.id).toMatch(/^[0-9a-f-]{36}$/i);
      expect(inserted.owner_id).toBe(ownerId);

      const rows = await handle.db
        .selectFrom('contacts')
        .selectAll()
        .where('owner_id', '=', ownerId)
        .execute();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.email).toBe('ada@example.com');
    } finally {
      await handle.close();
    }
  });
});
