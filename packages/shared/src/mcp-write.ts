import { z } from 'zod';
import {
  DELIVERY_MODES,
  EnvelopeDocumentSchema,
  MAX_ENVELOPE_DOCUMENTS,
  MAX_SIGNING_ORDER,
  hexColor,
  iso,
  sha256,
  uuid,
} from './envelope-contract';
import { ALL_FIELD_KINDS } from './field-meta';
import { REMINDER_CADENCE_BOUNDS } from './reminders';
import { MCP_LIST_LIMIT_MAX, McpFieldSchema, McpSignerSchema } from './mcp';

/**
 * MCP write tools (docs/design/mcp-server.md steps 8a, 8b, 8c, 8d; parity
 * plan WP-19). Every mutating tool takes a required `idempotency_key` and
 * a required `dry_run`; a dry run validates and returns
 * `{ dry_run: true, would }` without writing.
 */

// ---------------------------------------------------------------------------
// Limits
// ---------------------------------------------------------------------------

/** Largest decoded file `documents_upload` takes inline (base64 under the 1 MB JSON limit). */
export const MCP_UPLOAD_INLINE_MAX_BYTES = 700 * 1024;
/** Base64 length of {@link MCP_UPLOAD_INLINE_MAX_BYTES}, padded. */
export const MCP_UPLOAD_INLINE_MAX_BASE64 = Math.ceil(MCP_UPLOAD_INLINE_MAX_BYTES / 3) * 4;
/** The existing 25 MB PDF cap (`MAX_PDF_BYTES`). */
export const MCP_UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
/** Lifetime of the presigned PUT `documents_upload_start` returns. */
export const MCP_UPLOAD_PUT_TTL_SECONDS = 300;
/** A staged upload not attached within this long is swept. */
export const MCP_UPLOAD_STAGING_TTL_SECONDS = 24 * 60 * 60;
/** Completed uploads (inline, presigned or Drive) per owner per UTC day. */
export const MCP_UPLOAD_DAILY_CAP = 20;
/** How long `gdrive_import` waits for a conversion before `conversion_pending`. */
export const MCP_DRIVE_IMPORT_WAIT_SECONDS = 25;
/** Most signers `envelopes_prepare` adds in one call. */
export const MCP_PREPARE_MAX_SIGNERS = 20;
/** Most fields one placement call writes (the HTTP route's cap). */
export const MCP_MAX_FIELDS = 500;

// ---------------------------------------------------------------------------
// Shared pieces
// ---------------------------------------------------------------------------

export const McpIdempotencyKeySchema = z.string().min(8).max(200);

/** The two fields every mutating tool requires. */
const write = {
  /** Same key + same arguments within 24 hours returns the first result. */
  idempotency_key: McpIdempotencyKeySchema,
  /** `true`: validate only, write nothing, return `{ dry_run: true, would }`. */
  dry_run: z.boolean(),
};

/** What a dry run returns instead of the tool's normal output. */
export const McpDryRunOutputSchema = z.object({
  dry_run: z.literal(true),
  would: z.record(z.string(), z.unknown()),
});

const filename = z.string().trim().min(1).max(255);
const title = z.string().trim().min(1).max(200);
const signerName = z.string().trim().min(1).max(200);
const email = z.string().trim().toLowerCase().pipe(z.email());

/** A file staged by `documents_upload`, `documents_upload_complete` or `gdrive_import`. */
export const McpStagedDocumentSchema = z.object({
  /** Pass this as `document_id` to `envelopes_add_document`, `envelopes_upload_pdf` or `envelopes_prepare`. */
  document_id: uuid,
  filename: z.string().nullable(),
  mime: z.literal('application/pdf'),
  page_count: z.number().int().positive(),
  byte_length: z.number().int().positive(),
  sha256,
  /** Null in v1: nothing renders page images yet. */
  thumbnail_url: z.string().nullable(),
  /** Attach before this time; an unattached upload is deleted after it. */
  expires_at: iso,
  source: z.enum(['upload', 'gdrive']),
});

// ---------------------------------------------------------------------------
// 8b — uploads
// ---------------------------------------------------------------------------

export const DocumentsUploadInputSchema = z.strictObject({
  /** The file, base64. PDF, or a .docx that is converted to PDF. At most 700 KB decoded. */
  content_base64: z.string().min(4).max(MCP_UPLOAD_INLINE_MAX_BASE64),
  filename,
  ...write,
});

export const DocumentsUploadStartInputSchema = z.strictObject({
  filename,
  /** Optional size hint; above the 25 MB cap the call fails before a URL is made. */
  byte_length: z.number().int().positive().optional(),
  ...write,
});

export const DocumentsUploadStartOutputSchema = z.object({
  upload_id: uuid,
  /** Presigned URL. PUT the bytes here, with `headers`. Expires in `expires_in_seconds`. */
  upload_url: z.string(),
  method: z.literal('PUT'),
  headers: z.record(z.string(), z.string()),
  expires_in_seconds: z.number().int().positive(),
  max_bytes: z.number().int().positive(),
});

export const DocumentsUploadCompleteInputSchema = z.strictObject({
  upload_id: uuid,
  ...write,
});

export const EnvelopesUploadPdfInputSchema = z.strictObject({
  envelope_id: uuid,
  /** A completed, unattached upload. It replaces the envelope's first document. */
  document_id: uuid,
  ...write,
});

export const EnvelopesUploadPdfOutputSchema = z.object({
  pages: z.number().int().positive(),
  sha256,
  documents: z.array(EnvelopeDocumentSchema),
});

export const EnvelopesAddDocumentInputSchema = z.strictObject({
  envelope_id: uuid,
  /** A completed, unattached upload, appended as the envelope's next document. */
  document_id: uuid,
  /** Defaults to the uploaded file name. */
  title: title.optional(),
  ...write,
});

export const EnvelopesAddDocumentOutputSchema = z.object({
  document: EnvelopeDocumentSchema,
  documents: z.array(EnvelopeDocumentSchema),
});

// ---------------------------------------------------------------------------
// 8d — Google Drive
// ---------------------------------------------------------------------------

export const GDRIVE_MIME_FILTERS = ['pdf', 'doc', 'docx', 'all'] as const;

export const GdriveListAccountsInputSchema = z.strictObject({});

export const GdriveListAccountsOutputSchema = z.object({
  accounts: z.array(
    z.object({
      id: uuid,
      google_email: z.string(),
      connected_at: iso,
      token_status: z.enum(['live', 'reconnect_required']),
    }),
  ),
});

export const GdriveConnectUrlInputSchema = z.strictObject({});

export const GdriveConnectUrlOutputSchema = z.object({
  url: z.string(),
  note: z.string(),
});

const driveFileId = z
  .string()
  .regex(/^[A-Za-z0-9_-]{1,256}$/)
  .describe('A Drive file id from gdrive_list_files or gdrive_search_files.');

export const GdriveListFilesInputSchema = z.strictObject({
  /** Optional when the owner has one connected account; required with several. */
  account_id: uuid.optional(),
  mime: z.enum(GDRIVE_MIME_FILTERS).optional(),
  limit: z.number().int().min(1).max(MCP_LIST_LIMIT_MAX).optional(),
  cursor: z.string().min(1).max(1024).optional(),
});

export const GdriveSearchFilesInputSchema = z.strictObject({
  /** Substring of the file name. */
  q: z.string().trim().min(1).max(200),
  account_id: uuid.optional(),
  mime: z.enum(GDRIVE_MIME_FILTERS).optional(),
  limit: z.number().int().min(1).max(MCP_LIST_LIMIT_MAX).optional(),
  cursor: z.string().min(1).max(1024).optional(),
});

export const GdriveFilesOutputSchema = z.object({
  account_id: uuid,
  files: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      mime_type: z.string(),
      modified_time: z.string().nullable(),
      size: z.number().int().nullable(),
    }),
  ),
  next_cursor: z.string().nullable(),
});

export const GdriveImportInputSchema = z
  .strictObject({
    file_id: driveFileId.optional(),
    /** A Drive or Docs share link; parsed to a file id. */
    share_url: z.string().url().max(2048).optional(),
    account_id: uuid.optional(),
    ...write,
  })
  .refine((v) => (v.file_id === undefined) !== (v.share_url === undefined), {
    message: 'exactly one of file_id or share_url',
  });

/** `done` with the staged document, or `conversion_pending` with a job to poll. */
export const GdriveImportOutputSchema = z.object({
  status: z.enum(['done', 'conversion_pending']),
  job_id: uuid.nullable(),
  document: McpStagedDocumentSchema.nullable(),
});

export const GdriveConversionJobInputSchema = z.strictObject({ job_id: uuid });

export const GdriveConversionCancelInputSchema = z.strictObject({ job_id: uuid, ...write });

export const GdriveConversionCancelOutputSchema = z.object({ cancelled: z.literal(true) });

// ---------------------------------------------------------------------------
// 8c — prepare a draft
// ---------------------------------------------------------------------------

/** Metadata `envelopes_update` and `envelopes_prepare` share (PATCH /envelopes/:id). */
const metadata = {
  /** Draft only. Between 1 and 90 days from now while custom reminders are on. */
  expires_at: iso.optional(),
  /** At most 10, 32 characters each. Lower-cased and de-duplicated. */
  tags: z.array(z.string().max(32)).max(10).optional(),
  reminders_enabled: z.boolean().optional(),
  reminder_first_after_days: z
    .number()
    .int()
    .min(REMINDER_CADENCE_BOUNDS.firstAfterDays.min)
    .max(REMINDER_CADENCE_BOUNDS.firstAfterDays.max)
    .optional(),
  reminder_interval_days: z
    .number()
    .int()
    .min(REMINDER_CADENCE_BOUNDS.intervalDays.min)
    .max(REMINDER_CADENCE_BOUNDS.intervalDays.max)
    .optional(),
  reminder_max: z
    .number()
    .int()
    .min(REMINDER_CADENCE_BOUNDS.maxReminders.min)
    .max(REMINDER_CADENCE_BOUNDS.maxReminders.max)
    .optional(),
  /** How date fields render (field options must be on). */
  date_format: z.string().min(1).max(40).optional(),
  /** IANA timezone for date fields (field options must be on). */
  timezone: z.string().min(1).max(64).optional(),
};

export const EnvelopesCreateInputSchema = z.strictObject({ title, ...write });

export const EnvelopesUpdateInputSchema = z
  .strictObject({ envelope_id: uuid, title: title.optional(), ...metadata, ...write })
  .refine(
    (v) =>
      Object.keys(v).some((k) => k !== 'envelope_id' && k !== 'idempotency_key' && k !== 'dry_run'),
    { message: 'nothing to update' },
  );

export const EnvelopeWriteInputSchema = z.strictObject({ envelope_id: uuid, ...write });

export const EnvelopesDeleteDraftOutputSchema = z.object({ deleted: z.literal(true) });

const signerShape = {
  /** A saved contact; or give `email` and `name` instead. */
  contact_id: uuid.optional(),
  email: email.optional(),
  name: signerName.optional(),
  color: hexColor.optional(),
};

const oneSignerShape = (v: {
  contact_id?: string | undefined;
  email?: string | undefined;
  name?: string | undefined;
}): boolean =>
  v.contact_id !== undefined
    ? v.email === undefined && v.name === undefined
    : v.email !== undefined && v.name !== undefined;

export const EnvelopesAddSignerInputSchema = z
  .strictObject({ envelope_id: uuid, ...signerShape, ...write })
  .refine(oneSignerShape, { message: 'contact_id, or email and name' });

export const EnvelopesRemoveSignerInputSchema = z.strictObject({
  envelope_id: uuid,
  signer_id: uuid,
  ...write,
});

export const McpRemovedOutputSchema = z.object({ removed: z.literal(true) });

/** One field to place. Coordinates are 0–1 from the top-left; `page` is 1-based in its document. */
const fieldPlacement = {
  kind: z.enum(ALL_FIELD_KINDS),
  page: z.number().int().min(1),
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().min(0).max(1).nullable().optional(),
  height: z.number().min(0).max(1).nullable().optional(),
  required: z.boolean().optional(),
  /** Per-kind options (field options must be on). Radio and dropdown need `options`. */
  meta: z.record(z.string(), z.unknown()).optional(),
};

export const McpFieldPlacementSchema = z.strictObject({
  signer_id: uuid,
  /** Omitted: the envelope's first document. */
  document_id: uuid.optional(),
  ...fieldPlacement,
});

export const EnvelopesPlaceFieldsInputSchema = z.strictObject({
  envelope_id: uuid,
  fields: z.array(McpFieldPlacementSchema).max(MCP_MAX_FIELDS),
  /** `replace` (default) swaps every field; `append` keeps the placed ones and adds these. */
  mode: z.enum(['replace', 'append']).optional(),
  ...write,
});

export const EnvelopesPlaceFieldsOutputSchema = z.object({ fields: z.array(McpFieldSchema) });

export const EnvelopesSuggestFieldsInputSchema = z.strictObject({
  envelope_id: uuid,
  /** Only this signer. Default: every signer. */
  signer_id: uuid.optional(),
  /** The document that carries the signatures. Default: the last one. */
  document_id: uuid.optional(),
});

export const EnvelopesSuggestFieldsOutputSchema = z.object({
  fields: z.array(McpFieldPlacementSchema).max(MCP_MAX_FIELDS),
  note: z.string(),
});

export const EnvelopesSetSigningOrderInputSchema = z.strictObject({
  envelope_id: uuid,
  delivery_mode: z.enum(DELIVERY_MODES),
  /** Every signer once. Signers with the same order form one step. */
  signers: z
    .array(
      z.strictObject({
        signer_id: uuid,
        signing_order: z.number().int().min(1).max(MAX_SIGNING_ORDER),
      }),
    )
    .max(MAX_SIGNING_ORDER)
    .optional(),
  ...write,
});

export const EnvelopesReorderDocumentsInputSchema = z.strictObject({
  envelope_id: uuid,
  /** Every document id of the envelope, once, in the new order. */
  document_ids: z.array(uuid).min(1).max(MAX_ENVELOPE_DOCUMENTS),
  ...write,
});

export const EnvelopesDocumentsOutputSchema = z.object({
  documents: z.array(EnvelopeDocumentSchema),
});

export const EnvelopesRemoveDocumentInputSchema = z.strictObject({
  envelope_id: uuid,
  document_id: uuid,
  ...write,
});

/** One source document for `envelopes_prepare`. */
export const McpPrepareDocumentSchema = z
  .strictObject({
    /** A completed upload (`documents_upload`, `documents_upload_complete` or `gdrive_import`). */
    document_id: uuid.optional(),
    /** A Drive file the app can read; imported first (needs gdrive:read). */
    gdrive_file_id: driveFileId.optional(),
    /** Only with `gdrive_file_id`. */
    account_id: uuid.optional(),
    title: title.optional(),
  })
  .refine((v) => (v.document_id === undefined) !== (v.gdrive_file_id === undefined), {
    message: 'exactly one of document_id or gdrive_file_id',
  })
  .refine((v) => v.account_id === undefined || v.gdrive_file_id !== undefined, {
    message: 'account_id only with gdrive_file_id',
  });

export const McpPrepareSignerSchema = z
  .strictObject({
    ...signerShape,
    /** Sequential delivery only; signers with the same order form one step. */
    signing_order: z.number().int().min(1).max(MAX_SIGNING_ORDER).optional(),
  })
  .refine(oneSignerShape, { message: 'contact_id, or email and name' });

/** A field of `envelopes_prepare`: signer by index in `signers`, document by index in `documents`. */
export const McpPrepareFieldSchema = z.strictObject({
  /** 0-based index into `signers`. */
  signer_index: z
    .number()
    .int()
    .min(0)
    .max(MCP_PREPARE_MAX_SIGNERS - 1),
  /** 0-based index into the documents; default 0. */
  document_index: z
    .number()
    .int()
    .min(0)
    .max(MAX_ENVELOPE_DOCUMENTS - 1)
    .optional(),
  ...fieldPlacement,
});

export const EnvelopesPrepareInputSchema = z
  .strictObject({
    title,
    /** In order. The first is document 1. */
    documents: z.array(McpPrepareDocumentSchema).min(1).max(MAX_ENVELOPE_DOCUMENTS).optional(),
    /** Shorthand for one uploaded document. */
    document_id: uuid.optional(),
    /** Shorthand for one source: `{ upload_id }` or `{ gdrive_file_id }`. */
    source: z
      .strictObject({
        upload_id: uuid.optional(),
        gdrive_file_id: driveFileId.optional(),
        account_id: uuid.optional(),
      })
      .refine((v) => (v.upload_id === undefined) !== (v.gdrive_file_id === undefined), {
        message: 'exactly one of upload_id or gdrive_file_id',
      })
      .optional(),
    signers: z.array(McpPrepareSignerSchema).max(MCP_PREPARE_MAX_SIGNERS).optional(),
    fields: z.array(McpPrepareFieldSchema).max(MCP_MAX_FIELDS).optional(),
    /** Needs signing order to be on. Default parallel. */
    delivery_mode: z.enum(DELIVERY_MODES).optional(),
    ...metadata,
    ...write,
  })
  .refine(
    (v) => [v.documents, v.document_id, v.source].filter((x) => x !== undefined).length === 1,
    { message: 'exactly one of documents, document_id or source' },
  );

export const McpSignerOutputSchema = McpSignerSchema;

export type DocumentsUploadInput = z.infer<typeof DocumentsUploadInputSchema>;
export type McpStagedDocument = z.infer<typeof McpStagedDocumentSchema>;
export type GdriveImportOutput = z.infer<typeof GdriveImportOutputSchema>;
export type EnvelopesPrepareInput = z.infer<typeof EnvelopesPrepareInputSchema>;
export type McpPrepareDocument = z.infer<typeof McpPrepareDocumentSchema>;
export type EnvelopesSuggestFieldsInput = z.infer<typeof EnvelopesSuggestFieldsInputSchema>;
export type McpFieldPlacement = z.infer<typeof McpFieldPlacementSchema>;
