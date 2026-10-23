import { ConflictException, HttpException, Injectable, Logger } from '@nestjs/common';
import { isFeatureEnabled } from 'shared';
import { EnvelopeDocumentsService } from '../envelopes/documents/envelope-documents.service';
import {
  EnvelopesRepository,
  type UpdateDraftMetadataPatch,
} from '../envelopes/envelopes.repository';
import { EnvelopesService } from '../envelopes/envelopes.service';
import { SigningOrderService } from '../signing/signing-order.service';
import { StorageService } from '../storage/storage.service';
import { TemplateApplyService } from '../templates/template-apply.service';
import { TemplatesRepository } from '../templates/templates.repository';
import { deriveSlots } from './bulk-schema';
import { BulkRepository, type BulkBatchRecord, type BulkRowRecord } from './bulk.repository';
import { canvasHeightOf, placementsFor } from './template-placements';

export type RowOutcome =
  | { readonly kind: 'sent' }
  | { readonly kind: 'failed'; readonly code: string }
  /** A transient problem (storage, database): try the row again. */
  | { readonly kind: 'retry'; readonly code: string };

const PALETTE = ['#818CF8', '#34D399', '#F59E0B', '#F472B6', '#60A5FA', '#A78BFA'] as const;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;
const TITLE_MAX = 200;
const SLUG = /^[a-z0-9_]+$/;

/** A row problem that will not get better by retrying. */
class RowFailure extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

/**
 * Creates and sends the one envelope of one claimed row, through the same
 * services the app uses: `EnvelopesService` (create, upload, signers, fields,
 * send), `TemplateApplyService` (server-side layout expansion), the WP-03
 * documents service for the upload while `multiDocumentEnvelopes` is on, and
 * `SigningOrderService` (WP-05).
 *
 * Idempotent, so a restart never double-sends. The row stores its
 * `envelope_id` right after the draft exists. A resumed row re-uses that
 * draft and every step either replaces (upload, fields, order) or looks
 * the signer up by email first. An envelope that is already past `draft`
 * means an earlier attempt sent it: the row is marked sent and nothing is
 * sent again. `EnvelopesService.send` is itself an atomic draft flip, so two
 * racing workers cannot both send.
 */
@Injectable()
export class BulkRowProcessor {
  private readonly log = new Logger(BulkRowProcessor.name);

  constructor(
    private readonly envelopes: EnvelopesService,
    private readonly envelopesRepo: EnvelopesRepository,
    private readonly documents: EnvelopeDocumentsService,
    private readonly signingOrder: SigningOrderService,
    private readonly templates: TemplatesRepository,
    private readonly applySvc: TemplateApplyService,
    private readonly storage: StorageService,
    private readonly rows: BulkRepository,
  ) {}

  async process(batch: BulkBatchRecord, row: BulkRowRecord, now: Date): Promise<RowOutcome> {
    try {
      await this.run(batch, row, now);
      return { kind: 'sent' };
    } catch (err) {
      if (err instanceof RowFailure) return { kind: 'failed', code: err.code };
      if (err instanceof HttpException && err.getStatus() < 500) {
        const message = err.message;
        return { kind: 'failed', code: SLUG.test(message) ? message : 'send_failed' };
      }
      this.log.warn(
        `bulk row ${row.id} attempt ${row.attempts} failed: ${err instanceof Error ? err.name : 'unknown'}`,
      );
      return { kind: 'retry', code: 'send_failed' };
    }
  }

  private async run(batch: BulkBatchRecord, row: BulkRowRecord, now: Date): Promise<void> {
    const owner = batch.owner_id;
    if (batch.template_id === null) throw new RowFailure('template_not_found');
    const template = await this.templates.findOneByOwner(owner, batch.template_id);
    if (!template) throw new RowFailure('template_not_found');
    const derived = deriveSlots(template);
    if (!derived.ok || derived.slots.length !== batch.slot_count) {
      throw new RowFailure('template_changed');
    }
    const pdfPath = await this.templates.getExamplePdfPath(owner, template.id);
    if (!pdfPath) throw new RowFailure('template_no_example_pdf');

    let envelope = row.envelope_id
      ? await this.envelopesRepo.findByIdForOwner(owner, row.envelope_id)
      : null;
    // An earlier attempt already sent this envelope: done, and nothing more is sent.
    if (envelope && envelope.status !== 'draft') return;

    const pdf = await this.storage.download(pdfPath);
    if (!envelope) {
      const first = row.recipients[0];
      const title = (row.title ?? `${template.title} - ${first?.name ?? ''}`).slice(0, TITLE_MAX);
      envelope = await this.envelopes.createDraft(
        owner,
        { title },
        { ip: null, user_agent: 'bulk-send' },
      );
      // From here a restart resumes this draft instead of making another.
      await this.rows.setRowEnvelope(row.id, envelope.id);
    }
    const envelopeId = envelope.id;

    await this.applyOptions(batch, owner, envelopeId, now);

    if (!envelope.original_sha256) {
      if (isFeatureEnabled('multiDocumentEnvelopes')) {
        await this.documents.replacePrimary(owner, envelopeId, pdf);
      } else {
        await this.envelopes.uploadOriginal(owner, envelopeId, pdf);
      }
    }

    // Signers, one per slot, found by email first so a resume adds nobody twice.
    const current = await this.envelopesRepo.findByIdForOwner(owner, envelopeId);
    if (!current) throw new RowFailure('envelope_not_found');
    const signerIds: string[] = [];
    for (const [i, recipient] of row.recipients.entries()) {
      const existing = current.signers.find(
        (s) => s.email.toLowerCase() === recipient.email.toLowerCase(),
      );
      if (existing) {
        signerIds.push(existing.id);
        continue;
      }
      const roster = template.last_signers[i];
      const added = await this.envelopes.addSigner(owner, envelopeId, {
        email: recipient.email,
        name: recipient.name,
        color:
          roster && HEX_COLOR.test(roster.color)
            ? roster.color
            : (PALETTE[i % PALETTE.length] as string),
      });
      signerIds.push(added.id);
    }

    // Server-side template expansion (WP-12) onto this document's pages.
    const geometry = await canvasHeightOf(pdf);
    const applied = await this.applySvc.apply(owner, template.id, geometry.pages);
    const placements = placementsFor(applied.fields, geometry, derived.slotOfRole, signerIds);
    await this.envelopes.replaceFields(owner, envelopeId, placements);

    if (batch.options.signing_order === 'sequential' && isFeatureEnabled('signingOrder')) {
      await this.signingOrder.setOrder(owner, envelopeId, {
        delivery_mode: 'sequential',
        signers: signerIds.map((signer_id, i) => ({ signer_id, signing_order: i + 1 })),
      });
    }

    try {
      // WP-26: a batch the owner approved for an agent stamps `metadata.mcp`.
      const mcp = batch.options.mcp;
      await this.envelopes.send(
        owner,
        envelopeId,
        { email: batch.sender_email, name: batch.sender_name },
        { ip: null, user_agent: 'bulk-send' },
        mcp
          ? { mcp, newRecipientEmails: new Set(batch.options.new_recipient_emails ?? []) }
          : undefined,
      );
    } catch (err) {
      // Another worker (or the attempt that crashed) already flipped it.
      if (err instanceof ConflictException) return;
      throw err;
    }
    await this.templates.incrementUseCount(owner, template.id);
  }

  /** Expiry and reminder cadence, counted from the moment of sending. */
  private async applyOptions(
    batch: BulkBatchRecord,
    owner: string,
    envelopeId: string,
    now: Date,
  ): Promise<void> {
    const { expires_in_days, reminder } = batch.options;
    const patch: UpdateDraftMetadataPatch = {
      ...(expires_in_days !== undefined
        ? { expires_at: new Date(now.getTime() + expires_in_days * 86_400_000).toISOString() }
        : {}),
      ...(reminder !== undefined && isFeatureEnabled('customReminders')
        ? {
            reminder_first_after_days: reminder.first_after_days,
            reminder_interval_days: reminder.interval_days,
            reminder_max: reminder.max,
          }
        : {}),
    };
    if (Object.keys(patch).length === 0) return;
    await this.envelopes.patchDraft(owner, envelopeId, patch);
  }
}
