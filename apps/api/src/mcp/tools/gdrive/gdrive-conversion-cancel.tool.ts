import { GdriveConversionCancelInputSchema, GdriveConversionCancelOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { DRIVE_WRITE_ANNOTATIONS } from './gdrive-annotations';

/** `gdrive_conversion_cancel` → `DELETE /integrations/gdrive/conversion/:jobId` (step 8d). */
export const gdriveConversionCancelTool = defineWriteTool({
  name: 'gdrive_conversion_cancel',
  title: 'Cancel a Drive import',
  description:
    'Cancels a gdrive_import that is still conversion_pending. Nothing is staged. Requires idempotency_key and dry_run.',
  step: 'step-8d',
  scopes: ['gdrive:read', 'documents:write'],
  annotations: { ...DRIVE_WRITE_ANNOTATIONS, openWorldHint: false },
  requiresFlags: ['gdriveIntegration'],
  input: GdriveConversionCancelInputSchema,
  output: GdriveConversionCancelOutputSchema,
  preview: async (args, ctx) => {
    await ctx.services.drive.assertCancellable(ctx.principal.ownerId, args.job_id);
    return { job_id: args.job_id };
  },
  handler: async (args, ctx) => {
    await ctx.services.drive.cancelConversion(ctx.principal.ownerId, args.job_id);
    return { cancelled: true as const };
  },
});
