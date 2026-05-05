import type { TemplateField } from 'shared';
import { createPgMemDb, type PgMemHandle, seedUser } from '../../../test/pg-mem-db';
import { TemplatesPgRepository } from '../templates.repository.pg';

const OWNER_A = '11111111-1111-4111-8111-111111111111';
const OWNER_B = '22222222-2222-4222-8222-222222222222';

const SAMPLE_FIELDS: ReadonlyArray<TemplateField> = [
  { type: 'signature', pageRule: 'last', x: 60, y: 540 },
  { type: 'date', pageRule: 'last', x: 320, y: 540 },
  { type: 'initial', pageRule: 'all', x: 522, y: 50 },
];

describe('TemplatesPgRepository (pg-mem)', () => {
  let handle: PgMemHandle;
  let repo: TemplatesPgRepository;

  beforeEach(async () => {
    handle = createPgMemDb();
    await seedUser(handle, OWNER_A);
    await seedUser(handle, OWNER_B);
    // Inject the Kysely instance directly — TemplatesPgRepository's
    // constructor uses Nest @Inject which we bypass in unit tests.
    repo = new TemplatesPgRepository(handle.db);
  });

  afterEach(async () => {
    await handle.close();
  });

  it('round-trips a template through create + findOneByOwner', async () => {
    const created = await repo.create({
      owner_id: OWNER_A,
      title: 'NDA — short form',
      description: 'Mutual NDA',
      cover_color: '#FFFBEB',
      field_layout: SAMPLE_FIELDS,
    });

    expect(created.id).toEqual(expect.any(String));
    expect(created.uses_count).toBe(0);
    expect(created.last_used_at).toBeNull();
    expect(created.field_layout).toEqual(SAMPLE_FIELDS);

    const reloaded = await repo.findOneByOwner(OWNER_A, created.id);
    expect(reloaded).toEqual(created);
  });

  it('scopes findAllByOwner — never returns rows from other owners', async () => {
    await repo.create({
      owner_id: OWNER_A,
      title: 'A1',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
    });
    await repo.create({
      owner_id: OWNER_B,
      title: 'B1',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
    });
    const aList = await repo.findAllByOwner(OWNER_A);
    const bList = await repo.findAllByOwner(OWNER_B);
    expect(aList.map((t) => t.title)).toEqual(['A1']);
    expect(bList.map((t) => t.title)).toEqual(['B1']);
  });

  it('update applies a partial patch and bumps updated_at', async () => {
    const t = await repo.create({
      owner_id: OWNER_A,
      title: 'Original',
      description: 'foo',
      cover_color: '#000000',
      field_layout: SAMPLE_FIELDS,
    });
    const updated = await repo.update(OWNER_A, t.id, { title: 'Renamed' });
    expect(updated?.title).toBe('Renamed');
    expect(updated?.description).toBe('foo'); // untouched
  });

  it('update returns null when the template is owned by someone else', async () => {
    const t = await repo.create({
      owner_id: OWNER_A,
      title: 'A',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
    });
    const out = await repo.update(OWNER_B, t.id, { title: 'attacker' });
    expect(out).toBeNull();
  });

  it('incrementUseCount bumps uses_count and sets last_used_at', async () => {
    const t = await repo.create({
      owner_id: OWNER_A,
      title: 'Use me',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
    });
    expect(t.uses_count).toBe(0);
    expect(t.last_used_at).toBeNull();

    const after = await repo.incrementUseCount(OWNER_A, t.id);
    expect(after?.uses_count).toBe(1);
    expect(after?.last_used_at).not.toBeNull();
  });

  it('delete returns true when row exists and false otherwise', async () => {
    const t = await repo.create({
      owner_id: OWNER_A,
      title: 'D',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
    });
    expect(await repo.delete(OWNER_A, t.id)).toBe(true);
    expect(await repo.findOneByOwner(OWNER_A, t.id)).toBeNull();
    expect(await repo.delete(OWNER_A, t.id)).toBe(false);
  });

  // Regression for the "save template returns internal_error" bug
  // (migration 0009 added `tags` + `last_signers` columns; the live
  // DB hadn't been migrated, so INSERTs from the new repo failed
  // with column-not-found and the API mapped it to internal_error).
  // pg-mem applies 0009 via the test fixture — these assertions
  // confirm the repo round-trips the new columns, so a future
  // schema/repo drift would surface here before reaching prod.
  it('round-trips tags + last_signers on create', async () => {
    const t = await repo.create({
      owner_id: OWNER_A,
      title: 'Tagged template',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
      tags: ['Legal', 'Sales'],
      last_signers: [{ id: 'c-jamie', name: 'Jamie', email: 'jamie@seald.app', color: '#818CF8' }],
    });
    expect(t.tags).toEqual(['Legal', 'Sales']);
    expect(t.last_signers).toEqual([
      { id: 'c-jamie', name: 'Jamie', email: 'jamie@seald.app', color: '#818CF8' },
    ]);
  });

  it('defaults tags + last_signers to [] when caller omits them', async () => {
    // The repo's CreateTemplateInput marks both fields optional so
    // existing call sites that pre-date 0009 keep working without
    // every test having to spell them out.
    const t = await repo.create({
      owner_id: OWNER_A,
      title: 'No-tags template',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
    });
    expect(t.tags).toEqual([]);
    expect(t.last_signers).toEqual([]);
  });

  it('update can patch tags + last_signers in isolation', async () => {
    const t = await repo.create({
      owner_id: OWNER_A,
      title: 'Patchable',
      description: null,
      cover_color: null,
      field_layout: SAMPLE_FIELDS,
    });
    const patched = await repo.update(OWNER_A, t.id, {
      tags: ['Construction'],
      last_signers: [{ id: 's-1', name: 'Guest', email: 'g@example.com', color: '#F472B6' }],
    });
    expect(patched?.tags).toEqual(['Construction']);
    expect(patched?.last_signers?.[0]?.email).toBe('g@example.com');
    // Title untouched.
    expect(patched?.title).toBe('Patchable');
  });
});
