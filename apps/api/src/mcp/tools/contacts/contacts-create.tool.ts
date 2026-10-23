import { ConflictException } from '@nestjs/common';
import { ContactsCreateInputSchema, McpContactSchema } from 'shared';
import { defineWriteTool } from '../../tool';
import { CONTACT_WRITE_ANNOTATIONS, defaultColor, toMcpContact } from './contact-helpers';

/** `contacts_create` → `ContactsService.create`, as `POST /contacts` (step 12). */
export const contactsCreateTool = defineWriteTool({
  name: 'contacts_create',
  title: 'Create a contact',
  description:
    'Saves a contact: name, email and an optional #RRGGBB color (picked from the signer palette when omitted). An email already saved is email_taken; use contacts_update or contacts_import to change a contact. Requires idempotency_key and dry_run.',
  step: 'step-12',
  scopes: ['contacts:write'],
  annotations: CONTACT_WRITE_ANNOTATIONS,
  input: ContactsCreateInputSchema,
  output: McpContactSchema,
  preview: async (args, ctx) => {
    const existing = await ctx.services.contacts.list(ctx.principal.ownerId);
    if (existing.some((c) => c.email === args.email)) throw new ConflictException('email_taken');
    return { name: args.name, email: args.email, color: args.color ?? defaultColor(args.email) };
  },
  handler: async (args, ctx) =>
    toMcpContact(
      await ctx.services.contacts.create(ctx.principal.ownerId, {
        name: args.name,
        email: args.email,
        color: args.color ?? defaultColor(args.email),
      }),
    ),
});
