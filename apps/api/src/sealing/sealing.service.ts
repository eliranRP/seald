import { createHash } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import QRCode from 'qrcode';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import type { Envelope, EnvelopeEvent, EnvelopeField } from '../envelopes/envelope.entity';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { StorageService } from '../storage/storage.service';
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
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async processSealJob(envelope_id: string): Promise<void> {
    const envelope = await this.repo.findByIdWithAll(envelope_id);
    if (!envelope) throw new Error(`envelope_not_found:${envelope_id}`);
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
    const signedBytes = await this.pades.sign(sealedBytes);
    const sealedSha = sha256Hex(signedBytes);
    const sealedPath = `${envelope_id}/sealed.pdf`;
    await this.storage.upload(sealedPath, signedBytes, 'application/pdf');

    const events = await this.repo.listEventsForEnvelope(envelope_id);
    const auditBytes = await this.buildAuditPdf(envelope, events, sealedSha);
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
        },
      });
    }
  }

  async processAuditOnlyJob(envelope_id: string): Promise<void> {
    const envelope = await this.repo.findByIdWithAll(envelope_id);
    if (!envelope) throw new Error(`envelope_not_found:${envelope_id}`);

    const events = await this.repo.listEventsForEnvelope(envelope_id);
    // No sealed sha to reference — pass empty.
    const auditBytes = await this.buildAuditPdf(envelope, events, null);
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

      // Fetch + embed the signer's signature image once if they have any
      // signature/initials fields.
      const hasSigField = signerFields.some((f) => f.kind === 'signature' || f.kind === 'initials');
      let sigImg: Awaited<ReturnType<typeof pdf.embedPng>> | null = null;
      if (hasSigField) {
        const sigPath = `${envelope.id}/signatures/${signer.id}.png`;
        const sigBytes = await this.storage.download(sigPath);
        sigImg = await pdf.embedPng(sigBytes);
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

        if (f.kind === 'signature' || f.kind === 'initials') {
          if (sigImg) page.drawImage(sigImg, { x, y, width: w, height: h });
        } else if (f.kind === 'checkbox') {
          // Simple box + checkmark if true.
          page.drawRectangle({
            x,
            y,
            width: w,
            height: h,
            borderColor: rgb(0, 0, 0),
            borderWidth: 0.5,
          });
          if (f.value_boolean === true) {
            page.drawText('X', {
              x: x + w * 0.2,
              y: y + h * 0.2,
              size: Math.min(w, h) * 0.7,
              font: helvetica,
              color: rgb(0, 0, 0),
            });
          }
        } else {
          // text / date / email — render value_text as-is in Helvetica.
          const text = f.value_text ?? '';
          page.drawText(text, {
            x,
            y: y + h * 0.25,
            size: Math.min(h * 0.7, 14),
            font: helvetica,
            color: rgb(0, 0, 0),
          });
        }
      }
    }

    const out = await pdf.save();
    return Buffer.from(out);
  }

  /**
   * Single-page audit PDF: envelope meta + event timeline + QR code to the
   * public verify URL. Designed to be standalone — any subsequent forensic
   * review only needs this one file.
   */
  private async buildAuditPdf(
    envelope: Envelope,
    events: ReadonlyArray<EnvelopeEvent>,
    sealedSha: string | null,
  ): Promise<Buffer> {
    const pdf = await PDFDocument.create();
    const page = pdf.addPage([612, 792]); // US Letter
    const helv = await pdf.embedFont(StandardFonts.Helvetica);
    const helvBold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const margin = 50;
    let cursorY = 792 - margin;

    const line = (text: string, size = 10, bold = false): void => {
      page.drawText(text, {
        x: margin,
        y: cursorY,
        size,
        font: bold ? helvBold : helv,
        color: rgb(0, 0, 0),
      });
      cursorY -= size + 4;
    };

    line('Seald — Audit Trail', 18, true);
    cursorY -= 6;
    line(envelope.title, 12, true);
    line(`Reference: ${envelope.short_code}`, 10);
    line(`Status: ${envelope.status}`, 10);
    line(`Created: ${envelope.created_at}`, 10);
    if (envelope.completed_at) line(`Completed: ${envelope.completed_at}`, 10);
    if (sealedSha) line(`Sealed SHA-256: ${sealedSha}`, 8);
    if (envelope.original_sha256) line(`Original SHA-256: ${envelope.original_sha256}`, 8);

    cursorY -= 8;
    line('Signers', 12, true);
    for (const s of envelope.signers) {
      line(`• ${s.name} <${s.email}> — ${s.status}`, 10);
    }

    cursorY -= 8;
    line('Events', 12, true);
    for (const ev of events) {
      if (cursorY < margin + 30) break; // MVP: single page, truncate if overflow
      line(`[${ev.created_at}] ${ev.event_type} (${ev.actor_kind})`, 9);
    }

    // QR code at bottom-right.
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const verifyUrl = `${publicUrl}/verify/${envelope.short_code}`;
    const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 0, width: 200 });
    const qrBytes = Buffer.from(qrDataUrl.split(',')[1]!, 'base64');
    const qrImg = await pdf.embedPng(qrBytes);
    const qrSize = 100;
    page.drawImage(qrImg, {
      x: 612 - margin - qrSize,
      y: margin,
      width: qrSize,
      height: qrSize,
    });
    page.drawText(`Verify: ${verifyUrl}`, {
      x: margin,
      y: margin + 8,
      size: 8,
      font: helv,
      color: rgb(0.3, 0.3, 0.3),
    });

    const out = await pdf.save();
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
