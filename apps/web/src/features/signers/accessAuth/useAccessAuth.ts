import { useState } from 'react';
import { DEFAULT_ACCESS_AUTH, reconcileAccessAuth } from './model';
import type { AccessAuthValue } from './model';

/**
 * Owner state for the emailed-code choice. The returned value always matches
 * the current signers (overrides for removed ones dropped), so callers never
 * hand the send hook a stale row.
 */
export function useAccessAuth(signerIds: ReadonlyArray<string>): {
  readonly value: AccessAuthValue;
  readonly setValue: (next: AccessAuthValue) => void;
} {
  const [raw, setValue] = useState<AccessAuthValue>(DEFAULT_ACCESS_AUTH);
  return { value: reconcileAccessAuth(raw, signerIds), setValue };
}
