import { TemplatesDeleteInputSchema, TemplatesDeleteOutputSchema } from 'shared';
import { TEMPLATE_WRITE_ANNOTATIONS } from '../templates/template-helpers';
import { defineWriteTool } from '../../tool';

/** `templates_delete` → `TemplatesService.remove`, as `DELETE /templates/:id` (step 15). */
export const templatesDeleteTool = defineWriteTool({
  name: 'templates_delete',
  title: 'Delete a template',
  description:
    'Deletes a saved template for good. Envelopes already made from it are not changed. Its direct link, if it has one, goes with it, and a bulk batch that has not finished fails its remaining rows. Requires idempotency_key and dry_run.',
  step: 'step-15',
  scopes: ['templates:write'],
  annotations: { ...TEMPLATE_WRITE_ANNOTATIONS, destructiveHint: true },
  atomic: true,
  input: TemplatesDeleteInputSchema,
  output: TemplatesDeleteOutputSchema,
  preview: async (args, ctx) => {
    const t = await ctx.services.templates.get(ctx.principal.ownerId, args.template_id);
    return { template_id: t.id, removes: true };
  },
  handler: async (args, ctx) => {
    await ctx.services.templates.remove(ctx.principal.ownerId, args.template_id);
    return { removed: true as const };
  },
});
