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

  async findOneByOwner(_owner_id: string, _id: string): Promise<Contact | null> {
    throw new Error('not implemented');
  }
  async update(
    _owner_id: string,
    _id: string,
    _patch: UpdateContactPatch,
  ): Promise<Contact | null> {
    throw new Error('not implemented');
  }
  async delete(_owner_id: string, _id: string): Promise<boolean> {
    throw new Error('not implemented');
  }
}
