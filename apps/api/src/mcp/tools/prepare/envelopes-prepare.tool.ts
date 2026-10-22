import { BadRequestException, Logger, NotFoundException } from '@nestjs/common';
import {
  EnvelopesPrepareInputSchema,
  McpEnvelopeSchema,
  isFeatureEnabled,
  type EnvelopesPrepareInput,
} from 'shared';
import { normalizeFieldPlacements } from '../../../envelopes/field-placement.service';
import { McpToolFailure } from '../../tool-errors';
import { defineWriteTool, type McpToolContext } from '../../tool';
import {
  WRITE_ANNOTATIONS,
  loadMcpEnvelope,
  metadataPatch,
  previewMetadata,
  requireScope,
} from './draft-helpers';
import { replaceFields } from './envelopes-place-fields.tool';

const log = new Logger('envelopes_prepare');

type SourceDoc =
  | { readonly kind: 'upload'; readonly id: string; readonly title?: string }
  | {
      readonly kind: 'gdrive';
      readonly file_id: string;
      readonly account_id?: string;
      readonly title?: string;
    };

/** `documents[]`, `document_id` and `source` are three spellings of the same list. */
function sourcesOf(args: EnvelopesPrepareInput): SourceDoc[] {
  if (args.document_id !== undefined) return [{ kind: 'upload', id: args.document_id }];
  if (args.source !== undefined) {
    if (args.source.upload_id !== undefined) return [{ kind: 'upload', id: args.source.upload_id }];
    if (args.source.gdrive_file_id !== undefined) {
      return [
        {
          kind: 'gdrive',
          file_id: args.source.gdrive_file_id,
          ...(args.source.account_id !== undefined ? { account_id: args.source.account_id } : {}),
        },
      ];
    }
  }
  return (args.documents ?? []).map((d): SourceDoc => {
    const title = d.title !== undefined ? { title: d.title } : {};
    if (d.document_id !== undefined) return { kind: 'upload', id: d.document_id, ...title };
    return {
      kind: 'gdrive',
      file_id: d.gdrive_file_id ?? '',
      ...(d.account_id !== undefined ? { account_id: d.account_id } : {}),
      ...title,
    };
  });
}

const invalid = (): BadRequestException => new BadRequestException('validation_error');

/**
 * Everything that can be checked before anything is written: flags,
 * scopes, indexes, signing order, metadata. Shared by the dry run and the
 * real call, so a call that would fail on these writes nothing.
 */
function check(args: EnvelopesPrepareInput, ctx: McpToolContext): SourceDoc[] {
  const sources = sourcesOf(args);
  if (sources.some((s) => s.kind === 'gdrive')) {
    if (!isFeatureEnabled('gdriveIntegration')) throw invalid();
    requireScope(ctx, 'gdrive:read');
  }
  if (sources.length > 1 && !isFeatureEnabled('multiDocumentEnvelopes')) throw invalid();
  const uploads = sources.flatMap((s) => (s.kind === 'upload' ? [s.id] : []));
  if (new Set(uploads).size !== uploads.length) throw invalid();

  const signers = args.signers ?? [];
  const emails = signers.flatMap((s) => (s.email !== undefined ? [s.email] : []));
  if (new Set(emails).size !== emails.length) {
    throw new BadRequestException('signer_email_taken');
  }
  for (const f of args.fields ?? []) {
    if (f.signer_index >= signers.length) throw invalid();
    if ((f.document_index ?? 0) >= sources.length) throw invalid();
  }
  const ordered = signers.some((s) => s.signing_order !== undefined);
  if ((args.delivery_mode !== undefined || ordered) && !isFeatureEnabled('signingOrder')) {
    throw invalid();
  }
  if (ordered && args.delivery_mode === 'parallel') throw invalid();
  previewMetadata(metadataPatch(args, ctx.now));
  return sources;
}

/**
 * `envelopes_prepare` (step 8c): one call from files to a draft. It
 * composes the same service calls the single-purpose tools make (create,
 * attach, add signers, signing order, metadata, fields). Draft only: no
 * send, never `approval_pending`, until step 10.
 */
export const envelopesPrepareTool = defineWriteTool({
  name: 'envelopes_prepare',
  title: 'Prepare a draft',
  description:
    'Creates a draft in one call: title, its documents in order (documents[] of document_id from an upload or gdrive_file_id from Drive; or the document_id or source shorthands), signers (contact_id, or email and name; signing_order for sequential delivery), fields (signer_index and document_index point into those lists; coordinates 0 to 1 from the top-left, 1-based page) and optional expiry, tags and reminder settings. Nothing is sent: the result is a draft envelope for the owner to review and send in Seald. A Drive file that is still converting fails with conversion_pending; poll gdrive_conversion_status and pass the document_id. Requires idempotency_key and dry_run.',
  step: 'step-8c',
  scopes: ['envelopes:write', 'documents:write'],
  annotations: WRITE_ANNOTATIONS,
  input: EnvelopesPrepareInputSchema,
  output: McpEnvelopeSchema,
  preview: async (args, ctx) => {
    const owner = ctx.principal.ownerId;
    const sources = check(args, ctx);
    const documents: Record<string, unknown>[] = [];
    for (const s of sources) {
      if (s.kind === 'upload') {
        const staged = await ctx.services.uploads.assertAttachable(owner, s.id, ctx.now);
        documents.push({
          document_id: s.id,
          pages: staged.page_count,
          title: s.title ?? staged.filename,
        });
      } else {
        documents.push(
          await ctx.services.drive.previewImport(owner, {
            file_id: s.file_id,
            ...(s.account_id !== undefined ? { account_id: s.account_id } : {}),
          }),
        );
      }
    }
    return {
      title: args.title,
      status: 'draft',
      documents,
      signers: (args.signers ?? []).length,
      fields: (args.fields ?? []).length,
      delivery_mode: args.delivery_mode ?? 'parallel',
      sends: false,
    };
  },
  handler: async (args, ctx) => {
    const owner = ctx.principal.ownerId;
    const sources = check(args, ctx);

    // Drive sources become staged uploads first, so the draft is only
    // created once every document is in hand.
    const uploadIds: { readonly id: string; readonly title: string | null }[] = [];
    for (const s of sources) {
      if (s.kind === 'upload') {
        await ctx.services.uploads.assertAttachable(owner, s.id, ctx.now);
        uploadIds.push({ id: s.id, title: s.title ?? null });
        continue;
      }
      const imported = await ctx.services.drive.importFile(
        owner,
        { file_id: s.file_id, ...(s.account_id !== undefined ? { account_id: s.account_id } : {}) },
        ctx.now,
      );
      if (imported.status !== 'done') {
        throw new McpToolFailure('conversion_pending', {
          retryable: true,
          retry_after_seconds: 5,
          next_steps: [{ tool: 'gdrive_conversion_status', args: { job_id: imported.job_id } }],
        });
      }
      uploadIds.push({ id: imported.document.document_id, title: s.title ?? null });
    }

    const draft = await ctx.services.envelopes.createDraft(owner, { title: args.title });
    const id = draft.id;
    try {
      const multi = isFeatureEnabled('multiDocumentEnvelopes');
      for (const [i, u] of uploadIds.entries()) {
        if (!multi && i === 0) {
          await ctx.services.uploads.attachAsPrimary(owner, id, u.id, ctx.now);
        } else {
          await ctx.services.uploads.attachAsDocument(owner, id, u.id, u.title, ctx.now);
        }
      }

      const signerIds: string[] = [];
      for (const s of args.signers ?? []) {
        const signer = await ctx.services.envelopes.addSigner(owner, id, {
          ...(s.contact_id !== undefined ? { contact_id: s.contact_id } : {}),
          ...(s.email !== undefined ? { email: s.email } : {}),
          ...(s.name !== undefined ? { name: s.name } : {}),
          ...(s.color !== undefined ? { color: s.color } : {}),
        });
        signerIds.push(signer.id);
      }

      const ordered = (args.signers ?? []).some((s) => s.signing_order !== undefined);
      if (args.delivery_mode !== undefined || ordered) {
        const mode = args.delivery_mode ?? 'sequential';
        await ctx.services.signingOrder.setOrder(owner, id, {
          delivery_mode: mode,
          ...(mode === 'sequential'
            ? {
                signers: (args.signers ?? []).map((s, i) => ({
                  signer_id: signerIds[i] ?? '',
                  signing_order: s.signing_order ?? i + 1,
                })),
              }
            : {}),
        });
      }

      const { title: _title, ...patch } = metadataPatch(args, ctx.now);
      if (Object.keys(patch).length > 0) {
        await ctx.services.envelopes.patchDraft(owner, id, patch);
      }

      if ((args.fields ?? []).length > 0) {
        const docs = multi ? await ctx.services.documents.list(owner, id) : [];
        const placements = (args.fields ?? []).map((f) => {
          const signer_id = signerIds[f.signer_index];
          if (signer_id === undefined) throw invalid();
          const doc = multi ? docs[f.document_index ?? 0] : undefined;
          if (multi && !doc) throw new NotFoundException('document_not_found');
          return {
            signer_id,
            kind: f.kind,
            page: f.page,
            x: f.x,
            y: f.y,
            ...(f.width !== undefined ? { width: f.width } : {}),
            ...(f.height !== undefined ? { height: f.height } : {}),
            ...(f.required !== undefined ? { required: f.required } : {}),
            ...(doc ? { document_id: doc.id } : {}),
            ...(f.meta !== undefined ? { meta: f.meta } : {}),
          };
        });
        await replaceFields(ctx, id, normalizeFieldPlacements(placements));
      }
    } catch (err) {
      // Leave nothing half-built: the draft goes, the error stands.
      await ctx.services.envelopes.deleteDraft(owner, id).catch(() => {
        log.warn(`envelopes_prepare: cleanup of a failed draft did not finish owner=${owner}`);
      });
      throw err;
    }
    return loadMcpEnvelope(ctx, id);
  },
});
