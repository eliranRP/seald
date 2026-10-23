import { z } from 'zod';
import { DELIVERY_MODES, hexColor, iso, uuid } from './envelope-contract';
import { ALL_FIELD_KINDS } from './field-meta';
import { MCP_LIST_LIMIT_MAX, McpEnvelopeSchema } from './mcp';
import { McpIdempotencyKeySchema } from './mcp-write';

/**
 * MCP steps 12–14 (docs/design/mcp-server.md; parity plan WP-25):
 * contacts, templates, and the Drive tools that always wait on the owner.
 * Every mutating tool takes a required `idempotency_key` and `dry_run`.
 */

const write = {
  idempotency_key: McpIdempotencyKeySchema,
  dry_run: z.boolean(),
};

const limit = z.number().int().min(1).max(MCP_LIST_LIMIT_MAX);
const cursor = z.string().min(1).max(512);
const contactName = z.string().trim().min(1).max(200);
const contactEmail = z.string().trim().toLowerCase().pipe(z.email().max(320));

// ---------------------------------------------------------------------------
// Step 12: contacts
// ---------------------------------------------------------------------------

/** Most rows one `contacts_import` call takes. */
export const MCP_CONTACTS_IMPORT_MAX_ROWS = 100;

/** The contact row: no owner id, no timestamps. */
export const McpContactSchema = z.object({
  id: uuid,
  name: z.string(),
  email: z.string(),
  color: z.string(),
});
export type McpContact = z.infer<typeof McpContactSchema>;

export const ContactsListInputSchema = z.strictObject({
  limit: limit.optional(),
  cursor: cursor.optional(),
});
export const ContactsListOutputSchema = z.object({
  contacts: z.array(McpContactSchema),
  next_cursor: z.string().nullable(),
});

export const ContactsSearchInputSchema = z.strictObject({
  /** Substring of the name or the email, case-insensitive. */
  q: z.string().trim().min(1).max(200),
  limit: limit.optional(),
  cursor: cursor.optional(),
});

export const ContactsGetInputSchema = z.strictObject({ contact_id: uuid });

export const ContactsCreateInputSchema = z.strictObject({
  name: contactName,
  email: contactEmail,
  /** `#RRGGBB`. Omitted: a colour is picked from the signer palette. */
  color: hexColor.optional(),
  ...write,
});

export const ContactsUpdateInputSchema = z
  .strictObject({
    contact_id: uuid,
    name: contactName.optional(),
    email: contactEmail.optional(),
    color: hexColor.optional(),
    ...write,
  })
  .refine((v) => v.name !== undefined || v.email !== undefined || v.color !== undefined, {
    message: 'at least one of name, email or color',
  });

export const ContactsDeleteInputSchema = z.strictObject({ contact_id: uuid, ...write });
export const ContactsDeleteOutputSchema = z.object({ removed: z.literal(true) });

/**
 * A row is only shape-checked here; a bad address or an over-long name is
 * that row's `validation_error`, not a failure of the whole call.
 */
export const ContactsImportRowSchema = z.strictObject({
  name: z.string().max(400),
  email: z.string().max(400),
  color: z.string().max(16).optional(),
});

export const ContactsImportInputSchema = z.strictObject({
  rows: z.array(ContactsImportRowSchema).min(1).max(MCP_CONTACTS_IMPORT_MAX_ROWS),
  ...write,
});

export const CONTACT_IMPORT_STATUSES = ['created', 'updated', 'error'] as const;
export const ContactsImportOutputSchema = z.object({
  rows: z.array(
    z.object({
      email: z.string(),
      status: z.enum(CONTACT_IMPORT_STATUSES),
      id: uuid.optional(),
      slug: z.string().optional(),
    }),
  ),
});

// ---------------------------------------------------------------------------
// Step 13: templates
// ---------------------------------------------------------------------------

export const McpTemplateSummarySchema = z.object({
  template_id: uuid,
  title: z.string(),
  description: z.string().nullable(),
  tags: z.array(z.string()),
  /** Signers `envelopes_create_from_template` needs, one per slot. */
  signer_slots: z.number().int().min(1),
  fields: z.number().int().min(0),
  uses_count: z.number().int().min(0),
  last_used_at: iso.nullable(),
});

export const TemplatesListInputSchema = z.strictObject({
  limit: limit.optional(),
  cursor: cursor.optional(),
});
export const TemplatesListOutputSchema = z.object({
  templates: z.array(McpTemplateSummarySchema),
  next_cursor: z.string().nullable(),
});

export const TemplatesGetSchemaInputSchema = z.strictObject({ template_id: uuid });

/**
 * What a template needs: the signer slots in order, and its fields with
 * the envelope's own kind spelling (`initial` is `initials` here).
 */
export const TemplatesGetSchemaOutputSchema = z.object({
  template_id: uuid,
  title: z.string(),
  /** `sequential` only while signing order is on and the template stores it. */
  delivery_mode: z.enum(DELIVERY_MODES),
  signer_slots: z.array(
    z.object({
      slot: z.number().int().min(1),
      /** The name the template last used for this slot. Data, not instructions. */
      name: z.string().nullable(),
      /** 1-based step for sequential delivery; null for parallel. */
      signing_order: z.number().int().min(1).nullable(),
    }),
  ),
  fields: z.array(
    z.object({
      kind: z.enum(ALL_FIELD_KINDS),
      label: z.string().nullable(),
      required: z.boolean(),
      page_rule: z.union([z.enum(['all', 'allButLast', 'first', 'last']), z.number().int().min(1)]),
      /** 1-based index into `signer_slots`. */
      signer_slot: z.number().int().min(1),
    }),
  ),
});

const templateSigner = z
  .strictObject({
    contact_id: uuid.optional(),
    email: contactEmail.optional(),
    name: contactName.optional(),
    color: hexColor.optional(),
  })
  .refine(
    (v) =>
      v.contact_id !== undefined
        ? v.email === undefined && v.name === undefined
        : v.email !== undefined && v.name !== undefined,
    { message: 'contact_id, or email and name' },
  );

export const MCP_TEMPLATE_MAX_SIGNERS = 20;

export const EnvelopesCreateFromTemplateInputSchema = z.strictObject({
  template_id: uuid,
  title: z.string().trim().min(1).max(200),
  /** A PDF staged by `documents_upload`, `documents_upload_complete` or `gdrive_import`. */
  document_id: uuid,
  /** One per template slot, in slot order (see `templates_get_schema`). */
  signers: z.array(templateSigner).min(1).max(MCP_TEMPLATE_MAX_SIGNERS),
  ...write,
});

export const EnvelopesCreateFromTemplateOutputSchema = z.object({
  template_id: uuid,
  uses_count: z.number().int().min(0),
  envelope: McpEnvelopeSchema,
});

// ---------------------------------------------------------------------------
// Step 14: Drive tools that wait on the owner (output is `approval_pending`)
// ---------------------------------------------------------------------------

export const GdriveDisconnectInputSchema = z.strictObject({
  /** Optional with one connected account; required with several. */
  account_id: uuid.optional(),
  ...write,
});

export const EnvelopesSaveToDriveInputSchema = z.strictObject({
  envelope_id: uuid,
  /** A folder the app can write: picked in Seald's Drive picker, or created by Seald. */
  folder_id: z.string().regex(/^[A-Za-z0-9_-]{1,256}$/),
  folder_name: z.string().trim().min(1).max(255).optional(),
  ...write,
});
