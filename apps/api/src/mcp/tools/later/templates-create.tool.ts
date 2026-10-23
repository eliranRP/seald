import { McpTemplateSchema, TemplatesCreateInputSchema } from 'shared';
import type { CreateTemplateDto } from '../../../templates/dto/create-template.dto';
import { TEMPLATE_WRITE_ANNOTATIONS } from '../templates/template-helpers';
import { defineWriteTool } from '../../tool';
import { NOT_A_PDF_NOTE, assertFlags, dtoOf, toMcpTemplate } from './template-author-helpers';

/** `templates_create` → `TemplatesService.create`, as `POST /templates` (step 15). */
export const templatesCreateTool = defineWriteTool({
  name: 'templates_create',
  title: 'Create a template',
  description: `Saves a reusable field layout: title, field_layout entries (type signature, initial, date, text or checkbox; pageRule all, allButLast, first, last or a page number; x and y in PDF points from the top left; signerIndex or signerRoleId binds a field to an entry of last_signers) and optionally description, tags and the last_signers roster (id, name, email, color). Field type uses the template spelling: initial, not initials. ${NOT_A_PDF_NOTE} Requires idempotency_key and dry_run.`,
  step: 'step-15',
  scopes: ['templates:write'],
  annotations: TEMPLATE_WRITE_ANNOTATIONS,
  atomic: true,
  input: TemplatesCreateInputSchema,
  output: McpTemplateSchema,
  preview: (args) => {
    assertFlags(args);
    return Promise.resolve({
      title: args.title,
      fields: args.field_layout.length,
      last_signers: (args.last_signers ?? []).length,
    });
  },
  handler: async (args, ctx) => {
    assertFlags(args);
    const dto = { ...dtoOf(args), title: args.title, field_layout: args.field_layout };
    return toMcpTemplate(
      await ctx.services.templates.create(ctx.principal.ownerId, dto as CreateTemplateDto),
    );
  },
});
