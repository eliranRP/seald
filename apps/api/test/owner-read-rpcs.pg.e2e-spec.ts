import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import { ContactsPgRepository } from '../src/contacts/contacts.repository.pg';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import { TemplatesPgRepository } from '../src/templates/templates.repository.pg';

/**
 * Migration 0050: the owner list RPCs the SPA calls with supabase-js
 * (docs/supabase-native-architecture.md, step 4). Against real Postgres
 * with Supabase's `anon` / `authenticated` roles and a claim-based
 * `auth.uid()`, it proves that
 *   - each RPC returns exactly what the matching API route returns, so the
 *     SPA can switch between them with one mapping;
 *   - another signed-in user, and an anonymous caller, see none of it;
 *   - the tables stay closed to direct Data API reads.
 * Same harness as gdrive-token-rewrap.pg.e2e-spec.ts: its own database on
 * the server in SUBMIT_SIGNER_DATABASE_URL; skipped without it, required
 * in CI.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `owner_rpcs_${randomBytes(4).toString('hex')}`;

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the owner read RPC spec');
}

const describePg = databaseUrl ? describe : describe.skip;

const TABLES = ['envelopes', 'envelope_signers', 'contacts', 'templates'] as const;

describePg('owner read RPCs (migration 0050, real Postgres)', () => {
  let admin: Pool | undefined;
  let pool: Pool | undefined;
  let db: Kysely<Database>;
  const owner = randomUUID();
  const other = randomUUID();

  /** Runs `text` as `role`, signed in as `sub` (null: no JWT), in a rolled-back transaction. */
  async function as<T>(
    role: 'anon' | 'authenticated',
    sub: string | null,
    text: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    const client = await pool!.connect();
    try {
      await client.query('begin');
      await client.query(`set local role ${role}`);
      await client.query(`select set_config('request.jwt.claim.sub', $1, true)`, [sub ?? '']);
      const res = await client.query(text, params);
      return res.rows as T[];
    } finally {
      await client.query('rollback');
      client.release();
    }
  }

  async function rpc(name: string, sub: string, args = ''): Promise<unknown> {
    const rows = await as<{ r: unknown }>(
      'authenticated',
      sub,
      `select public.${name}(${args}) as r`,
    );
    return rows[0]?.r;
  }

  /** The API's wire JSON for a repository result. */
  const wire = (v: unknown): unknown => JSON.parse(JSON.stringify(v));

  async function envelope(
    ownerId: string,
    title: string,
    over: Record<string, unknown> = {},
  ): Promise<string> {
    const row = await db
      .insertInto('envelopes')
      .values({
        owner_id: ownerId,
        title,
        short_code: randomBytes(7).toString('hex').slice(0, 13),
        tc_version: 'tc-1',
        privacy_version: 'pp-1',
        expires_at: '2027-01-01T00:00:00.000Z',
        ...over,
      } as never)
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async function signer(
    envelopeId: string,
    email: string,
    over: Record<string, unknown> = {},
  ): Promise<void> {
    await db
      .insertInto('envelope_signers')
      .values({
        envelope_id: envelopeId,
        email,
        name: email.split('@')[0] ?? email,
        color: '#4F46E5',
        // A signed row must carry its consent and signature format.
        ...(over['signed_at']
          ? { tc_accepted_at: over['signed_at'], signature_format: 'typed' }
          : {}),
        ...over,
      } as never)
      .execute();
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    // Roles are cluster-wide; create them once, as Supabase has them.
    await admin.query(`
      do $$ begin
        if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
        if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
      end $$;
    `);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    pool = new Pool({ connectionString: dedicated.toString(), max: 4 });
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      grant usage on schema auth to anon, authenticated;
      -- Supabase's auth.uid(): the JWT's sub claim.
      create or replace function auth.uid() returns uuid language sql stable as $$
        select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
      $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: {
        ...process.env,
        DATABASE_URL: dedicated.toString(),
        MIGRATIONS_DIR: resolve(__dirname, '../db/migrations'),
      },
    });
    // Supabase's default grants: everything, with RLS as the only gate.
    await pool.query(
      `grant all on ${TABLES.map((t) => `public.${t}`).join(', ')} to anon, authenticated`,
    );
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });

    await pool.query('insert into auth.users (id) values ($1), ($2)', [owner, other]);

    // The owner: a draft, a signed, a declined, a bounced and a viewed
    // envelope, with updated_at spread out so the order is fixed.
    const draft = await envelope(owner, 'Draft NDA', { updated_at: '2026-10-01T10:00:00.123Z' });
    await signer(draft, 'Ana@Example.com');
    const sealed = await envelope(owner, 'Offer letter', {
      status: 'completed',
      sent_at: '2026-10-02T09:00:00.000Z',
      completed_at: '2026-10-03T09:00:00.000Z',
      updated_at: '2026-10-03T09:00:00.456Z',
      tags: JSON.stringify(['hr', 'offer']),
      original_pages: 3,
    });
    await signer(sealed, 'ana@example.com', {
      signed_at: '2026-10-03T08:00:00.789Z',
      signing_order: 1,
    });
    await signer(sealed, 'bo@example.com', {
      signed_at: '2026-10-03T08:30:00.000Z',
      signing_order: 2,
    });
    const declined = await envelope(owner, 'Lease', {
      status: 'declined',
      sent_at: '2026-10-04T09:00:00.000Z',
      updated_at: '2026-10-04T12:00:00.000Z',
    });
    await signer(declined, 'bo@example.com', { declined_at: '2026-10-04T11:00:00.000Z' });
    const waiting = await envelope(owner, 'Advisory agreement', {
      status: 'awaiting_others',
      sent_at: '2026-10-05T09:00:00.000Z',
      updated_at: '2026-10-05T12:00:00.000Z',
    });
    await signer(waiting, 'cy@example.com', { delivery_status: 'bounced' });
    await signer(waiting, 'di@example.com', {
      viewed_at: '2026-10-05T10:00:00.000Z',
      signing_order: 2,
    });

    // The other user: one envelope listing the owner's contact, which must
    // not count toward the owner's stats.
    const foreign = await envelope(other, 'Not yours', {
      status: 'awaiting_others',
      sent_at: '2026-10-06T09:00:00.000Z',
    });
    await signer(foreign, 'ana@example.com');

    await db
      .insertInto('contacts')
      .values([
        {
          owner_id: owner,
          name: 'Ana',
          email: 'ana@example.com',
          color: '#112233',
          created_at: '2026-09-01T00:00:00.000Z',
        },
        {
          owner_id: owner,
          name: 'Bo',
          email: 'BO@example.com',
          color: '#223344',
          created_at: '2026-09-02T00:00:00.000Z',
        },
        {
          owner_id: owner,
          name: 'Ed',
          email: 'ed@example.com',
          color: '#334455',
          created_at: '2026-09-03T00:00:00.000Z',
        },
        {
          owner_id: owner,
          name: 'Gone',
          email: 'gone@example.com',
          color: '#445566',
          deleted_at: '2026-09-04T00:00:00.000Z',
        },
        { owner_id: other, name: 'Theirs', email: 'theirs@example.com', color: '#556677' },
      ] as never)
      .execute();

    const layout = JSON.stringify([{ type: 'signature', pageRule: 2, x: 0.1, y: 0.2 }]);
    await db
      .insertInto('templates')
      .values([
        {
          owner_id: owner,
          title: 'Used',
          field_layout: layout,
          last_used_at: '2026-10-01T00:00:00.000Z',
          uses_count: 3,
          example_pdf_path: `${owner}/t/example.pdf`,
        },
        {
          owner_id: owner,
          title: 'Never used',
          field_layout: '[]',
          tags: JSON.stringify(['x']),
          delivery_mode: 'sequential',
        },
        {
          owner_id: owner,
          title: 'Deleted',
          field_layout: '[]',
          deleted_at: '2026-10-02T00:00:00.000Z',
        },
        { owner_id: other, title: 'Theirs', field_layout: '[]' },
      ] as never)
      .execute();
  }, 180_000);

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  it('seald_list_envelopes returns what GET /envelopes returns, page by page', async () => {
    const repo = new EnvelopesPgRepository(db);
    const full = await repo.listByOwner(owner, { limit: 100, sort: 'date', dir: 'desc' });
    expect(full.items).toHaveLength(4);
    expect(await rpc('seald_list_envelopes', owner, '100')).toEqual(wire(full));

    const firstPage = await repo.listByOwner(owner, { limit: 2, sort: 'date', dir: 'desc' });
    expect(firstPage.next_cursor).not.toBeNull();
    expect(await rpc('seald_list_envelopes', owner, '2')).toEqual(wire(firstPage));
  });

  it('seald_list_contacts returns what GET /contacts returns', async () => {
    const expected = await new ContactsPgRepository(db).listWithStats(owner);
    const got = await rpc('seald_list_contacts', owner);
    expect(got).toEqual(wire(expected));
    // Ana: one sent envelope of the owner's (the other user's does not count).
    expect(got).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: 'Ana', docs_count: 1 })]),
    );
  });

  it('seald_list_templates returns what GET /templates returns', async () => {
    const expected = await new TemplatesPgRepository(db).findAllByOwner(owner);
    expect(expected.map((t) => t.title)).toEqual(['Used', 'Never used']);
    expect(await rpc('seald_list_templates', owner)).toEqual(wire(expected));
  });

  it('another signed-in user sees only their own rows', async () => {
    const env = (await rpc('seald_list_envelopes', other)) as { items: Array<{ title: string }> };
    expect(env.items.map((e) => e.title)).toEqual(['Not yours']);
    const contacts = (await rpc('seald_list_contacts', other)) as Array<{ name: string }>;
    expect(contacts.map((c) => c.name)).toEqual(['Theirs']);
    const templates = (await rpc('seald_list_templates', other)) as Array<{ title: string }>;
    expect(templates.map((t) => t.title)).toEqual(['Theirs']);
  });

  it('an anonymous caller cannot run the RPCs', async () => {
    for (const fn of [
      'seald_list_envelopes()',
      'seald_list_contacts()',
      'seald_list_templates()',
    ]) {
      await expect(as('anon', null, `select public.${fn}`)).rejects.toThrow(/permission denied/);
    }
  });

  it('a signed-in user with no JWT subject gets empty lists', async () => {
    const rows = await as<{ e: unknown; c: unknown; t: unknown }>(
      'authenticated',
      null,
      'select public.seald_list_envelopes() as e, public.seald_list_contacts() as c, public.seald_list_templates() as t',
    );
    expect(rows[0]).toEqual({ e: { items: [], next_cursor: null }, c: [], t: [] });
  });

  it('keeps the tables closed to direct reads (RLS, no policies)', async () => {
    for (const table of TABLES) {
      const rows = await as('authenticated', owner, `select * from public.${table}`);
      expect(rows).toEqual([]);
    }
  });

  it('does not expose the ISO helper', async () => {
    await expect(as('authenticated', owner, `select public.seald_iso(now())`)).rejects.toThrow(
      /permission denied/,
    );
  });
});
