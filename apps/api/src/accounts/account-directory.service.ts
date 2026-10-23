import { Injectable } from '@nestjs/common';
import { AccountDirectoryRepository } from './account-directory.repository';

/**
 * Account facts for a caller that has an owner id but no session
 * (WP-17, `me_get`). A Supabase session already carries the email in
 * its JWT (`GET /me`); an API key does not.
 */
@Injectable()
export class AccountDirectoryService {
  constructor(private readonly repo: AccountDirectoryRepository) {}

  email(owner_id: string): Promise<string | null> {
    return this.repo.findEmail(owner_id);
  }
}
