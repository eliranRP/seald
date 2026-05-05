import {
  BadRequestException,
  ConflictException,
  GoneException,
  Injectable,
  NotFoundException,
  PayloadTooLargeException,
  PreconditionFailedException,
  UnauthorizedException,
  UnprocessableEntityException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import sharp from 'sharp';
import type { SignatureFormat } from 'shared';
import { CURRENT_SIGNER_AUTH_TIER, ESIGN_DISCLOSURE_VERSION } from 'shared';
import { APP_ENV } from '../config/config.module';
import type { AppEnv } from '../config/env.schema';
import { Inject } from '@nestjs/common';
import { OutboundEmailsRepository } from '../email/outbound-emails.repository';
import { buildTimelineHtml, type TimelineEventFragment } from '../email/template-fragments';
import type {
  Envelope,
  EnvelopeField,
  EnvelopeSigner,
  SetSignerSignatureInput,
  SignatureKind,
} from '../envelopes/envelopes.repository';
import { EnvelopesRepository } from '../envelopes/envelopes.repository';
import { StorageService } from '../storage/storage.service';
import { signatureStoragePath } from './signature-paths';
import { SignerSessionService } from './signer-session.service';
import { SigningTokenService } from './signing-token.service';

const MAX_SIGNATURE_BYTES = 512 * 1024; // 512 KB
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);
const SIGNATURE_TARGET_WIDTH = 600;
const SIGNATURE_TARGET_HEIGHT = 200;

export interface StartSessionResult {
  readonly envelope_id: string;
  readonly signer_id: string;
  readonly requires_tc_accept: boolean;
  /** The session JWT to set as an HttpOnly cookie on the response. */
  readonly session_jwt: string;
}

export interface SignMeResponse {
  readonly envelope: {
    readonly id: string;
    readonly title: string;
    readonly short_code: string;
    readonly status: Envelope['status'];
    readonly original_pages: number | null;
    readonly expires_at: string;
    readonly tc_version: string;
    readonly privacy_version: string;
  };
  readonly signer: {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly color: string;
    readonly role: EnvelopeSigner['role'];
    readonly status: EnvelopeSigner['status'];
    readonly viewed_at: string | null;
    readonly tc_accepted_at: string | null;
    readonly signed_at: string | null;
    readonly declined_at: string | null;
  };
  /** Fields the caller should fill. Only fields belonging to THIS signer. */
  readonly fields: ReadonlyArray<EnvelopeField>;
  /** Other signers — status only, emails + names masked. */
  readonly other_signers: ReadonlyArray<{
    readonly id: string;
    readonly status: EnvelopeSigner['status'];
    readonly name_masked: string;
  }>;
}

/**
 * Recipient-side orchestration for `/sign/*` routes. Counterpart to
 * EnvelopesService (sender-side), but operates on narrowly-scoped signer
 * sessions rather than full owner context. Every method that mutates
 * assumes the caller has validated the session via SignerSessionGuard.
 */
@Injectable()
export class SigningService {
  constructor(
    private readonly repo: EnvelopesRepository,
    private readonly tokens: SigningTokenService,
    private readonly session: SignerSessionService,
    private readonly storage: StorageService,
    private readonly outboundEmails: OutboundEmailsRepository,
    @Inject(APP_ENV) private readonly env: AppEnv,
  ) {}

  async startSession(envelope_id: string, token: string): Promise<StartSessionResult> {
    // Hash at the boundary; plaintext never persists.
    const hash = this.tokens.hash(token);
    const found = await this.repo.findSignerByAccessTokenHash(hash);
    if (!found) {
      throw new UnauthorizedException('invalid_token');
    }
    const { envelope, signer } = found;

    // Guard against token-guess across envelopes: the token must belong to
    // the envelope in the request body.
    if (envelope.id !== envelope_id) {
      throw new UnauthorizedException('invalid_token');
    }

    assertStillSignable(envelope, signer);

    const session_jwt = await this.session.mint({
      envelope_id: envelope.id,
      signer_id: signer.id,
    });

    return {
      envelope_id: envelope.id,
      signer_id: signer.id,
      // Always true at start for MVP. /sign/accept-terms is idempotent, so a
      // re-click is a no-op; /sign/me returns the authoritative tc state so
      // the FE can skip the gate if already accepted.
      requires_tc_accept: true,
      session_jwt,
    };
  }

  /**
   * Session-scoped read: the signer's own view of the envelope. Filters
   * fields to only those assigned to this signer; masks other signers' names
   * so one signer doesn't inadvertently learn another's identity from an
   * invite mistake.
   */
  me(envelope: Envelope, signer: EnvelopeSigner): SignMeResponse {
    const myFields = envelope.fields.filter((f) => f.signer_id === signer.id);
    const others = envelope.signers
      .filter((s) => s.id !== signer.id)
      .map((s) => ({
        id: s.id,
        status: s.status,
        name_masked: maskName(s.name),
      }));
    return {
      envelope: {
        id: envelope.id,
        title: envelope.title,
        short_code: envelope.short_code,
        status: envelope.status,
        original_pages: envelope.original_pages,
        expires_at: envelope.expires_at,
        tc_version: envelope.tc_version,
        privacy_version: envelope.privacy_version,
      },
      signer: {
        id: signer.id,
        email: signer.email,
        name: signer.name,
        color: signer.color,
        role: signer.role,
        status: signer.status,
        viewed_at: signer.viewed_at,
        tc_accepted_at: signer.tc_accepted_at,
        signed_at: signer.signed_at,
        declined_at: signer.declined_at,
      },
      fields: myFields,
      other_signers: others,
    };
  }

  /** Mints a short-lived (90s) signed URL for the envelope's original PDF. */
  getOriginalPdfSignedUrl(envelope: Envelope): Promise<string> {
    // Envelope domain type doesn't expose original_file_path. Use the
    // deterministic path set by EnvelopesService.uploadOriginal.
    const path = `${envelope.id}/original.pdf`;
    return this.storage.createSignedUrl(path, 90);
  }

  /**
   * Stamp tc_accepted_at (idempotent), viewed_at (idempotent), and emit
   * tc_accepted + viewed events if this is the signer's first time. Every
   * stamp runs before event append so the append only fires on the real
   * transition — signers clicking twice don't pollute the audit with dupes.
   */
  async acceptTerms(
    envelope: Envelope,
    signer: EnvelopeSigner,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.repo.acceptTerms(signer.id);
    await this.repo.recordSignerViewed(signer.id, ip, userAgent);

    if (signer.tc_accepted_at === null) {
      await this.repo.appendEvent({
        envelope_id: envelope.id,
        signer_id: signer.id,
        actor_kind: 'signer',
        event_type: 'tc_accepted',
        ip,
        user_agent: userAgent,
        // ESIGN §7001(c)(1) requires the consumer's affirmative consent
        // to electronic records to be tied to the exact disclosure they
        // saw. We persist the disclosure version + the authentication
        // tier so the audit trail is self-describing — a future copy
        // change cannot retroactively alter what a past signer agreed
        // to. (saas-legal-advisor S.1, S.7.)
        metadata: {
          tc_version: envelope.tc_version,
          privacy_version: envelope.privacy_version,
          esign_disclosure_version: ESIGN_DISCLOSURE_VERSION,
          signer_auth_tier: CURRENT_SIGNER_AUTH_TIER,
        },
      });
    }
    if (signer.viewed_at === null) {
      await this.repo.appendEvent({
        envelope_id: envelope.id,
        signer_id: signer.id,
        actor_kind: 'signer',
        event_type: 'viewed',
        ip,
        user_agent: userAgent,
        metadata: {},
      });
    }
  }

  /**
   * T-14 — record the signer's ESIGN Consumer Disclosure acknowledgment.
   * The flow on `/sign/:id/prep` shows two checkboxes:
   *   1. "I have read the Consumer Disclosure" (the existing TC checkbox)
   *   2. "I can access electronic records on this device" (new — ESIGN
   *      §7001(c)(1)(C)(ii) "demonstrated ability" requirement)
   *
   * The frontend posts here once both are checked. Idempotent — re-posting
   * doesn't append a duplicate event because the controller short-circuits
   * when the most recent acknowledgment for this signer is the same
   * disclosure version. We don't bother de-duping at the DB layer because
   * the chain-tail check is cheap and the audit PDF only renders the
   * earliest acknowledgment.
   */
  async acknowledgeEsignDisclosure(
    envelope: Envelope,
    signer: EnvelopeSigner,
    disclosureVersion: string,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'esign_disclosure_acknowledged',
      ip,
      user_agent: userAgent,
      metadata: {
        esign_disclosure_version: disclosureVersion,
        demonstrated_ability: true,
      },
    });
  }

  /**
   * T-15 — record the signer's explicit intent-to-sign affirmation. The
   * Review screen disables Submit until the signer ticks "I intend to
   * sign this document with the signature shown above"; on tick the FE
   * posts here. The matching audit event lands in the chain BEFORE the
   * `signed` event so the trail reads in the correct order.
   */
  async confirmIntentToSign(
    envelope: Envelope,
    signer: EnvelopeSigner,
    ip: string | null,
    userAgent: string | null,
  ): Promise<void> {
    await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'intent_to_sign_confirmed',
      ip,
      user_agent: userAgent,
      metadata: {},
    });
  }

  /**
   * T-16 — withdrawal of consent for electronic signing. Distinct from
   * decline (which says "I will not sign"); this says "I no longer
   * consent to signing electronically". Per ESIGN §7001(c)(1) the user
   * must always have a withdrawal procedure. Since Seald only operates
   * electronically, withdrawal terminates the request without an
   * alternative, mirroring the operator-policy note exposed to the
   * signer in the UI confirmation copy.
   *
   * Implementation re-uses the decline pipeline so all the side effects
   * (sender notification, session invalidation for other signers, audit
   * job enqueue) happen exactly once, then prepends a discrete
   * `consent_withdrawn` event to the chain so the audit PDF can
   * differentiate withdrawal from decline.
   */
  async withdrawConsent(
    envelope: Envelope,
    signer: EnvelopeSigner,
    reason: string | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ status: 'declined'; envelope_status: Envelope['status'] }> {
    await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'consent_withdrawn',
      ip,
      user_agent: userAgent,
      metadata: {
        reason_provided: reason !== null && reason.length > 0,
        reason_length: reason?.length ?? 0,
      },
    });
    // Chain into the decline path. Pass a structured reason so the
    // sender notification and audit PDF read correctly.
    const declineReason = reason ?? 'Signer withdrew consent for electronic signing.';
    return this.decline(envelope, signer, declineReason, ip, userAgent);
  }

  /**
   * Fill a non-signature field (date / text / checkbox / email). Enforces:
   *   - field exists in envelope + belongs to THIS signer (else 404)
   *   - field is not a signature/initials kind (those use /sign/signature)
   *   - payload shape matches field kind (text vs boolean)
   */
  async fillField(
    envelope: Envelope,
    signer: EnvelopeSigner,
    field_id: string,
    body: { value_text?: string; value_boolean?: boolean },
    ip: string | null,
    userAgent: string | null,
  ): Promise<EnvelopeField> {
    const field = envelope.fields.find((f) => f.id === field_id);
    if (!field) throw new NotFoundException('field_not_found');
    if (field.signer_id !== signer.id) throw new NotFoundException('field_not_found');
    if (field.kind === 'signature' || field.kind === 'initials') {
      throw new BadRequestException('wrong_field_kind');
    }

    // Kind → expected payload shape. Service is authoritative; DTO is a
    // defense-in-depth first pass.
    if (field.kind === 'checkbox') {
      if (typeof body.value_boolean !== 'boolean') {
        throw new BadRequestException('wrong_field_kind');
      }
    } else if (typeof body.value_text !== 'string') {
      throw new BadRequestException('wrong_field_kind');
    }

    const updated = await this.repo.fillField(field_id, signer.id, {
      value_text: body.value_text ?? null,
      value_boolean: body.value_boolean ?? null,
    });
    if (!updated) throw new NotFoundException('field_not_found');

    await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'field_filled',
      ip,
      user_agent: userAgent,
      metadata: { field_id, kind: field.kind },
    });

    return updated;
  }

  /**
   * Finalize the signer's participation:
   *   1. Enforce pre-conditions — TC accepted, all required fields filled,
   *      signature uploaded. These also exist as repo-level invariants but
   *      we check here first to return precise 4xx slugs.
   *   2. Atomic submit via repo.submitSigner (row-conditional UPDATE).
   *   3. Append `signed` event.
   *   4. If this was the last signer: append `all_signed` event and enqueue
   *      a `seal` job (the worker picks it up in Phase 3e).
   *
   * Returns `{ status: 'submitted', envelope_status }`. Controller clears the
   * session cookie on success — further /sign/* calls from this signer will
   * 401 until a new /sign/start (impossible since their token can only
   * activate when signer is !signed/declined, which is no longer true).
   */
  async submit(
    envelope: Envelope,
    signer: EnvelopeSigner,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ status: 'submitted'; envelope_status: Envelope['status'] }> {
    if (signer.tc_accepted_at === null) {
      throw new PreconditionFailedException('tc_required');
    }
    // Required fields for THIS signer must all be filled.
    const myFields = envelope.fields.filter((f) => f.signer_id === signer.id);
    const hasSignatureField = myFields.some((f) => f.kind === 'signature' || f.kind === 'initials');
    if (!hasSignatureField) {
      // Data-integrity guard — envelopes.service.send already enforces this
      // at send time, but if something slipped through, 412 is the right
      // precondition failure.
      throw new PreconditionFailedException('signature_required');
    }
    const unfilledRequired = myFields.filter(
      (f) => f.required && f.kind !== 'signature' && f.kind !== 'initials' && f.filled_at === null,
    );
    if (unfilledRequired.length > 0) {
      throw new UnprocessableEntityException('missing_fields');
    }

    const submitted = await this.repo.submitSigner(signer.id, ip, userAgent);
    if (!submitted) {
      // Race or missing signature — re-read to tell the user why.
      const fresh = await this.repo.findByIdWithAll(envelope.id);
      const freshSigner = fresh?.signers.find((s) => s.id === signer.id);
      if (!fresh || fresh.status !== 'awaiting_others') {
        throw new GoneException('envelope_terminal');
      }
      if (freshSigner?.signed_at) throw new ConflictException('already_signed');
      if (freshSigner?.declined_at) throw new ConflictException('already_declined');
      // No signature image yet.
      throw new PreconditionFailedException('signature_required');
    }

    await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'signed',
      ip,
      user_agent: userAgent,
      metadata: {},
    });

    if (submitted.all_signed) {
      await this.repo.appendEvent({
        envelope_id: envelope.id,
        actor_kind: 'system',
        event_type: 'all_signed',
        metadata: {},
      });
      await this.repo.enqueueJob(envelope.id, 'seal');
    }

    return { status: 'submitted', envelope_status: submitted.envelope_status };
  }

  /**
   * Terminal decline — any signer declining aborts the whole envelope
   * (parallel-mode MVP). Flow:
   *
   *   1. repo.declineSigner atomically: signer.declined_at + envelope.status
   *      = 'declined'. Returns null on lost race → map to 4xx via re-read.
   *   2. Append `declined` event carrying the reason in metadata.
   *   3. For every OTHER signer:
   *      - if they had not signed yet: kind='withdrawn_to_signer' email
   *      - if they had signed: kind='withdrawn_after_sign' email
   *      - session_invalidated_by_decline event for audit
   *   4. If the envelope carries sender_email (set at send time), enqueue
   *      a `declined_to_sender` email so the sender isn't surprised by the
   *      status flip in their dashboard.
   *   5. Enqueue an audit_only job so the worker (Phase 3e) still produces
   *      an audit.pdf documenting what happened.
   */
  async decline(
    envelope: Envelope,
    signer: EnvelopeSigner,
    reason: string | null,
    ip: string | null,
    userAgent: string | null,
  ): Promise<{ status: 'declined'; envelope_status: Envelope['status'] }> {
    const updated = await this.repo.declineSigner(signer.id, reason, ip, userAgent);
    if (!updated) {
      const fresh = await this.repo.findByIdWithAll(envelope.id);
      const freshSigner = fresh?.signers.find((s) => s.id === signer.id);
      if (!fresh || fresh.status !== 'awaiting_others') {
        throw new GoneException('envelope_terminal');
      }
      if (freshSigner?.signed_at) throw new ConflictException('already_signed');
      if (freshSigner?.declined_at) throw new ConflictException('already_declined');
      throw new GoneException('envelope_terminal');
    }

    // Audit event. reason lives on signer row (decline_reason column) and is
    // referenced by the audit PDF; we store length/presence in the event
    // metadata so the sender's event stream shows it without leaking the
    // reason to other signers' views.
    const declinedEvent = await this.repo.appendEvent({
      envelope_id: envelope.id,
      signer_id: signer.id,
      actor_kind: 'signer',
      event_type: 'declined',
      ip,
      user_agent: userAgent,
      metadata: {
        reason_provided: reason !== null && reason.length > 0,
        reason_length: reason?.length ?? 0,
      },
    });

    // Session-invalidation audit event for every other signer, plus the
    // appropriate withdrawal email.
    const publicUrl = this.env.APP_PUBLIC_URL.replace(/\/$/, '');
    const others = updated.signers.filter((s) => s.id !== signer.id);

    // Pre-render a single timeline for the `withdrawn_after_sign` kind:
    // (sent → each who signed → withdrawn pending). Rendered once even if
    // multiple recipients share it.
    const withdrawnTimelineHtml = (() => {
      const events: TimelineEventFragment[] = [];
      if (envelope.sent_at !== null) {
        events.push({
          label: `Envelope sent by ${envelope.sender_name ?? envelope.sender_email ?? 'the sender'}`,
          at: formatUtc(envelope.sent_at),
        });
      }
      for (const s of updated.signers) {
        if (s.signed_at !== null) {
          events.push({ label: `${s.name} signed`, at: formatUtc(s.signed_at) });
        }
      }
      events.push({
        label: `Envelope withdrawn by ${signer.name}`,
        at: formatUtc(new Date().toISOString()),
        pending: true,
      });
      return buildTimelineHtml(events);
    })();

    for (const other of others) {
      await this.repo.appendEvent({
        envelope_id: envelope.id,
        signer_id: other.id,
        actor_kind: 'system',
        event_type: 'session_invalidated_by_decline',
        metadata: { cause_signer_id: signer.id },
      });

      const wasSigned = other.signed_at !== null;
      await this.outboundEmails.insert({
        envelope_id: envelope.id,
        signer_id: other.id,
        kind: wasSigned ? 'withdrawn_after_sign' : 'withdrawn_to_signer',
        to_email: other.email,
        to_name: other.name,
        source_event_id: declinedEvent.id,
        payload: {
          sender_name: envelope.sender_name ?? envelope.sender_email ?? 'The document sender',
          envelope_title: envelope.title,
          signed_at_readable: wasSigned ? formatUtc(other.signed_at!) : '',
          public_url: publicUrl,
          ...(wasSigned ? { timeline_html: withdrawnTimelineHtml } : {}),
        },
      });
    }

    // Sender-facing withdrawal email. sender_email was stamped at send time
    // (see EnvelopesService.send → sendDraft). Defensive guard — pre-0004
    // envelopes won't carry it and we skip rather than fail the decline.
    if (envelope.sender_email) {
      await this.outboundEmails.insert({
        envelope_id: envelope.id,
        signer_id: null,
        kind: 'declined_to_sender',
        to_email: envelope.sender_email,
        to_name: envelope.sender_name ?? envelope.sender_email,
        source_event_id: declinedEvent.id,
        payload: {
          sender_name: envelope.sender_name ?? envelope.sender_email,
          envelope_title: envelope.title,
          signer_name: signer.name,
          signer_email: signer.email,
          reason_provided: reason !== null && reason.length > 0,
          reason: reason ?? '',
          public_url: publicUrl,
        },
      });
    }

    await this.repo.enqueueJob(envelope.id, 'audit_only');

    return { status: 'declined', envelope_status: updated.status };
  }

  /**
   * Accept a signature image (PNG or JPEG), normalize via sharp to a
   * canonical 600×200 PNG, upload to a deterministic path that depends on
   * the capture *kind*, and stamp the matching column set on the signer
   * row (signature_* for full signatures, initials_* for initials).
   *
   * Storage paths:
   *   - kind='signature' → `{envelope_id}/signatures/{signer_id}.png`
   *   - kind='initials'  → `{envelope_id}/signatures/{signer_id}-initials.png`
   *
   * Before this split the two captures shared a single path/column pair,
   * which meant the second upload silently overwrote the first and the
   * worker burn-in rendered the same image at every signature/initials
   * field. Old envelopes that already submitted only carry the signature
   * artifact — the burn-in falls back to the signature image when the
   * initials artifact is absent so legacy state still seals correctly.
   */
  async setSignature(
    envelope: Envelope,
    signer: EnvelopeSigner,
    image: Buffer,
    meta: {
      kind?: SignatureKind;
      format: SignatureFormat;
      font?: string | null;
      stroke_count?: number | null;
      source_filename?: string | null;
    },
  ): Promise<EnvelopeSigner> {
    if (image.length === 0) {
      throw new BadRequestException('image_unreadable');
    }
    if (image.length > MAX_SIGNATURE_BYTES) {
      throw new PayloadTooLargeException('image_too_large');
    }
    const isPng =
      image.length >= PNG_MAGIC.length && image.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC);
    const isJpeg =
      image.length >= JPEG_MAGIC.length && image.subarray(0, JPEG_MAGIC.length).equals(JPEG_MAGIC);
    if (!isPng && !isJpeg) {
      throw new UnsupportedMediaTypeException('image_not_png_or_jpeg');
    }

    let canonical: Buffer;
    try {
      canonical = await sharp(image)
        .resize(SIGNATURE_TARGET_WIDTH, SIGNATURE_TARGET_HEIGHT, {
          fit: 'inside',
          withoutEnlargement: false,
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      throw new BadRequestException('image_unreadable');
    }

    const kind: SignatureKind = meta.kind ?? 'signature';
    const path = signatureStoragePath(envelope.id, signer.id, kind);
    await this.storage.upload(path, canonical, 'image/png');

    const input: SetSignerSignatureInput = {
      kind,
      signature_format: meta.format,
      signature_image_path: path,
      signature_font: meta.font ?? null,
      signature_stroke_count: meta.stroke_count ?? null,
      signature_source_filename: meta.source_filename ?? null,
    };
    return this.repo.setSignerSignature(signer.id, input);
  }
}

// Re-exported here so existing callers that imported the helper from this
// module before the helper moved to ./signature-paths keep working. New
// imports should target ./signature-paths directly.
export { signatureStoragePath } from './signature-paths';

function assertStillSignable(envelope: Envelope, signer: EnvelopeSigner): void {
  if (envelope.status !== 'awaiting_others') {
    throw new GoneException('envelope_terminal');
  }
  if (signer.signed_at !== null) {
    throw new ConflictException('already_signed');
  }
  if (signer.declined_at !== null) {
    throw new ConflictException('already_declined');
  }
}

/** ISO timestamp → "2026-04-24 13:05 UTC" for human-readable email copy. */
function formatUtc(iso: string): string {
  const date = new Date(iso);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const hours = String(date.getUTCHours()).padStart(2, '0');
  const minutes = String(date.getUTCMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes} UTC`;
}

/** "Ada Lovelace" → "A***e L***e" so co-signer names don't fully leak. */
function maskName(name: string): string {
  return name
    .split(/\s+/)
    .map((part) => {
      if (part.length <= 1) return part;
      if (part.length === 2) return `${part[0]}*`;
      return `${part[0]}***${part[part.length - 1]}`;
    })
    .join(' ');
}
