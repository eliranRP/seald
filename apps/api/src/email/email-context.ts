import type { Envelope } from '../envelopes/envelope.entity';
import type { EmailKindDb } from '../../db/schema';
import { buildProgressDotsHtml, buildProgressText, type ProgressDot } from './template-fragments';

/**
 * Template variables the dispatcher derives from the envelope at send time
 * (status-card emails): the signer progress dots, the document meta line,
 * and defaults for values older payloads never carried. The payload always
 * wins over these, so a caller can still pass its own value.
 */

/** Kinds addressed to a signer: the doc meta line says who it is from. */
const SIGNER_FACING: ReadonlySet<EmailKindDb> = new Set<EmailKindDb>([
  'invite',
  'reminder',
  'your_turn',
  'expired_to_signer',
  'withdrawn_to_signer',
  'withdrawn_after_sign',
  'signer_replaced',
  'signer_corrected',
  'access_code',
]);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "2026-11-20T..." → "Nov 20" (UTC). Empty string for an unparseable value. */
export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${MONTHS[d.getUTCMonth()] ?? ''} ${d.getUTCDate()}`;
}

/** "today", "yesterday", "5 days ago" — whole UTC days between two instants. */
export function formatSentAgo(sentAtIso: string, now: Date): string {
  const sent = new Date(sentAtIso);
  if (Number.isNaN(sent.getTime())) return 'earlier';
  const day = 24 * 60 * 60 * 1000;
  const days = Math.floor(
    (Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) -
      Date.UTC(sent.getUTCFullYear(), sent.getUTCMonth(), sent.getUTCDate())) /
      day,
  );
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}

function pagesLabel(pages: number | null): string {
  if (pages === null) return '';
  return pages === 1 ? '1 page' : `${pages} pages`;
}

/** One dot per signer, in signing order. The recipient's dot is `you`. */
export function progressDots(
  signers: Envelope['signers'],
  recipientSignerId: string | null,
): ProgressDot[] {
  return [...signers]
    .sort((a, b) => a.signing_order - b.signing_order)
    .map((s): ProgressDot => {
      if (s.signed_at !== null) return 'done';
      if (s.declined_at !== null || s.delivery_status === 'bounced') return 'bad';
      if (recipientSignerId !== null && s.id === recipientSignerId) return 'you';
      return 'waiting';
    });
}

export interface EmailContextInput {
  readonly kind: EmailKindDb;
  readonly signerId: string | null;
  readonly envelope: Envelope;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly publicUrl: string;
  readonly now: Date;
}

/** Derived variables for one send. Only keys the payload does not set are returned. */
export function buildEmailContextVars(input: EmailContextInput): Record<string, string> {
  const { kind, signerId, envelope, payload, publicUrl, now } = input;
  const dots = progressDots(envelope.signers, SIGNER_FACING.has(kind) ? signerId : null);
  const sender =
    typeof payload['sender_name'] === 'string' && payload['sender_name']
      ? payload['sender_name']
      : (envelope.sender_name ?? '');
  const pages = pagesLabel(envelope.original_pages);
  const signerCount =
    envelope.signers.length === 1 ? '1 signer' : `${envelope.signers.length} signers`;
  let metaTail = signerCount;
  if (SIGNER_FACING.has(kind)) metaTail = sender ? `from ${sender}` : '';
  const vars: Record<string, string> = {
    signer_progress_dots_html: buildProgressDotsHtml(dots),
    signer_progress_text: buildProgressText(dots),
    doc_meta: [pages, metaTail].filter(Boolean).join(' · '),
    expires_at_readable: formatShortDate(envelope.expires_at),
    new_link_url: `${publicUrl}/sign/${envelope.id}`,
    previous_signer_name: 'The previous signer',
    decline_reason: 'No reason given.',
    bounce_reason: '',
    sent_ago: envelope.sent_at ? formatSentAgo(envelope.sent_at, now) : 'earlier',
  };
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(vars)) {
    const given = payload[key];
    const missing = given === undefined || given === null || given === '';
    if (missing) out[key] = value;
  }
  return out;
}
