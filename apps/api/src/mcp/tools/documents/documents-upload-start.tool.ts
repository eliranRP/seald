import { DocumentsUploadStartInputSchema, DocumentsUploadStartOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { WRITE_ANNOTATIONS } from '../prepare/draft-helpers';

/** `documents_upload_start` → `StagedUploadsService.startUpload` (step 8b, presigned PUT). */
export const documentsUploadStartTool = defineWriteTool({
  name: 'documents_upload_start',
  title: 'Start a large upload',
  description:
    'Starts an upload of one file up to 25 MB (PDF or .docx). Returns upload_id and a presigned upload_url that expires in 5 minutes: PUT the raw bytes there with the given headers, then call documents_upload_complete with the upload_id. The URL is a credential for that one upload; do not share or log it. Requires idempotency_key and dry_run.',
  step: 'step-8b',
  scopes: ['documents:write'],
  annotations: WRITE_ANNOTATIONS,
  signedUrlFields: ['upload_url'],
  input: DocumentsUploadStartInputSchema,
  output: DocumentsUploadStartOutputSchema,
  preview: async (args, ctx) =>
    ctx.services.uploads.previewStart(
      ctx.principal.ownerId,
      {
        filename: args.filename,
        ...(args.byte_length !== undefined ? { byte_length: args.byte_length } : {}),
      },
      ctx.now,
    ),
  handler: async (args, ctx) =>
    ctx.services.uploads.startUpload(
      ctx.principal.ownerId,
      {
        filename: args.filename,
        ...(args.byte_length !== undefined ? { byte_length: args.byte_length } : {}),
      },
      ctx.now,
    ),
});
