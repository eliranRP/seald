import { HttpException } from '@nestjs/common';
import { z } from 'zod';
import {
  ContactsImportInputSchema,
  ContactsImportOutputSchema,
  type ContactsImportRowSchema,
} from 'shared';
import { defineWriteTool, type McpToolContext } from '../../tool';
import { httpExceptionSlug } from '../../tool-errors';
import { CONTACT_WRITE_ANNOTATIONS, defaultColor } from './contact-helpers';

type Row = z.infer<typeof ContactsImportRowSchema>;
type RowResult = z.infer<typeof ContactsImportOutputSchema>['rows'][number];

const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(320));
const nameSchema = z.string().trim().min(1).max(200);
const colorSchema = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

type Parsed =
  | { readonly ok: true; readonly name: string; readonly email: string; readonly color?: string }
  | { readonly ok: false; readonly email: string };

function parseRow(row: Row): Parsed {
  const email = emailSchema.safeParse(row.email);
  const name = nameSchema.safeParse(row.name);
  const color = row.color === undefined ? undefined : colorSchema.safeParse(row.color);
  if (!email.success || !name.success || (color !== undefined && !color.success)) {
    return { ok: false, email: row.email.trim().toLowerCase().slice(0, 320) };
  }
  return {
    ok: true,
    name: name.data,
    email: email.data,
    ...(color?.success ? { color: color.data } : {}),
  };
}

const PLACEHOLDER_ID = '00000000-0000-4000-8000-000000000000';

/**
 * Upsert by email, row by row. One bad row does not roll back the others;
 * the runner's idempotency key covers the whole call. `write` false is the
 * dry run: the same decisions, nothing stored.
 */
async function run(
  rows: readonly Row[],
  ctx: McpToolContext,
  write: boolean,
): Promise<RowResult[]> {
  const owner = ctx.principal.ownerId;
  const byEmail = new Map((await ctx.services.contacts.list(owner)).map((c) => [c.email, c.id]));
  const out: RowResult[] = [];
  for (const raw of rows) {
    const row = parseRow(raw);
    if (!row.ok) {
      out.push({ email: row.email, status: 'error', slug: 'validation_error' });
      continue;
    }
    const existing = byEmail.get(row.email);
    try {
      if (existing !== undefined) {
        if (write) {
          await ctx.services.contacts.update(owner, existing, {
            name: row.name,
            ...(row.color !== undefined ? { color: row.color } : {}),
          });
        }
        out.push({
          email: row.email,
          status: 'updated',
          ...(existing !== PLACEHOLDER_ID ? { id: existing } : {}),
        });
      } else if (write) {
        const created = await ctx.services.contacts.create(owner, {
          name: row.name,
          email: row.email,
          color: row.color ?? defaultColor(row.email),
        });
        byEmail.set(row.email, created.id);
        out.push({ email: row.email, status: 'created', id: created.id });
      } else {
        // Dry run: a repeat of this email later in the call is an update.
        byEmail.set(row.email, PLACEHOLDER_ID);
        out.push({ email: row.email, status: 'created' });
      }
    } catch (err) {
      if (!(err instanceof HttpException) || err.getStatus() >= 500) throw err;
      out.push({ email: row.email, status: 'error', slug: httpExceptionSlug(err) });
    }
  }
  return out;
}

/** `contacts_import` → `ContactsService.create` / `update`, upsert by email (step 12). */
export const contactsImportTool = defineWriteTool({
  name: 'contacts_import',
  title: 'Import contacts',
  description:
    'Saves up to 100 contacts in one call, upserting by email: a new email is created, a saved one gets the new name (and color if given). Each row reports created, updated or error with a slug; one bad row does not stop the others. Requires idempotency_key and dry_run.',
  step: 'step-12',
  scopes: ['contacts:write'],
  annotations: CONTACT_WRITE_ANNOTATIONS,
  input: ContactsImportInputSchema,
  output: ContactsImportOutputSchema,
  preview: async (args, ctx) => ({ rows: await run(args.rows, ctx, false) }),
  handler: async (args, ctx) => ({ rows: await run(args.rows, ctx, true) }),
});
