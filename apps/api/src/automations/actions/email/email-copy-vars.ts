import type { AutomationTrigger } from 'shared';

/**
 * Template variables for an `automation_copy` mail, minus the stop link
 * (minted per send attempt). Everything is a plain string. `*_html` values
 * are the only ones that reach the HTML body unescaped, so they escape
 * their own dynamic parts here. Never carries a signing link, a download
 * URL or an attachment (design doc § Email copy).
 */

const EVENT_COPY: Readonly<
  Record<AutomationTrigger, { readonly label: string; readonly phrase: string }>
> = {
  envelope_sealed: { label: 'Sealed', phrase: 'was sealed' },
  signer_signed: { label: 'Signature recorded', phrase: 'was signed' },
  signer_declined: { label: 'Declined', phrase: 'was declined' },
  envelope_expired: { label: 'Expired', phrase: 'expired' },
  envelope_viewed: { label: 'Viewed', phrase: 'was viewed' },
  envelope_sent: { label: 'Sent for signature', phrase: 'was sent for signature' },
};

const STATUS_LABELS: Readonly<Record<string, string>> = {
  draft: 'Draft',
  awaiting_others: 'Waiting for signatures',
  sealing: 'Sealing',
  completed: 'Completed',
  declined: 'Declined',
  expired: 'Expired',
  canceled: 'Canceled',
};

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

/** One line only: the value lands in a subject header. */
function oneLine(input: string): string {
  return input.replace(/[\r\n\u2028\u2029]+/g, ' ').trim();
}

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? oneLine(status.replace(/_/g, ' '));
}

export interface EmailCopyVarsInput {
  readonly automationId: string;
  readonly ownerId: string;
  readonly trigger: AutomationTrigger;
  readonly envelopeId: string;
  readonly envelopeTitle: string;
  readonly envelopeStatus: string;
  readonly shortCode: string;
  readonly signerName: string | null;
  readonly senderEmail: string;
  readonly senderName: string | null;
  readonly recipient: string;
  readonly appPublicUrl: string;
}

export function buildEmailCopyPayload(input: EmailCopyVarsInput): Record<string, string> {
  const publicUrl = input.appPublicUrl.replace(/\/+$/, '');
  const copy = EVENT_COPY[input.trigger];
  const signer = input.signerName ? oneLine(input.signerName) : '';
  // The in-app link goes only to the owner's own mailbox.
  const toOwner = input.recipient.trim().toLowerCase() === input.senderEmail.trim().toLowerCase();
  const dashboardUrl = `${publicUrl}/document/${input.envelopeId}`;
  return {
    automation_id: input.automationId,
    owner_id: input.ownerId,
    event_label: copy.label,
    event_phrase: copy.phrase,
    envelope_title: oneLine(input.envelopeTitle),
    status_label: statusLabel(input.envelopeStatus),
    short_code: input.shortCode,
    verify_url: `${publicUrl}/verify/${encodeURIComponent(input.shortCode)}`,
    sender_name: oneLine(input.senderName ?? '') || input.senderEmail,
    sender_email: input.senderEmail,
    public_url: publicUrl,
    signer_row_html: signer
      ? `<tr><td style="padding: 4px 16px 4px 0; color: #64748b">Signer</td><td style="padding: 4px 0"><span style="color: #1f2937; text-decoration: none">${escapeHtml(signer)}</span></td></tr>`
      : '',
    signer_line_text: signer ? `Signer: ${signer}\n` : '',
    dashboard_link_html: toOwner
      ? `<p class="muted" style="margin-top: 14px"><a href="${escapeHtml(dashboardUrl)}" style="color: #4f46e5; text-decoration: underline">Open in Seald</a></p>`
      : '',
    dashboard_text: toOwner ? `\nOpen in Seald:\n  ${dashboardUrl}\n` : '',
  };
}
