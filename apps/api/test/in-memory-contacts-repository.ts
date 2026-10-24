import { randomUUID } from 'node:crypto';
import type { Contact } from '../src/contacts/contact.entity';
import {
  ContactEmailTakenError,
  ContactsRepository,
  type CreateContactInput,
  type UpdateContactPatch,
} from '../src/contacts/contacts.repository';

/**
 * In-memory repo used by controller e2e. Mirrors the real adapter's contract
 * — including the unique-violation → ContactEmailTakenError mapping and the
 * soft delete — so the controller is exercised against identical behaviour.
 * Zero DB dependency keeps the e2e fast and hermetic.
 */
export class InMemoryContactsRepository extends ContactsRepository {
  private readonly rows = new Map<string, Contact>();
  /** ids of soft-deleted rows (kept in `rows` so Undo can bring them back). */
  private readonly deleted = new Set<string>();

  reset(): void {
    this.rows.clear();
    this.deleted.clear();
  }

  private live(): Contact[] {
    return [...this.rows.values()].filter((c) => !this.deleted.has(c.id));
  }

  async create(input: CreateContactInput): Promise<Contact> {
    const dup = this.live().find((c) => c.owner_id === input.owner_id && c.email === input.email);
    if (dup) throw new ContactEmailTakenError();
    const now = new Date().toISOString();
    const c: Contact = {
      id: randomUUID(),
      owner_id: input.owner_id,
      name: input.name,
      email: input.email,
      color: input.color,
      created_at: now,
      updated_at: now,
    };
    this.rows.set(c.id, c);
    return c;
  }

  async findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>> {
    return this.live()
      .filter((c) => c.owner_id === owner_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const c = this.rows.get(id);
    return c && c.owner_id === owner_id && !this.deleted.has(id) ? c : null;
  }

  async update(owner_id: string, id: string, patch: UpdateContactPatch): Promise<Contact | null> {
    const existing = await this.findOneByOwner(owner_id, id);
    if (!existing) return null;
    if (patch.email !== undefined && patch.email !== existing.email) {
      const dup = this.live().find(
        (c) => c.owner_id === owner_id && c.email === patch.email && c.id !== id,
      );
      if (dup) throw new ContactEmailTakenError();
    }
    const next: Contact = {
      ...existing,
      ...patch,
      updated_at: new Date().toISOString(),
    };
    this.rows.set(id, next);
    return next;
  }

  async delete(owner_id: string, id: string): Promise<boolean> {
    const existing = await this.findOneByOwner(owner_id, id);
    if (!existing) return false;
    this.deleted.add(id);
    return true;
  }

  override async restoreMany(
    owner_id: string,
    ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<Contact>> {
    const restored: Contact[] = [];
    for (const id of ids) {
      const c = this.rows.get(id);
      if (!c || c.owner_id !== owner_id || !this.deleted.has(id)) continue;
      if (this.live().some((o) => o.owner_id === owner_id && o.email === c.email)) continue;
      this.deleted.delete(id);
      restored.push(c);
    }
    return restored;
  }

  async deleteAllByOwner(owner_id: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (row.owner_id === owner_id) {
        this.rows.delete(id);
        this.deleted.delete(id);
        count++;
      }
    }
    return count;
  }
}
