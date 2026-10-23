import { z } from 'zod';
import { ApprovalPendingResultSchema, APPROVE_REQUIRES } from './approvals';
import { ENVELOPE_STATUSES, iso, uuid } from './envelope-contract';
import { McpIdempotencyKeySchema } from './mcp-write';

/**
 * MCP steps 10 and 11 (docs/design/mcp-server.md § Fields and send;
 * parity plan WP-24): send, remind and cancel through owner approval,
 * plus the attribution every event an MCP call causes carries
 * (`envelope_events.metadata.mcp`).
 */

// Attribution: `metadata.mcp` is `McpEventMetadataSchema` in ./mcp (WP-23,
// which renders it on the certificate). The send path writes exactly that
// shape on `sent`, `step_started`, `canceled`, `session_invalidated_by_cancel`
// and `reminder_sent`. Send-caused rows also carry a top-level
// `new_recipient_count` (outside `mcp`) that the daily new-recipient cap counts.

// ---------------------------------------------------------------------------
// Bounce and complaint suspension (§ Rate limits)
// ---------------------------------------------------------------------------

/**
 * Over a rolling window, a bounce rate above `maxBounceRate` or at least
 * `complaintsToSuspend` spam complaints on the owner's mail suspends
 * `envelopes:send` on every key of that owner (slug `send_suspended`).
 */
export const MCP_SEND_SUSPENSION = {
  windowDays: 7,
  maxBounceRate: 0.05,
  complaintsToSuspend: 2,
} as const;

// ---------------------------------------------------------------------------
// Tool inputs
// ---------------------------------------------------------------------------

const write = {
  idempotency_key: McpIdempotencyKeySchema,
  dry_run: z.boolean(),
};

/** Raw confirmation token from `envelopes_preview_send` (32 bytes, base64url). */
const confirmationToken = z.string().regex(/^[A-Za-z0-9_-]{43}$/);

export const EnvelopesSendInputSchema = z.strictObject({
  envelope_id: uuid,
  ...write,
  /** Only on the unattended path (the key's owner turned approval off). */
  confirmation_token: confirmationToken.optional(),
});

export const EnvelopesPreviewSendInputSchema = z.strictObject({ envelope_id: uuid, ...write });

export const EnvelopesRemindInputSchema = z.strictObject({
  envelope_id: uuid,
  signer_id: uuid,
  ...write,
});

export const EnvelopesPreviewRemindInputSchema = EnvelopesRemindInputSchema;

export const EnvelopesCancelInputSchema = z.strictObject({ envelope_id: uuid, ...write });

// ---------------------------------------------------------------------------
// Tool outputs
// ---------------------------------------------------------------------------

/** The sentence the preview adds when the account's own mailbox is a signer. */
export const SIGNER_IS_ACCOUNT_OWNER_NOTE = 'You are a signer. Send this from Seald instead.';

/** Unattended confirmation tokens live this long. */
export const MCP_CONFIRMATION_TTL_SECONDS = 600;

export const EnvelopesPreviewSendOutputSchema = z.object({
  ready: z.boolean(),
  summary: z.object({
    title: z.string(),
    signers: z.array(
      z.object({
        name: z.string(),
        email: z.string(),
        signer_is_account_owner: z.boolean(),
      }),
    ),
    field_count: z.number().int().min(0),
    expires_at: iso,
    file_sha256: z.string().nullable(),
    /** Present only when `signer_is_account_owner` is true. */
    note: z.string().optional(),
  }),
  signer_is_account_owner: z.boolean(),
  approval: z.enum(['email', 'none']),
  approval_id: uuid.nullable(),
  /** The signed-in review of the opened approval; never the token link. Null when none opened. */
  review_url: z.string().nullable(),
  approve_requires: z.enum(APPROVE_REQUIRES).nullable(),
  /** Unattended path only. Not kept for an idempotent replay. */
  confirmation_token: z.string().optional(),
  expires_in_seconds: z.literal(MCP_CONFIRMATION_TTL_SECONDS).optional(),
});
export type EnvelopesPreviewSendOutput = z.infer<typeof EnvelopesPreviewSendOutputSchema>;

/** The unattended same-turn send went out. */
export const EnvelopesSentResultSchema = z.object({
  status: z.literal('sent'),
  envelope_id: uuid,
  envelope_status: z.enum(ENVELOPE_STATUSES),
});

export const EnvelopesSendOutputSchema = z.union([
  ApprovalPendingResultSchema,
  EnvelopesSentResultSchema,
]);
export type EnvelopesSendOutput = z.infer<typeof EnvelopesSendOutputSchema>;

export const EnvelopesPreviewRemindOutputSchema = z.object({
  envelope_id: uuid,
  signer: z.object({ id: uuid, name: z.string(), email: z.string() }),
  /** Reminders always go through owner approval. */
  approval: z.literal('email'),
});

export const EnvelopesRemindOutputSchema = ApprovalPendingResultSchema;
export const EnvelopesCancelOutputSchema = ApprovalPendingResultSchema;
