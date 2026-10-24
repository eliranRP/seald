import type { Contact, ContactWithStats } from './contact.entity';

export interface CreateContactInput {
  readonly owner_id: string;
  readonly name: string;
  readonly email: string;
  readonly color: string;
}

export interface UpdateContactPatch {
  readonly name?: string;
  readonly email?: string;
  readonly color?: string;
}

/**
 * Port for contact persistence. Every method takes `owner_id` as an explicit
 * argument so the scoping rule is visible at every call site. The repository
 * does not know about "the current user" — the caller enforces that.
 */
export abstract class ContactsRepository {
  abstract create(input: CreateContactInput): Promise<Contact>;
  abstract findAllByOwner(owner_id: string): Promise<ReadonlyArray<Contact>>;
  abstract findOneByOwner(owner_id: string, id: string): Promise<Contact | null>;
  abstract update(owner_id: string, id: string, patch: UpdateContactPatch): Promise<Contact | null>;
  /**
   * Live contacts plus their sent-document count and latest send time
   * (see `ContactWithStats`). Newest contact first; the SPA sorts.
   */
  async listWithStats(owner_id: string): Promise<ReadonlyArray<ContactWithStats>> {
    // Default for adapters with no envelope data (test doubles): no sends.
    const all = await this.findAllByOwner(owner_id);
    return all.map((c) => ({ ...c, docs_count: 0, last_sent_at: null }));
  }
  /** Soft delete (sets `deleted_at`). True when a live row was removed. */
  abstract delete(owner_id: string, id: string): Promise<boolean>;
  /**
   * Soft-delete every live contact in `ids` owned by `owner_id`, and purge
   * this owner's rows soft-deleted more than 24 hours ago. Returns the ids
   * actually removed.
   */
  async deleteMany(owner_id: string, ids: ReadonlyArray<string>): Promise<ReadonlyArray<string>> {
    const removed: string[] = [];
    for (const id of ids) if (await this.delete(owner_id, id)) removed.push(id);
    return removed;
  }
  /**
   * Undo a soft delete. A contact whose email a live contact has since taken
   * is skipped. Returns the restored contacts.
   */
  async restoreMany(
    _owner_id: string,
    _ids: ReadonlyArray<string>,
  ): Promise<ReadonlyArray<Contact>> {
    // Adapters without soft delete have nothing to restore.
    return [];
  }

  /**
   * Issue #38 — bulk-delete every contact owned by `owner_id`. Used by
   * MeService.deleteAccount; contacts are working state with no
   * statutory retention requirement, so we hard-delete them. Returns
   * the row count actually deleted. Idempotent (returns 0 when none
   * existed).
   */
  abstract deleteAllByOwner(owner_id: string): Promise<number>;
}

/**
 * Thrown by adapters when the (owner_id, email) unique index is violated.
 * The service layer maps this to a 409 Conflict. Adapters never throw HTTP
 * exceptions directly — the port stays transport-agnostic.
 */
export class ContactEmailTakenError extends Error {
  constructor() {
    super('contact_email_taken');
    this.name = 'ContactEmailTakenError';
  }
}
