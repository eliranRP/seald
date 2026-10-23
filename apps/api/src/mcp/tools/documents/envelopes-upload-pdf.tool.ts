import { EnvelopesUploadPdfInputSchema, EnvelopesUploadPdfOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { toMcpDocument } from '../envelope-mappers';
import { DESTRUCTIVE_ANNOTATIONS, requireDraft } from '../prepare/draft-helpers';

/**
 * `envelopes_upload_pdf` → the call `POST /envelopes/:id/upload` makes
 * (`replacePrimary` with multi-document envelopes on, `uploadOriginal`
 * off), fed from a completed staged upload (step 8b).
 */
export const envelopesUploadPdfTool = defineWriteTool({
  name: 'envelopes_upload_pdf',
  title: 'Set the first document',
  description:
    "Puts a completed upload (document_id from documents_upload, documents_upload_complete or gdrive_import) on a draft as its first document, replacing that document's PDF if it had one. To add more documents use envelopes_add_document. An upload attaches once. Requires idempotency_key and dry_run.",
  step: 'step-8b',
  scopes: ['envelopes:write'],
  annotations: DESTRUCTIVE_ANNOTATIONS,
  input: EnvelopesUploadPdfInputSchema,
  output: EnvelopesUploadPdfOutputSchema,
  preview: async (args, ctx) => {
    const staged = await ctx.services.uploads.assertAttachable(
      ctx.principal.ownerId,
      args.document_id,
      ctx.now,
    );
    const envelope = await requireDraft(ctx, args.envelope_id);
    return {
      envelope_id: envelope.id,
      replaces_existing: envelope.original_sha256 !== null,
      pages: staged.page_count,
      sha256: staged.sha256,
    };
  },
  handler: async (args, ctx) => {
    const owner = ctx.principal.ownerId;
    const envelope = await ctx.services.uploads.attachAsPrimary(
      owner,
      args.envelope_id,
      args.document_id,
      ctx.now,
    );
    const documents = await ctx.services.documents.list(owner, args.envelope_id);
    return {
      pages: envelope.original_pages ?? 0,
      sha256: envelope.original_sha256 ?? '',
      documents: documents.map(toMcpDocument),
    };
  },
});
