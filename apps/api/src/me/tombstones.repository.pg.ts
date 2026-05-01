import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { sql } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { TombstonesRepository } from './tombstones.repository';

@Injectable()
export class TombstonesPgRepository extends TombstonesRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async recordDeletion(input: {
    readonly user_id: string;
    readonly email_hash: string;
  }): Promise<void> {
    await this.db
      .insertInto('deleted_user_tombstones')
      .values({
        user_id: input.user_id,
        email_hash: input.email_hash,
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          email_hash: input.email_hash,
          deleted_at: sql<string>`now()`,
        }),
      )
      .execute();
  }
}
