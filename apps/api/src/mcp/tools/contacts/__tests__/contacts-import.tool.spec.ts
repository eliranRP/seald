import { OTHER_OWNER, OWNER, err, ok, write } from '../../__tests__/write-harness';
import { callStep, stepWorld } from './step-world';

type Rows = Array<{ email: string; status: string; slug?: string; id?: string }>;

describe('contacts_import', () => {
  it('upserts by email, row by row; one bad row does not stop the others', async () => {
    const w = stepWorld();
    await w.contacts.create({
      owner_id: OWNER,
      name: 'Old Ada',
      email: 'ada@example.com',
      color: '#112233',
    });
    await w.contacts.create({
      owner_id: OTHER_OWNER,
      name: 'Eve',
      email: 'eve@example.com',
      color: '#112233',
    });
    const out = ok(
      await callStep(
        w,
        'contacts_import',
        write({
          rows: [
            { name: 'Ada', email: 'ADA@example.com', color: '#445566' },
            { name: 'Bob', email: 'bob@example.com' },
            { name: 'Broken', email: 'nope' },
            { name: 'Eve', email: 'eve@example.com' },
            { name: 'Bob again', email: 'bob@example.com' },
          ],
        }),
      ),
    );
    const rows = out['rows'] as Rows;
    expect(rows.map((r) => [r.email, r.status, r.slug])).toEqual([
      ['ada@example.com', 'updated', undefined],
      ['bob@example.com', 'created', undefined],
      ['nope', 'error', 'validation_error'],
      // Another owner's Eve is not this owner's contact: created fresh.
      ['eve@example.com', 'created', undefined],
      ['bob@example.com', 'updated', undefined],
    ]);
    const mine = await w.contacts.findAllByOwner(OWNER);
    expect(mine.map((c) => c.email).sort()).toEqual([
      'ada@example.com',
      'bob@example.com',
      'eve@example.com',
    ]);
    expect(mine.find((c) => c.email === 'ada@example.com')).toMatchObject({
      name: 'Ada',
      color: '#445566',
    });
    expect(mine.find((c) => c.email === 'bob@example.com')?.name).toBe('Bob again');
    // The other owner's row is untouched.
    expect((await w.contacts.findAllByOwner(OTHER_OWNER))[0]?.name).toBe('Eve');
  });

  it('dry run reports the same statuses and writes nothing', async () => {
    const w = stepWorld();
    const dry = ok(
      await callStep(w, 'contacts_import', {
        idempotency_key: 'dry-00000005',
        dry_run: true,
        rows: [
          { name: 'A', email: 'a@example.com' },
          { name: 'A2', email: 'a@example.com' },
        ],
      }),
    );
    expect((dry['would'] as { rows: Rows }).rows.map((r) => r.status)).toEqual([
      'created',
      'updated',
    ]);
    expect(await w.contacts.findAllByOwner(OWNER)).toHaveLength(0);
  });

  it('caps a call at 100 rows, needs contacts:write, and replays on the same key', async () => {
    const w = stepWorld();
    const row = (i: number) => ({ name: `P${i}`, email: `p${i}@example.com` });
    const many = Array.from({ length: 101 }, (_, i) => row(i));
    expect(err(await callStep(w, 'contacts_import', write({ rows: many }))).slug).toBe(
      'validation_error',
    );
    expect(err(await callStep(w, 'contacts_import', write({ rows: [] }))).slug).toBe(
      'validation_error',
    );
    expect(
      err(await callStep(w, 'contacts_import', write({ rows: [row(1)] }), { scopes: [] })).slug,
    ).toBe('insufficient_scope');
    const exactly = write({ rows: Array.from({ length: 100 }, (_, i) => row(i)) });
    const first = ok(await callStep(w, 'contacts_import', exactly));
    expect((first['rows'] as Rows).filter((r) => r.status === 'created').length).toBe(100);
    expect(ok(await callStep(w, 'contacts_import', exactly))).toEqual(first);
    expect(await w.contacts.findAllByOwner(OWNER)).toHaveLength(100);
  });
});
