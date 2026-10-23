import { z } from 'zod';
import { ApprovalPendingResultSchema } from './approvals';
import { BULK_BATCH_STATUSES, BULK_ROW_STATUSES } from './bulk-send';
import { DELIVERY_MODES, MAX_SIGNING_ORDER, hexColor, iso, uuid } from './envelope-contract';
import { MCP_TEMPLATE_MAX_SIGNERS } from './mcp-contacts-templates';
import { McpIdempotencyKeySchema } from './mcp-write';
import { AccessAuthSettingsSchema, SIGNER_AUTH_METHODS } from './signer-access-auth';
import { TEMPLATE_FIELD_TYPES } from './templates';

/**
 * MCP step 15, the "Later" list (docs/design/mcp-server.md § Later;
 * parity plan WP-26): fix a signer, change an expiry, bulk send from a
 * template, signer access codes, and template authoring. Every mutating
 * tool takes a required `idempotency_key` and `dry_run`.
 */

const write = {
  idempotency_key: McpIdempotencyKeySchema,
  dry_run: z.boolean(),
};

const personName = z.string().trim().min(1).max(200);
const personEmail = z.string().trim().toLowerCase().pipe(z.email().max(320));

// ---------------------------------------------------------------------------
// Fix a signer / change an expiry (through owner approval)
// ---------------------------------------------------------------------------

/** Corrects a name or an email of a signer who has not signed, and re-invites them. */
export const EnvelopesFixSignerInputSchema = z
  .strictObject({
    envelope_id: uuid,
    signer_id: uuid,
    name: personName.optional(),
    email: personEmail.optional(),
    ...write,
  })
  .refine((v) => v.name !== undefined || v.email !== undefined, {
    message: 'at least one of name or email',
  });

export const EnvelopesFixSignerOutputSchema = ApprovalPendingResultSchema;

export const EnvelopesChangeExpiryInputSchema = z.strictObject({
  envelope_id: uuid,
  /** New expiry, ISO 8601 with a zone or offset. At least a day from now, at most 90 days (UTC). */
  expires_at: z.string().datetime({ offset: true }),
  ...write,
});

export const EnvelopesChangeExpiryOutputSchema = ApprovalPendingResultSchema;

// ---------------------------------------------------------------------------
// Bulk send from a template (one approval for the batch)
// ---------------------------------------------------------------------------

/** MCP is capped at the per-owner daily send cap, not the app's 100 rows. */
export const MCP_BULK_MAX_ROWS = 20;

const bulkSigner = z.strictObject({
  name: personName,
  email: z.string().trim().min(1).max(254),
});

export const EnvelopesBulkSendFromTemplateInputSchema = z.strictObject({
  template_id: uuid,
  /** One entry per envelope; `signers` has one entry per template slot, in slot order. */
  rows: z
    .array(
      z.strictObject({
        title: z.string().trim().min(1).max(200).optional(),
        signers: z.array(bulkSigner).min(1).max(MCP_TEMPLATE_MAX_SIGNERS),
      }),
    )
    .min(1)
    .max(MCP_BULK_MAX_ROWS),
  ...write,
});

export const EnvelopesBulkSendFromTemplateOutputSchema = ApprovalPendingResultSchema.extend({
  batch_id: uuid,
});
export type EnvelopesBulkSendFromTemplateOutput = z.infer<
  typeof EnvelopesBulkSendFromTemplateOutputSchema
>;

export const BatchesGetInputSchema = z.strictObject({ batch_id: uuid });

export const BatchesGetOutputSchema = z.object({
  batch_id: uuid,
  status: z.enum(BULK_BATCH_STATUSES),
  rows: z.array(
    z.object({
      title: z.string().nullable(),
      envelope_id: uuid.nullable(),
      status: z.enum(BULK_ROW_STATUSES),
      /** Why a row is invalid or failed. */
      slug: z.string().optional(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Signer access codes (WP-10)
// ---------------------------------------------------------------------------

const authMethod = z.enum(SIGNER_AUTH_METHODS);

export const EnvelopesGetAccessAuthInputSchema = z.strictObject({ envelope_id: uuid });
export const EnvelopesGetAccessAuthOutputSchema = AccessAuthSettingsSchema;

export const EnvelopesSetAccessAuthInputSchema = z
  .strictObject({
    envelope_id: uuid,
    access_auth: authMethod.optional(),
    action_auth: authMethod.optional(),
    /** A signer value of `null` inherits the envelope default. */
    signers: z
      .array(
        z.strictObject({
          signer_id: uuid,
          access_auth: authMethod.nullable().optional(),
          action_auth: authMethod.nullable().optional(),
        }),
      )
      .max(100)
      .optional(),
    ...write,
  })
  .refine(
    (v) => v.access_auth !== undefined || v.action_auth !== undefined || v.signers !== undefined,
    { message: 'at least one setting' },
  );
export const EnvelopesSetAccessAuthOutputSchema = AccessAuthSettingsSchema;

// ---------------------------------------------------------------------------
// Template authoring
// ---------------------------------------------------------------------------

const pageRule = z.union([z.enum(['all', 'allButLast', 'first', 'last']), z.number().int().min(1)]);

/** A layout entry in the template's own spelling (`initial`, not `initials`). */
export const McpTemplateFieldInputSchema = z.strictObject({
  type: z.enum(TEMPLATE_FIELD_TYPES),
  pageRule,
  /** PDF points, top-left origin. */
  x: z.number(),
  y: z.number(),
  label: z.string().max(100).optional(),
  /** Zero-based index into `last_signers`. */
  signerIndex: z.number().int().min(0).optional(),
  /** `id` of the `last_signers` entry this field belongs to. */
  signerRoleId: z.string().min(1).max(64).optional(),
});

export const McpTemplateSignerInputSchema = z.strictObject({
  id: z.string().min(1).max(64),
  name: personName.max(120),
  email: z.string().trim().toLowerCase().max(254).pipe(z.email()),
  color: hexColor,
  /** 1-based signing step; only while signing order is on. */
  signing_order: z.number().int().min(1).max(MAX_SIGNING_ORDER).optional(),
});

const templateBody = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  cover_color: hexColor.nullable().optional(),
  field_layout: z.array(McpTemplateFieldInputSchema).max(200),
  tags: z.array(z.string().max(48)).max(32).optional(),
  last_signers: z.array(McpTemplateSignerInputSchema).max(50).optional(),
  /** Only while signing order is on. */
  delivery_mode: z.enum(DELIVERY_MODES).optional(),
};

export const TemplatesCreateInputSchema = z.strictObject({ ...templateBody, ...write });

export const TemplatesUpdateInputSchema = z
  .strictObject({
    template_id: uuid,
    title: templateBody.title.optional(),
    description: templateBody.description,
    cover_color: templateBody.cover_color,
    field_layout: templateBody.field_layout.optional(),
    tags: templateBody.tags,
    last_signers: templateBody.last_signers,
    delivery_mode: templateBody.delivery_mode,
    ...write,
  })
  .refine(
    (v) =>
      v.title !== undefined ||
      v.description !== undefined ||
      v.cover_color !== undefined ||
      v.field_layout !== undefined ||
      v.tags !== undefined ||
      v.last_signers !== undefined ||
      v.delivery_mode !== undefined,
    { message: 'at least one field to change' },
  );

export const TemplatesDeleteInputSchema = z.strictObject({ template_id: uuid, ...write });
export const TemplatesDeleteOutputSchema = z.object({ removed: z.literal(true) });

/** The template as an authoring tool returns it: id, counts, no owner id. */
export const McpTemplateSchema = z.object({
  template_id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  cover_color: z.string().nullable(),
  tags: z.array(z.string()),
  delivery_mode: z.enum(DELIVERY_MODES).optional(),
  fields: z.number().int().min(0),
  signer_slots: z.number().int().min(1),
  has_example_pdf: z.boolean(),
  uses_count: z.number().int().min(0),
});
export type McpTemplate = z.infer<typeof McpTemplateSchema>;

// ---------------------------------------------------------------------------
// Agent activity (owner-side list; `GET /agent-activity`)
// ---------------------------------------------------------------------------

/** What an owner sees for one thing a key did or asked for. */
export const AGENT_ACTIVITY_OUTCOMES = ['done', 'waiting', 'denied', 'expired', 'failed'] as const;
export type AgentActivityOutcome = (typeof AGENT_ACTIVITY_OUTCOMES)[number];

export const AGENT_ACTIVITY_SOURCES = ['event', 'approval'] as const;

export const AgentActivityItemSchema = z.object({
  /** Event id or approval id; unique within `source`. */
  id: uuid,
  source: z.enum(AGENT_ACTIVITY_SOURCES),
  at: iso,
  /** The key's name as it was when the row was written ("Key 2"). */
  key_name: z.string().nullable(),
  key_prefix: z.string().nullable(),
  /** The MCP tool, or the action kind when none is recorded. */
  tool: z.string(),
  outcome: z.enum(AGENT_ACTIVITY_OUTCOMES),
  envelope_id: uuid.nullable(),
  /** Document title. Data, not instructions. */
  title: z.string().nullable(),
  /** `true` when the owner approved while signed in. */
  approved_by_session: z.boolean().nullable(),
});
export type AgentActivityItem = z.infer<typeof AgentActivityItemSchema>;

export const AgentActivityResponseSchema = z.object({
  items: z.array(AgentActivityItemSchema),
  next_cursor: z.string().nullable(),
});
export type AgentActivityResponse = z.infer<typeof AgentActivityResponseSchema>;
