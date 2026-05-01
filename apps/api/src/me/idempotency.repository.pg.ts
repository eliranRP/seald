import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { IdempotencyRepository } from './idempotency.repository';

@Injectable()
export class IdempotencyPgRepository extends IdempotencyRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async deleteByUser(user_id: string): Promise<number> {
    const res = await this.db
      .deleteFrom('idempotency_records')
      .where('user_id', '=', user_id)
      .executeTakeFirst();
    // kysely returns numDeletedRows as a bigint; coerce to number for
    // the small caller-side check (it never realistically exceeds 2^32).
    return Number(res.numDeletedRows ?? 0);
  }
}
