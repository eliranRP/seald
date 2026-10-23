import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { guessContactName, isEmailShape } from 'shared';
import type { Contact, ContactWithStats } from './contact.entity';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';
import {
  ContactEmailTakenError,
  ContactsRepository,
  type UpdateContactPatch,
} from './contacts.repository';

/** Colours handed to contacts added in bulk, cycling (matches the SPA's signer palette). */
const BULK_COLORS = ['#F472B6', '#7DD3FC', '#FBBF24', '#A78BFA', '#34D399', '#FB7185'] as const;

export interface BulkCreateResult {
  readonly created: ReadonlyArray<Contact>;
  /** Addresses that were already a contact (or repeated in the paste). */
  readonly skipped_duplicate: ReadonlyArray<string>;
  /** Tokens that are not an email address. */
  readonly invalid: ReadonlyArray<string>;
}

@Injectable()
export class ContactsService {
  constructor(private readonly repo: ContactsRepository) {}

  async create(owner_id: string, dto: CreateContactDto): Promise<Contact> {
    try {
      return await this.repo.create({ owner_id, ...dto });
    } catch (err) {
      if (err instanceof ContactEmailTakenError) throw new ConflictException('email_taken');
      throw err;
    }
  }

  list(owner_id: string): Promise<ReadonlyArray<ContactWithStats>> {
    return this.repo.listWithStats(owner_id);
  }

  /**
   * Add many contacts from a pasted list. Each address is trimmed,
   * lower-cased and checked; the name is guessed from the local part. An
   * address that is already a contact, or repeats inside the paste, is
   * reported in `skipped_duplicate` rather than failing the batch.
   */
  async createMany(owner_id: string, emails: ReadonlyArray<string>): Promise<BulkCreateResult> {
    const existing = await this.repo.findAllByOwner(owner_id);
    const seen = new Set(existing.map((c) => c.email.toLowerCase()));
    const created: Contact[] = [];
    const skipped: string[] = [];
    const invalid: string[] = [];
    let colorIndex = existing.length;
    for (const raw of emails) {
      const email = raw.trim().toLowerCase();
      if (email.length === 0) continue;
      if (!isEmailShape(email)) {
        invalid.push(email);
        continue;
      }
      if (seen.has(email)) {
        skipped.push(email);
        continue;
      }
      seen.add(email);
      try {
        created.push(
          await this.repo.create({
            owner_id,
            name: guessContactName(email),
            email,
            color: BULK_COLORS[colorIndex % BULK_COLORS.length] ?? BULK_COLORS[0],
          }),
        );
        colorIndex += 1;
      } catch (err) {
        // A concurrent request added it first.
        if (err instanceof ContactEmailTakenError) skipped.push(email);
        else throw err;
      }
    }
    return { created, skipped_duplicate: skipped, invalid };
  }

  async get(owner_id: string, id: string): Promise<Contact> {
    const c = await this.repo.findOneByOwner(owner_id, id);
    if (!c) throw new NotFoundException('contact_not_found');
    return c;
  }

  async update(owner_id: string, id: string, dto: UpdateContactDto): Promise<Contact> {
    // class-transformer/@Transform can inject own `<field>: undefined` on the
    // DTO instance for optional fields that were absent from the request body.
    // Forwarding them would cause the PG adapter to SET column = NULL. Strip
    // undefined keys here so the repo receives only caller-specified fields.
    const patch = Object.fromEntries(
      Object.entries(dto).filter(([, v]) => v !== undefined),
    ) as UpdateContactPatch;
    try {
      const c = await this.repo.update(owner_id, id, patch);
      if (!c) throw new NotFoundException('contact_not_found');
      return c;
    } catch (err) {
      if (err instanceof ContactEmailTakenError) throw new ConflictException('email_taken');
      throw err;
    }
  }

  async remove(owner_id: string, id: string): Promise<void> {
    const ok = await this.repo.delete(owner_id, id);
    if (!ok) throw new NotFoundException('contact_not_found');
  }

  /** Soft-delete several contacts; returns the ids actually removed. */
  async removeMany(owner_id: string, ids: ReadonlyArray<string>): Promise<{ deleted: string[] }> {
    const deleted = await this.repo.deleteMany(owner_id, ids);
    return { deleted: [...deleted] };
  }

  /** Undo a delete within the 24-hour window. */
  restore(owner_id: string, ids: ReadonlyArray<string>): Promise<ReadonlyArray<Contact>> {
    return this.repo.restoreMany(owner_id, ids);
  }
}
