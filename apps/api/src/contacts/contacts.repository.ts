import type { Contact } from './contact.entity';

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
  abstract delete(owner_id: string, id: string): Promise<boolean>;
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
