import { Controller, Get, Param } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { Public } from '../auth/public.decorator';
import { VerifyService, type VerifyResponse } from './verify.service';

export type { VerifyResponse };

/**
 * Public, unauthenticated verification surface. Anyone with the envelope's
 * 13-char short_code can pull the metadata + event timeline + pre-signed
 * URLs for sealed.pdf and audit.pdf. This is the counterpart to the QR
 * code stamped on the audit PDF.
 *
 * What we deliberately expose:
 *   - title, short_code, status, timestamps
 *   - signer name + email + role + status + signed_at / declined_at
 *   - full event timeline (actor_kind + event_type + timestamp; we
 *     redact ip/user_agent since those are PII that the sender's
 *     dashboard already guards)
 *   - sealed_sha256 + original_sha256 for tamper evidence
 *   - 5-minute signed URLs for sealed/audit PDFs (only when sealed)
 *
 * What we redact:
 *   - owner_id
 *   - ip / user_agent on events
 *   - signer decline_reason free-text (only presence flag)
 *   - signature image paths / tokens / anything internal
 */
@Public()
@Controller('verify')
export class VerifyController {
  constructor(private readonly svc: VerifyService) {}

  @Get(':short_code')
  @Throttle({ short: { limit: 10, ttl: 60_000 } })
  verify(@Param('short_code') short_code: string): Promise<VerifyResponse> {
    return this.svc.verify(short_code);
  }
}
