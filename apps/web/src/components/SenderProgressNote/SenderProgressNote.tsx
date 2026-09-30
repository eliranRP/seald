import { SENDER_PROGRESS_NOTE } from 'shared';

/**
 * What the sender is told after send. The sentence lives in
 * `packages/shared/src/product-claims.ts` (`SENDER_PROGRESS_NOTE`).
 */
export function SenderProgressNote() {
  return <>{SENDER_PROGRESS_NOTE}</>;
}
