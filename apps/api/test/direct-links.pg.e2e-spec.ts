import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { Kysely, PostgresDialect } from 'kysely';
import { Pool } from 'pg';
import type { Database } from '../db/schema';
import {
  generateDirectLinkToken,
  hashClaimEmail,
  hashDirectLinkToken,
} from '../src/direct-links/direct-link-token';
import { DirectLinkExistsError } from '../src/direct-links/direct-links.repository';
import { DirectLinksPgRepository } from '../src/direct-links/direct-links.repository.pg';
import { EnvelopesPgRepository } from '../src/envelopes/envelopes.repository.pg';
import { TemplatesPgRepository } from '../src/templates/templates.repository.pg';
import { setFlag } from './pades-e2e-harness';

/**
 * WP-37 (migration 0033) against real Postgres:
 *
 *   - only the token hash is stored; one live link per template;
 *     rotate revokes the old hash in the same transaction;
 *   - the daily cap and the one-claim-per-address rule hold when claims
 *     arrive concurrently (advisory lock per link);
 *   - attachEnvelope stamps envelopes.source / direct_link_id /
 *     source_template_id; deleting a template removes its links and claims;
 *   - templates.delivery_mode (WP-06 gap) round-trips;
 *   - RLS is on for both new tables, and 0033 survives up → down → up.
 *
 * Creates its own scratch database on the server SUBMIT_SIGNER_DATABASE_URL
 * names, migrates it with the real runner, then drops it. Skips without the
 * URL; in CI a missing URL fails the file.
 */
const execFileAsync = promisify(execFile);
const databaseUrl = process.env.SUBMIT_SIGNER_DATABASE_URL;
const DB_NAME = `direct_links_${randomUUID().replace(/-/g, '').slice(0, 8)}`;
const MIGRATIONS_DIR = resolve(__dirname, '../db/migrations');
const UP = join(MIGRATIONS_DIR, '0033_template_direct_links.sql');
const DOWN = join(MIGRATIONS_DIR, 'down', '0033_template_direct_links_down.sql');

if (!databaseUrl && process.env.CI === 'true') {
  throw new Error('SUBMIT_SIGNER_DATABASE_URL is required in CI for the direct-links pg spec');
}

const describePg = databaseUrl ? describe : describe.skip;

describePg('template direct links (real Postgres)', () => {
  let pool: Pool;
  let db: Kysely<Database>;
  let links: DirectLinksPgRepository;
  let templates: TemplatesPgRepository;
  let envelopes: EnvelopesPgRepository;
  let dedicatedUrl: string;
  let admin: Pool | undefined;
  let ownerId: string;

  async function psqlFile(file: string): Promise<void> {
    await execFileAsync('psql', [dedicatedUrl, '-v', 'ON_ERROR_STOP=1', '-1', '-q', '-f', file]);
  }

  beforeAll(async () => {
    if (!databaseUrl) throw new Error('SUBMIT_SIGNER_DATABASE_URL missing');
    admin = new Pool({ connectionString: databaseUrl, max: 1 });
    admin.on('error', () => undefined);
    await admin.query(`drop database if exists ${DB_NAME} with (force)`);
    await admin.query(`create database ${DB_NAME}`);
    const dedicated = new URL(databaseUrl);
    dedicated.pathname = `/${DB_NAME}`;
    dedicatedUrl = dedicated.toString();
    pool = new Pool({
      connectionString: dedicatedUrl,
      max: 12,
      application_name: 'direct-links-pg',
    });
    pool.on('error', () => undefined);
    await pool.query(`
      create schema if not exists auth;
      create table if not exists auth.users (id uuid primary key);
      create or replace function auth.uid() returns uuid
        language sql stable as $$ select null::uuid $$;
    `);
    await execFileAsync('sh', [resolve(__dirname, '../scripts/migrate.sh')], {
      env: { ...process.env, DATABASE_URL: dedicatedUrl, MIGRATIONS_DIR },
    });
    db = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    links = new DirectLinksPgRepository(db);
    templates = new TemplatesPgRepository(db);
    envelopes = new EnvelopesPgRepository(db);
    ownerId = randomUUID();
    await pool.query('insert into auth.users (id) values ($1)', [ownerId]);
  }, 180_000);

  afterEach(() => setFlag('signingOrder', undefined));

  afterAll(async () => {
    await db?.destroy();
    if (admin) {
      await admin.query(`drop database if exists ${DB_NAME} with (force)`);
      await admin.end();
    }
  });

  async function newTemplate(over: { delivery_mode?: 'parallel' | 'sequential' } = {}) {
    return templates.create({
      owner_id: ownerId,
      title: 'Agreement',
      description: null,
      cover_color: null,
      field_layout: [],
      last_signers: [{ id: 'slot-1', name: 'A', email: 'a@example.com', color: '#112233' }],
      ...over,
    });
  }

  async function newLink(templateId: string, daily_cap = 50) {
    const gen = generateDirectLinkToken();
    const link = await links.create({
      template_id: templateId,
      owner_id: ownerId,
      token_hash: gen.tokenHash,
      prefix: gen.prefix,
      signer_slot: 'slot-1',
      daily_cap,
      sender_name: 'Owner',
      sender_email: 'owner@example.com',
    });
    return { gen, link };
  }

  it('stores only the token hash and finds the link by it', async () => {
    const t = await newTemplate();
    const { gen, link } = await newLink(t.id);
    const found = await links.findLiveByTokenHash(hashDirectLinkToken(gen.token));
    expect(found?.id).toBe(link.id);
    expect(await links.findLiveByTokenHash(hashDirectLinkToken(`dl_${'a'.repeat(43)}`))).toBeNull();
    const raw = await pool.query(
      'select row_to_json(l)::text as j from template_direct_links l where id = $1',
      [link.id],
    );
    const json = String((raw.rows[0] as { j: string }).j);
    expect(json).not.toContain(gen.token);
    expect(json).not.toContain(gen.token.slice(3));
    expect(json).toContain(gen.tokenHash);
  });

  it('allows one live link per template and rejects a second', async () => {
    const t = await newTemplate();
    await newLink(t.id);
    await expect(newLink(t.id)).rejects.toBeInstanceOf(DirectLinkExistsError);
  });

  it('disables and re-enables without changing the hash', async () => {
    const t = await newTemplate();
    const { gen } = await newLink(t.id);
    const off = await links.update(ownerId, t.id, { enabled: false });
    expect(off?.enabled).toBe(false);
    expect((await links.findLiveByTokenHash(hashDirectLinkToken(gen.token)))?.enabled).toBe(false);
    const on = await links.update(ownerId, t.id, { enabled: true });
    expect(on?.enabled).toBe(true);
    expect((await links.findLiveByTokenHash(hashDirectLinkToken(gen.token)))?.enabled).toBe(true);
    // Another owner cannot touch it.
    expect(await links.update(randomUUID(), t.id, { enabled: false })).toBeNull();
  });

  it('rotate revokes the old hash and keeps the settings in one step', async () => {
    const t = await newTemplate();
    const { gen: first } = await newLink(t.id, 7);
    await links.update(ownerId, t.id, { enabled: false });
    const next = generateDirectLinkToken();
    const rotated = await links.rotate(ownerId, t.id, {
      token_hash: next.tokenHash,
      prefix: next.prefix,
      sender_email: 'owner@example.com',
    });
    expect(rotated).toMatchObject({ daily_cap: 7, enabled: false, signer_slot: 'slot-1' });
    expect(await links.findLiveByTokenHash(hashDirectLinkToken(first.token))).toBeNull();
    expect((await links.findLiveByTokenHash(next.tokenHash))?.id).toBe(rotated?.id);
    expect((await links.findLiveByTemplate(ownerId, t.id))?.id).toBe(rotated?.id);
    const revoked = await pool.query(
      'select count(*)::int as n from template_direct_links where template_id = $1 and revoked_at is not null',
      [t.id],
    );
    expect((revoked.rows[0] as { n: number }).n).toBe(1);
    expect(
      await links.rotate(randomUUID(), t.id, {
        token_hash: next.tokenHash,
        prefix: 'x',
        sender_email: null,
      }),
    ).toBeNull();
  });

  it('revoke ends the link and a new one can follow', async () => {
    const t = await newTemplate();
    const { gen } = await newLink(t.id);
    expect(await links.revoke(ownerId, t.id)).toBe(true);
    expect(await links.revoke(ownerId, t.id)).toBe(false);
    expect(await links.findLiveByTokenHash(hashDirectLinkToken(gen.token))).toBeNull();
    await newLink(t.id);
  });

  it('holds the daily cap when claims arrive at the same time', async () => {
    const t = await newTemplate();
    const { link } = await newLink(t.id, 5);
    const now = new Date();
    const results = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        links.reserveClaim({
          link_id: link.id,
          email_hash: hashClaimEmail(`v${i}@example.org`),
          daily_cap: 5,
          now,
        }),
      ),
    );
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(5);
    expect(results.filter((r) => r.kind === 'cap_reached')).toHaveLength(15);
    expect(await links.countRecentClaims(link.id, now)).toBe(5);
  });

  it('lets one address through once per day even when it races itself', async () => {
    const t = await newTemplate();
    const { link } = await newLink(t.id);
    const now = new Date();
    const hash = hashClaimEmail('same@example.org');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        links.reserveClaim({ link_id: link.id, email_hash: hash, daily_cap: 50, now }),
      ),
    );
    expect(results.filter((r) => r.kind === 'reserved')).toHaveLength(1);
    expect(results.filter((r) => r.kind === 'duplicate')).toHaveLength(7);
  });

  it('counts only the last 24 hours, and a released claim frees its slot', async () => {
    const t = await newTemplate();
    const { link } = await newLink(t.id, 1);
    const old = await links.reserveClaim({
      link_id: link.id,
      email_hash: hashClaimEmail('old@example.org'),
      daily_cap: 1,
      now: new Date(),
    });
    if (old.kind !== 'reserved') throw new Error('expected reserved');
    await pool.query(
      "update template_direct_link_claims set created_at = now() - interval '25 hours' where id = $1",
      [old.claim_id],
    );
    const fresh = await links.reserveClaim({
      link_id: link.id,
      email_hash: hashClaimEmail('new@example.org'),
      daily_cap: 1,
      now: new Date(),
    });
    expect(fresh.kind).toBe('reserved');
    if (fresh.kind !== 'reserved') return;
    const blocked = await links.reserveClaim({
      link_id: link.id,
      email_hash: hashClaimEmail('third@example.org'),
      daily_cap: 1,
      now: new Date(),
    });
    expect(blocked.kind).toBe('cap_reached');
    await links.releaseClaim(fresh.claim_id);
    const again = await links.reserveClaim({
      link_id: link.id,
      email_hash: hashClaimEmail('third@example.org'),
      daily_cap: 1,
      now: new Date(),
    });
    expect(again.kind).toBe('reserved');
  });

  it('stamps the envelope provenance, defaulting other envelopes to app', async () => {
    const t = await newTemplate();
    const { link } = await newLink(t.id);
    const claim = await links.reserveClaim({
      link_id: link.id,
      email_hash: hashClaimEmail('p@example.org'),
      daily_cap: 50,
      now: new Date(),
    });
    if (claim.kind !== 'reserved') throw new Error('expected reserved');
    const mk = () =>
      envelopes.createDraft({
        owner_id: ownerId,
        title: 'From link',
        short_code: randomBytes(8).toString('hex').slice(0, 13),
        tc_version: 'tc-v1',
        privacy_version: 'pp-v1',
        expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
      });
    const viaLink = await mk();
    const plain = await mk();
    await links.attachEnvelope(claim.claim_id, {
      envelope_id: viaLink.id,
      template_id: t.id,
      direct_link_id: link.id,
    });
    const rows = await pool.query<{
      id: string;
      source: string;
      direct_link_id: string | null;
      source_template_id: string | null;
    }>('select id, source, direct_link_id, source_template_id from envelopes where id = any($1)', [
      [viaLink.id, plain.id],
    ]);
    const byId = new Map(rows.rows.map((r) => [r.id, r]));
    expect(byId.get(viaLink.id)).toMatchObject({
      source: 'direct_link',
      direct_link_id: link.id,
      source_template_id: t.id,
    });
    expect(byId.get(plain.id)).toMatchObject({ source: 'app', direct_link_id: null });
    const c = await pool.query(
      'select envelope_id from template_direct_link_claims where id = $1',
      [claim.claim_id],
    );
    expect((c.rows[0] as { envelope_id: string }).envelope_id).toBe(viaLink.id);
    // The source check refuses an unknown value.
    await expect(
      pool.query("update envelopes set source = 'web' where id = $1", [plain.id]),
    ).rejects.toThrow();
  });

  it('hides links on template delete and removes them with the purge, keeping the envelope', async () => {
    const t = await newTemplate();
    const { link } = await newLink(t.id);
    const claim = await links.reserveClaim({
      link_id: link.id,
      email_hash: hashClaimEmail('d@example.org'),
      daily_cap: 50,
      now: new Date(),
    });
    if (claim.kind !== 'reserved') throw new Error('expected reserved');
    const env = await envelopes.createDraft({
      owner_id: ownerId,
      title: 'Kept',
      short_code: randomBytes(8).toString('hex').slice(0, 13),
      tc_version: 'tc-v1',
      privacy_version: 'pp-v1',
      expires_at: new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    });
    await links.attachEnvelope(claim.claim_id, {
      envelope_id: env.id,
      template_id: t.id,
      direct_link_id: link.id,
    });
    expect(await templates.delete(ownerId, t.id)).toBe(true);
    // Soft delete: the public link path loads the template through
    // findOneByOwner, which no longer returns it, so the link 404s. The rows
    // stay so Undo (restore) brings the link back.
    expect(await templates.findOneByOwner(ownerId, t.id)).toBeNull();
    const kept_link = await pool.query(
      'select count(*)::int as n from template_direct_links where id = $1',
      [link.id],
    );
    expect((kept_link.rows[0] as { n: number }).n).toBe(1);
    // Past the Undo window the row is purged; links and claims cascade.
    await pool.query('delete from templates where id = $1', [t.id]);
    const gone = await pool.query(
      'select count(*)::int as n from template_direct_links where id = $1',
      [link.id],
    );
    expect((gone.rows[0] as { n: number }).n).toBe(0);
    const claims = await pool.query(
      'select count(*)::int as n from template_direct_link_claims where id = $1',
      [claim.claim_id],
    );
    expect((claims.rows[0] as { n: number }).n).toBe(0);
    const kept = await pool.query(
      'select source, direct_link_id, source_template_id from envelopes where id = $1',
      [env.id],
    );
    expect(kept.rows[0]).toEqual({
      source: 'direct_link',
      direct_link_id: null,
      source_template_id: null,
    });
  });

  it('stores templates.delivery_mode, defaulting to parallel, and gates it on the wire', async () => {
    setFlag('signingOrder', false);
    const plain = await newTemplate();
    expect(plain).not.toHaveProperty('delivery_mode');
    setFlag('signingOrder', true);
    const seq = await newTemplate({ delivery_mode: 'sequential' });
    expect(seq.delivery_mode).toBe('sequential');
    expect((await templates.findOneByOwner(ownerId, plain.id))?.delivery_mode).toBe('parallel');
    const updated = await templates.update(ownerId, seq.id, {
      delivery_mode: 'parallel',
      last_signers: [
        { id: 'slot-1', name: 'A', email: 'a@example.com', color: '#112233', signing_order: 2 },
      ],
    });
    expect(updated?.delivery_mode).toBe('parallel');
    expect(updated?.last_signers[0]?.signing_order).toBe(2);
    setFlag('signingOrder', false);
    expect(await templates.findOneByOwner(ownerId, seq.id)).not.toHaveProperty('delivery_mode');
  });

  it('turns row level security on for both tables', async () => {
    const res = await pool.query<{ relname: string; relrowsecurity: boolean }>(
      "select relname, relrowsecurity from pg_class where relname in ('template_direct_links', 'template_direct_link_claims')",
    );
    expect(res.rows).toHaveLength(2);
    expect(res.rows.every((r) => r.relrowsecurity)).toBe(true);
    const policies = await pool.query(
      "select count(*)::int as n from pg_policies where tablename like 'template_direct_link%'",
    );
    expect((policies.rows[0] as { n: number }).n).toBe(0);
  });

  it('0033 re-runs idempotently and survives up → down → up', async () => {
    await psqlFile(UP);
    await psqlFile(DOWN);
    const dropped = await pool.query(
      "select (select count(*) from pg_class where relname like 'template_direct_link%')::int as tables, (select count(*) from information_schema.columns where table_name = 'envelopes' and column_name in ('source', 'direct_link_id'))::int as env_cols, (select count(*) from information_schema.columns where table_name = 'templates' and column_name = 'delivery_mode')::int as tpl_cols",
    );
    expect(dropped.rows[0]).toEqual({ tables: 0, env_cols: 0, tpl_cols: 0 });
    // 0031's column is not ours to drop.
    const kept = await pool.query(
      "select count(*)::int as n from information_schema.columns where table_name = 'envelopes' and column_name = 'source_template_id'",
    );
    expect((kept.rows[0] as { n: number }).n).toBe(1);
    await psqlFile(UP);
    await psqlFile(UP);
    const back = await pool.query(
      "select count(*)::int as n from pg_class where relname in ('template_direct_links', 'template_direct_link_claims')",
    );
    expect((back.rows[0] as { n: number }).n).toBe(2);
  });
});
