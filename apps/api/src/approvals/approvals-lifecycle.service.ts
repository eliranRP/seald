import { Injectable, Logger } from '@nestjs/common';
import { APPROVAL_POLICY } from 'shared';
import { ApprovalsRepository } from './approvals.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The approval side effects other modules trigger, kept apart from
 * `ApprovalsService` so the api-keys and me modules can depend on it
 * without pulling in the envelope and Drive services the kinds need
 * (and without an import cycle once WP-45 wires key actions as kinds).
 */
@Injectable()
export class ApprovalsLifecycleService {
  private readonly log = new Logger(ApprovalsLifecycleService.name);

  constructor(private readonly repo: ApprovalsRepository) {}

  /**
   * Revoking a key expires that key's pending approvals
   * (docs/design/mcp-server.md § API keys). A link opened later shows
   * Expired; an Approve racing the revoke still finds the key revoked at
   * decision time and records Failed, so nothing is sent either way.
   */
  async expireForRevokedKey(apiKeyId: string, now: Date = new Date()): Promise<number> {
    const n = await this.repo.expireOpenForApiKey(apiKeyId, 'api_key_revoked', now);
    if (n > 0) this.log.log(`approvals expired on key revoke key=${apiKeyId} count=${n}`);
    return n;
  }

  /** An email change expires every pending approval of the owner; none is revived. */
  expireForEmailChange(ownerId: string, now: Date = new Date()): Promise<number> {
    return this.repo.expireOpenForOwner(ownerId, 'email_changed', now);
  }

  /** Account deletion (`MeService`). The auth.users FK also cascades. */
  deleteAllForOwner(ownerId: string): Promise<number> {
    return this.repo.deleteAllForOwner(ownerId);
  }

  /**
   * Three denials of one key within 24 hours suspend that key's
   * `envelopes:send`. Derived from the rows, so it lifts by itself 24
   * hours after the third denial or when the key is replaced. The send
   * path (WP-24) refuses with `key_send_suspended` while this is true.
   */
  async isSendSuspended(apiKeyId: string, now: Date = new Date()): Promise<boolean> {
    const since = new Date(now.getTime() - DAY_MS);
    return (
      (await this.repo.countDenialsForKey(apiKeyId, since)) >= APPROVAL_POLICY.denialsToSuspend
    );
  }
}
