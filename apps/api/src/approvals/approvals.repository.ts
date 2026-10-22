import type {
  ApprovalKind,
  ApprovalNotify,
  ApprovalStatus,
  ApprovalSummary,
  ApproveRequires,
} from 'shared';
import type { InsertOutboundEmailInput } from '../email/outbound-emails.repository';
import type { ApprovalRecord, TokenMatch } from './approval-state';

/** The key facts an approval needs, read at request and at decision time. */
export interface ApprovalKeyFacts {
  readonly id: string;
  readonly ownerId: string;
  readonly name: string;
  readonly prefix: string;
  readonly revokedAt: string | null;
  readonly expiresAt: string | null;
  readonly alwaysRequireSignin: boolean;
  readonly allowNewRecipients: boolean;
  readonly approvalNotify: ApprovalNotify;
}

/** The account mailbox. Approval mail goes only to a verified address. */
export interface OwnerMailbox {
  readonly email: string | null;
  readonly verified: boolean;
}

export interface OpenApprovalInput {
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
  readonly approveRequires: ApproveRequires;
  readonly notify: ApprovalNotify;
  readonly expiresAt: string;
  readonly now: Date;
  /** Open approvals one key may hold. */
  readonly maxOpenPerKey: number;
  /** `approval_request` mails per owner per UTC day. */
  readonly maxMailsPerOwnerPerDay: number;
  /**
   * The `approval_request` row for this approval, built from the stored
   * record. Null when no email goes out (`approval_notify: none`). It is
   * inserted in the same transaction as the approval.
   */
  readonly email: ((record: ApprovalRecord, dedupeKey: string) => InsertOutboundEmailInput) | null;
}

export type OpenApprovalResult =
  | {
      readonly outcome: 'created' | 'repreviewed' | 'unchanged';
      readonly record: ApprovalRecord;
    }
  | { readonly outcome: 'limit_open' | 'limit_mail' };

export interface ClaimDecisionInput {
  readonly id: string;
  readonly decision: 'approve' | 'deny';
  /** The email path decides only through the current token or the alias. */
  readonly tokenHash: string | null;
  /** The in-app path decides only for the owner. */
  readonly ownerId: string | null;
  readonly via: 'email' | 'app';
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly signedIn: boolean;
  /** The hash the decision checked; the row must still carry it. */
  readonly subjectHash: string;
  readonly now: Date;
}

export interface OwnerEditInput {
  readonly id: string;
  readonly ownerId: string;
  readonly expectSubjectHash: string;
  readonly subjectHash: string;
  readonly summary: ApprovalSummary;
  readonly approveRequires: ApproveRequires;
  readonly previousTokenHash: string | null;
  readonly expiresAt: string;
  readonly now: Date;
  readonly maxMailsPerOwnerPerDay: number;
  readonly email: ((record: ApprovalRecord, dedupeKey: string) => InsertOutboundEmailInput) | null;
}

export interface ListApprovalsInput {
  readonly status?: ApprovalStatus;
  readonly limit: number;
  readonly cursor: { readonly createdAt: string; readonly id: string } | null;
  readonly now: Date;
}

export interface InsertConfirmationInput {
  readonly ownerId: string;
  readonly apiKeyId: string | null;
  readonly oauthGrantId: string | null;
  readonly envelopeId: string;
  readonly subjectHash: string;
  readonly tokenHash: string;
  readonly expiresAt: string;
}

export interface ConsumeConfirmationInput {
  readonly tokenHash: string;
  readonly apiKeyId: string | null;
  readonly oauthGrantId: string | null;
  readonly envelopeId: string;
  readonly subjectHash: string;
  readonly now: Date;
}

/**
 * Port for `mcp_approvals` and `mcp_confirmations` (migration 0030) plus
 * the few cross-table reads an approval needs (the key, the mailbox, the
 * known-recipient set, outbox volume). Every state change is a single
 * conditional statement, so concurrent callers resolve to one winner.
 */
export abstract class ApprovalsRepository {
  abstract findKeyFacts(apiKeyId: string): Promise<ApprovalKeyFacts | null>;

  abstract findOwnerMailbox(ownerId: string): Promise<OwnerMailbox | null>;

  /**
   * Lower-cased addresses among `emails` that are known for this owner:
   * an earlier envelope to that address was sent from the web app, or an
   * owner-approved send went to it. A contact alone never counts.
   */
  abstract findKnownRecipients(ownerId: string, emails: readonly string[]): Promise<Set<string>>;

  /**
   * Under a per-owner advisory lock: stamp a stale open row for the same
   * subject expired, then re-preview the open row (same id) or insert a
   * new one, enforcing the open-per-key and mail-per-day caps, and insert
   * the approval email in the same transaction.
   */
  abstract openOrRepreview(input: OpenApprovalInput): Promise<OpenApprovalResult>;

  abstract findById(id: string): Promise<ApprovalRecord | null>;

  abstract findByTokenHash(
    tokenHash: string,
  ): Promise<{ readonly record: ApprovalRecord; readonly match: TokenMatch } | null>;

  /**
   * Mint at dispatch: store the hash of the token going into this email,
   * only while the row is open and still carries `subjectHash` (a later
   * re-preview or edit supersedes an older queued email).
   */
  abstract armLinkToken(
    id: string,
    subjectHash: string,
    tokenHash: string,
    now: Date,
  ): Promise<ApprovalRecord | null>;

  /** Stamp `expired_at` on a row with no outcome yet. */
  abstract markExpired(id: string, reason: string, now: Date): Promise<ApprovalRecord | null>;

  /** Record Failed before any decision (key revoked, validation failed). Nothing ran. */
  abstract markFailedUndecided(
    id: string,
    slug: string,
    decision: Omit<ClaimDecisionInput, 'id' | 'decision' | 'subjectHash' | 'tokenHash' | 'ownerId'>,
  ): Promise<ApprovalRecord | null>;

  /** The single conditional decision update. Null when another decision won. */
  abstract claimDecision(input: ClaimDecisionInput): Promise<ApprovalRecord | null>;

  /** After Approve: the action succeeded. */
  abstract markCompleted(
    id: string,
    result: Readonly<Record<string, unknown>>,
    now: Date,
  ): Promise<ApprovalRecord | null>;

  /** After Approve: the action failed; nothing was sent. */
  abstract markFailedAfterApprove(
    id: string,
    slug: string,
    now: Date,
  ): Promise<ApprovalRecord | null>;

  /** Owner edit from Review: re-mint on the same pending row. */
  abstract applyOwnerEdit(
    input: OwnerEditInput,
  ): Promise<
    | { readonly outcome: 'remint'; readonly record: ApprovalRecord; readonly mailed: boolean }
    | { readonly outcome: 'not_open' }
  >;

  abstract list(
    ownerId: string,
    input: ListApprovalsInput,
  ): Promise<{ readonly items: readonly ApprovalRecord[]; readonly hasMore: boolean }>;

  abstract countPending(ownerId: string, now: Date): Promise<number>;

  /** Revoking a key expires its open approvals. Returns the rows expired. */
  abstract expireOpenForApiKey(apiKeyId: string, reason: string, now: Date): Promise<number>;

  /** An email change (session-only) expires every open approval of the owner. */
  abstract expireOpenForOwner(ownerId: string, reason: string, now: Date): Promise<number>;

  /** Account deletion: approvals, confirmations and their outbox rows. */
  abstract deleteAllForOwner(ownerId: string): Promise<number>;

  abstract countDenialsForKey(apiKeyId: string, since: Date): Promise<number>;

  /** All outbound mail created since each boundary (the provider quota breaker). */
  abstract countOutboundSince(
    dayStart: Date,
    monthStart: Date,
  ): Promise<{ readonly day: number; readonly month: number }>;

  abstract insertConfirmation(input: InsertConfirmationInput): Promise<void>;

  /** One conditional update; a second caller, a changed subject or an expired token gets false. */
  abstract consumeConfirmation(input: ConsumeConfirmationInput): Promise<boolean>;
}
