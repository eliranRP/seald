import type { ApprovalDetail } from 'shared';

/**
 * What the last Approve / Deny on this page came to. One value, so "needs a
 * fresh sign-in", "refused" and "approved" can never show together. The
 * request in flight is the mutation's own `isPending`.
 */
export type ApproveOutcome =
  | { readonly kind: 'none' }
  /** The decision needs a recent sign-in; nothing was recorded. */
  | { readonly kind: 'needs-fresh' }
  /** Refused or failed; nothing was recorded and the owner may retry. */
  | { readonly kind: 'failed'; readonly message: string }
  /** WP-45: the Approve response, which alone carries a minted secret. */
  | { readonly kind: 'approved'; readonly detail: ApprovalDetail };

export const NO_OUTCOME: ApproveOutcome = { kind: 'none' };

/**
 * A new decision clears the last refusal or sign-in notice. An Approve
 * response is kept: its one-time secret must not vanish.
 */
export function outcomeForRetry(outcome: ApproveOutcome): ApproveOutcome {
  return outcome.kind === 'approved' ? outcome : NO_OUTCOME;
}

/** The approved detail to show for `id`, when this page approved it. */
export function approvedDetailFor(outcome: ApproveOutcome, id: string): ApprovalDetail | null {
  return outcome.kind === 'approved' && outcome.detail.id === id ? outcome.detail : null;
}
