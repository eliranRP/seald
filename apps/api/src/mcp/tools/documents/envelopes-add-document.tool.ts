import { ConflictException } from '@nestjs/common';
import {
  EnvelopesAddDocumentInputSchema,
  EnvelopesAddDocumentOutputSchema,
  MAX_ENVELOPE_DOCUMENTS,
} from 'shared';
import { defineWriteTool } from '../../tool';
import { toMcpDocument } from '../envelope-mappers';
import { WRITE_ANNOTATIONS, requireDraft } from '../prepare/draft-helpers';

/**
 * `envelopes_add_document` → `EnvelopeDocumentsService.add`, as
 * `POST /envelopes/:id/documents` (WP-03), fed from a completed staged
 * upload (step 8b). One upload attaches one document.
 */
export const envelopesAddDocumentTool = defineWriteTool({
  name: 'envelopes_add_document',
  title: 'Add a document',
  description:
    'Appends a completed upload (document_id from documents_upload, documents_upload_complete or gdrive_import) to a draft as its next document; the first one fills document 1. Up to 10 documents. title defaults to the file name. Returns the envelope document and the full list in order. An upload attaches once. Requires idempotency_key and dry_run.',
  step: 'step-8b',
  scopes: ['envelopes:write'],
  annotations: WRITE_ANNOTATIONS,
  requiresFlags: ['multiDocumentEnvelopes'],
  input: EnvelopesAddDocumentInputSchema,
  output: EnvelopesAddDocumentOutputSchema,
  preview: async (args, ctx) => {
    const staged = await ctx.services.uploads.assertAttachable(
      ctx.principal.ownerId,
      args.document_id,
      ctx.now,
    );
    const envelope = await requireDraft(ctx, args.envelope_id);
    const docs = envelope.documents ?? [];
    const filled = docs.filter((d) => d.original_sha256 !== null).length;
    if (filled >= MAX_ENVELOPE_DOCUMENTS) throw new ConflictException('too_many_documents');
    return {
      envelope_id: envelope.id,
      ord: filled === 0 ? 1 : docs.length + 1,
      title: args.title ?? staged.filename,
      pages: staged.page_count,
    };
  },
  handler: async (args, ctx) => {
    const owner = ctx.principal.ownerId;
    const document = await ctx.services.uploads.attachAsDocument(
      owner,
      args.envelope_id,
      args.document_id,
      args.title ?? null,
      ctx.now,
    );
    const documents = await ctx.services.documents.list(owner, args.envelope_id);
    return { document: toMcpDocument(document), documents: documents.map(toMcpDocument) };
  },
});
