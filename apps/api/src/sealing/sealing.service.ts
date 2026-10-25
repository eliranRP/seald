import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { isFeatureEnabled } from 'shared';
import { APP_ENV } from '../config/config.module';
import { burnInField } from './burn-in-fields';
import type { AppEnv } from '../config/env.schema';
import { insertOutboundEmailIdempotent } from '../email/insert-idempotent';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import {
  buildSignerListHtmlFromSigners,
  buildTimelineHtml,
  type TimelineEventFragment,
} from '../email/template-fragments';
import type { Envelope, EnvelopeEvent, EnvelopeField } from '../envelopes/envelope.entity';
import { eventHash } from '../envelopes/event-hash';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import {
  documentDeclinedPath,
  documentSealedPath,
  legacyOriginalPath,
} from '../envelopes/documents/document-paths';
import {
  EnvelopeDocumentsRepository,
  type EnvelopeDocumentRecord,
} from '../envelopes/documents/envelope-documents.repository';
import { signatureStoragePath } from '../signing/signature-paths';
import { StorageService } from '../storage/storage.service';
import { buildAuditPdf, type AuditDocumentHash } from './audit-pdf';
import { declinedPdfPath } from './declined-pdf-path';
import { DssInjector } from './dss-injector';
import { PadesSigner } from './pades-signer';

/**
 * Sealing pipeline for terminal envelopes. Invoked by the worker when a
 * claim returns a `seal` or `audit_only` job.
 *
 * Multi-file envelopes (WP-03): steps 1-6 run once per document, in
 * `ord` order, each with only its own fields. Every document gets its own
 * PAdES seal (B-T -> B-LT -> B-LTA unchanged). Document 1 keeps the legacy
 * `{id}/sealed.pdf`; the others go to `{id}/documents/{doc_id}/sealed.pdf`.
 * One audit.pdf lists every document's original and sealed hash. A
 * single-document envelope seals exactly as before.
 *
 * seal:
 *   1. Download original.pdf
 *   2. Burn-in each signer's signature.png at their signature/initials fields
 *      + drawText for date/text/email + checkbox stamps
 *   3. Flag `appendCertificate` only: render the certificate in pre-seal
 *      mode (no sealed hash; original hash + event chain head) and append
 *      its pages to the burned-in PDF, so they fall under the seal
 *   4. PadesSigner.sign() (KMS or P12 CMS seal, B-T with a TSA; Noop only
 *      when no provider is configured — see SealingModule)
 *   5. DssInjector: B-T → B-LT (/DSS) → B-LTA (document timestamp)
 *   6. Upload sealed.pdf
 *   7. Generate audit.pdf (events timeline + QR to /verify/{short_code});
 *      it stays the record that carries the sealed SHA-256
 *   8. Upload audit.pdf
 *   9. repo.transitionToSealed (status → completed; no event row)
 *  10. Enqueue `completed` email to the sender and every signer
 *      and append `sealed` if that event is not already recorded
 *      (one row per mailbox; deduped on retry)
 *
 * audit_only:
 *   1. Envelope is already terminal (declined/expired/canceled). Stamp
 *      every page of original.pdf with a "not signed" banner, seal it the
 *      same way (sign + B-LT/B-LTA) and upload it as declined.pdf.
 *   2. Generate audit.pdf. Upload + repo.setAuditFile. No completed emails.
 *
 * Throwing bubbles up to the worker, which records the error via
 * repo.failJob and (if attempts<max) schedules a backoff retry.
 */
@Injectable()
export class SealingService {
  private readonly logger = new Logger(SealingService.name);

  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly storage: StorageService,
    private readonly outboundEmails: OutboundEmailsRepository,
    private readonly pades: PadesSigner,
    private readonly dss: DssInjector,
    @Inject(APP_ENV) private readonly env: AppEnv,
    private readonly documents: EnvelopeDocumentsRepository,
  ) {}

  /**
   * Documents to seal, with the fields that sit on each. An envelope with
   * no document rows (a pre-0022 shape; every row gets one by trigger)
   * seals as one legacy document. With one document every field goes on
   * it unfiltered, so the legacy burn-in input is unchanged.
   */
  private async planDocuments(envelope: Envelope): Promise<SealPlanItem[]> {
    const docs = await this.documents.listByEnvelope(envelope.id);
    const first = docs[0];
    if (first === undefined) {
      return [
        {
          doc: null,
          ord: 1,
          title: envelope.title,
          originalPath: legacyOriginalPath(envelope.id),
          originalSha256: envelope.original_sha256,
          originalPages: envelope.original_pages,
          fields: envelope.fields,
        },
      ];
    }
    const byField = docs.length > 1 ? await this.documents.listFieldDocumentIds(envelope.id) : null;
    return docs.map((doc) => ({
      doc,
      ord: doc.ord,
      title: doc.title,
      originalPath:
        doc.original_file_path ?? (doc.ord === 1 ? legacyOriginalPath(envelope.id) : null),
      originalSha256: doc.original_sha256,
      originalPages: doc.original_pages,
      fields:
        byField === null
          ? envelope.fields
          : envelope.fields.filter(
              (f) => (byField.get(f.id) ?? f.document_id ?? first.id) === doc.id,
            ),
    }));
  }

  /** Runs every step of a seal job in this process (Docker worker, tests). */
  async processSealJob(envelope_id: string): Promise<void> {
    let progress: SealProgress = EMPTY_SEAL_PROGRESS;
    // Same process for every step, so the certificate stays in memory.
    const scratch: SealStepScratch = { inProcess: true };
    for (;;) {
      const step = await this.processSealStep(envelope_id, progress, scratch);
      if (step.done) return;
      progress = step.progress;
    }
  }

  /**
   * One step of a seal job. The Supabase edge worker runs one step per
   * invocation, because the runtime counts CPU per worker and a whole seal
   * does not fit (docs/supabase-native-architecture.md). The caller keeps
   * `progress` between steps; it is plain JSON. Steps, each idempotent:
   *
   *   1. `appendCertificate` only: render the pre-seal certificate once and
   *      park it in Storage, so every document gets the same pages.
   *   2. One document per step: burn-in, sign, B-LT/B-LTA, upload sealed.pdf.
   *      Outside one process (the edge worker) this is two steps: burn-in +
   *      sign, parked at `sealParkedSignedPath`; then B-LT/B-LTA + upload.
   *   3. audit.pdf, the status flip and the completion emails.
   */
  async processSealStep(
    envelope_id: string,
    progress: SealProgress,
    scratch: SealStepScratch = {},
  ): Promise<{ done: true } | { done: false; progress: SealProgress }> {
    const envelope = await this.repo.findByIdWithAll(envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status === 'completed') {
      // A previous attempt sealed the PDF and then died before every
      // completion row was queued. Re-enter only the fan-out; dedupe
      // keys keep it to one mail per party.
      await this.enqueueCompletionEmails(envelope);
      return { done: true };
    }
    if (envelope.status !== 'sealing') {
      // Envelope raced into a non-sealing state (declined, expired). Bail
      // quietly — the worker will mark the job done and no harm done.
      this.logger.warn(
        `seal job for ${envelope_id}: envelope in status ${envelope.status}, skipping`,
      );
      return { done: true };
    }

    const plan = await this.planDocuments(envelope);

    // Events + signer details feed both the optional pre-seal certificate
    // and audit.pdf. The envelope stays `sealing` across steps, so nothing
    // appends an event between the certificate and the audit render.
    const [events, signerDetails] = await Promise.all([
      this.repo.listEventsForEnvelope(envelope_id),
      this.repo.listSignerAuditDetails(envelope_id),
    ]);

    // One certificate for the envelope; with `appendCertificate` the same
    // pages are appended to every document before its seal.
    let certificate: Buffer | null = null;
    if (isFeatureEnabled('appendCertificate')) {
      const certificatePath = sealCertificatePath(envelope_id);
      if (!progress.certificateReady) {
        const rendered = await buildAuditPdf({
          envelope,
          events,
          signerDetails,
          sealedSha256: null,
          sealedPages: null,
          publicUrl: this.env.APP_PUBLIC_URL,
          cmsSealApplied: this.pades.appliesCmsSeal,
          // Unknown before sign(); the pre-seal copy is the hedged "when
          // available" wording either way.
          timestampApplied: true,
          preSeal: { chainHeadSha256: chainHeadHex(events) },
          ...auditDocumentsInput(plan, null),
        });
        if (!scratch.inProcess) {
          await this.storage.upload(certificatePath, rendered, 'application/pdf');
        }
        scratch.certificate = rendered;
        return { done: false, progress: { ...progress, certificateReady: true } };
      }
      certificate = scratch.certificate ?? (await this.storage.download(certificatePath));
    }

    const sealed: SealedDocument[] = [];
    for (const item of plan) {
      const recorded = progress.documents.find((d) => d.ord === item.ord);
      if (recorded) {
        sealed.push({ item, ...recorded });
        continue;
      }
      const done = await this.sealDocument(envelope, item, certificate, progress, scratch);
      if ('parked' in done) {
        return { done: false, progress: { ...progress, pendingUpgrade: done.parked } };
      }
      const rest = withoutPendingUpgrade(progress);
      return {
        done: false,
        progress: { ...rest, documents: [...rest.documents, { ord: item.ord, ...done.record }] },
      };
    }
    for (const done of sealed) {
      if (done.item.doc !== null) {
        await this.documents.setSealed(done.item.doc.id, done.path, done.sha256);
      }
    }
    const primary = sealed[0];
    if (primary === undefined) throw new Error(`seal job for ${envelope_id}: nothing sealed`);

    const auditBytes = await buildAuditPdf({
      envelope,
      events,
      signerDetails,
      sealedSha256: primary.sha256,
      sealedPages: primary.pages,
      publicUrl: this.env.APP_PUBLIC_URL,
      cmsSealApplied: this.pades.appliesCmsSeal,
      timestampApplied: sealed.every((done) => done.timestampApplied),
      ...auditDocumentsInput(plan, sealed),
    });
    const auditPath = `${envelope_id}/audit.pdf`;
    await this.storage.upload(auditPath, auditBytes, 'application/pdf');

    const updated = await this.repo.transitionToSealed(envelope_id, {
      sealed_file_path: primary.path,
      sealed_sha256: primary.sha256,
      audit_file_path: auditPath,
    });
    if (!updated) {
      // The status flip lost. If the winner already marked the envelope
      // completed, still try the fan-out — they may have crashed before
      // it. A cancel/expire leaves the artifacts orphaned.
      const fresh = await this.repo.findByIdWithAll(envelope_id);
      if (fresh?.status === 'completed') {
        await this.enqueueCompletionEmails(fresh);
        return { done: true };
      }
      this.logger.warn(
        `seal job for ${envelope_id}: transitionToSealed lost the race, artifacts orphaned`,
      );
      return { done: true };
    }

    await this.enqueueCompletionEmails(updated);
    if (certificate !== null && !scratch.inProcess) {
      await this.storage.remove([sealCertificatePath(envelope_id)]).catch((err: unknown) => {
        this.logger.warn(
          `seal job for ${envelope_id}: could not remove the parked certificate (${err instanceof Error ? err.message : String(err)})`,
        );
      });
    }
    return { done: true };
  }

  /** Burn-in, PAdES seal and upload of one document (a seal step). */
  private async sealDocument(
    envelope: Envelope,
    item: SealPlanItem,
    certificate: Buffer | null,
    progress: SealProgress,
    scratch: SealStepScratch,
  ): Promise<{ parked: PendingUpgrade } | { record: SealedDocumentRecordFields }> {
    const signed = await this.signedForUpgrade(
      envelope.id,
      item.ord,
      progress,
      scratch,
      async () => {
        if (item.originalPath === null) {
          throw new Error(`document ${item.doc?.id ?? item.ord} of ${envelope.id} has no original`);
        }
        const originalBytes = await this.storage.download(item.originalPath);
        let sealedBytes = await this.burnIn(envelope, originalBytes, item.fields);
        if (certificate !== null) sealedBytes = await appendPdfPages(sealedBytes, certificate);
        return this.pades.sign(sealedBytes);
      },
    );
    if ('parked' in signed) return signed;
    // PAdES B-T -> B-LT (/DSS) -> B-LTA (document timestamp), each step an
    // ISO 32000-1 section 7.5.6 incremental update that leaves the B-T
    // bytes untouched. Every step degrades to the previous level on failure.
    const signedBytes = await this.dss.upgradeToBLt(signed.pdf);
    const sealedPath = documentSealedPath(envelope.id, item.doc?.id ?? '', item.ord);
    await this.storage.upload(sealedPath, signedBytes, 'application/pdf');
    await this.dropParked(envelope.id, signed.parkedPath);
    // Count pages on the sealed file itself: with `appendCertificate` it
    // carries the certificate pages after the original ones, so it can
    // differ from original_pages.
    const sealedPdfDoc = await PDFDocument.load(signedBytes, { updateMetadata: false });
    return {
      record: {
        path: sealedPath,
        sha256: sha256Hex(signedBytes),
        pages: sealedPdfDoc.getPageCount(),
        timestampApplied: signed.timestampApplied,
      },
    };
  }

  /**
   * The B-T signed bytes of document `ord`, ready for the B-LT/B-LTA
   * upgrade. In one process `sign` runs and the caller upgrades at once.
   * Otherwise the first step signs and parks the result (`parked`), and the
   * next step reads it back, so the two halves get a CPU budget each.
   */
  private async signedForUpgrade(
    envelopeId: string,
    ord: number,
    progress: SealProgress,
    scratch: SealStepScratch,
    sign: () => Promise<{ pdf: Buffer; timestampApplied: boolean }>,
  ): Promise<
    | { parked: PendingUpgrade }
    | { pdf: Buffer; timestampApplied: boolean; parkedPath: string | null }
  > {
    const pending = progress.pendingUpgrade;
    if (pending !== undefined && pending.ord === ord) {
      const pdf = await this.storage.download(pending.signedPath);
      return { pdf, timestampApplied: pending.timestampApplied, parkedPath: pending.signedPath };
    }
    const signed = await sign();
    if (scratch.inProcess) return { ...signed, parkedPath: null };
    const signedPath = sealParkedSignedPath(envelopeId, ord);
    await this.storage.upload(signedPath, signed.pdf, 'application/pdf');
    return { parked: { ord, signedPath, timestampApplied: signed.timestampApplied } };
  }

  private async dropParked(envelopeId: string, path: string | null): Promise<void> {
    if (path === null) return;
    await this.storage.remove([path]).catch((err: unknown) => {
      this.logger.warn(
        `could not remove ${path} for ${envelopeId}: ${err instanceof Error ? err.message : String(err)}`,
      );
    });
  }

  /**
   * One `completed` row per mailbox: every signer who has signed, plus
   * the sender when their address is not already in that set. Links are
   * the public verify URLs (short code). Signer access tokens are not
   * stored. A second call with the same envelope is a no-op per party.
   */
  private async enqueueCompletionEmails(envelope: Envelope): Promise<void> {
    const events = await this.repo.listEventsForEnvelope(envelope.id);
    const existingSealed = events.find((event) => event.event_type === 'sealed');
    const sealedEvent =
      existingSealed ??
      (await this.repo.appendEvent({
        envelope_id: envelope.id,
        actor_kind: 'system',
        event_type: 'sealed',
        metadata: envelope.sealed_sha256 ? { sealed_sha256: envelope.sealed_sha256 } : {},
      }));

    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const signerListHtml = buildSignerListHtmlFromSigners(envelope.signers);
    const timelineEvents: TimelineEventFragment[] = [];
    if (envelope.sent_at !== null) {
      timelineEvents.push({
        label: `Envelope sent by ${envelope.sender_name ?? envelope.sender_email ?? 'the sender'}`,
        at: formatIsoForTimeline(envelope.sent_at),
      });
    }
    for (const signer of envelope.signers) {
      if (signer.signed_at !== null) {
        timelineEvents.push({
          label: `${signer.name} signed`,
          at: formatIsoForTimeline(signer.signed_at),
        });
      }
    }
    timelineEvents.push({
      label: 'Envelope sealed and audit trail locked',
      at: formatIsoForTimeline(sealedEvent.created_at),
    });
    const timelineHtml = buildTimelineHtml(timelineEvents);
    const verifyUrl = `${publicUrl}/verify/${envelope.short_code}`;

    const prior = await this.outboundEmails.listByEnvelope(envelope.id);
    const already = new Set(
      prior
        .filter((row) => row.kind === 'completed')
        .map((row) => row.to_email.trim().toLowerCase()),
    );

    for (const party of completionParties(envelope)) {
      const mailbox = party.email.trim().toLowerCase();
      if (already.has(mailbox)) continue;
      already.add(mailbox);
      await insertOutboundEmailIdempotent(this.outboundEmails, {
        envelope_id: envelope.id,
        signer_id: party.signerId,
        kind: 'completed',
        to_email: party.email,
        to_name: party.name,
        source_event_id: sealedEvent.id,
        dedupe_key: `completed:${envelope.id}:${mailbox}`,
        payload: {
          envelope_title: envelope.title,
          short_code: envelope.short_code,
          sealed_url: `${verifyUrl}#sealed`,
          audit_url: `${verifyUrl}#audit`,
          verify_url: verifyUrl,
          public_url: publicUrl,
          signer_list_html: signerListHtml,
          timeline_html: timelineHtml,
        },
      });
    }
  }

  /** Runs every step of an audit_only job in this process (Docker worker, tests). */
  async processAuditOnlyJob(envelope_id: string): Promise<void> {
    let progress: SealProgress = EMPTY_SEAL_PROGRESS;
    const scratch: SealStepScratch = { inProcess: true };
    for (;;) {
      const step = await this.processAuditOnlyStep(envelope_id, progress, scratch);
      if (step.done) return;
      progress = step.progress;
    }
  }

  /**
   * One step of an audit_only job, for the same reason as `processSealStep`:
   * one sealed declined.pdf per step, then audit.pdf + setAuditFile.
   */
  async processAuditOnlyStep(
    envelope_id: string,
    progress: SealProgress,
    scratch: SealStepScratch = {},
  ): Promise<{ done: true } | { done: false; progress: SealProgress }> {
    const envelope = await this.repo.findByIdWithAll(envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');

    // Written before audit.pdf + setAuditFile. A retry rewrites the same
    // paths, so the job stays idempotent. One stamped copy per document.
    const plan = await this.planDocuments(envelope);
    for (const item of plan) {
      if (progress.declined?.includes(item.ord)) continue;
      const written = await this.writeDeclinedPdf(envelope, item, progress, scratch);
      if (written !== null) {
        return { done: false, progress: { ...progress, pendingUpgrade: written.parked } };
      }
      const rest = withoutPendingUpgrade(progress);
      return {
        done: false,
        progress: { ...rest, declined: [...(rest.declined ?? []), item.ord] },
      };
    }

    const [events, signerDetails] = await Promise.all([
      this.repo.listEventsForEnvelope(envelope_id),
      this.repo.listSignerAuditDetails(envelope_id),
    ]);
    const auditBytes = await buildAuditPdf({
      envelope,
      events,
      signerDetails,
      sealedSha256: null,
      sealedPages: null,
      publicUrl: this.env.APP_PUBLIC_URL,
      cmsSealApplied: false,
      timestampApplied: false,
      ...auditDocumentsInput(plan, null),
    });
    const auditPath = `${envelope_id}/audit.pdf`;
    await this.storage.upload(auditPath, auditBytes, 'application/pdf');
    await this.repo.setAuditFile(envelope_id, auditPath);
    return { done: true };
  }

  /**
   * declined.pdf: original.pdf with a "not signed" banner on every page,
   * PAdES-sealed (and upgraded to B-LT/B-LTA) like sealed.pdf so anyone
   * can check it came from Seald. Burns in no signer data. Skipped for a
   * non-terminal status, and when original.pdf is missing (logged).
   */
  /** Null when declined.pdf is written (or skipped); `parked` after the sign half. */
  private async writeDeclinedPdf(
    envelope: Envelope,
    item: SealPlanItem,
    progress: SealProgress,
    scratch: SealStepScratch,
  ): Promise<{ parked: PendingUpgrade } | null> {
    const banner = NOT_SIGNED_BANNERS[envelope.status];
    if (banner === undefined) return null;
    let originalBytes: Buffer | null = null;
    const resuming = progress.pendingUpgrade?.ord === item.ord;
    if (!resuming) {
      try {
        if (item.originalPath === null) throw new Error('no original path');
        originalBytes = await this.storage.download(item.originalPath);
      } catch (err) {
        this.logger.warn(
          `audit_only job for ${envelope.id}: no original for document ${item.ord}, skipping its declined.pdf (${err instanceof Error ? err.message : String(err)})`,
        );
        return null;
      }
    }
    const signed = await this.signedForUpgrade(envelope.id, item.ord, progress, scratch, async () =>
      this.pades.sign(await stampNotSignedBanner(originalBytes as Buffer, banner)),
    );
    if ('parked' in signed) return signed;
    const sealed = await this.dss.upgradeToBLt(signed.pdf);
    const path =
      item.doc === null
        ? declinedPdfPath(envelope.id)
        : documentDeclinedPath(envelope.id, item.doc.id, item.ord);
    await this.storage.upload(path, sealed, 'application/pdf');
    await this.dropParked(envelope.id, signed.parkedPath);
    return null;
  }

  /**
   * Overlay signatures + field values onto the original PDF. All coordinates
   * are normalized (0..1) relative to the page size. Origin is top-left in
   * the wire contract; pdf-lib uses bottom-left, so we flip y.
   */
  private async burnIn(
    envelope: Envelope,
    originalBytes: Buffer,
    fields: ReadonlyArray<EnvelopeField> = envelope.fields,
  ): Promise<Buffer> {
    const pdf = await PDFDocument.load(originalBytes);
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();

    // Group fields by signer so we only fetch each signature image once.
    const fieldsBySigner = new Map<string, EnvelopeField[]>();
    for (const f of fields) {
      const list = fieldsBySigner.get(f.signer_id) ?? [];
      list.push(f);
      fieldsBySigner.set(f.signer_id, list);
    }

    for (const signer of envelope.signers) {
      const signerFields = fieldsBySigner.get(signer.id) ?? [];
      if (signerFields.length === 0) continue;

      // Fetch + embed the signer's signature and initials images
      // independently. Either may be missing on legacy envelopes (initials
      // were uploaded into the signature slot before the storage split, so
      // pre-migration submissions only have a single signature image). We
      // tolerate missing artifacts and fall back, rather than aborting the
      // seal — a half-rendered page is strictly better than no PDF at all.
      const hasSignatureField = signerFields.some((f) => f.kind === 'signature');
      const hasInitialsField = signerFields.some((f) => f.kind === 'initials');

      let sigImg: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
      if (hasSignatureField || hasInitialsField) {
        sigImg = await tryEmbedPng(
          pdf,
          this.storage,
          signatureStoragePath(envelope.id, signer.id, 'signature'),
        );
      }

      let initialsImg: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
      if (hasInitialsField) {
        initialsImg = await tryEmbedPng(
          pdf,
          this.storage,
          signatureStoragePath(envelope.id, signer.id, 'initials'),
        );
        // Legacy fallback: pre-0005 envelopes only ever stored one image.
        // Render it for both kinds rather than leaving the initials slot
        // blank.
        if (!initialsImg) initialsImg = sigImg;
      }

      for (const f of signerFields) {
        const pageIdx = Math.max(0, f.page - 1);
        if (pageIdx >= pages.length) continue;
        burnInField(pages[pageIdx]!, f, {
          sigImg,
          initialsImg,
          helvetica,
          helveticaBold: helvetica, // bold unused for text fields
        });
      }
    }

    // useObjectStreams:false → writes a classic `xref` table instead of
    // compressed object streams. @signpdf/placeholder-plain can only parse
    // the classic form; if we leave the default (true), it crashes with
    // "Expected xref at NaN". PDF readers handle both fine, so the only
    // cost is a slightly larger file on disk.
    const out = await pdf.save({ useObjectStreams: false });
    return Buffer.from(out);
  }
}

/** One document of a seal or audit_only job. `doc` is null for the
 *  synthesized legacy document of an envelope without document rows. */
interface SealPlanItem {
  readonly doc: EnvelopeDocumentRecord | null;
  readonly ord: number;
  readonly title: string;
  readonly originalPath: string | null;
  readonly originalSha256: string | null;
  readonly originalPages: number | null;
  readonly fields: ReadonlyArray<EnvelopeField>;
}

interface SealedDocumentRecordFields {
  readonly path: string;
  readonly sha256: string;
  readonly pages: number;
  readonly timestampApplied: boolean;
}

interface SealedDocument extends SealedDocumentRecordFields {
  readonly item: SealPlanItem;
}

/**
 * What a seal job has finished so far, carried between steps (plain JSON;
 * the edge worker stores it on `envelope_jobs.progress`, migration 0048).
 */
export interface SealProgress {
  /** The pre-seal certificate is parked at `sealCertificatePath`. */
  readonly certificateReady?: boolean;
  /** Documents already sealed and uploaded, by `ord`. */
  readonly documents: ReadonlyArray<{ readonly ord: number } & SealedDocumentRecordFields>;
  /** audit_only jobs: documents whose declined.pdf is already written, by `ord`. */
  readonly declined?: ReadonlyArray<number>;
  /**
   * A document signed (PAdES B-T) and parked in Storage, waiting for its
   * B-LT/B-LTA upgrade in the next step. Edge only: signing and upgrading
   * a large PDF do not fit one 2 s CPU budget together.
   */
  readonly pendingUpgrade?: PendingUpgrade;
}

export interface PendingUpgrade {
  readonly ord: number;
  readonly signedPath: string;
  readonly timestampApplied: boolean;
}

export const EMPTY_SEAL_PROGRESS: SealProgress = { documents: [] };

/** In-memory carry-over for steps that run in the same process. */
export interface SealStepScratch {
  certificate?: Buffer;
  /** Every step runs in this process: skip parking the certificate in Storage. */
  inProcess?: boolean;
}

/** Where a multi-step seal parks a signed document before its B-LT/B-LTA upgrade. */
export function sealParkedSignedPath(envelopeId: string, ord: number): string {
  return `${envelopeId}/seal-work/${ord}.signed.pdf`;
}

function withoutPendingUpgrade(progress: SealProgress): SealProgress {
  const { pendingUpgrade: _done, ...rest } = progress;
  return rest;
}

/** Where a multi-step seal parks the certificate between steps. */
export function sealCertificatePath(envelopeId: string): string {
  return `${envelopeId}/seal-work/certificate.pdf`;
}

/** `documents` for buildAuditPdf: only set for a multi-file envelope, so a
 *  single-file audit.pdf keeps its layout. */
function auditDocumentsInput(
  plan: ReadonlyArray<SealPlanItem>,
  sealed: ReadonlyArray<SealedDocument> | null,
): { documents?: AuditDocumentHash[] } {
  if (plan.length <= 1) return {};
  return {
    documents: plan.map((item, i) => ({
      ord: item.ord,
      title: item.title,
      originalSha256: item.originalSha256,
      originalPages: item.originalPages,
      sealedSha256: sealed?.[i]?.sha256 ?? null,
      sealedPages: sealed?.[i]?.pages ?? null,
    })),
  };
}

/** Banner per terminal non-completed status. Other statuses get none. */
const NOT_SIGNED_BANNERS: Partial<Record<Envelope['status'], string>> = {
  declined: 'Declined — not signed',
  expired: 'Expired — not signed',
  canceled: 'Canceled — not signed',
};

/**
 * Draw a banner across the top of every page. Coordinates follow the
 * page's MediaBox origin so offset pages still get it. Saves with a
 * classic xref (see burnIn) so @signpdf can add its placeholder.
 */
async function stampNotSignedBanner(pdfBytes: Buffer, text: string): Promise<Buffer> {
  const pdf = await PDFDocument.load(pdfBytes);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const page of pdf.getPages()) {
    const box = page.getMediaBox();
    const size = Math.max(10, Math.min(18, box.width / 30));
    const barHeight = size * 2;
    const top = box.y + box.height;
    page.drawRectangle({
      x: box.x,
      y: top - barHeight,
      width: box.width,
      height: barHeight,
      color: rgb(1, 0.94, 0.94),
    });
    const textWidth = bold.widthOfTextAtSize(text, size);
    page.drawText(text, {
      x: box.x + (box.width - textWidth) / 2,
      y: top - barHeight + size * 0.65,
      size,
      font: bold,
      color: rgb(0.73, 0.11, 0.11),
    });
  }
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/** Append every page of `extra` after the pages of `base`. */
async function appendPdfPages(base: Buffer, extra: Buffer): Promise<Buffer> {
  const pdf = await PDFDocument.load(base);
  const source = await PDFDocument.load(extra);
  const pages = await pdf.copyPages(source, source.getPageIndices());
  for (const page of pages) pdf.addPage(page);
  // Classic xref for @signpdf/placeholder-plain (see burnIn).
  return Buffer.from(await pdf.save({ useObjectStreams: false }));
}

/** Hex SHA-256 of the last event's canonical JSON: the value the next
 *  event's `prev_event_hash` will hold (rule S.6). */
function chainHeadHex(events: ReadonlyArray<EnvelopeEvent>): string | null {
  const last = events[events.length - 1];
  return last ? eventHash(last).toString('hex') : null;
}

interface CompletionParty {
  readonly email: string;
  readonly name: string;
  readonly signerId: string | null;
}

/** Signers who finished, then the sender if that mailbox is not already included. */
function completionParties(envelope: Envelope): readonly CompletionParty[] {
  const parties: CompletionParty[] = [];
  const seen = new Set<string>();
  const add = (email: string, name: string, signerId: string | null): void => {
    const key = email.trim().toLowerCase();
    if (key.length === 0 || seen.has(key)) return;
    seen.add(key);
    parties.push({ email: email.trim(), name, signerId });
  };
  for (const signer of envelope.signers) {
    if (signer.signed_at === null) continue;
    add(signer.email, signer.name, signer.id);
  }
  if (envelope.sender_email) {
    add(envelope.sender_email, envelope.sender_name ?? envelope.sender_email, null);
  }
  return parties;
}

function sha256Hex(buf: Buffer): string {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * Embed a PNG from object storage if it exists; resolve to null on any
 * not-found-shaped error. Used by the burn-in to make missing initials
 * artifacts non-fatal — legacy envelopes only have a single image and we
 * still need to seal them.
 */
async function tryEmbedPng(
  pdf: PDFDocument,
  storage: StorageService,
  path: string,
): Promise<Awaited<ReturnType<typeof pdf.embedPng>> | null> {
  try {
    const bytes = await storage.download(path);
    return await pdf.embedPng(bytes);
  } catch {
    return null;
  }
}

/** "2026-04-22T14:18:07.000Z" → "Apr 22, 2026 · 02:18 PM UTC". Matches the
 *  design-kit `.timeline time` format. */
function formatIsoForTimeline(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  const pad = (n: number) => n.toString().padStart(2, '0');
  const h = d.getUTCHours();
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const ampm = h < 12 ? 'AM' : 'PM';
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()} · ${pad(h12)}:${pad(d.getUTCMinutes())} ${ampm} UTC`;
}
