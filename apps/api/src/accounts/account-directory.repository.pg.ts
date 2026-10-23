import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { Database } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import { AccountDirectoryRepository } from './account-directory.repository';

/** `auth.users` is Supabase's table; it is not part of db/schema.ts. */
@Injectable()
export class AccountDirectoryPgRepository extends AccountDirectoryRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async findEmail(owner_id: string): Promise<string | null> {
    const result = await sql<{ email: string | null }>`
      select u.email::text as email from auth.users u where u.id = ${owner_id}::uuid`.execute(
      this.db,
    );
    const email = result.rows[0]?.email ?? null;
    return email !== null && email.length > 0 ? email : null;
  }
}
