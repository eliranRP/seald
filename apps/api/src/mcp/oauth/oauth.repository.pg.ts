import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import {
  OAuthRepository,
  type ConsumeCodeResult,
  type InsertCodeInput,
  type IssueTokensInput,
  type OAuthAccessRecord,
  type OAuthClientRecord,
  type OAuthCodeRecord,
  type OAuthGrantRecord,
  type OAuthRefreshRecord,
  type UpsertClientInput,
} from './oauth.repository';

type Db = Kysely<Database> | Transaction<Database>;

function iso(value: Date | string | null): string | null {
  return value === null ? null : new Date(value).toISOString();
}

function isoNN(value: Date | string): string {
  return new Date(value).toISOString();
}

interface GrantJoinRow {
  id: string;
  owner_id: string;
  scopes: string[];
  require_owner_approval: boolean;
  allow_new_recipients: boolean;
  always_require_signin: boolean;
  created_at: Date;
  last_used_at: Date | null;
  revoked_at: Date | null;
  c_id: string;
  c_client_id: string;
  c_kind: 'preregistered' | 'cimd';
  c_client_name: string;
  c_redirect_uris: string[];
}

function toGrant(row: GrantJoinRow): OAuthGrantRecord {
  return {
    id: row.id,
    ownerId: row.owner_id,
    client: {
      id: row.c_id,
      clientId: row.c_client_id,
      kind: row.c_kind,
      clientName: row.c_client_name,
      redirectUris: [...row.c_redirect_uris],
    },
    scopes: [...row.scopes],
    requireOwnerApproval: row.require_owner_approval,
    allowNewRecipients: row.allow_new_recipients,
    alwaysRequireSignin: row.always_require_signin,
    createdAt: isoNN(row.created_at),
    lastUsedAt: iso(row.last_used_at),
    revokedAt: iso(row.revoked_at),
  };
}

function grantQuery(db: Db) {
  return db
    .selectFrom('oauth_grants as g')
    .innerJoin('oauth_clients as c', 'c.id', 'g.client_ref')
    .select([
      'g.id',
      'g.owner_id',
      'g.scopes',
      'g.require_owner_approval',
      'g.allow_new_recipients',
      'g.always_require_signin',
      'g.created_at',
      'g.last_used_at',
      'g.revoked_at',
      'c.id as c_id',
      'c.client_id as c_client_id',
      'c.kind as c_kind',
      'c.client_name as c_client_name',
      'c.redirect_uris as c_redirect_uris',
    ]);
}

async function writeTokens(db: Db, input: IssueTokensInput): Promise<void> {
  await db
    .insertInto('oauth_access_tokens')
    .values({
      token_hash: input.accessHash,
      grant_id: input.grantId,
      family_id: input.familyId,
      client_ref: input.clientRef,
      scopes: [...input.scopes],
      resource: input.resource,
      expires_at: input.accessExpiresAt,
    })
    .execute();
  await db
    .insertInto('oauth_refresh_tokens')
    .values({
      token_hash: input.refreshHash,
      grant_id: input.grantId,
      family_id: input.familyId,
      client_ref: input.clientRef,
      scopes: [...input.scopes],
      resource: input.resource,
      absolute_expires_at: input.refreshAbsoluteExpiresAt,
      idle_expires_at: input.refreshIdleExpiresAt,
    })
    .execute();
}

@Injectable()
export class OAuthPgRepository extends OAuthRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async upsertClient(input: UpsertClientInput): Promise<OAuthClientRecord> {
    const at = input.now.toISOString();
    const row = await this.db
      .insertInto('oauth_clients')
      .values({
        client_id: input.clientId,
        kind: input.kind,
        client_name: input.clientName,
        redirect_uris: [...input.redirectUris],
        created_at: at,
        updated_at: at,
      })
      .onConflict((oc) =>
        oc.column('client_id').doUpdateSet({
          kind: input.kind,
          client_name: input.clientName,
          redirect_uris: [...input.redirectUris],
          updated_at: at,
        }),
      )
      .returningAll()
      .executeTakeFirstOrThrow();
    return {
      id: row.id,
      clientId: row.client_id,
      kind: row.kind,
      clientName: row.client_name,
      redirectUris: [...row.redirect_uris],
    };
  }

  async upsertGrant(input: {
    readonly ownerId: string;
    readonly clientRef: string;
    readonly scopes: readonly string[];
    readonly now: Date;
  }): Promise<OAuthGrantRecord> {
    const at = input.now.toISOString();
    const id = await this.db.transaction().execute(async (trx) => {
      // One live grant per (owner, client); the partial unique index is the backstop.
      await sql`select pg_advisory_xact_lock(hashtextextended(${`oauth_grant:${input.ownerId}:${input.clientRef}`}, 0))`.execute(
        trx,
      );
      const live = await trx
        .selectFrom('oauth_grants')
        .select('id')
        .where('owner_id', '=', input.ownerId)
        .where('client_ref', '=', input.clientRef)
        .where('revoked_at', 'is', null)
        .executeTakeFirst();
      if (live) {
        await trx
          .updateTable('oauth_grants')
          .set({ scopes: [...input.scopes], updated_at: at })
          .where('id', '=', live.id)
          .execute();
        return live.id;
      }
      const inserted = await trx
        .insertInto('oauth_grants')
        .values({
          owner_id: input.ownerId,
          client_ref: input.clientRef,
          scopes: [...input.scopes],
          created_at: at,
          updated_at: at,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
      return inserted.id;
    });
    const grant = await this.findGrant(id);
    if (!grant) throw new Error('oauth grant vanished after upsert');
    return grant;
  }

  async insertCode(input: InsertCodeInput): Promise<void> {
    await this.db
      .insertInto('oauth_authorization_codes')
      .values({
        code_hash: input.codeHash,
        grant_id: input.grantId,
        owner_id: input.ownerId,
        client_ref: input.clientRef,
        redirect_uri: input.redirectUri,
        code_challenge: input.codeChallenge,
        resource: input.resource,
        scopes: [...input.scopes],
        expires_at: input.expiresAt,
      })
      .execute();
  }

  async consumeCode(codeHash: string, now: Date): Promise<ConsumeCodeResult> {
    const at = now.toISOString();
    const consumed = await this.db
      .updateTable('oauth_authorization_codes')
      .set({ consumed_at: at })
      .where('code_hash', '=', codeHash)
      .where('consumed_at', 'is', null)
      .where('expires_at', '>', sql<Date>`${at}::timestamptz`)
      .returningAll()
      .executeTakeFirst();
    if (consumed) return { outcome: 'consumed', code: toCode(consumed) };
    const existing = await this.db
      .selectFrom('oauth_authorization_codes')
      .selectAll()
      .where('code_hash', '=', codeHash)
      .executeTakeFirst();
    if (existing && existing.consumed_at !== null) {
      return { outcome: 'replayed', code: toCode(existing) };
    }
    return { outcome: 'invalid' };
  }

  async findGrant(grantId: string): Promise<OAuthGrantRecord | null> {
    const row = await grantQuery(this.db).where('g.id', '=', grantId).executeTakeFirst();
    return row ? toGrant(row) : null;
  }

  async issueTokens(input: IssueTokensInput): Promise<void> {
    await this.db.transaction().execute((trx) => writeTokens(trx, input));
  }

  async findRefreshToken(tokenHash: string): Promise<OAuthRefreshRecord | null> {
    const row = await this.db
      .selectFrom('oauth_refresh_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      grantId: row.grant_id,
      familyId: row.family_id,
      clientRef: row.client_ref,
      scopes: [...row.scopes],
      resource: row.resource,
      absoluteExpiresAt: isoNN(row.absolute_expires_at),
      idleExpiresAt: isoNN(row.idle_expires_at),
      rotatedAt: iso(row.rotated_at),
      revokedAt: iso(row.revoked_at),
    };
  }

  async rotateRefreshToken(
    oldId: string,
    next: IssueTokensInput,
    now: Date,
  ): Promise<'rotated' | 'reused'> {
    const at = now.toISOString();
    return this.db.transaction().execute(async (trx) => {
      const claimed = await trx
        .updateTable('oauth_refresh_tokens')
        .set({ rotated_at: at })
        .where('id', '=', oldId)
        .where('rotated_at', 'is', null)
        .where('revoked_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      if (!claimed) return 'reused';
      await writeTokens(trx, next);
      return 'rotated';
    });
  }

  async findAccessToken(tokenHash: string): Promise<OAuthAccessRecord | null> {
    const token = await this.db
      .selectFrom('oauth_access_tokens')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    if (!token) return null;
    const grant = await this.findGrant(token.grant_id);
    if (!grant) return null;
    return {
      id: token.id,
      grant,
      familyId: token.family_id,
      scopes: [...token.scopes],
      resource: token.resource,
      expiresAt: isoNN(token.expires_at),
      revokedAt: iso(token.revoked_at),
    };
  }

  async revokeGrant(grantId: string, reason: string, now: Date): Promise<boolean> {
    const at = now.toISOString();
    return this.db.transaction().execute(async (trx) => {
      const updated = await trx
        .updateTable('oauth_grants')
        .set({ revoked_at: at, revoked_reason: reason.slice(0, 64), updated_at: at })
        .where('id', '=', grantId)
        .where('revoked_at', 'is', null)
        .returning('id')
        .executeTakeFirst();
      await trx
        .updateTable('oauth_refresh_tokens')
        .set({ revoked_at: at })
        .where('grant_id', '=', grantId)
        .where('revoked_at', 'is', null)
        .execute();
      await trx
        .updateTable('oauth_access_tokens')
        .set({ revoked_at: at })
        .where('grant_id', '=', grantId)
        .where('revoked_at', 'is', null)
        .execute();
      return updated !== undefined;
    });
  }

  async revokeFamily(familyId: string, now: Date): Promise<number> {
    const at = now.toISOString();
    return this.db.transaction().execute(async (trx) => {
      const refresh = await trx
        .updateTable('oauth_refresh_tokens')
        .set({ revoked_at: at })
        .where('family_id', '=', familyId)
        .where('revoked_at', 'is', null)
        .returning('id')
        .execute();
      const access = await trx
        .updateTable('oauth_access_tokens')
        .set({ revoked_at: at })
        .where('family_id', '=', familyId)
        .where('revoked_at', 'is', null)
        .returning('id')
        .execute();
      return refresh.length + access.length;
    });
  }

  async revokeAccessToken(tokenHash: string, now: Date): Promise<boolean> {
    const row = await this.db
      .updateTable('oauth_access_tokens')
      .set({ revoked_at: now.toISOString() })
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return row !== undefined;
  }

  async touchGrantLastUsed(grantId: string, now: Date): Promise<void> {
    await this.db
      .updateTable('oauth_grants')
      .set({ last_used_at: now.toISOString() })
      .where('id', '=', grantId)
      .execute();
  }

  async listLiveGrants(ownerId: string): Promise<readonly OAuthGrantRecord[]> {
    const rows = await grantQuery(this.db)
      .where('g.owner_id', '=', ownerId)
      .where('g.revoked_at', 'is', null)
      .orderBy('g.created_at', 'desc')
      .limit(100)
      .execute();
    return rows.map(toGrant);
  }
}

function toCode(row: {
  id: string;
  grant_id: string;
  owner_id: string;
  client_ref: string;
  redirect_uri: string;
  code_challenge: string;
  resource: string;
  scopes: string[];
  expires_at: Date;
  consumed_at: Date | null;
}): OAuthCodeRecord {
  return {
    id: row.id,
    grantId: row.grant_id,
    ownerId: row.owner_id,
    clientRef: row.client_ref,
    redirectUri: row.redirect_uri,
    codeChallenge: row.code_challenge,
    resource: row.resource,
    scopes: [...row.scopes],
    expiresAt: isoNN(row.expires_at),
    consumedAt: iso(row.consumed_at),
  };
}
