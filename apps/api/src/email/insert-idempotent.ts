import {
  DuplicateOutboundEmailError,
  type InsertOutboundEmailInput,
  OutboundEmailsRepository,
} from './outbound-emails.repository';

/**
 * Insert one outbox row. A unique-constraint clash (same dedupe key, or
 * the older envelope/signer/kind/event tuple) is success: the notice was
 * already queued. Other errors propagate so the caller can retry.
 */
export async function insertOutboundEmailIdempotent(
  repo: OutboundEmailsRepository,
  input: InsertOutboundEmailInput,
): Promise<void> {
  try {
    await repo.insert(input);
  } catch (err) {
    if (err instanceof DuplicateOutboundEmailError) return;
    throw err;
  }
}

/** Case-insensitive mailbox compare. citext does this in Postgres. */
export function sameMailbox(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}
