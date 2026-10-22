import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';

/**
 * CSRF for the public approval page (docs/design/mcp-server.md § Owner
 * approval). The preview returns `HMAC(server_key, approval_id || nonce)`
 * in its body and the nonce in a `__Host-` cookie. A decision POST must
 * carry both, and the value must be the HMAC for that approval and that
 * nonce. A bare double-submit cookie is not enough: the value is bound
 * to the approval. CSRF protects the owner's browser from other sites;
 * it does not authenticate the approver.
 */
@Injectable()
export class ApprovalCsrf {
  private readonly log = new Logger(ApprovalCsrf.name);
  private readonly key: Buffer;
  /** `__Host-` needs Secure, which a plain-http dev server cannot set. */
  readonly cookieName: string;
  readonly secureCookie: boolean;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    if (env.APPROVAL_CSRF_KEY) {
      this.key = Buffer.from(env.APPROVAL_CSRF_KEY, 'utf8');
    } else {
      // Production refuses to boot without the key (env.schema); elsewhere
      // a per-process key is enough, a restart only reloads open pages.
      this.key = randomBytes(32);
      if (env.NODE_ENV !== 'test')
        this.log.warn('APPROVAL_CSRF_KEY unset; using a per-process key');
    }
    this.secureCookie = env.NODE_ENV === 'production';
    this.cookieName = this.secureCookie ? '__Host-seald_approval' : 'seald_approval';
  }

  /** A fresh nonce (for the cookie) and its value (for the body). */
  issue(approvalId: string): { readonly nonce: string; readonly value: string } {
    const nonce = randomBytes(32).toString('base64url');
    return { nonce, value: this.valueFor(approvalId, nonce) };
  }

  verify(approvalId: string, nonce: string | undefined, value: string | undefined): boolean {
    if (!nonce || !value || !/^[A-Za-z0-9_-]{43}$/.test(nonce)) return false;
    const expected = Buffer.from(this.valueFor(approvalId, nonce), 'utf8');
    const presented = Buffer.from(value, 'utf8');
    return presented.length === expected.length && timingSafeEqual(presented, expected);
  }

  private valueFor(approvalId: string, nonce: string): string {
    return createHmac('sha256', this.key)
      .update(`${approvalId}.${nonce}`, 'utf8')
      .digest('base64url');
  }
}
