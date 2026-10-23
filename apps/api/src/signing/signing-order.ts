import type { DeliveryMode } from 'shared';

/**
 * Signing order (WP-05), pure rules shared by the send and submit
 * transactions (pg), the in-memory test repository, the session guard,
 * reminders and the certificate.
 *
 * Every recipient is a signer; roles do not change. With
 * `delivery_mode = 'sequential'`, signers with the same `signing_order`
 * form one step and are invited together. The next step is invited only
 * when every signer in the current one has signed. `'parallel'` keeps
 * today's behaviour: one step, everyone invited at send.
 *
 * A decline in any step ends the envelope (unchanged), so these helpers
 * only ever reason about signers who have not declined.
 */
export interface OrderedSigner {
  readonly id: string;
  readonly signing_order: number;
  readonly signed_at: string | Date | null;
  readonly declined_at: string | Date | null;
}

export interface InviteCandidate extends OrderedSigner {
  readonly invited_at: string | Date | null;
}

/** Distinct `signing_order` values, ascending. Step N is the N-th entry. */
export function stepOrders(signers: ReadonlyArray<OrderedSigner>): number[] {
  return [...new Set(signers.map((s) => s.signing_order))].sort((a, b) => a - b);
}

/** 1-based step of a `signing_order` within the envelope (dense rank). */
export function stepOf(signers: ReadonlyArray<OrderedSigner>, signingOrder: number): number {
  return stepOrders(signers).indexOf(signingOrder) + 1;
}

/**
 * The active step's `signing_order`: the lowest one that still has a
 * signer who has neither signed nor declined. Null once everyone signed.
 */
export function activeSigningOrder(signers: ReadonlyArray<OrderedSigner>): number | null {
  let lowest: number | null = null;
  for (const s of signers) {
    if (s.signed_at !== null || s.declined_at !== null) continue;
    if (lowest === null || s.signing_order < lowest) lowest = s.signing_order;
  }
  return lowest;
}

/**
 * Whether this signer may open and sign now. Parallel envelopes: always.
 * Sequential: only while the signer's step is the active one.
 */
export function isSignersTurn(
  mode: DeliveryMode,
  signers: ReadonlyArray<OrderedSigner>,
  signerId: string,
): boolean {
  if (mode !== 'sequential') return true;
  const signer = signers.find((s) => s.id === signerId);
  if (!signer) return false;
  return signer.signing_order === activeSigningOrder(signers);
}

/** Signers to invite at send: everyone (parallel) or step 1 (sequential). */
export function initialInvitees<T extends OrderedSigner>(
  mode: DeliveryMode,
  signers: ReadonlyArray<T>,
): T[] {
  if (mode !== 'sequential') return [...signers];
  const first = stepOrders(signers)[0];
  return signers.filter((s) => s.signing_order === first);
}

/**
 * After a signature: the signers of the step that just became active and
 * have not been invited yet. Empty in parallel mode, while the current
 * step still has someone to sign, once everyone has signed, or when the
 * step was already invited (a concurrent submit got there first). The
 * caller stamps `invited_at` under the envelope row lock, which is what
 * makes exactly one submit start each step.
 */
export function nextStepInvitees<T extends InviteCandidate>(
  mode: DeliveryMode,
  signers: ReadonlyArray<T>,
): { readonly signingOrder: number; readonly step: number; readonly signers: T[] } | null {
  if (mode !== 'sequential') return null;
  const active = activeSigningOrder(signers);
  if (active === null) return null;
  const pending = signers.filter(
    (s) =>
      s.signing_order === active &&
      s.invited_at === null &&
      s.signed_at === null &&
      s.declined_at === null,
  );
  if (pending.length === 0) return null;
  return { signingOrder: active, step: stepOf(signers, active), signers: pending };
}
