import { Inject, Injectable } from '@nestjs/common';
import { APP_ENV } from '../../../config/config.module';
import type { AppEnv } from '../../../config/env.schema';
import { generateStopToken, normalizeEmail } from './email-copy.config';
import { EmailCopyRepository } from './email-copy.repository';
import { stopUrl } from './email-copy.urls';

/**
 * Mints the stop link of an `automation_copy` mail at dispatch, the same
 * pattern as `ApprovalLinkMinter`. The outbox row holds only the owner id
 * and recipe id; each attempt draws a fresh token and stores its hash, so
 * the raw token exists only in the message being sent. Returns null (the
 * dispatcher skips the row) when the address has already stopped these
 * notices.
 */
@Injectable()
export class EmailCopyLinkMinter {
  constructor(
    private readonly repo: EmailCopyRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async mint(row: {
    readonly to_email: string;
    readonly payload: Readonly<Record<string, unknown>>;
  }): Promise<Record<string, string> | null> {
    const ownerId = row.payload['owner_id'];
    const email = normalizeEmail(row.to_email);
    if (typeof ownerId !== 'string' || !email) return null;
    if (await this.repo.isSuppressed(ownerId, email)) return null;
    const minted = generateStopToken();
    await this.repo.putStopToken({ tokenHash: minted.hash, ownerId, email });
    return { stop_url: stopUrl(this.env, minted.token) };
  }
}
