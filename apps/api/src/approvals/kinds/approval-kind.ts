import type { ApprovalDestination, ApprovalKind } from 'shared';
import type { z } from 'zod';
import type { SubjectField } from '../subject-hash';

/** Who and when, for a kind's describe and execute. */
export interface ApprovalKindContext {
  readonly ownerId: string;
  /** The verified account mailbox the approval was sent to. */
  readonly ownerEmail: string;
  readonly now: Date;
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
  execute(args: A, ctx: ApprovalExecuteContext): Promise<Record<string, unknown>>;
}
