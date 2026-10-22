import { DocumentsUploadCompleteInputSchema, McpStagedDocumentSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { WRITE_ANNOTATIONS } from '../prepare/draft-helpers';

/** `documents_upload_complete` → `StagedUploadsService.completeUpload` (step 8b). */
export const documentsUploadCompleteTool = defineWriteTool({
  name: 'documents_upload_complete',
  title: 'Finish a large upload',
  description:
    'Finishes an upload started with documents_upload_start, after the bytes were PUT to upload_url. Seald re-checks the size and file type, converts a .docx to PDF, and returns the document_id (the same id as upload_id) and page_count. Requires idempotency_key and dry_run.',
  step: 'step-8b',
  scopes: ['documents:write'],
  annotations: WRITE_ANNOTATIONS,
  input: DocumentsUploadCompleteInputSchema,
  output: McpStagedDocumentSchema,
  preview: async (args, ctx) =>
    ctx.services.uploads.previewComplete(ctx.principal.ownerId, args.upload_id, ctx.now),
  handler: async (args, ctx) =>
    ctx.services.uploads.completeUpload(ctx.principal.ownerId, args.upload_id, ctx.now),
});
