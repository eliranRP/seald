import type { ApprovalDestination, ApprovalKind, McpEventMetadata } from 'shared';
import type { z } from 'zod';
import type { SubjectField } from '../subject-hash';

/** Who and when, for a kind's describe and execute. */
export interface ApprovalKindContext {
  readonly ownerId: string;
  /** The verified account mailbox the approval was sent to. */
  readonly ownerEmail: string;
  readonly now: Date;
  /** The key that asked (null for an OAuth grant, WP-27). Always set by ApprovalsService. */
  readonly apiKeyId?: string | null;
}

/** What `checkLimits` sees: the context plus the recomputed New flags. */
export interface ApprovalLimitsContext extends ApprovalKindContext {
  /** Recipients of the subject that are not known (the card's New flags). */
  readonly newRecipients: number;
}

/** What one approval is about: the facts `subject_hash` covers and the card shows. */
export interface DescribedSubject {
  /**
   * Identifies the thing acted on, so one owner has at most one open
   * approval per action and subject (`envelope:<id>`,
   * `envelope:<id>:signer:<id>`, `gdrive_account:<id>`).
   */
  readonly subjectKey: string;
  readonly envelopeId: string | null;
  readonly title: string | null;
  /** Everyone the action emails or touches, names and emails, full list. */
  readonly recipients: ReadonlyArray<{ readonly name: string; readonly email: string }>;
  readonly pageCount: number | null;
  readonly destination: ApprovalDestination | null;
  /** `original_sha256` of each document, in order. */
  readonly files: readonly string[];
  readonly fields: readonly SubjectField[];
  /** Kind-specific facts Approve acts on (hashed). */
  readonly extra?: Readonly<Record<string, unknown>>;
  /** Rows of a batch; 1 for a single action. */
  readonly batchSize?: number;
}

export interface ApprovalExecuteContext extends ApprovalKindContext {
  readonly approvalId: string;
  /** The decision request, for the action's own audit rows. */
  readonly audit: { readonly ip: string | null; readonly user_agent: string | null };
  /**
   * `metadata.mcp` for every event the action writes (WP-24): the key
   * snapshot, the tool, and how the owner approved (email link or
   * signed in).
   */
  readonly mcp?: McpEventMetadata;
  /** Lower-cased recipient addresses that were New at decision time. */
  readonly newRecipientEmails?: ReadonlySet<string>;
}

/**
 * One approval kind. Adding a kind is: a value in `APPROVAL_KINDS`
 * (shared), a handler here, and its entry in the registry. The registry
 * is a `Record<ApprovalKind, …>`, so the compiler refuses a kind with no
 * handler.
 *
 * `describe` runs at request time and again at decision time; it throws
 * an `HttpException` (with the usual slug) when the action is no longer
 * possible, and its output is what `subject_hash` covers. `execute` runs
 * after Approve; a thrown `HttpException` slug becomes `result_slug` and
 * the approval reads Failed.
 */
export interface ApprovalKindHandler<A extends Record<string, unknown> = Record<string, unknown>> {
  readonly kind: ApprovalKind;
  /** The MCP tool that asks for this kind (approvals_list `tool`). */
  readonly tool: string;
  /** Fixed sentence for the card and email. Never interpolated with user text. */
  readonly actionLabel: string;
  /** False for a typed stub: `request` refuses with `approval_kind_not_ready`. */
  readonly ready: boolean;
  readonly args: z.ZodType<A>;
  /**
   * True when Approve needs a session whatever the recipients (cancel,
   * disconnect, a non-default Drive folder, every WP-45 action).
   */
  highRisk(args: A): boolean;
  describe(args: A, ctx: ApprovalKindContext): Promise<DescribedSubject>;
  /**
   * Optional per-owner limits (the send caps, WP-24), checked after
   * `describe` once the New flags are known, at request and again at
   * decision time. Throws an `HttpException` slug when the action would
   * pass a limit. `execute` re-checks under the owner lock.
   */
  checkLimits?(args: A, ctx: ApprovalLimitsContext): Promise<void>;
  /**
   * Runs after Approve, inside the decision's transaction (WP-24): the
   * action and the recorded decision commit together, so a crash cannot
   * leave an approved row whose action never ran, or run it twice.
   */
  execute(args: A, ctx: ApprovalExecuteContext): Promise<Record<string, unknown>>;
}
