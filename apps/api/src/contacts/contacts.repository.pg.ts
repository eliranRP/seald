import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import type { Database, ContactsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import type { Contact } from './contact.entity';
import {
  ContactEmailTakenError,
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from './contacts.repository';

type Row = Selectable<ContactsTable>;

/**
 * Postgres error code 23505 = unique_violation. We only care about the
 * (owner_id, email) uniqueness — any other 23505 is re-thrown so we don't
 * hide bugs. pg-mem surfaces the same code; the constraint name matches
 * the real DB after the migration is applied verbatim.
 *
 * pg-mem quirk: it does not populate `constraint`; instead, the detail
 * "Key (owner_id,email)=..." appears embedded in `message`. We match on
 * that string as the pg-mem signal, keeping real-Postgres matching narrow
 * on the constraint name.
 */
function isEmailUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const e = err as { code?: string; constraint?: string; message?: string };
  if (e.code !== '23505') return false;
  // Real Postgres exposes `constraint` with the exact index name.
  if (e.constraint === 'contacts_owner_email_uniq') return true;
  // pg-mem embeds column info in `message` (no `constraint` field).
  if (typeof e.message === 'string' && e.message.includes('contacts_owner_email_uniq')) return true;
  if (typeof e.message === 'string' && e.message.includes('Key (owner_id,email)')) return true;
  return false;
}

function toDomain(r: Row): Contact {
  return {
    id: r.id,
    owner_id: r.owner_id,
    name: r.name,
    email: r.email,
    color: r.color,
    created_at: new Date(r.created_at).toISOString(),
    updated_at: new Date(r.updated_at).toISOString(),
  };
}

@Injectable()
export class ContactsPgRepository extends ContactsRepository {
  constructor(@Inject(DB_TOKEN) private readonly db: Kysely<Database>) {
    super();
  }

  async create(input: CreateContactInput): Promise<Contact> {
    try {
      const row = await this.db
        .insertInto('contacts')
        .values({
          owner_id: input.owner_id,
          name: input.name,
          email: input.email,
          color: input.color,
        })
        .returningAll()
        .executeTakeFirstOrThrow();
      return toDomain(row);
    } catch (err) {
      if (isEmailUniqueViolation(err)) throw new ContactEmailTakenError();
      throw err;
    }
  }

  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>> {
    const rows = await this.db
      .selectFrom('contacts')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const row = await this.db
      .selectFrom('contacts')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async update(owner_id: string, id: string, patch: UpdateContactPatch): Promise<Contact | null> {
    if (Object.keys(patch).length === 0) {
      return this.findOneByOwner(owner_id, id);
    }
    try {
      const row = await this.db
        .updateTable('contacts')
        .set({ ...patch, updated_at: new Date().toISOString() })
        .where('owner_id', '=', owner_id)
        .where('id', '=', id)
        .returningAll()
        .executeTakeFirst();
      return row ? toDomain(row) : null;
    } catch (err) {
      if (isEmailUniqueViolation(err)) throw new ContactEmailTakenError();
      throw err;
    }
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const res = await this.db
      .deleteFrom('contacts')
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .executeTakeFirst();
    return (res?.numDeletedRows ?? 0n) > 0n;
  }
}
