import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { ApprovalsRepository } from './approvals.repository';

/** Resend free tier. */
export const DEFAULT_PROVIDER_DAILY_QUOTA = 100;
export const DEFAULT_PROVIDER_MONTHLY_QUOTA = 3000;
/** Approval mail stops at this share of either quota. */
export const BREAKER_RATIO = 0.8;

/**
 * Global circuit breaker for approval mail (docs/design/mcp-server.md
 * § Owner approval, plan risk "Resend quota"). The provider quota covers
 * every message Seald sends, so the breaker counts all outbound mail
 * created today (UTC) and this month. Past 80% of either quota, new
 * approval requests return `approval_limit` instead of failing open, and
 * signer invites keep the remaining headroom. It never blocks a decision.
 */
@Injectable()
export class ApprovalMailBreaker {
  private readonly log = new Logger(ApprovalMailBreaker.name);
  private readonly dailyLimit: number;
  private readonly monthlyLimit: number;

  constructor(
    private readonly repo: ApprovalsRepository,
    @Inject(APP_ENV) env: AppEnv,
  ) {
    const daily = env.EMAIL_PROVIDER_DAILY_QUOTA ?? DEFAULT_PROVIDER_DAILY_QUOTA;
    const monthly = env.EMAIL_PROVIDER_MONTHLY_QUOTA ?? DEFAULT_PROVIDER_MONTHLY_QUOTA;
    this.dailyLimit = Math.floor(daily * BREAKER_RATIO);
    this.monthlyLimit = Math.floor(monthly * BREAKER_RATIO);
  }

  /** True while approval mail may still be queued. */
  async allows(now: Date): Promise<boolean> {
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const used = await this.repo.countOutboundSince(dayStart, monthStart);
    const open = used.day < this.dailyLimit && used.month < this.monthlyLimit;
    if (!open) {
      this.log.warn(
        `approval mail breaker open day=${used.day}/${this.dailyLimit} month=${used.month}/${this.monthlyLimit}`,
      );
    }
    return open;
  }
}
