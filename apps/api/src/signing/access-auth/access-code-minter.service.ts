import { Inject, Injectable } from '@nestjs/common';
import { ACCESS_CODE_POLICY, ACCESS_CODE_PURPOSES, type AccessCodePurpose } from 'shared';
import { APP_ENV } from '../../config/config.module';
import type { AppEnv } from '../../config/env.schema';
import { AccessAuthRepository } from './access-auth.repository';
import { generateAccessCode, hashAccessCode } from './access-code';

const PURPOSE_LINES: Readonly<Record<AccessCodePurpose, string>> = {
  access: 'Enter it on the signing page to open the document.',
  action: 'Enter it on the signing page to finish signing.',
};

/**
 * Mints the code of an `access_code` email at dispatch (WP-10), the same
 * way signer links are minted (MCP Insert A): the outbox row holds only
 * the challenge id. Each attempt draws a new code, stores its HMAC on the
 * challenge and restarts the 10-minute clock, so a code exists in
 * plaintext only inside the message being sent. Returns null when the
 * challenge was replaced, used or locked, or the signer can no longer
 * sign; the dispatcher then skips the row.
 */
@Injectable()
export class AccessCodeMinter {
  constructor(
    private readonly repo: AccessAuthRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async mint(row: {
    readonly signer_id: string | null;
    readonly payload: Readonly<Record<string, unknown>>;
  }): Promise<Record<string, string | number> | null> {
    const key = this.env.SIGNER_OTP_KEY;
    const challengeId = row.payload['challenge_id'];
    const purpose = row.payload['purpose'];
    if (!key || !row.signer_id || typeof challengeId !== 'string') return null;
    if (!isPurpose(purpose)) return null;
    const code = generateAccessCode();
    const armed = await this.repo.armChallenge({
      challenge_id: challengeId,
      signer_id: row.signer_id,
      purpose,
      code_hash: hashAccessCode(
        key,
        { challenge_id: challengeId, signer_id: row.signer_id, purpose },
        code,
      ),
      now: new Date(),
      ttl_seconds: ACCESS_CODE_POLICY.ttlSeconds,
    });
    if (!armed) return null;
    return {
      code,
      expires_minutes: Math.round(ACCESS_CODE_POLICY.ttlSeconds / 60),
      purpose_line: PURPOSE_LINES[purpose],
    };
  }
}

function isPurpose(value: unknown): value is AccessCodePurpose {
  return typeof value === 'string' && (ACCESS_CODE_PURPOSES as readonly string[]).includes(value);
}
