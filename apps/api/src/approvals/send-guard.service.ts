import { ForbiddenException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import { MCP_DAILY_CAPS, MCP_SEND_SUSPENSION } from 'shared';
import { ApprovalsLifecycleService } from './approvals-lifecycle.service';
import { SendGuardRepository, type DeliveryHealth } from './send-guard.repository';

const DAY_MS = 24 * 60 * 60 * 1000;

function utcDayStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** Seconds until the next UTC midnight, when the daily caps reset. */
function secondsToUtcMidnight(now: Date): number {
  const next = utcDayStart(now).getTime() + DAY_MS;
  return Math.max(1, Math.ceil((next - now.getTime()) / 1000));
}

function capError(slug: 'send_daily_cap' | 'recipient_daily_cap', now: Date): HttpException {
  return new HttpException(
    { message: slug, retryAfter: secondsToUtcMidnight(now) },
    HttpStatus.TOO_MANY_REQUESTS,
  );
}

/** True when the telemetry crosses the suspension line. */
export function isDeliverySuspended(health: DeliveryHealth): boolean {
  if (health.complaints >= MCP_SEND_SUSPENSION.complaintsToSuspend) return true;
  return health.sent > 0 && health.bounced / health.sent > MCP_SEND_SUSPENSION.maxBounceRate;
}

/**
 * The per-owner limits on agent sends (docs/design/mcp-server.md § Rate
 * limits, idempotency, errors; MCP step 10):
 *
 * - **Daily caps**, per owner across every key and grant, per UTC day: 20
 *   sends (`send_daily_cap`) and 25 new recipient addresses
 *   (`recipient_daily_cap`). {@link assertCapsLocked} takes
 *   `pg_advisory_xact_lock` on the owner inside the send transaction, so
 *   two concurrent sends at the cap give one success and one refusal.
 *   Turning `require_owner_approval` off does not raise them.
 * - **Suspension**: three denials of one key within 24 hours suspend that
 *   key's `envelopes:send` (`key_send_suspended`); a bounce rate over 5%
 *   or 2+ spam complaints on the owner's mail in a rolling 7 days
 *   suspend it on every key of the owner (`send_suspended`). Both are
 *   derived from existing rows, so they lift by themselves when the
 *   window passes.
 */
@Injectable()
export class SendGuardService {
  private readonly log = new Logger(SendGuardService.name);

  constructor(
    private readonly repo: SendGuardRepository,
    private readonly lifecycle: ApprovalsLifecycleService,
  ) {}

  async assertNotSuspended(
    ownerId: string,
    apiKeyId: string | null,
    now: Date,
    oauthGrantId: string | null = null,
  ): Promise<void> {
    const keySuspended =
      apiKeyId !== null
        ? await this.lifecycle.isSendSuspended(apiKeyId, now)
        : oauthGrantId !== null && (await this.lifecycle.isGrantSendSuspended(oauthGrantId, now));
    if (keySuspended) {
      throw new ForbiddenException('key_send_suspended');
    }
    if (await this.isDeliverySuspended(ownerId, now)) {
      this.log.warn(`send suspended on delivery telemetry owner=${ownerId}`);
      throw new ForbiddenException('send_suspended');
    }
  }

  async isDeliverySuspended(ownerId: string, now: Date): Promise<boolean> {
    const since = new Date(now.getTime() - MCP_SEND_SUSPENSION.windowDays * DAY_MS);
    return isDeliverySuspended(await this.repo.deliveryHealthSince(ownerId, since));
  }

  /**
   * Request-time check, no lock: fail early when this send could not pass.
   * `sends` is how many envelopes the action sends (1; the rows of a bulk
   * batch, WP-26).
   */
  async assertCaps(ownerId: string, newRecipients: number, now: Date, sends = 1): Promise<void> {
    const usage = await this.repo.usageSince(ownerId, utcDayStart(now));
    if (usage.sends + sends > MCP_DAILY_CAPS.sends) throw capError('send_daily_cap', now);
    if (usage.newRecipients + newRecipients > MCP_DAILY_CAPS.new_recipients) {
      throw capError('recipient_daily_cap', now);
    }
  }

  /**
   * Send-time check under the owner lock. Must run inside the
   * transaction that then sends, so the lock covers the send's own rows.
   */
  async assertCapsLocked(
    ownerId: string,
    newRecipients: number,
    now: Date,
    sends = 1,
  ): Promise<void> {
    await this.repo.lockOwner(ownerId);
    await this.assertCaps(ownerId, newRecipients, now, sends);
  }

  /** `select … for update` on the envelope, inside the send transaction. */
  lockEnvelope(envelopeId: string): Promise<void> {
    return this.repo.lockEnvelope(envelopeId);
  }

  /** What `me_get` reports as left for today. */
  async remaining(
    ownerId: string,
    now: Date,
  ): Promise<{ readonly sends: number; readonly newRecipients: number }> {
    const usage = await this.repo.usageSince(ownerId, utcDayStart(now));
    return {
      sends: Math.max(0, MCP_DAILY_CAPS.sends - usage.sends),
      newRecipients: Math.max(0, MCP_DAILY_CAPS.new_recipients - usage.newRecipients),
    };
  }
}
