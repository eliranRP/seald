import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import type { Database, GDriveAccountsTable } from '../../../db/schema';
import { DB_TOKEN } from '../../db/db.provider';
import type { GDriveAccount, GDriveRepository } from './gdrive.repository';

type Row = Selectable<GDriveAccountsTable>;

function toDomain(r: Row): GDriveAccount {
  return {
    id: r.id,
    userId: r.user_id,
    googleUserId: r.google_user_id,
    googleEmail: r.google_email,
    refreshTokenCiphertext: Buffer.isBuffer(r.refresh_token_ciphertext)
      ? r.refresh_token_ciphertext
      : Buffer.from(r.refresh_token_ciphertext as unknown as ArrayBuffer),
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

  async softDelete(id: string, userId: string): Promise<boolean> {
    const r = await this.db
      .updateTable('gdrive_accounts')
      .set({ deleted_at: new Date().toISOString() })
      .where('id', '=', id)
      .where('user_id', '=', userId)
      .where('deleted_at', 'is', null)
      .executeTakeFirst();
    return (r?.numUpdatedRows ?? 0n) > 0n;
  }

  async touchLastUsed(id: string): Promise<void> {
    await this.db
      .updateTable('gdrive_accounts')
      .set({ last_used_at: new Date().toISOString() })
      .where('id', '=', id)
      .execute();
  }
}
