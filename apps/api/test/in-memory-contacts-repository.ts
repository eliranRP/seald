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
 * — including the unique-violation → ContactEmailTakenError mapping — so the
 * controller is exercised against identical behaviour. Zero DB dependency
 * keeps the e2e fast and hermetic.
 */
export class InMemoryContactsRepository extends ContactsRepository {
  private readonly rows = new Map<string, Contact>();

  reset(): void {
    this.rows.clear();
  }

  async create(input: CreateContactInput): Promise<Contact> {
    const dup = [...this.rows.values()].find(
      (c) => c.owner_id === input.owner_id && c.email === input.email,
    );
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
    return [...this.rows.values()]
      .filter((c) => c.owner_id === owner_id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }

  async findOneByOwner(owner_id: string, id: string): Promise<Contact | null> {
    const c = this.rows.get(id);
    return c && c.owner_id === owner_id ? c : null;
  }

  async update(owner_id: string, id: string, patch: UpdateContactPatch): Promise<Contact | null> {
    const existing = this.rows.get(id);
    if (!existing || existing.owner_id !== owner_id) return null;
    if (patch.email !== undefined && patch.email !== existing.email) {
      const dup = [...this.rows.values()].find(
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
    const existing = this.rows.get(id);
    if (!existing || existing.owner_id !== owner_id) return false;
    this.rows.delete(id);
    return true;
  }

  async deleteAllByOwner(owner_id: string): Promise<number> {
    let count = 0;
    for (const [id, row] of this.rows) {
      if (row.owner_id === owner_id) {
        this.rows.delete(id);
        count++;
      }
    }
    return count;
  }
}
