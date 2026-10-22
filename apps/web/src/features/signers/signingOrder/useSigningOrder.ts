import { useState } from 'react';
import { DEFAULT_SIGNING_ORDER, reconcileRows, type SigningOrderValue } from './model';

/**
 * Owner state for the signing order. The returned value is always in step
 * with the current signers (removed ones dropped, new ones appended as their
 * own step), so callers never hand the send hook a stale row.
 */
export function useSigningOrder(signerIds: ReadonlyArray<string>): {
  readonly value: SigningOrderValue;
  readonly setValue: (next: SigningOrderValue) => void;
} {
  const [raw, setValue] = useState<SigningOrderValue>(DEFAULT_SIGNING_ORDER);
  return { value: reconcileRows(raw, signerIds), setValue };
}
