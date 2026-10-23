import { z } from 'zod';
import { iso, uuid } from './envelope-contract';

/**
 * Owner approval (docs/design/mcp-server.md § Owner approval; MCP steps
 * 7a, 7c and the server side of 7d; parity plan WP-21).
 *
 * An agent never decides. A tool that needs the owner's agreement asks
 * the approvals service for an approval and returns `approval_pending`.
 * The owner decides on the standalone Approve/Deny page reached from the
 * approval email (primary) or in the app queue (secondary). The server
 * runs the action after a valid Approve.
 */

// ---------------------------------------------------------------------------
// Kinds
// ---------------------------------------------------------------------------

/**
 * Every action that can wait on the owner. The registry in
 * `apps/api/src/approvals/kinds` maps each to a handler; a kind whose
 * action has not shipped has a typed stub that refuses with
 * `approval_kind_not_ready` and never opens a row.
 *
 * - `envelope_send`, `envelope_remind`, `envelope_cancel`: MCP steps 10–11 (WP-24).
 * - `gdrive_disconnect`, `envelope_save_to_drive`: MCP step 14 (WP-25).
 * - `automation_external_destination`: automations A3 (WP-30).
 * - `envelope_fix_signer`, `envelope_change_expiry`, `bulk_send`: MCP step 15 (WP-26).
 * - `account_delete`, `api_key_create`, `api_key_revoke`,
 *   `approval_required_toggle`, `envelope_sign_as_signer`: WP-45 (D5).
 * - `account_export`, `automation_rotate_secret`, `oauth_grant_revoke`:
 *   WP-45, the D5 parity routes `GET /me/export`,
 *   `POST /automations/:id/rotate-secret` and
 *   `POST /me/connected-apps/:id/revoke` (WP-27's connected apps).
 */
export const APPROVAL_KINDS = [
  'envelope_send',
  'envelope_remind',
  'envelope_cancel',
  'gdrive_disconnect',
  'envelope_save_to_drive',
  'envelope_fix_signer',
  'envelope_change_expiry',
  'bulk_send',
  'automation_external_destination',
  'account_delete',
  'api_key_create',
  'api_key_revoke',
  'approval_required_toggle',
  'envelope_sign_as_signer',
  'account_export',
  'automation_rotate_secret',
  'oauth_grant_revoke',
] as const;
export type ApprovalKind = (typeof APPROVAL_KINDS)[number];

export function isApprovalKind(value: unknown): value is ApprovalKind {
  return typeof value === 'string' && (APPROVAL_KINDS as readonly string[]).includes(value);
}

/** Status words every approval surface uses. */
export const APPROVAL_STATUSES = ['pending', 'done', 'denied', 'expired', 'failed'] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

/**
 * What the public card shows for one link. `superseded` is "pending, old
 * email": an agent re-preview replaced this link ("Updated, see the
 * newest email"); it never decides.
 */
export const APPROVAL_CARD_STATES = [...APPROVAL_STATUSES, 'superseded'] as const;
export type ApprovalCardState = (typeof APPROVAL_CARD_STATES)[number];

/** `link`: Approve is login-free from the email. `session`: Approve needs a sign-in. */
export const APPROVE_REQUIRES = ['link', 'session'] as const;
export type ApproveRequires = (typeof APPROVE_REQUIRES)[number];

/** Where a decision came from (`approval_decided.metadata.decided_via`). */
export const APPROVAL_DECIDED_VIA = ['email', 'app'] as const;
export type ApprovalDecidedVia = (typeof APPROVAL_DECIDED_VIA)[number];

/** Owner setting on a key or grant: `none` skips the approval email only. */
export const APPROVAL_NOTIFY = ['email', 'none'] as const;
export type ApprovalNotify = (typeof APPROVAL_NOTIFY)[number];

// ---------------------------------------------------------------------------
// Policy
// ---------------------------------------------------------------------------

export const APPROVAL_POLICY = {
  /** A link lives 24 hours from create, the latest agent re-preview or the latest owner edit. */
  ttlSeconds: 24 * 60 * 60,
  /** Approve from the app or the review needs `amr[].timestamp` within 12 hours. */
  freshSignInSeconds: 12 * 60 * 60,
  /** Open approvals per key (`approval_limit`). */
  maxOpenPerKey: 10,
  /** `approval_request` mails per owner per UTC day (`approval_limit`). */
  maxRequestMailsPerOwnerPerDay: 30,
  /** A batch larger than this needs a session to Approve. */
  sessionBatchThreshold: 5,
  /** Denials of one key within 24 hours that suspend its `envelopes:send`. */
  denialsToSuspend: 3,
  /** The HTML card and email list this many recipients, then "+N more". */
  recipientsShown: 3,
  /** Preview and decision calls per IP and per token, per minute. */
  floodPerMinute: 10,
} as const;

// ---------------------------------------------------------------------------
// Card summary (the displayed facts)
// ---------------------------------------------------------------------------

export const ApprovalRecipientSchema = z.object({
  name: z.string(),
  email: z.string(),
  /** Not in `subject_hash`; recomputed at decision time. */
  is_new: z.boolean(),
});
export type ApprovalRecipient = z.infer<typeof ApprovalRecipientSchema>;

/**
 * An external destination shown on the card (a recipe's webhook host and
 * path, an added address, a Drive folder). Never a URL query string.
 */
export const ApprovalDestinationSchema = z.object({
  kind: z.enum(['webhook', 'email', 'drive_folder', 'drive_account']),
  label: z.string(),
});
export type ApprovalDestination = z.infer<typeof ApprovalDestinationSchema>;

/**
 * One fixed label and its value, for a kind with no document (the key a
 * request would create: name, scopes, expiry). Labels are fixed strings;
 * values are data, never instructions.
 */
export const ApprovalFactSchema = z.object({
  label: z.string(),
  value: z.string(),
});
export type ApprovalFact = z.infer<typeof ApprovalFactSchema>;

export const ApprovalSummarySchema = z.object({
  kind: z.enum(APPROVAL_KINDS),
  /** Fixed sentence for the action ("Send for signature"). */
  action_label: z.string(),
  /** Document title, or null for an action with no document. Data, not instructions. */
  title: z.string().nullable(),
  /** New addresses first. The full list; the card shows 3, then "+N more". */
  recipients: z.array(ApprovalRecipientSchema),
  page_count: z.number().int().min(0).nullable(),
  /** The owner's key name ("Key 2"), or "Sent via API key". Never an agent name. */
  key_name: z.string(),
  approver_email: z.string(),
  destination: ApprovalDestinationSchema.nullable(),
  /** WP-45: the facts of a kind with no document (key name, scopes, expiry). */
  facts: z.array(ApprovalFactSchema).optional(),
  /** WP-45 `envelope_sign_as_signer`: the signer row the owner signs as. */
  signer_id: uuid.optional(),
});
export type ApprovalSummary = z.infer<typeof ApprovalSummarySchema>;

// ---------------------------------------------------------------------------
// MCP (step 7c)
// ---------------------------------------------------------------------------

/**
 * A successful tool result, not an error. `review_url` is the signed-in
 * review route `/approve/<id>/review`; it is never the `/approve#` token
 * link and carries no token.
 */
export const ApprovalPendingResultSchema = z.object({
  status: z.literal('approval_pending'),
  message: z.literal('pending owner approval'),
  approval_id: uuid,
  summary: ApprovalSummarySchema,
  review_url: z.string(),
  approve_requires: z.enum(APPROVE_REQUIRES),
});
export type ApprovalPendingResult = z.infer<typeof ApprovalPendingResultSchema>;

export const ApprovalsGetInputSchema = z.strictObject({ approval_id: uuid });

export const ApprovalsGetOutputSchema = z.object({
  status: z.enum(APPROVAL_STATUSES),
  /** Present when the status is `failed`: why nothing was sent. */
  result_slug: z.string().optional(),
});

export const ApprovalsListInputSchema = z.strictObject({
  status: z.enum(APPROVAL_STATUSES).optional(),
  limit: z.number().int().min(1).max(50).optional(),
  cursor: z.string().min(1).max(512).optional(),
});

export const ApprovalsListOutputSchema = z.object({
  items: z.array(
    z.object({
      approval_id: uuid,
      /** The tool that asked, or the action kind when no tool is recorded. */
      tool: z.string(),
      status: z.enum(APPROVAL_STATUSES),
      requested_at: iso,
      expires_at: iso,
    }),
  ),
  next_cursor: z.string().nullable(),
});

export type ApprovalsGetInput = z.infer<typeof ApprovalsGetInputSchema>;
export type ApprovalsGetOutput = z.infer<typeof ApprovalsGetOutputSchema>;
export type ApprovalsListInput = z.infer<typeof ApprovalsListInputSchema>;
export type ApprovalsListOutput = z.infer<typeof ApprovalsListOutputSchema>;

// ---------------------------------------------------------------------------
// HTTP: in-app queue (session JWT only)
// ---------------------------------------------------------------------------

export const ApprovalDetailSchema = z.object({
  id: uuid,
  kind: z.enum(APPROVAL_KINDS),
  status: z.enum(APPROVAL_STATUSES),
  summary: ApprovalSummarySchema,
  approve_requires: z.enum(APPROVE_REQUIRES),
  /** The envelope the action is about, for the guided review. */
  envelope_id: uuid.nullable(),
  requested_at: iso,
  expires_at: iso,
  decided_at: iso.nullable(),
  /** Set when the owner edited from Review ("Fields updated · 12:21"). */
  fields_updated_at: iso.nullable(),
  result_slug: z.string().nullable(),
  /** Output of the action after a successful Approve. */
  result: z.record(z.string(), z.unknown()).nullable(),
  /**
   * WP-45: a secret the action minted, only in the response of the
   * Approve that created it and never stored (the new API key, a rotated
   * webhook secret). Shown once on the approval page; never in a tool result.
   */
  reveal: z
    .object({
      api_key_secret: z.string().optional(),
      automation_secret: z.string().optional(),
    })
    .optional(),
});
export type ApprovalDetail = z.infer<typeof ApprovalDetailSchema>;

/**
 * WP-45: a signature or initials image the owner adopts on the approval
 * page of `envelope_sign_as_signer`. A PNG or JPEG, base64, applied only
 * on Approve. 300 KB decoded keeps two images under the 1 MB JSON limit.
 */
export const APPROVAL_SIGNATURE_MAX_BYTES = 300 * 1024;
const signatureImage = z.strictObject({
  image_base64: z
    .string()
    .min(8)
    .max(Math.ceil(APPROVAL_SIGNATURE_MAX_BYTES / 3) * 4)
    .regex(/^[A-Za-z0-9+/]+={0,2}$/),
  format: z.enum(['drawn', 'typed', 'upload']),
  font: z.string().trim().min(1).max(80).optional(),
  stroke_count: z.number().int().min(0).max(100_000).optional(),
});
export type ApprovalSignatureImage = z.infer<typeof signatureImage>;

/**
 * `POST /approvals/:id/approve` body (session JWT only). Empty for every
 * kind before WP-45. The WP-45 kinds read their part and refuse the
 * Approve, without recording anything, when it is missing or wrong:
 *
 * - `account_delete`: `confirm_email`, the account email typed by hand.
 * - `envelope_sign_as_signer`: the signer's own consent on this page
 *   (`esign_disclosure_version`, `record_access`, `intent_to_sign`) and
 *   the images for the signature and initials fields.
 */
export const ApprovalApproveBodySchema = z.strictObject({
  confirm_email: z.string().trim().min(3).max(320).optional(),
  esign_disclosure_version: z.string().min(1).max(40).optional(),
  record_access: z.literal(true).optional(),
  intent_to_sign: z.literal(true).optional(),
  signature: signatureImage.optional(),
  initials: signatureImage.optional(),
});
export type ApprovalApproveBody = z.infer<typeof ApprovalApproveBodySchema>;

export const ApprovalListResponseSchema = z.object({
  items: z.array(ApprovalDetailSchema),
  next_cursor: z.string().nullable(),
  /** Pending rows, for the header bell. */
  pending_count: z.number().int().min(0),
});
export type ApprovalListResponse = z.infer<typeof ApprovalListResponseSchema>;

// ---------------------------------------------------------------------------
// HTTP: the public page (`/approve#<token>`)
// ---------------------------------------------------------------------------

/** 32 random bytes, base64url: 43 characters. */
const linkToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const ApprovalEmailPreviewRequestSchema = z.strictObject({ token: linkToken });
export type ApprovalEmailPreviewRequest = z.infer<typeof ApprovalEmailPreviewRequestSchema>;

export const ApprovalEmailDecisionRequestSchema = z.strictObject({
  token: linkToken,
  decision: z.enum(['approve', 'deny']),
  csrf: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});
export type ApprovalEmailDecisionRequest = z.infer<typeof ApprovalEmailDecisionRequestSchema>;

/**
 * The card for one link. An unknown or replaced token reads `expired`
 * with no other fields. `csrf` comes only from the preview of a pending
 * link. `review_url` is the signed-in review, never a token link.
 */
export const ApprovalCardSchema = z.object({
  state: z.enum(APPROVAL_CARD_STATES),
  approval_id: uuid.optional(),
  summary: ApprovalSummarySchema.optional(),
  approve_requires: z.enum(APPROVE_REQUIRES).optional(),
  expires_at: iso.optional(),
  fields_updated_at: iso.nullable().optional(),
  result_slug: z.string().nullable().optional(),
  review_url: z.string().optional(),
  csrf: z.string().optional(),
  /** On a decision POST: whether this call recorded the decision. */
  decided: z.boolean().optional(),
});
export type ApprovalCard = z.infer<typeof ApprovalCardSchema>;
