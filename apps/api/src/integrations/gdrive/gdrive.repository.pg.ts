import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { Database, GDriveAccountsTable } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import type { GDriveAccount, GDriveRepository } from './gdrive.repository';

type Row = Selectable<GDriveAccountsTable>;

function toCiphertext(value: Buffer | string | null): Buffer | null {
  if (value == null) return null;
  return Buffer.isBuffer(value) ? value : Buffer.from(value);
}

function toDomain(r: Row): GDriveAccount {
  return {
    id: r.id,
    userId: r.user_id,
    googleUserId: r.google_user_id,
    googleEmail: r.google_email,
    refreshTokenCiphertext: toCiphertext(r.refresh_token_ciphertext),
    refreshTokenKmsKeyArn: r.refresh_token_kms_key_arn,
    scope: r.scope,
    connectedAt: new Date(r.connected_at).toISOString(),
    lastUsedAt: r.last_used_at ? new Date(r.last_used_at).toISOString() : null,
    deletedAt: r.deleted_at ? new Date(r.deleted_at).toISOString() : null,
  };
}

@Injectable()
export class GDrivePgRepository implements GDriveRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {}

  async findByIdForUser(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = await this.db
      .selectFrom('gdrive_accounts')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return r ? toDomain(r) : null;
  }

  async findByIdForUserIncludingDeleted(id: string, userId: string): Promise<GDriveAccount | null> {
    const r = await this.db
      .selectFrom('gdrive_accounts')
      .selectAll()
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return r ? toDomain(r) : null;
  }

  async listForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    const rows = await this.db
      .selectFrom('gdrive_accounts')
      .selectAll()
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .orderBy('connected_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async listAllForUser(userId: string): Promise<ReadonlyArray<GDriveAccount>> {
    const rows = await this.db
      .selectFrom('gdrive_accounts')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('connected_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async insert(row: GDriveAccount): Promise<GDriveAccount> {
    const inserted = await this.db
      .insertInto('gdrive_accounts')
      .values({
        id: row.id,
        user_id: row.userId,
        google_user_id: row.googleUserId,
        google_email: row.googleEmail,
        refresh_token_ciphertext: row.refreshTokenCiphertext,
        refresh_token_kms_key_arn: row.refreshTokenKmsKeyArn,
        scope: row.scope,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(inserted);
  }

  async findActiveByUserAndGoogleUser(
    userId: string,
    googleUserId: string,
  ): Promise<GDriveAccount | null> {
    const r = await this.db
      .selectFrom('gdrive_accounts')
      .selectAll()
      .where('user_id', '=', userId)
      .where('google_user_id', '=', googleUserId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return r ? toDomain(r) : null;
  }

  async replaceToken(args: {
    id: string;
    refreshTokenCiphertext: Buffer;
    refreshTokenKmsKeyArn: string;
    scope: string;
    googleEmail: string;
  }): Promise<GDriveAccount> {
    // `connected_at` is intentionally NOT bumped — it records the first
    // OAuth grant for this (user, googleUser) pair. Reconnects rotate
    // the token but preserve the original connection date for audit.
    const updated = await this.db
      .updateTable('gdrive_accounts')
      .set({
        refresh_token_ciphertext: args.refreshTokenCiphertext,
        refresh_token_kms_key_arn: args.refreshTokenKmsKeyArn,
        scope: args.scope,
        google_email: args.googleEmail,
        last_used_at: null,
      })
      .where('id', '=', args.id)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(updated);
  }

  async disconnect(id: string, userId: string): Promise<boolean> {
    // Token wipe and deleted_at land in one transaction. A second call
    // leaves the original deleted_at (coalesce) and the null token columns.
    return this.db.transaction().execute(async (trx) => {
      const r = await trx
        .updateTable('gdrive_accounts')
        .set({
          deleted_at: sql<string>`coalesce(deleted_at, now())`,
          refresh_token_ciphertext: null,
          refresh_token_kms_key_arn: null,
        })
        .where('id', '=', id)
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return (r.numUpdatedRows ?? 0n) > 0n;
    });
  }

  async deleteAllByUser(userId: string): Promise<number> {
    const r = await this.db
      .deleteFrom('gdrive_accounts')
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return Number(r.numDeletedRows ?? 0n);
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .updateTable('gdrive_accounts')
      .set({ last_used_at: new Date().toISOString() })
      .where('id', '=', id)
      .execute();
  }
}
