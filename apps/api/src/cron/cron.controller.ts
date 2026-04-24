import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { EmailDispatcherService, type FlushResult } from '../email/email-dispatcher.service';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';

/**
 * Internal cron endpoints. Locked down with a shared-secret header
 * (`X-Cron-Secret`), not a user JWT — these are invoked by the host's
 * cron/systemd timer against the local loopback.
 *
 * CRON_SECRET is mandatory in production (env schema enforces >=32 chars).
 * In test it's optional, but if unset the endpoint refuses.
 */
@Controller('internal/cron')
export class CronController {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly emailDispatcher: EmailDispatcherService,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  /**
   * POST /internal/cron/expire
   *
   * Flips every `awaiting_others` envelope whose expires_at has passed to
   * `expired` (row-conditionally), and for each one enqueues an
   * audit_only job so the worker produces the audit.pdf. Batch-limited to
   * 100 envelopes per invocation — if more need processing, the next
   * cron tick picks them up.
   */
  @Post('expire')
  @HttpCode(200)
  async expire(
    @Headers('x-cron-secret') secret: string | undefined,
  ): Promise<{ expired_count: number; envelope_ids: string[] }> {
    this.assertSecret(secret);
    const ids = await this.repo.expireEnvelopes(new Date(), 100);
    for (const id of ids) {
      await this.repo.enqueueJob(id, 'audit_only');
      await this.repo.appendEvent({
        envelope_id: id,
        actor_kind: 'system',
        event_type: 'expired',
        metadata: {},
      });
    }
    return { expired_count: ids.length, envelope_ids: [...ids] };
  }

  /**
   * POST /internal/cron/flush-emails
   *
   * Drains the `outbound_emails` queue: claims up to 50 due rows, renders
   * each template, hands to the configured `EmailSender`, and marks rows
   * `sent` / `pending` (retry with backoff) / `failed` as appropriate.
   *
   * Intended to be invoked once per minute by a host cron timer. Safe to
   * run concurrently with itself — the claim is atomic via
   * `for update skip locked`.
   */
  @Post('flush-emails')
  @HttpCode(200)
  async flushEmails(@Headers('x-cron-secret') secret: string | undefined): Promise<FlushResult> {
    this.assertSecret(secret);
    return this.emailDispatcher.flushOnce(50);
  }

  private assertSecret(provided: string | undefined): void {
    const expected = this.env.CRON_SECRET;
    if (!expected) {
      // Explicit config error — caller shouldn't retry.
      throw new BadRequestException('cron_not_configured');
    }
    if (provided !== expected) {
      throw new UnauthorizedException('invalid_cron_secret');
    }
  }
}
