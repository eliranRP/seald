import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts } from 'pdf-lib';
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
import type { Envelope, EnvelopeField } from '../envelopes/envelope.entity';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { signatureStoragePath } from '../signing/signature-paths';
import { StorageService } from '../storage/storage.service';
import { buildAuditPdf } from './audit-pdf';
import { DssInjector } from './dss-injector';
import { PadesSigner } from './pades-signer';

/**
 * Sealing pipeline for terminal envelopes. Invoked by the worker when a
 * claim returns a `seal` or `audit_only` job.
 *
 * seal:
 *   1. Download original.pdf
 *   2. Burn-in each signer's signature.png at their signature/initials fields
 *      + drawText for date/text/email + checkbox stamps
 *   3. Hand to PadesSigner.sign() (noop in MVP)
 *   4. Upload sealed.pdf
 *   5. Generate audit.pdf (events timeline + QR to /verify/{short_code})
 *   6. Upload audit.pdf
 *   7. repo.transitionToSealed (status → completed; no event row)
 *   8. Enqueue `completed` email to the sender and every signer
 *      and append `sealed` if that event is not already recorded
 *      (one row per mailbox; deduped on retry)
 *
 * audit_only:
 *   1. Envelope is already terminal (declined/expired). Generate audit.pdf.
 *   2. Upload + repo.setAuditFile. No seal, no completed emails.
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
  ) {}

  async processSealJob(envelope_id: string): Promise<void> {
    const envelope = await this.repo.findByIdWithAll(envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');
    if (envelope.status === 'completed') {
      // A previous attempt sealed the PDF and then died before every
      // completion row was queued. Re-enter only the fan-out; dedupe
      // keys keep it to one mail per party.
      await this.enqueueCompletionEmails(envelope);
      return;
    }
    if (envelope.status !== 'sealing') {
      // Envelope raced into a non-sealing state (declined, expired). Bail
      // quietly — the worker will mark the job done and no harm done.
      this.logger.warn(
        `seal job for ${envelope_id}: envelope in status ${envelope.status}, skipping`,
      );
      return;
    }

    const originalPath = `${envelope_id}/original.pdf`;
    const originalBytes = await this.storage.download(originalPath);

    const sealedBytes = await this.burnIn(envelope, originalBytes);
    const signed = await this.pades.sign(sealedBytes);
    const btSignedBytes = signed.pdf;
    // PAdES B-T → B-LT upgrade. The DssInjector pipeline (cert-chain
    // extraction + OCSP/CRL fetch + /DSS dictionary build) is wired here;
    // the injector itself returns the B-T bytes unchanged today because a
    // full-resave would mutate the existing /Sig.Contents byte range and
    // break the embedded signature. The remaining piece is the ISO
    // 32000-1 §7.5.6 incremental-update writer — see TODO at the bottom
    // of dss-injector.ts. Until then the chain-extractor and revocation-
    // fetcher are still exercised by unit tests, ready to slot in when
    // the writer lands.
    const signedBytes = await this.dss.upgradeToBLt(btSignedBytes);
    const sealedSha = sha256Hex(signedBytes);
    const sealedPath = `${envelope_id}/sealed.pdf`;
    await this.storage.upload(sealedPath, signedBytes, 'application/pdf');

    // The sealed file's page count differs from original_pages because
    // burn-in appends the cover/signature page. Surface it to the audit
    // PDF so the "Signed document" hash card reflects reality.
    const sealedPdfDoc = await PDFDocument.load(signedBytes, { updateMetadata: false });
    const sealedPages = sealedPdfDoc.getPageCount();

    const [events, signerDetails] = await Promise.all([
      this.repo.listEventsForEnvelope(envelope_id),
      this.repo.listSignerAuditDetails(envelope_id),
    ]);
    const auditBytes = await buildAuditPdf({
      envelope,
      events,
      signerDetails,
      sealedSha256: sealedSha,
      sealedPages,
      publicUrl: this.env.APP_PUBLIC_URL,
      cmsSealApplied: this.pades.appliesCmsSeal,
      timestampApplied: signed.timestampApplied,
    });
    const auditPath = `${envelope_id}/audit.pdf`;
    await this.storage.upload(auditPath, auditBytes, 'application/pdf');

    const updated = await this.repo.transitionToSealed(envelope_id, {
      sealed_file_path: sealedPath,
      sealed_sha256: sealedSha,
      audit_file_path: auditPath,
    });
    if (!updated) {
      // The status flip lost. If the winner already marked the envelope
      // completed, still try the fan-out — they may have crashed before
      // it. A cancel/expire leaves the artifacts orphaned.
      const fresh = await this.repo.findByIdWithAll(envelope_id);
      if (fresh?.status === 'completed') {
        await this.enqueueCompletionEmails(fresh);
        return;
      }
      this.logger.warn(
        `seal job for ${envelope_id}: transitionToSealed lost the race, artifacts orphaned`,
      );
      return;
    }

    await this.enqueueCompletionEmails(updated);
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
      at: formatIsoForTimeline(new Date().toISOString()),
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

  async processAuditOnlyJob(envelope_id: string): Promise<void> {
    const envelope = await this.repo.findByIdWithAll(envelope_id);
    if (!envelope) throw new NotFoundException('envelope_not_found');

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
    });
    const auditPath = `${envelope_id}/audit.pdf`;
    await this.storage.upload(auditPath, auditBytes, 'application/pdf');
    await this.repo.setAuditFile(envelope_id, auditPath);
  }

  /**
   * Overlay signatures + field values onto the original PDF. All coordinates
   * are normalized (0..1) relative to the page size. Origin is top-left in
   * the wire contract; pdf-lib uses bottom-left, so we flip y.
   */
  private async burnIn(envelope: Envelope, originalBytes: Buffer): Promise<Buffer> {
    const pdf = await PDFDocument.load(originalBytes);
    const helvetica = await pdf.embedFont(StandardFonts.Helvetica);
    const pages = pdf.getPages();

    // Group fields by signer so we only fetch each signature image once.
    const fieldsBySigner = new Map<string, EnvelopeField[]>();
    for (const f of envelope.fields) {
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
