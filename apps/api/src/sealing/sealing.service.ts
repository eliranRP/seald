import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
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
 *   7. repo.transitionToSealed → appendEvent('sealed')
 *   8. Enqueue `completed` email to every signer
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
    const btSignedBytes = await this.pades.sign(sealedBytes);
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
      retentionYears: this.env.ENVELOPE_RETENTION_YEARS,
    });
    const auditPath = `${envelope_id}/audit.pdf`;
    await this.storage.upload(auditPath, auditBytes, 'application/pdf');

    const updated = await this.repo.transitionToSealed(envelope_id, {
      sealed_file_path: sealedPath,
      sealed_sha256: sealedSha,
      audit_file_path: auditPath,
    });
    if (!updated) {
      // Race with a cancel/expire. Uploaded artifacts become orphaned — cheap
      // enough not to worry about cleanup for MVP.
      this.logger.warn(
        `seal job for ${envelope_id}: transitionToSealed lost the race, artifacts orphaned`,
      );
      return;
    }

    await this.repo.appendEvent({
      envelope_id,
      actor_kind: 'system',
      event_type: 'sealed',
      metadata: { sealed_sha256: sealedSha },
    });

    // Per-signer completed email. Source event is the `sealed` event we just
    // appended — but we have the envelope-level payload now, so we can fan
    // out without another read.
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');

    // Pre-render the signer roster + event timeline fragments once per
    // envelope — loop-free template engine means iteration has to happen
    // here. The timeline is derived from the signers (sent → each signed
    // → sealed) without another event-log query.
    const signerListHtml = buildSignerListHtmlFromSigners(updated.signers);
    const timelineEvents: TimelineEventFragment[] = [];
    if (envelope.sent_at !== null) {
      timelineEvents.push({
        label: `Envelope sent by ${envelope.sender_name ?? envelope.sender_email ?? 'the sender'}`,
        at: formatIsoForTimeline(envelope.sent_at),
      });
    }
    for (const s of updated.signers) {
      if (s.signed_at !== null) {
        timelineEvents.push({
          label: `${s.name} signed`,
          at: formatIsoForTimeline(s.signed_at),
        });
      }
    }
    timelineEvents.push({
      label: 'Envelope sealed and audit trail locked',
      at: formatIsoForTimeline(new Date().toISOString()),
    });
    const timelineHtml = buildTimelineHtml(timelineEvents);

    for (const signer of updated.signers) {
      if (signer.signed_at === null) continue; // defensive — all should be signed
      await this.outboundEmails.insert({
        envelope_id,
        signer_id: signer.id,
        kind: 'completed',
        to_email: signer.email,
        to_name: signer.name,
        source_event_id: null,
        payload: {
          envelope_title: envelope.title,
          short_code: envelope.short_code,
          sealed_url: `${publicUrl}/verify/${envelope.short_code}#sealed`,
          audit_url: `${publicUrl}/verify/${envelope.short_code}#audit`,
          verify_url: `${publicUrl}/verify/${envelope.short_code}`,
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
      retentionYears: this.env.ENVELOPE_RETENTION_YEARS,
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
        const page = pages[pageIdx]!;
        const pw = page.getWidth();
        const ph = page.getHeight();
        const w = (f.width ?? defaultWidth(f.kind)) * pw;
        const h = (f.height ?? defaultHeight(f.kind)) * ph;
        const x = f.x * pw;

        // Flip y: wire contract y is from top, pdf-lib y is from bottom.
        const y = ph - f.y * ph - h;

        if (f.kind === 'signature') {
          if (sigImg) page.drawImage(sigImg, { x, y, width: w, height: h });
        } else if (f.kind === 'initials') {
          if (initialsImg) page.drawImage(initialsImg, { x, y, width: w, height: h });
        } else if (f.kind === 'checkbox') {
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5,
          });
          if (f.value_boolean === true) {
            const inset = Math.min(w, h) * 0.18;
            const innerW = w - inset * 2;
            const innerH = h - inset * 2;
            const left = x + inset;
            const bottom = y + inset;
            const stroke = Math.max(0.8, Math.min(w, h) * 0.12);
            page.drawLine({
              start: { x: left, y: bottom + innerH * 0.6 },
              end: { x: left + innerW * 0.4, y: bottom + innerH * 0.15 },
              thickness: stroke,
              color: rgb(0, 0, 0),
            });
            page.drawLine({
              start: { x: left + innerW * 0.4, y: bottom + innerH * 0.15 },
              end: { x: left + innerW, y: bottom + innerH * 0.95 },
              thickness: stroke,
              color: rgb(0, 0, 0),
            });
          }
        } else {
          // text / date / email — center text vertically in the field box.
          // pdf-lib drawText y = text baseline position.
          // Place baseline at field center minus half the font descent.
          const text = f.value_text ?? '';
          const fontSize = Math.min(h * 0.6, 12);
          // Approximate: baseline at ~40% from bottom centers the visible
          // text body (ascenders above, descenders below the baseline).
          page.drawText(text, {
            x: x + 4,
            y: y + h * 0.35,
            size: fontSize,
            font: helvetica,
            color: rgb(0, 0, 0),
          });
        }
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

/** pdf-lib expects signatures ~25% page width if no explicit width. */
function defaultWidth(kind: EnvelopeField['kind']): number {
  if (kind === 'signature') return 0.25;
  if (kind === 'initials') return 0.08;
  if (kind === 'checkbox') return 0.03;
  return 0.2;
}

function defaultHeight(kind: EnvelopeField['kind']): number {
  if (kind === 'signature') return 0.06;
  if (kind === 'initials') return 0.04;
  if (kind === 'checkbox') return 0.03;
  return 0.03;
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
