import { Injectable } from '@nestjs/common';
import { generateApprovalToken, hashApprovalToken, looksLikeApprovalToken } from './approval-token';
import { ApprovalsRepository } from './approvals.repository';

/** The unattended send's token lives 10 minutes. */
export const CONFIRMATION_TTL_SECONDS = 10 * 60;

export interface ConfirmationCredential {
  readonly ownerId: string;
  readonly apiKeyId: string | null;
  readonly oauthGrantId: string | null;
}

/**
 * The 10-minute confirmation token of the unattended same-turn send
 * (docs/design/mcp-server.md § Fields and send). It exists only when the
 * key's `require_owner_approval` is off. It only proves that a preview of
 * this exact envelope was made within 10 minutes with this credential
 * and that the draft has not changed since (`subject_hash`). It is not
 * the owner's approval and not evidence of intent.
 *
 * WP-24 calls `consume` inside the send transaction, after locking the
 * envelope and recomputing `subject_hash`; a second caller gets false.
 */
@Injectable()
export class ConfirmationsService {
  constructor(private readonly repo: ApprovalsRepository) {}

  async mint(
    credential: ConfirmationCredential,
    envelopeId: string,
    subjectHash: string,
    now: Date = new Date(),
  ): Promise<{ readonly token: string; readonly expiresInSeconds: number }> {
    const minted = generateApprovalToken();
    await this.repo.insertConfirmation({
      ownerId: credential.ownerId,
      apiKeyId: credential.apiKeyId,
      oauthGrantId: credential.oauthGrantId,
      envelopeId,
      subjectHash,
      tokenHash: minted.hash,
      expiresAt: new Date(now.getTime() + CONFIRMATION_TTL_SECONDS * 1000).toISOString(),
    });
    return { token: minted.token, expiresInSeconds: CONFIRMATION_TTL_SECONDS };
  }

  /** True once: same credential, same envelope, unchanged subject, inside 10 minutes. */
  async consume(
    credential: ConfirmationCredential,
    token: string,
    envelopeId: string,
    currentSubjectHash: string,
    now: Date = new Date(),
  ): Promise<boolean> {
    if (!looksLikeApprovalToken(token)) return false;
    if (credential.apiKeyId === null && credential.oauthGrantId === null) return false;
    return this.repo.consumeConfirmation({
      tokenHash: hashApprovalToken(token),
      apiKeyId: credential.apiKeyId,
      oauthGrantId: credential.oauthGrantId,
      envelopeId,
      subjectHash: currentSubjectHash,
      now,
    });
  }
}
