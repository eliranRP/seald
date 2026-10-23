import {
  BadRequestException,
  ConflictException,
  GoneException,
  NotFoundException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import {
  API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
  APPROVAL_SIGNATURE_MAX_BYTES,
  ESIGN_DISCLOSURE_VERSION,
  calendarDateInZone,
  formatCalendarDate,
  isDateFormat,
  isValidTimeZone,
  uuid,
  type ApprovalApproveBody,
  type ApprovalFact,
  type ApprovalSignatureImage,
  type Envelope,
} from 'shared';
import { z } from 'zod';
import { sameMailbox } from '../../email/insert-idempotent';
import type { EnvelopeDocumentsService } from '../../envelopes/documents/envelope-documents.service';
import type { EnvelopesService } from '../../envelopes/envelopes.service';
import type { AccessAuthService } from '../../signing/access-auth/access-auth.service';
import { isSignersTurn } from '../../signing/signing-order';
import type { SigningService } from '../../signing/signing.service';
import type { ApprovalKindHandler, DescribedSubject } from './approval-kind';
import { envelopeFacts, fieldsOf } from './envelope-kinds';

/** The services the owner's own signature goes through (the same ones `/sign/*` calls). */
export interface SignAsSignerServices {
  readonly envelopes: EnvelopesService;
  readonly documents: EnvelopeDocumentsService;
  readonly accessAuth: AccessAuthService;
  readonly signing: SigningService;
}

const Args = z.strictObject({ envelope_id: uuid, signer_id: uuid });
type Args = z.infer<typeof Args>;

type Signer = Envelope['signers'][number];
type Field = Envelope['fields'][number];

/** Marks every signer event the approval page causes (S.6: in the hash chain). */
export const VIA_MCP_APPROVAL = 'mcp_approval';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** What Approve will do for this signer: the images it needs and the values it fills. */
export interface SignPlan {
  readonly needsSignature: boolean;
  readonly needsInitials: boolean;
  /** Required fields the server fills itself: the date, the signer's name and email, a read-only default. */
  readonly autoFills: ReadonlyArray<{ readonly field: Field; readonly value: string }>;
}

const FIELD_LABELS: Readonly<Record<string, string>> = {
  signature: 'Signature',
  initials: 'Initials',
  date: 'Date',
  text: 'Text',
  checkbox: 'Checkbox',
  email: 'Email',
  name: 'Name',
  number: 'Number',
  radio: 'Choice',
  dropdown: 'List',
};

function defaultText(field: Field): string | null {
  const d = field.meta?.['default'];
  if (typeof d === 'string') return d;
  if (typeof d === 'number') return String(d);
  return null;
}

/** Today in the envelope's date format and time zone (ISO when it has none). */
export function signingDate(envelope: Envelope, now: Date): string {
  const tz =
    typeof envelope.timezone === 'string' && isValidTimeZone(envelope.timezone)
      ? envelope.timezone
      : null;
  const day = calendarDateInZone(now, tz);
  if (isDateFormat(envelope.date_format)) return formatCalendarDate(day, envelope.date_format);
  const mm = String(day.month).padStart(2, '0');
  const dd = String(day.day).padStart(2, '0');
  return `${day.year}-${mm}-${dd}`;
}

/**
 * The fields this signer owns and what Approve does with each. Required
 * fields that need the signer's own answer (free text, a number, a
 * choice, a checkbox) cannot be answered on the approval page:
 * `sign_as_signer_needs_input`, and the owner signs from their link.
 */
export function planSignature(envelope: Envelope, signer: Signer, now: Date): SignPlan {
  const mine = envelope.fields.filter((f) => f.signer_id === signer.id);
  const needsSignature = mine.some((f) => f.kind === 'signature');
  const needsInitials = mine.some((f) => f.kind === 'initials');
  if (!needsSignature && !needsInitials) throw new ConflictException('signature_required');
  const autoFills: Array<{ field: Field; value: string }> = [];
  for (const field of mine) {
    if (field.kind === 'signature' || field.kind === 'initials') continue;
    if (field.filled_at) continue;
    const readOnlyDefault = field.meta?.['read_only'] === true ? defaultText(field) : null;
    let value: string | null = null;
    if (readOnlyDefault !== null) value = readOnlyDefault;
    else if (field.kind === 'date') value = signingDate(envelope, now);
    else if (field.kind === 'name') value = signer.name;
    else if (field.kind === 'email') value = signer.email;
    if (value !== null) {
      autoFills.push({ field, value });
    } else if (field.required) {
      throw new ConflictException('sign_as_signer_needs_input');
    }
  }
  return { needsSignature, needsInitials, autoFills };
}

function signableSigner(envelope: Envelope, signerId: string, ownerEmail: string): Signer {
  if (envelope.status !== 'awaiting_others') throw new GoneException('envelope_terminal');
  const signer = envelope.signers.find((s) => s.id === signerId);
  if (!signer) throw new NotFoundException('signer_not_found');
  // Never another signer: the row must carry the account's own mailbox.
  if (!sameMailbox(signer.email, ownerEmail))
    throw new ConflictException('signer_not_account_owner');
  if (signer.signed_at !== null) throw new ConflictException('already_signed');
  if (signer.declined_at !== null) throw new ConflictException('already_declined');
  if (!isSignersTurn(envelope.delivery_mode, envelope.signers, signer.id)) {
    throw new ConflictException('not_your_turn');
  }
  return signer;
}

function fieldFacts(plan: SignPlan, envelope: Envelope, signer: Signer): ApprovalFact[] {
  const mine = envelope.fields
    .filter((f) => f.signer_id === signer.id)
    .sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x);
  const auto = new Map(plan.autoFills.map((a) => [a.field.id, a.value]));
  const facts: ApprovalFact[] = [
    { label: 'Signing as', value: `${signer.name} <${signer.email}>` },
  ];
  for (const f of mine) {
    const label = `${FIELD_LABELS[f.kind] ?? 'Field'} · page ${f.page}`;
    let value = f.required ? 'Required' : 'Optional, left blank';
    if (f.kind === 'signature') value = 'Your signature, adopted on this page';
    else if (f.kind === 'initials') value = 'Your initials, adopted on this page';
    else if (auto.has(f.id)) value = auto.get(f.id) ?? '';
    else if (f.filled_at) value = 'Already filled';
    facts.push({ label, value });
  }
  return facts;
}

/** Decode and check one adopted image; the same checks `/sign/signature` makes. */
export function decodeSignatureImage(image: ApprovalSignatureImage): Buffer {
  const bytes = Buffer.from(image.image_base64, 'base64');
  if (bytes.length === 0) throw new BadRequestException('image_unreadable');
  if (bytes.length > APPROVAL_SIGNATURE_MAX_BYTES) throw new BadRequestException('image_too_large');
  const isPng = bytes.length >= PNG_MAGIC.length && bytes.subarray(0, 8).equals(PNG_MAGIC);
  const isJpeg = bytes.length >= JPEG_MAGIC.length && bytes.subarray(0, 3).equals(JPEG_MAGIC);
  if (!isPng && !isJpeg) throw new UnsupportedMediaTypeException('image_not_png_or_jpeg');
  return bytes;
}

/**
 * `envelope_sign_as_signer` (parity plan WP-45, D5). The owner signs as
 * the signer of their own envelope whose address is the account email,
 * never as anyone else. The approval page is the signer's consent: it
 * shows the ESIGN disclosure, the record-access attestation, the
 * intent-to-sign sentence (today's approved copy, D4) and the fields,
 * and the owner adopts a signature there. Nothing is applied before
 * Approve.
 *
 * Approve runs the same `SigningService` steps `/sign/*` runs, as the
 * signer (`actor_kind: signer`): terms and view, disclosure, the
 * signature images, the date / name / email fields, intent, then
 * submit. Every one of those rows carries `via: 'mcp_approval'` and
 * goes through `appendEvent` (S.6); the certificate prints it. Signer
 * rows never carry `metadata.mcp`. A signer who must enter an emailed
 * code (WP-10) is refused: the code stays the signer's own check.
 */
export function envelopeSignAsSignerKind(svc: SignAsSignerServices): ApprovalKindHandler<Args> {
  async function load(
    args: Args,
    ownerId: string,
    ownerEmail: string,
  ): Promise<{ envelope: Envelope; signer: Signer; files: string[]; pageCount: number | null }> {
    const { envelope, files, pageCount } = await envelopeFacts(svc, ownerId, args.envelope_id);
    const signer = signableSigner(envelope, args.signer_id, ownerEmail);
    const eff = await svc.accessAuth.effectiveFor(envelope.id, signer.id);
    if (eff.access !== 'none' || eff.action !== 'none') {
      throw new ConflictException('signer_access_code_required');
    }
    return { envelope, signer, files, pageCount };
  }

  return {
    kind: 'envelope_sign_as_signer',
    tool: 'envelopes_sign_as_signer',
    actionLabel: 'Sign as yourself',
    ready: true,
    args: Args,
    highRisk: () => true,
    freshSignInSeconds: API_KEY_FRESH_LOGIN_MAX_AGE_SECONDS,
    async describe(args, ctx): Promise<DescribedSubject> {
      const { envelope, signer, files, pageCount } = await load(args, ctx.ownerId, ctx.ownerEmail);
      const plan = planSignature(envelope, signer, ctx.now);
      return {
        subjectKey: `envelope:${envelope.id}:signer:${signer.id}:sign`,
        envelopeId: envelope.id,
        title: envelope.title,
        recipients: [],
        pageCount,
        destination: null,
        files,
        fields: fieldsOf(envelope),
        facts: fieldFacts(plan, envelope, signer),
        signerId: signer.id,
        extra: {
          signer_id: signer.id,
          signer_email: signer.email.toLowerCase(),
          needs_signature: plan.needsSignature,
          needs_initials: plan.needsInitials,
          esign_disclosure_version: ESIGN_DISCLOSURE_VERSION,
        },
      };
    },
    async checkApproveBody(args, body, ctx) {
      // The disclosure the page showed must be the one in force.
      if (
        body.esign_disclosure_version !== ESIGN_DISCLOSURE_VERSION ||
        body.record_access !== true ||
        body.intent_to_sign !== true
      ) {
        throw new BadRequestException('consent_required');
      }
      const { envelope, signer } = await load(args, ctx.ownerId, ctx.ownerEmail);
      const plan = planSignature(envelope, signer, ctx.now);
      if (plan.needsSignature && !body.signature)
        throw new BadRequestException('signature_required');
      if (plan.needsInitials && !body.initials) throw new BadRequestException('initials_required');
      if (body.signature) decodeSignatureImage(body.signature);
      if (body.initials) decodeSignatureImage(body.initials);
    },
    async execute(args, ctx) {
      const body: ApprovalApproveBody = ctx.body ?? {};
      const meta = { via: VIA_MCP_APPROVAL, approval_id: ctx.approvalId };
      const { ip, user_agent: ua } = ctx.audit;
      let { envelope, signer } = await load(args, ctx.ownerId, ctx.ownerEmail);
      const plan = planSignature(envelope, signer, ctx.now);

      await svc.signing.acceptTerms(envelope, signer, ip, ua, meta);
      await svc.signing.acknowledgeEsignDisclosure(
        envelope,
        signer,
        ESIGN_DISCLOSURE_VERSION,
        ip,
        ua,
        meta,
      );
      const images: Array<['signature' | 'initials', ApprovalSignatureImage | undefined]> = [
        ['signature', plan.needsSignature ? body.signature : undefined],
        ['initials', plan.needsInitials ? body.initials : undefined],
      ];
      for (const [kind, image] of images) {
        if (!image) continue;
        await svc.signing.setSignature(envelope, signer, decodeSignatureImage(image), {
          kind,
          format: image.format,
          font: image.font ?? null,
          stroke_count: image.stroke_count ?? null,
          source_filename: null,
        });
      }
      for (const { field, value } of plan.autoFills) {
        await svc.signing.fillField(
          envelope,
          signer,
          field.id,
          { value_text: value },
          ip,
          ua,
          meta,
        );
      }
      await svc.signing.confirmIntentToSign(envelope, signer, ip, ua, meta);

      // Submit reads the stamped terms and the filled fields: reload.
      ({ envelope, signer } = await load(args, ctx.ownerId, ctx.ownerEmail));
      const submitted = await svc.signing.submit(envelope, signer, ip, ua, undefined, meta);
      return {
        envelope_id: envelope.id,
        signer_id: signer.id,
        envelope_status: submitted.envelope_status,
      };
    },
  };
}
