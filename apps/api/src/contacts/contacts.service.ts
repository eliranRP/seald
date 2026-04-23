import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Contact } from './contact.entity';
import type { CreateContactDto } from './dto/create-contact.dto';
import type { UpdateContactDto } from './dto/update-contact.dto';
import { ContactEmailTakenError, ContactsRepository } from './contacts.repository';

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

  list(owner_id: string): Promise<ReadonlyArray<Contact>> {
    return this.repo.findAllByOwner(owner_id);
  }

  async get(owner_id: string, id: string): Promise<Contact> {
    const c = await this.repo.findOneByOwner(owner_id, id);
    if (!c) throw new NotFoundException('contact_not_found');
    return c;
  }

  async update(owner_id: string, id: string, dto: UpdateContactDto): Promise<Contact> {
    try {
      const c = await this.repo.update(owner_id, id, dto);
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
}
