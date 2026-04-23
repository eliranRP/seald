import { Inject, Injectable } from '@nestjs/common';
import type { Kysely, Selectable } from 'kysely';
import type { Database, ContactsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import type { Contact } from './contact.entity';
import {
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from './contacts.repository';

type Row = Selectable<ContactsTable>;

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
    const row = await this.db
      .updateTable('contacts')
      .set({ ...patch, updated_at: new Date().toISOString() })
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
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
