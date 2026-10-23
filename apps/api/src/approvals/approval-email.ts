import { APPROVAL_POLICY, type ApprovalSummary, type ApproveRequires } from 'shared';
import { sortRecipients } from './approval-state';

/**
 * Template variables for the `approval_request` and `approval_denied`
 * emails (docs/design/mcp-server.md § Owner approval). The template
 * engine is loop- and branch-free, so the variant blocks are built here
 * as `*_html` fragments; every dynamic value is HTML-escaped on the way
 * in. Inline styles throughout (Gmail strips classes), emails wrapped in
 * a styled anchor so Gmail's auto-linker leaves them alone, tables, not
 * flex.
 */

function approvalLinks(publicUrl: string, approvalId: string, token: string) {
  return {
    approveUrl: `${publicUrl}/approve#${token}`,
    // `?intent=deny` pre-focuses Deny on the page and never acts by itself.
    denyUrl: `${publicUrl}/approve?intent=deny#${token}`,
    reviewUrl: reviewUrlFor(publicUrl, approvalId),
  };
}

/** The signed-in guided review. Never a token link. */
export function reviewUrlFor(publicUrl: string, approvalId: string): string {
  return `${publicUrl}/approve/${approvalId}/review`;
}

export interface ApprovalRequestVarsInput {
  readonly summary: ApprovalSummary;
  readonly approveRequires: ApproveRequires;
  readonly publicUrl: string;
  readonly approvalId: string;
  readonly token: string;
  /** Set when this email follows an owner edit from Review. */
  readonly fieldsUpdated: boolean;
}

export function buildApprovalRequestVars(
  input: ApprovalRequestVarsInput,
): Record<string, string | number> {
  const { summary } = input;
  const links = approvalLinks(input.publicUrl, input.approvalId, input.token);
  const recipients = sortRecipients(summary.recipients);
  return {
    action_label: summary.action_label,
    key_name: summary.key_name,
    title: summary.title ?? summary.action_label,
    page_count_readable: pagesReadable(summary.page_count),
    approver_html: mailboxHtml(summary.approver_email),
    approver_email: summary.approver_email,
    recipients_html: recipientsHtml(recipients),
    recipients_text: recipientsText(recipients),
    destination_html: destinationHtml(summary),
    destination_text: summary.destination ? `Destination: ${summary.destination.label}\n` : '',
    updated_html: input.fieldsUpdated ? UPDATED_HTML : '',
    updated_text: input.fieldsUpdated
      ? 'Fields updated. This email replaces the previous one.\n\n'
      : '',
    actions_html:
      input.approveRequires === 'link'
        ? knownActionsHtml(links.approveUrl, links.reviewUrl, links.denyUrl)
        : sessionActionsHtml(links.reviewUrl, links.denyUrl),
    actions_text:
      input.approveRequires === 'link'
        ? `Approve:\n  ${links.approveUrl}\n\nReview fields:\n  ${links.reviewUrl}\n\nDeny:\n  ${links.denyUrl}\n`
        : `Sign in to approve:\n  ${links.reviewUrl}\n\nDeny:\n  ${links.denyUrl}\n`,
    public_url: input.publicUrl,
  };
}

export interface ApprovalDeniedVarsInput {
  readonly summary: ApprovalSummary;
  readonly publicUrl: string;
  /** The third denial in 24 hours suspended the key's `envelopes:send`. */
  readonly suspended: boolean;
}

export function buildApprovalDeniedVars(
  input: ApprovalDeniedVarsInput,
): Record<string, string | number> {
  return {
    key_name: input.summary.key_name,
    action_label: input.summary.action_label,
    title: input.summary.title ?? input.summary.action_label,
    suspended_line: input.suspended
      ? `${input.summary.key_name} was denied ${APPROVAL_POLICY.denialsToSuspend} times in 24 hours, so it can no longer send until you review it.`
      : '',
    settings_url: `${input.publicUrl}/settings/developers`,
    public_url: input.publicUrl,
  };
}

function pagesReadable(pages: number | null): string {
  if (pages === null || pages === 0) return '—';
  return pages === 1 ? '1 page' : `${pages} pages`;
}

const HTML_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => HTML_ESCAPE[ch] ?? ch);
}

const FONT = 'Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif';

/** An address inside a styled anchor, so Gmail does not re-link it. */
function mailboxHtml(email: string): string {
  return (
    `<a href="mailto:${escapeHtml(email)}" style="display:inline-block;color:#1f2937 !important;` +
    `font-family:${FONT};text-decoration:none !important;pointer-events:none;overflow-wrap:anywhere;">` +
    `${escapeHtml(email)}</a>`
  );
}

const NEW_BADGE =
  '<span style="display:inline-block;margin-left:6px;padding:1px 7px;border-radius:9999px;' +
  'background:#fef3c7;color:#92400e;font-family:JetBrains Mono,ui-monospace,monospace;' +
  'font-size:10px;font-weight:600;letter-spacing:0.05em;text-transform:uppercase;">New</span>';

/** At most 3 rows, New first, then "+N more". The text part lists everyone. */
function recipientsHtml(recipients: ApprovalSummary['recipients']): string {
  if (recipients.length === 0) return '';
  const shown = recipients.slice(0, APPROVAL_POLICY.recipientsShown);
  const rest = recipients.length - shown.length;
  const rows = shown
    .map(
      (r) =>
        `<tr><td style="padding:10px 14px;border-top:1px solid #e2e8f0;font-family:${FONT};">` +
        `<div style="font-weight:600;color:#0b1220;font-size:13px;line-height:1.35;overflow-wrap:anywhere;">` +
        `${escapeHtml(r.name)}${r.is_new ? NEW_BADGE : ''}</div>` +
        `<div style="font-size:12px;margin-top:1px;">${mailboxHtml(r.email)}</div>` +
        `</td></tr>`,
    )
    .join('');
  const more =
    rest > 0
      ? `<tr><td style="padding:10px 14px;border-top:1px solid #e2e8f0;font-family:${FONT};` +
        `font-size:12px;color:#64748b;">+${rest} more</td></tr>`
      : '';
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" ` +
    `style="margin:16px 0 4px;width:100%;border:1px solid #e2e8f0;border-radius:12px;border-collapse:separate;">` +
    `<tr><td style="padding:10px 14px;font-family:JetBrains Mono,ui-monospace,monospace;font-size:11px;` +
    `font-weight:600;letter-spacing:0.08em;text-transform:uppercase;color:#475569;">` +
    `Recipients (${recipients.length})</td></tr>` +
    rows +
    more +
    `</table>`
  );
}

function recipientsText(recipients: ApprovalSummary['recipients']): string {
  if (recipients.length === 0) return '';
  const lines = recipients.map((r) => `  - ${r.name} <${r.email}>${r.is_new ? ' (new)' : ''}`);
  return `Recipients:\n${lines.join('\n')}\n`;
}

function destinationHtml(summary: ApprovalSummary): string {
  if (!summary.destination) return '';
  return (
    `<p style="margin:12px 0 0;font-family:${FONT};font-size:14px;color:#1f2937;">` +
    `<span style="color:#64748b;">Destination</span> ` +
    `<b style="color:#0b1220;font-weight:600;overflow-wrap:anywhere;">${escapeHtml(summary.destination.label)}</b></p>`
  );
}

const UPDATED_HTML =
  '<span style="display:inline-block;margin:0 0 10px;padding:2px 8px;border-radius:9999px;' +
  'background:#e0e7ff;color:#3730a3;font-family:JetBrains Mono,ui-monospace,monospace;' +
  'font-size:11px;font-weight:600;letter-spacing:0.05em;">Fields updated</span>';

function primaryButton(href: string, label: string): string {
  return (
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" ` +
    `style="display:block;padding:12px 18px;background:#0b1220;color:#ffffff !important;` +
    `text-decoration:none !important;border:1px solid #0b1220;border-radius:10px;font-family:${FONT};` +
    `font-weight:600;font-size:15px;line-height:1.2;text-align:center;">${escapeHtml(label)}</a>`
  );
}

function secondaryButton(href: string, label: string): string {
  return (
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" ` +
    `style="display:block;padding:10px 18px;background:#ffffff;color:#0b1220 !important;` +
    `text-decoration:none !important;border:1px solid #cbd5e1;border-radius:10px;font-family:${FONT};` +
    `font-weight:600;font-size:14px;line-height:1.2;text-align:center;">${escapeHtml(label)}</a>`
  );
}

function denyLink(href: string): string {
  return (
    `<a href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" ` +
    `style="color:#64748b !important;font-family:${FONT};font-size:13px;text-decoration:underline;">Deny</a>`
  );
}

function actionsTable(rows: readonly string[]): string {
  return (
    `<table role="presentation" cellspacing="0" cellpadding="0" border="0" ` +
    `style="margin-top:20px;width:100%;border-collapse:separate;">` +
    rows.map((cell) => `<tr><td style="padding:0 0 10px;">${cell}</td></tr>`).join('') +
    `</table>`
  );
}

/** Every recipient known: full-width Approve, secondary Review fields, small Deny link. */
function knownActionsHtml(approveUrl: string, reviewUrl: string, denyUrl: string): string {
  return actionsTable([
    primaryButton(approveUrl, 'Approve'),
    secondaryButton(reviewUrl, 'Review fields'),
    `<div style="text-align:center;">${denyLink(denyUrl)}</div>`,
  ]);
}

/** Approve needs a session: one main button into the review, and the small Deny link. */
function sessionActionsHtml(reviewUrl: string, denyUrl: string): string {
  return actionsTable([
    primaryButton(reviewUrl, 'Sign in to approve'),
    `<div style="text-align:center;">${denyLink(denyUrl)}</div>`,
  ]);
}
