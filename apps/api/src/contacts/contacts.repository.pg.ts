import { Inject, Injectable } from '@nestjs/common';
import { sql, type Kysely, type Selectable } from 'kysely';
import type { Database, ContactsTable } from '../../db/schema';
import { DB_TOKEN } from '../db/db.provider';
import type { Contact, ContactWithStats } from './contact.entity';
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

/** How long a soft-deleted contact stays restorable. */
const UNDO_WINDOW_MS = 24 * 60 * 60 * 1000;

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
      .where('deleted_at', 'is', null)
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map(toDomain);
  }

  override async listWithStats(owner_id: string): Promise<ReadonlyArray<ContactWithStats>> {
    const contacts = await this.findAllByOwner(owner_id);
    if (contacts.length === 0) return [];
    // One pass over the owner's sent envelopes: per signer email, how many
    // envelopes and the latest send time. Matching is by lower-cased email
    // because a signer can be typed in without being a saved contact.
    const rows = await this.db
      .selectFrom('envelope_signers as s')
      .innerJoin('envelopes as e', 'e.id', 's.envelope_id')
      .select([
        sql<string>`lower(s.email)`.as('email'),
        'e.id as envelope_id',
        'e.sent_at as sent_at',
      ])
      .where('e.owner_id', '=', owner_id)
      .where('e.sent_at', 'is not', null)
      .execute();
    const stats = new Map<string, { ids: Set<string>; last: number }>();
    for (const r of rows) {
      const entry = stats.get(r.email) ?? { ids: new Set<string>(), last: 0 };
      entry.ids.add(r.envelope_id);
      const t = r.sent_at ? new Date(r.sent_at).getTime() : 0;
      if (t > entry.last) entry.last = t;
      stats.set(r.email, entry);
    }
    return contacts.map((c) => {
      const entry = stats.get(c.email.toLowerCase());
      return {
        ...c,
        docs_count: entry ? entry.ids.size : 0,
        last_sent_at: entry && entry.last > 0 ? new Date(entry.last).toISOString() : null,
      };
    });
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const row = await this.db
      .selectFrom('contacts')
      .selectAll()
      .where('owner_id', '=', owner_id)
      .where('id', '=', id)
      .where('deleted_at', 'is', null)
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
        .where('deleted_at', 'is', null)
        .returningAll()
        .executeTakeFirst();
      return row ? toDomain(row) : null;
    } catch (err) {
      if (isEmailUniqueViolation(err)) throw new ContactEmailTakenError();
      throw err;
    }
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const removed = await this.deleteMany(owner_id, [id]);
    return removed.length > 0;
  }

  override async deleteMany(
    owner_id: string,
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<string>> {
    // Opportunistic purge: rows past the Undo window are gone for good.
    const cutoff = new Date(Date.now() - UNDO_WINDOW_MS);
    await this.db
      .deleteFrom('contacts')
      .where('owner_id', '=', owner_id)
      .where('deleted_at', '<', cutoff)
      .execute();
    if (ids.length === 0) return [];
    const now = new Date().toISOString();
    const rows = await this.db
      .updateTable('contacts')
      .set({ deleted_at: now, updated_at: now })
      .where('owner_id', '=', owner_id)
      .where('id', 'in', [...ids])
      .where('deleted_at', 'is', null)
      .returning('id')
      .execute();
    return rows.map((r) => r.id);
  }

  override async restoreMany(
    owner_id: string,
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<Contact>> {
    const restored: Contact[] = [];
    // One at a time: a unique violation (the email was re-added while the
    // contact sat in the Undo window) skips that contact, not the batch.
    for (const id of ids) {
      try {
        const row = await this.db
          .updateTable('contacts')
          .set({ deleted_at: null, updated_at: new Date().toISOString() })
          .where('owner_id', '=', owner_id)
          .where('id', '=', id)
          .where('deleted_at', 'is not', null)
          .returningAll()
          .executeTakeFirst();
        if (row) restored.push(toDomain(row));
      } catch (err) {
        if (!isEmailUniqueViolation(err)) throw err;
      }
    }
    return restored;
  }

  async deleteAllByOwner(owner_id: string): Promise<number> {
    const res = await this.db
      .deleteFrom('contacts')
      .where('owner_id', '=', owner_id)
      .executeTakeFirst();
    return Number(res?.numDeletedRows ?? 0n);
  }
}
