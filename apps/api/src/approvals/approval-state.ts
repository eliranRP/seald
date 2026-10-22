import {
  APPROVAL_POLICY,
  type ApprovalCardState,
  type ApprovalKind,
  type ApprovalNotify,
  type ApprovalRecipient,
  type ApprovalStatus,
  type ApprovalSummary,
  type ApproveRequires,
} from 'shared';

/**
 * Pure rules of the approval state machine (docs/design/mcp-server.md
 * § Owner approval). No I/O here: the service and the repository apply
 * what these functions decide, and the unit specs pin every branch.
 */

/** One `mcp_approvals` row, as the service sees it. Timestamps are ISO strings. */
export interface ApprovalRecord {
  readonly id: string;
  readonly ownerId: string;
  readonly apiKeyId: string | null;
  readonly oauthGrantId: string | null;
  readonly kind: ApprovalKind;
  readonly tool: string | null;
  readonly subjectKey: string;
  readonly envelopeId: string | null;
  readonly args: Readonly<Record<string, unknown>>;
  readonly summary: ApprovalSummary;
  readonly subjectHash: string;
  readonly linkTokenHash: string | null;
  readonly previousTokenHash: string | null;
  readonly priorTokenHashes: readonly string[];
  readonly notify: ApprovalNotify;
  readonly approveRequires: ApproveRequires;
  readonly ownerEditedAt: string | null;
  readonly expiresAt: string;
  readonly approvedAt: string | null;
  readonly deniedAt: string | null;
  readonly failedAt: string | null;
  readonly expiredAt: string | null;
  readonly completedAt: string | null;
  readonly expiredReason: string | null;
  readonly decidedVia: 'email' | 'app' | null;
  readonly resultSlug: string | null;
  readonly result: Readonly<Record<string, unknown>> | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/**
 * An approved action that has not finished after this long is reported as
 * Failed (`execution_interrupted`): the process died between the decision
 * and the action. Nothing retries it; the agent asks again.
 */
export const EXECUTION_STALE_MS = 10 * 60 * 1000;

export const TTL_MS = APPROVAL_POLICY.ttlSeconds * 1000;

export function expiryFrom(now: Date): string {
  return new Date(now.getTime() + TTL_MS).toISOString();
}

/** No decision, failure or expiry is recorded. The 24-hour clock is checked separately. */
export function hasNoOutcome(r: ApprovalRecord): boolean {
  return (
    r.approvedAt === null && r.deniedAt === null && r.failedAt === null && r.expiredAt === null
  );
}

/** Open: nothing recorded and still inside its 24 hours. Only an open row decides. */
export function isOpen(r: ApprovalRecord, now: Date): boolean {
  return hasNoOutcome(r) && Date.parse(r.expiresAt) > now.getTime();
}

export interface DerivedStatus {
  readonly status: ApprovalStatus;
  readonly resultSlug: string | null;
}

/**
 * The status every surface shows. A pending row past `expires_at` reads
 * `expired` even before anything stamps `expired_at`. An approved row
 * still running its action reads `pending`; after
 * {@link EXECUTION_STALE_MS} it reads `failed` / `execution_interrupted`.
 */
export function approvalStatus(r: ApprovalRecord, now: Date): DerivedStatus {
  if (r.deniedAt !== null) return { status: 'denied', resultSlug: null };
  if (r.failedAt !== null) return { status: 'failed', resultSlug: r.resultSlug ?? 'action_failed' };
  if (r.approvedAt !== null) {
    if (r.completedAt !== null) return { status: 'done', resultSlug: null };
    if (now.getTime() - Date.parse(r.approvedAt) > EXECUTION_STALE_MS) {
      return { status: 'failed', resultSlug: 'execution_interrupted' };
    }
    return { status: 'pending', resultSlug: null };
  }
  if (r.expiredAt !== null) return { status: 'expired', resultSlug: null };
  if (Date.parse(r.expiresAt) <= now.getTime()) return { status: 'expired', resultSlug: null };
  return { status: 'pending', resultSlug: null };
}

/** Which stored hash a presented link token matched. */
export type TokenMatch = 'current' | 'alias' | 'prior';

export function matchToken(r: ApprovalRecord, tokenHash: string): TokenMatch | null {
  if (r.linkTokenHash !== null && r.linkTokenHash === tokenHash) return 'current';
  if (r.previousTokenHash !== null && r.previousTokenHash === tokenHash) return 'alias';
  if (r.priorTokenHashes.includes(tokenHash)) return 'prior';
  return null;
}

/**
 * The card state for one link:
 * - the current token, or the single owner-edit alias, shows the row;
 * - a token an agent re-preview replaced shows `superseded` while the
 *   row is pending ("Updated, see the newest email"), never Expired;
 * - an unknown token (never issued, or an alias a later owner edit
 *   replaced) shows `expired`.
 */
export function cardState(
  r: ApprovalRecord | null,
  match: TokenMatch | null,
  now: Date,
): ApprovalCardState {
  if (r === null || match === null) return 'expired';
  const { status } = approvalStatus(r, now);
  if (match === 'prior' && status === 'pending') return 'superseded';
  return status;
}

/** Only the current token and the single alias can decide. */
export function tokenCanDecide(match: TokenMatch | null): boolean {
  return match === 'current' || match === 'alias';
}

/** What a repeated request for the same open subject does. */
export type RepreviewPlan =
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'repreview';
      readonly subjectHash: string;
      readonly priorTokenHashes: readonly string[];
      readonly expiresAt: string;
    };

/**
 * Agent re-preview of a pending row. Same `approval_id`. When the subject
 * changed: the current token and any owner-edit alias move into
 * `prior_token_hashes` (those links show "Updated, see the newest
 * email"), the link hash is cleared until the new email is minted, and
 * the 24 hours restart. An unchanged subject is a no-op: same row, same
 * email, same clock.
 */
export function planAgentRepreview(
  r: ApprovalRecord,
  nextSubjectHash: string,
  now: Date,
): RepreviewPlan {
  if (r.subjectHash === nextSubjectHash) return { kind: 'unchanged' };
  const moved = [r.linkTokenHash, r.previousTokenHash].filter((h): h is string => h !== null);
  const prior = [...r.priorTokenHashes, ...moved.filter((h) => !r.priorTokenHashes.includes(h))];
  return {
    kind: 'repreview',
    subjectHash: nextSubjectHash,
    priorTokenHashes: prior,
    expiresAt: expiryFrom(now),
  };
}

export type OwnerEditPlan =
  | { readonly kind: 'unchanged' }
  | {
      readonly kind: 'remint';
      readonly subjectHash: string;
      readonly previousTokenHash: string | null;
      readonly expiresAt: string;
      readonly ownerEditedAt: string;
    };

/**
 * Owner edit from Review. Same `approval_id`. The token in the latest
 * email becomes the single alias (`previous_token_hash`), so that link
 * still decides and shows "Fields updated"; a second edit overwrites the
 * alias, so the first link then matches nothing and shows Expired. The
 * new token is minted when the new email is dispatched. When no email
 * has been minted since the last edit, the alias is kept.
 */
export function planOwnerEdit(
  r: ApprovalRecord,
  nextSubjectHash: string,
  now: Date,
): OwnerEditPlan {
  if (r.subjectHash === nextSubjectHash) return { kind: 'unchanged' };
  return {
    kind: 'remint',
    subjectHash: nextSubjectHash,
    previousTokenHash: r.linkTokenHash ?? r.previousTokenHash,
    expiresAt: expiryFrom(now),
    ownerEditedAt: now.toISOString(),
  };
}

export interface ApproveRequiresInput {
  /** The kind is high-risk for these arguments (cancel, disconnect, a non-default folder, …). */
  readonly highRisk: boolean;
  readonly recipients: readonly ApprovalRecipient[];
  /** The key's Advanced "Always require sign-in". */
  readonly alwaysRequireSignin: boolean;
  /** Rows of a batch (bulk send); 1 for a single action. */
  readonly batchSize: number;
}

/**
 * Whether Approve needs a session. Recomputed at decision time from the
 * current recipients, the action and the key settings; never read back
 * from the row. Login-free Approve only when every recipient is known,
 * the action is not high-risk, the batch is at most 5 and the key does
 * not always require sign-in. Deny never needs a session.
 */
export function approveRequires(input: ApproveRequiresInput): ApproveRequires {
  if (input.highRisk) return 'session';
  if (input.alwaysRequireSignin) return 'session';
  if (input.batchSize > APPROVAL_POLICY.sessionBatchThreshold) return 'session';
  if (input.recipients.some((r) => r.is_new)) return 'session';
  return 'link';
}

/** `amr` timestamps a little in the future are clock skew; more is bogus. */
const AMR_FUTURE_SKEW_SECONDS = 60;

/**
 * In-app and review Approve: the session's newest `amr[].timestamp` must
 * be within the last 12 hours. `iat` is not the check (a refresh renews it).
 */
export function isFreshForApproval(lastSignInAt: number | null | undefined, now: Date): boolean {
  if (lastSignInAt === null || lastSignInAt === undefined) return false;
  const nowSeconds = now.getTime() / 1000;
  if (lastSignInAt > nowSeconds + AMR_FUTURE_SKEW_SECONDS) return false;
  return nowSeconds - lastSignInAt <= APPROVAL_POLICY.freshSignInSeconds;
}

/** Recipients with New first, then in the order given. */
export function sortRecipients(recipients: readonly ApprovalRecipient[]): ApprovalRecipient[] {
  return [...recipients.filter((r) => r.is_new), ...recipients.filter((r) => !r.is_new)];
}

/** The key name the card and email show. */
export function displayKeyName(name: string | null | undefined): string {
  const trimmed = (name ?? '').trim();
  return trimmed.length > 0 ? trimmed : 'Sent via API key';
}
