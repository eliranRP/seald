import { ContactsDeleteInputSchema, ContactsDeleteOutputSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { CONTACT_WRITE_ANNOTATIONS } from './contact-helpers';

/** `contacts_delete` → `ContactsService.remove`, as `DELETE /contacts/:id` (step 12). */
export const contactsDeleteTool = defineWriteTool({
  name: 'contacts_delete',
  title: 'Delete a contact',
  description:
    'Deletes a saved contact. Envelopes already made keep their signers. A contact that does not exist is contact_not_found. Requires idempotency_key and dry_run.',
  step: 'step-12',
  scopes: ['contacts:write'],
  annotations: { ...CONTACT_WRITE_ANNOTATIONS, destructiveHint: true },
  input: ContactsDeleteInputSchema,
  output: ContactsDeleteOutputSchema,
  preview: async (args, ctx) => {
    const c = await ctx.services.contacts.get(ctx.principal.ownerId, args.contact_id);
    return { contact_id: c.id, email: c.email };
  },
  handler: async (args, ctx) => {
    await ctx.services.contacts.remove(ctx.principal.ownerId, args.contact_id);
    return { removed: true as const };
  },
});
