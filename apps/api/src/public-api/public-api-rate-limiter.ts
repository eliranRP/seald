import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Optional,
  type CanActivate,
  type ExecutionContext,
} from '@nestjs/common';
import type { Response } from 'express';
import { PUBLIC_API_PRINCIPAL, type PublicApiRequest } from './api-key.guard';

export interface PublicApiRateOptions {
  readonly capacity: number;
  readonly windowMs: number;
  readonly clock?: () => number;
}

/** DI token for tests that need a tighter or looser limit. */
export const PUBLIC_API_RATE_OPTIONS = Symbol('PUBLIC_API_RATE_OPTIONS');

/** docs/design/mcp-server.md § Rate limits: per credential, 30 requests per 60 seconds. */
export const PUBLIC_API_RATE_DEFAULTS = { capacity: 30, windowMs: 60_000 } as const;

/**
 * Per-key fixed-window counter, the same shape and the same numbers as
 * the per-credential limit of `/mcp`. In-process, one node, like
 * `GDriveRateLimiter`: it is not shared across processes.
 */
@Injectable()
export class PublicApiRateLimiter {
  private readonly capacity: number;
  private readonly windowMs: number;
  private readonly clock: () => number;
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(@Optional() @Inject(PUBLIC_API_RATE_OPTIONS) opts?: PublicApiRateOptions) {
    this.capacity = opts?.capacity ?? PUBLIC_API_RATE_DEFAULTS.capacity;
    this.windowMs = opts?.windowMs ?? PUBLIC_API_RATE_DEFAULTS.windowMs;
    this.clock = opts?.clock ?? Date.now;
  }

  /** Seconds to wait when over the limit; null when the call may go on. */
  take(keyId: string): number | null {
    const now = this.clock();
    if (this.windows.size > 10_000) {
      for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
    }
    const entry = this.windows.get(keyId);
    if (!entry || entry.resetAt <= now) {
      this.windows.set(keyId, { count: 1, resetAt: now + this.windowMs });
      return null;
    }
    if (entry.count >= this.capacity) return Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    entry.count += 1;
    return null;
  }
}

/** After `ApiKeyGuard`: unauthenticated calls never spend a key's budget. */
@Injectable()
export class PublicApiRateGuard implements CanActivate {
  constructor(private readonly limiter: PublicApiRateLimiter) {}

  canActivate(context: ExecutionContext): boolean {
    const http = context.switchToHttp();
    const principal = http.getRequest<PublicApiRequest>()[PUBLIC_API_PRINCIPAL];
    if (!principal) return true;
    const wait = this.limiter.take(principal.keyId);
    if (wait === null) return true;
    http.getResponse<Response>().setHeader('Retry-After', String(wait));
    throw new HttpException(
      { message: 'rate_limited', retryAfter: wait },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}
