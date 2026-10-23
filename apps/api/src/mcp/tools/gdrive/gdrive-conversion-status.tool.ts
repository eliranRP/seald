import { GdriveConversionJobInputSchema, GdriveImportOutputSchema } from 'shared';
import { defineTool } from '../../tool';
import { DRIVE_READ_ANNOTATIONS } from './gdrive-annotations';

/**
 * `gdrive_conversion_status` → `GET /integrations/gdrive/conversion/:jobId`
 * (step 8d). A poll: once the job is done it stages the converted PDF
 * (once; a repeated poll returns the same document_id), so from the
 * agent's side it is a read.
 */
export const gdriveConversionStatusTool = defineTool({
  name: 'gdrive_conversion_status',
  title: 'Check a Drive import',
  description:
    'Checks a gdrive_import that returned conversion_pending. Returns conversion_pending until the file is converted, then done with its document_id. Poll every few seconds.',
  step: 'step-8d',
  scopes: ['gdrive:read', 'documents:write'],
  annotations: { ...DRIVE_READ_ANNOTATIONS, openWorldHint: false },
  requiresFlags: ['gdriveIntegration'],
  input: GdriveConversionJobInputSchema,
  output: GdriveImportOutputSchema,
  handler: async (args, ctx) =>
    ctx.services.drive.conversionStatus(ctx.principal.ownerId, args.job_id, ctx.now),
});
