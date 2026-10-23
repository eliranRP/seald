import { DocumentsUploadInputSchema, McpStagedDocumentSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { WRITE_ANNOTATIONS } from '../prepare/draft-helpers';

/** `documents_upload` → `StagedUploadsService.stageInline` (step 8b, inline path). */
export const documentsUploadTool = defineWriteTool({
  name: 'documents_upload',
  title: 'Upload a small file',
  description:
    'Uploads one file of up to 700 KB as base64 (content_base64) and returns a document_id. PDF is kept as-is; a .docx is converted to PDF. The type is read from the bytes, not the file name. For larger files (up to 25 MB) use documents_upload_start. The upload is staged: attach it with envelopes_add_document, envelopes_upload_pdf or envelopes_prepare within 24 hours. Counts toward a daily limit of 20 documents. Requires idempotency_key and dry_run.',
  step: 'step-8b',
  scopes: ['documents:write'],
  annotations: WRITE_ANNOTATIONS,
  input: DocumentsUploadInputSchema,
  output: McpStagedDocumentSchema,
  preview: async (args, ctx) =>
    ctx.services.uploads.previewInline(ctx.principal.ownerId, args, ctx.now),
  handler: async (args, ctx) =>
    ctx.services.uploads.stageInline(ctx.principal.ownerId, args, ctx.now),
});
