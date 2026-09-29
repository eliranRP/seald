import { SENDER_PROGRESS_NOTE } from 'shared';

/**
 * What the sender is told after send. The sentence lives in
 * `packages/shared/src/product-claims.ts` (`SENDER_PROGRESS_NOTE`) so the
 * planned per-signature emails can be reflected in one place.
 */
export function SenderProgressNote() {
  return <>{SENDER_PROGRESS_NOTE}</>;
}
