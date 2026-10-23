import { z } from 'zod';
import { API_KEY_SCOPES } from './api-keys';
import {
  ACTOR_KINDS,
  DELIVERY_MODES,
  ENVELOPE_STATUSES,
  EVENT_TYPES,
  EnvelopeDocumentSchema,
  FieldSchema,
  SIGNER_ROLES,
  iso,
  uuid,
} from './envelope-contract';

/**
 * MCP server contract (docs/design/mcp-server.md, steps 4–6).
 *
 * `MCP_SERVER_VERSION` is `serverInfo.version` on `initialize`. It is not
 * the api package version. The tools/list snapshot classifier bumps the
 * minor for an additive change; a breaking change is a new `_v2` tool
 * name, so the major is not used for that.
 */
export const MCP_SERVER_VERSION = '0.6.0';

/**
 * Protocol revisions the server negotiates: the current one and the one
 * before it, newest first. `initialize` answers with the client's version
 * when it is in this list, and with the first entry otherwise. Any other
 * `MCP-Protocol-Version` header is HTTP 400.
 */
export const MCP_PROTOCOL_VERSIONS = ['2025-11-25', '2025-06-18'] as const;
export type McpProtocolVersion = (typeof MCP_PROTOCOL_VERSIONS)[number];

export function isSupportedMcpProtocolVersion(value: unknown): value is McpProtocolVersion {
  return typeof value === 'string' && (MCP_PROTOCOL_VERSIONS as readonly string[]).includes(value);
}

/**
 * Daily caps from the doc's rate-limit table. Enforcement ships with the
 * send path (step 10); until then no MCP tool can spend them, so
 * `me_get` reports the full allowance.
 */
export const MCP_DAILY_CAPS = {
  sends: 20,
  new_recipients: 25,
  email_copies: 50,
} as const;

/** Lists take `limit` (default 20, max 50) and an opaque `cursor`. */
export const MCP_LIST_LIMIT_DEFAULT = 20;
export const MCP_LIST_LIMIT_MAX = 50;

/** `EnvelopesService.getDownloadUrl` signs for 300 seconds; MCP asks for no more. */
export const MCP_DOWNLOAD_URL_TTL_SECONDS = 300;

const limit = z.number().int().min(1).max(MCP_LIST_LIMIT_MAX);
const cursor = z.string().min(1).max(512);
const envelopeStatus = z.enum(ENVELOPE_STATUSES);

// ---------------------------------------------------------------------------
// Inputs. Every input is a strict object: unknown fields are rejected.
// ---------------------------------------------------------------------------

export const MeGetInputSchema = z.strictObject({});

export const EnvelopesSearchInputSchema = z.strictObject({
  /** Case-insensitive substring of the title or the short code. */
  title: z.string().trim().min(1).max(200).optional(),
  /** Case-insensitive substring of a signer's name or email. */
  signer: z.string().trim().min(1).max(320).optional(),
  status: z.array(envelopeStatus).min(1).max(ENVELOPE_STATUSES.length).optional(),
  /** Comma-separated tag names, same filter as the dashboard list (any tag matches). */
  tags: z.string().trim().min(1).max(400).optional(),
  /** Inclusive lower bound on `updated_at`. */
  date_from: iso.optional(),
  /** Exclusive upper bound on `updated_at`. */
  date_to: iso.optional(),
  template_id: uuid.optional(),
  /** Case-insensitive substring of the name of a Drive file one of the documents was imported from. */
  drive_file_name: z.string().trim().min(1).max(255).optional(),
  limit: limit.optional(),
  cursor: cursor.optional(),
});

export const EnvelopeIdInputSchema = z.strictObject({ envelope_id: uuid });

export const EnvelopesDownloadUrlInputSchema = z.strictObject({
  envelope_id: uuid,
  /** Default: sealed when it exists, otherwise the original. `audit` has no `document_id`. */
  kind: z.enum(['sealed', 'original', 'audit']).optional(),
  /** One document of a multi-document envelope. Omitted means the envelope's first document. */
  document_id: uuid.optional(),
});

export const EnvelopesListPendingInputSchema = z.strictObject({
  limit: limit.optional(),
  cursor: cursor.optional(),
});

export const EnvelopesListEventsInputSchema = z.strictObject({
  envelope_id: uuid,
  limit: limit.optional(),
  cursor: cursor.optional(),
});

// ---------------------------------------------------------------------------
// Outputs. Plain (non-strict) objects: parsing drops any key the schema does
// not name, so a storage path or token column cannot ride along.
// ---------------------------------------------------------------------------

export const MCP_SIGNER_STATUSES = ['not_sent', 'sent', 'viewed', 'signed', 'declined'] as const;
export type McpSignerStatus = (typeof MCP_SIGNER_STATUSES)[number];

export const McpDocumentSchema = EnvelopeDocumentSchema;

export const McpSignerSchema = z.object({
  id: uuid,
  email: z.string(),
  name: z.string(),
  role: z.enum(SIGNER_ROLES),
  signing_order: z.number().int(),
  status: z.enum(MCP_SIGNER_STATUSES),
  viewed_at: iso.nullable(),
  signed_at: iso.nullable(),
  declined_at: iso.nullable(),
});

export const McpFieldSchema = z.object({
  id: uuid,
  signer_id: uuid,
  document_id: uuid.optional(),
  kind: FieldSchema.shape.kind,
  page: z.number().int().min(1),
  x: z.number(),
  y: z.number(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  required: z.boolean(),
  /** Per-kind options (WP-07). Present while `fieldMetaV2` is on. */
  meta: z.record(z.string(), z.unknown()).optional(),
});

export const McpEnvelopeSchema = z.object({
  id: uuid,
  title: z.string(),
  status: envelopeStatus,
  short_code: z.string(),
  tags: z.array(z.string()),
  original_pages: z.number().int().nullable(),
  expires_at: iso,
  sent_at: iso.nullable(),
  completed_at: iso.nullable(),
  created_at: iso,
  updated_at: iso,
  signers: z.array(McpSignerSchema),
  fields: z.array(McpFieldSchema),
  documents: z.array(McpDocumentSchema),
  // Added in 0.3.0 (WP-19). Optional so older readers stay valid.
  delivery_mode: z.enum(DELIVERY_MODES).optional(),
  reminders_enabled: z.boolean().optional(),
  /** Present while `customReminders` is on. */
  reminder_first_after_days: z.number().int().optional(),
  reminder_interval_days: z.number().int().optional(),
  reminder_max: z.number().int().optional(),
  /** Present while `fieldMetaV2` is on; null means the signer's own format. */
  date_format: z.string().nullable().optional(),
  timezone: z.string().nullable().optional(),
});

export const MeGetOutputSchema = z.object({
  id: uuid,
  /** Null only when the account has no mailbox on record. */
  email: z.string().nullable(),
  scopes: z.array(z.enum(API_KEY_SCOPES)),
  require_owner_approval: z.boolean(),
  quotas: z.object({
    sends_remaining: z.number().int().min(0),
    new_recipients_remaining: z.number().int().min(0),
    email_copies_remaining: z.number().int().min(0),
  }),
});

export const EnvelopesSearchOutputSchema = z.object({
  items: z.array(
    z.object({
      id: uuid,
      title: z.string(),
      status: envelopeStatus,
      short_code: z.string(),
      updated_at: iso,
      signers: z.array(
        z.object({
          id: uuid,
          name: z.string(),
          email: z.string(),
          status: z.enum(MCP_SIGNER_STATUSES),
        }),
      ),
      documents: z.array(
        z.object({
          id: uuid,
          ord: z.number().int().min(1),
          title: z.string(),
          original_pages: z.number().int().nullable(),
        }),
      ),
    }),
  ),
  next_cursor: z.string().nullable(),
});

export const MCP_NEXT_ACTIONS = ['remind', 'wait', 'download', 'none'] as const;

export const EnvelopesStatusOutputSchema = z.object({
  envelope_id: uuid,
  title: z.string(),
  status: envelopeStatus,
  sent_at: iso.nullable(),
  completed_at: iso.nullable(),
  expires_at: iso,
  signers: z.array(
    z.object({
      id: uuid,
      name: z.string(),
      email: z.string(),
      status: z.enum(MCP_SIGNER_STATUSES),
      sent_at: iso.nullable(),
      viewed_at: iso.nullable(),
      signed_at: iso.nullable(),
      declined_at: iso.nullable(),
    }),
  ),
  pending_signers: z.array(z.object({ id: uuid, name: z.string(), email: z.string() })),
  next_action: z.enum(MCP_NEXT_ACTIONS),
  can_remind_at: iso.nullable(),
  documents: z.array(McpDocumentSchema),
});

export const EnvelopesDownloadUrlOutputSchema = z.object({
  url: z.string(),
  kind: z.enum(['sealed', 'original', 'audit']),
  document_id: uuid.optional(),
  expires_in_seconds: z.number().int(),
});

export const EnvelopesListPendingOutputSchema = z.object({
  items: z.array(
    z.object({
      envelope_id: uuid,
      title: z.string(),
      envelope_status: envelopeStatus,
      signer_id: uuid,
      name: z.string(),
      email: z.string(),
      sent_at: iso.nullable(),
      viewed_at: iso.nullable(),
    }),
  ),
  next_cursor: z.string().nullable(),
});

export const EnvelopesListEventsOutputSchema = z.object({
  events: z.array(
    z.object({
      id: uuid,
      event_type: z.enum(EVENT_TYPES),
      actor_kind: z.enum(ACTOR_KINDS),
      signer_id: uuid.nullable(),
      created_at: iso,
      metadata: z.record(z.string(), z.unknown()),
    }),
  ),
  next_cursor: z.string().nullable(),
});

/**
 * Tool error body (`isError: true`). `slug` is the same slug
 * `HttpExceptionFilter` returns as `{ error }`. `message` is a fixed
 * sentence and never echoes document text. `next_steps` is empty when the
 * owner has to act in Seald.
 */
export const McpToolErrorSchema = z.object({
  slug: z.string(),
  message: z.string(),
  retryable: z.boolean(),
  retry_after_seconds: z.number().int().positive().optional(),
  /**
   * A Seald app page the owner opens to unblock the call (connect Drive,
   * pick a file). Never carries a token.
   */
  url: z.string().optional(),
  next_steps: z.array(z.object({ tool: z.string(), args: z.record(z.string(), z.unknown()) })),
});

export type MeGetInput = z.infer<typeof MeGetInputSchema>;
export type MeGetOutput = z.infer<typeof MeGetOutputSchema>;
export type EnvelopesSearchInput = z.infer<typeof EnvelopesSearchInputSchema>;
export type EnvelopesSearchOutput = z.infer<typeof EnvelopesSearchOutputSchema>;
export type EnvelopeIdInput = z.infer<typeof EnvelopeIdInputSchema>;
export type McpEnvelope = z.infer<typeof McpEnvelopeSchema>;
export type McpSigner = z.infer<typeof McpSignerSchema>;
export type McpField = z.infer<typeof McpFieldSchema>;
export type EnvelopesStatusOutput = z.infer<typeof EnvelopesStatusOutputSchema>;
export type EnvelopesDownloadUrlInput = z.infer<typeof EnvelopesDownloadUrlInputSchema>;
export type EnvelopesDownloadUrlOutput = z.infer<typeof EnvelopesDownloadUrlOutputSchema>;
export type EnvelopesListPendingInput = z.infer<typeof EnvelopesListPendingInputSchema>;
export type EnvelopesListPendingOutput = z.infer<typeof EnvelopesListPendingOutputSchema>;
export type EnvelopesListEventsInput = z.infer<typeof EnvelopesListEventsInputSchema>;
export type EnvelopesListEventsOutput = z.infer<typeof EnvelopesListEventsOutputSchema>;
export type McpToolError = z.infer<typeof McpToolErrorSchema>;
