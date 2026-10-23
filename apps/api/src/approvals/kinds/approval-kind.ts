import type {
  ApprovalApproveBody,
  ApprovalDestination,
  ApprovalFact,
  ApprovalKind,
  McpEventMetadata,
} from 'shared';
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
  /** WP-45: the OAuth grant that asked (WP-27), or null for a key. */
  readonly oauthGrantId?: string | null;
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
  /**
   * WP-45: what the card lists for a kind with no document (the key a
   * request would create). Fixed labels; shown, and hashed with `extra`.
   */
  readonly facts?: readonly ApprovalFact[];
  /** WP-45 `envelope_sign_as_signer`: the signer row, for the approval page. */
  readonly signerId?: string;
}

/** A secret an action minted, handed to the Approve response once and never stored. */
export interface ApprovalReveal {
  readonly api_key_secret?: string;
  readonly automation_secret?: string;
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
  /**
   * WP-45: the Approve body, after the kind's `checkApproveBody` passed
   * (the typed email, the signer's consent and images).
   */
  readonly body?: ApprovalApproveBody;
  /**
   * WP-45: hand a minted secret to this Approve's response. It is not
   * written to `result`, a log or an event, so it is shown once.
   */
  readonly revealOnce?: (reveal: ApprovalReveal) => void;
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
  /**
   * WP-45: Approve needs a session whose newest `amr[].timestamp` is
   * within this many seconds (the 10-minute window of key creation),
   * instead of the default 12 hours. Only the in-app Approve can meet
   * it; such a kind is also `highRisk`, so the email link never approves.
   */
  readonly freshSignInSeconds?: number;
  /**
   * WP-45: checks the Approve body before anything is recorded (the
   * typed account email, the signer's consent). Throws a 4xx slug, which
   * the page shows; the approval stays pending.
   */
  checkApproveBody?(
    args: A,
    body: ApprovalApproveBody,
    ctx: ApprovalKindContext,
  ): void | Promise<void>;
  /**
   * WP-45: false runs `execute` after the decision commits, outside its
   * transaction. Only for an action that calls a service which must see
   * the decision's rows unlocked (account deletion asks Supabase to
   * delete the auth user, whose cascade would wait on this transaction's
   * row locks). Defaults to true.
   */
  readonly transactional?: boolean;
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
