import { BadRequestException, Logger } from '@nestjs/common';
import {
  EnvelopesCreateFromTemplateInputSchema,
  EnvelopesCreateFromTemplateOutputSchema,
  isFeatureEnabled,
  type Template,
} from 'shared';
import { normalizeFieldPlacements } from '../../../envelopes/field-placement.service';
import { McpToolFailure } from '../../tool-errors';
import { defineWriteTool, type McpToolContext } from '../../tool';
import { WRITE_ANNOTATIONS, loadMcpEnvelope } from '../prepare/draft-helpers';
import { replaceFields } from '../prepare/envelopes-place-fields.tool';
import { envelopeKind, isRequired, normalizedBox, templateShape } from './template-helpers';

const log = new Logger('envelopes_create_from_template');

interface Plan {
  readonly template: Template;
  readonly pages: number;
  readonly shape: ReturnType<typeof templateShape>;
  readonly fieldCount: number;
}

type Args = (typeof EnvelopesCreateFromTemplateInputSchema)['_output'];

/**
 * Everything that can be checked before anything is written: the template
 * is the owner's and has fields, one signer per slot, no repeated email,
 * the staged upload can still be attached, and the layout lands on at
 * least one page of it. Shared by the dry run and the real call.
 */
async function plan(args: Args, ctx: McpToolContext): Promise<Plan> {
  const owner = ctx.principal.ownerId;
  const template = await ctx.services.templates.get(owner, args.template_id);
  if (template.field_layout.length === 0) throw new McpToolFailure('template_has_no_fields');
  const shape = templateShape(template);
  if (args.signers.length !== shape.slots.length) {
    throw new BadRequestException('template_signer_count_mismatch');
  }
  const emails = args.signers.flatMap((s) => (s.email !== undefined ? [s.email] : []));
  if (new Set(emails).size !== emails.length) throw new BadRequestException('signer_email_taken');
  const staged = await ctx.services.uploads.assertAttachable(owner, args.document_id, ctx.now);
  const applied = await ctx.services.templateApply.apply(owner, template.id, staged.page_count);
  // A numeric page rule past the end of this PDF is skipped; none left is no layout.
  if (applied.fields.length === 0) throw new McpToolFailure('template_has_no_fields');
  return { template, pages: staged.page_count, shape, fieldCount: applied.fields.length };
}

/**
 * `envelopes_create_from_template` (step 13): a draft from a saved
 * template. The layout expands through `TemplateApplyService`, the same
 * call the app makes. No field value is ever written (no prefill). A use
 * counts only after the draft, its signers and its fields all exist.
 */
export const envelopesCreateFromTemplateTool = defineWriteTool({
  name: 'envelopes_create_from_template',
  title: 'Create a draft from a template',
  description:
    'Creates a draft from a saved template: your PDF (document_id from documents_upload or gdrive_import), the template fields laid out on its pages, and one signer per template slot in slot order (templates_get_schema lists the slots; each signer is a contact_id, or email and name). A sequential template keeps its signing order. Nothing is sent and no field values are set: the owner reviews and sends in Seald. The template counts as used only when everything succeeded. Requires idempotency_key and dry_run.',
  step: 'step-13',
  scopes: ['templates:read', 'envelopes:write'],
  annotations: WRITE_ANNOTATIONS,
  input: EnvelopesCreateFromTemplateInputSchema,
  output: EnvelopesCreateFromTemplateOutputSchema,
  preview: async (args, ctx) => {
    const p = await plan(args, ctx);
    return {
      template_id: p.template.id,
      title: args.title,
      status: 'draft',
      pages: p.pages,
      signers: args.signers.length,
      fields: p.fieldCount,
      delivery_mode: p.shape.delivery_mode,
      sends: false,
    };
  },
  handler: async (args, ctx) => {
    const owner = ctx.principal.ownerId;
    const { template, pages, shape } = await plan(args, ctx);
    const applied = await ctx.services.templateApply.apply(owner, template.id, pages);

    const draft = await ctx.services.envelopes.createDraft(owner, { title: args.title });
    const id = draft.id;
    try {
      if (isFeatureEnabled('multiDocumentEnvelopes')) {
        await ctx.services.uploads.attachAsDocument(owner, id, args.document_id, null, ctx.now);
      } else {
        await ctx.services.uploads.attachAsPrimary(owner, id, args.document_id, ctx.now);
      }

      const signerIds: string[] = [];
      for (const s of args.signers) {
        const signer = await ctx.services.envelopes.addSigner(owner, id, {
          ...(s.contact_id !== undefined ? { contact_id: s.contact_id } : {}),
          ...(s.email !== undefined ? { email: s.email } : {}),
          ...(s.name !== undefined ? { name: s.name } : {}),
          ...(s.color !== undefined ? { color: s.color } : {}),
        });
        signerIds.push(signer.id);
      }

      if (shape.delivery_mode === 'sequential') {
        await ctx.services.signingOrder.setOrder(owner, id, {
          delivery_mode: 'sequential',
          signers: shape.slots.map((slot, i) => ({
            signer_id: signerIds[i] ?? '',
            signing_order: slot.signing_order ?? i + 1,
          })),
        });
      }

      const docs = isFeatureEnabled('multiDocumentEnvelopes')
        ? await ctx.services.documents.list(owner, id)
        : [];
      const metaOn = isFeatureEnabled('fieldMetaV2');
      const placements = applied.fields.map((f) => {
        const kind = envelopeKind(f.type);
        const slot = shape.slotOf(f);
        const signer_id = signerIds[slot] ?? signerIds[0];
        if (signer_id === undefined) throw new BadRequestException('validation_error');
        const doc = docs[0];
        return {
          signer_id,
          kind,
          page: f.page,
          ...normalizedBox(kind, f.x, f.y),
          required: isRequired(f),
          ...(f.linkId !== undefined ? { link_id: f.linkId } : {}),
          ...(doc ? { document_id: doc.id } : {}),
          ...(metaOn && f.meta !== undefined ? { meta: f.meta } : {}),
        };
      });
      await replaceFields(ctx, id, normalizeFieldPlacements(placements));
    } catch (err) {
      // Leave nothing half-built: the draft goes, the error stands, no use is counted.
      await ctx.services.envelopes.deleteDraft(owner, id).catch(() => {
        log.warn(`cleanup of a failed draft did not finish owner=${owner}`);
      });
      throw err;
    }

    const used = await ctx.services.templates.use(owner, template.id);
    return {
      template_id: template.id,
      uses_count: used.uses_count,
      envelope: await loadMcpEnvelope(ctx, id),
    };
  },
});
