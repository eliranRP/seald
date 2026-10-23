import { ConflictException } from '@nestjs/common';
import { ContactsUpdateInputSchema, McpContactSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { CONTACT_WRITE_ANNOTATIONS, toMcpContact } from './contact-helpers';

/** `contacts_update` → `ContactsService.update`, as `PATCH /contacts/:id` (step 12). */
export const contactsUpdateTool = defineWriteTool({
  name: 'contacts_update',
  title: 'Update a contact',
  description:
    'Changes a saved contact: any of name, email, color. An email another contact already uses is email_taken. Envelopes already made keep the signer details they were made with. Requires idempotency_key and dry_run.',
  step: 'step-12',
  scopes: ['contacts:write'],
  annotations: CONTACT_WRITE_ANNOTATIONS,
  input: ContactsUpdateInputSchema,
  output: McpContactSchema,
  preview: async (args, ctx) => {
    const owner = ctx.principal.ownerId;
    const current = await ctx.services.contacts.get(owner, args.contact_id);
    if (args.email !== undefined && args.email !== current.email) {
      const all = await ctx.services.contacts.list(owner);
      if (all.some((c) => c.email === args.email && c.id !== current.id)) {
        throw new ConflictException('email_taken');
      }
    }
    return {
      contact_id: current.id,
      name: args.name ?? current.name,
      email: args.email ?? current.email,
      color: args.color ?? current.color,
    };
  },
  handler: async (args, ctx) =>
    toMcpContact(
      await ctx.services.contacts.update(ctx.principal.ownerId, args.contact_id, {
        ...(args.name !== undefined ? { name: args.name } : {}),
        ...(args.email !== undefined ? { email: args.email } : {}),
        ...(args.color !== undefined ? { color: args.color } : {}),
      }),
    ),
});
