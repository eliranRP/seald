/**
 * Pre-rendered HTML fragments for the transactional email templates.
 *
 * The MVP template engine is deliberately loop-free (`{{var}}` only), so
 * any block that needs per-signer or per-event iteration has to be
 * rendered to a single HTML string *before* it lands in the outbound
 * email payload. Two fragments live here:
 *
 *  - `buildSignerListHtml()` — emits the `<div class="signers">…</div>`
 *    block used by `reminder`, `completed`, and `expired_to_sender`.
 *  - `buildTimelineHtml()`   — emits the `<ul class="timeline">…</ul>`
 *    block used by `completed` and `withdrawn_after_sign`.
 *
 * The class names match the shared stylesheet at
 * `apps/api/src/email/templates/_email.css` verbatim. Both builders are
 * trust boundaries — every dynamic value is HTML-escaped on the way out,
 * because `TemplateService.render()` passes variable values through as
 * raw strings (by design, so these builders can inject markup).
 */

export interface SignerFragment {
  readonly name: string;
  readonly email: string;
  /** UI status used by the template (maps from backend SignerUiStatus). */
  readonly status: 'signed' | 'pending' | 'waiting' | 'declined' | 'expired';
  /** Optional — appended to the status pill like "Signed · Apr 22". */
  readonly completedLabel?: string;
}

export interface BuildSignerListOptions {
  /**
   * When set, the row whose email matches gets "(that's you)" appended
   * to its name — matches the reminder template in the design kit.
   */
  readonly highlightEmail?: string;
}

export interface TimelineEventFragment {
  readonly label: string;
  /** Pre-formatted timestamp shown under the label. Empty string is fine. */
  readonly at: string;
  /** Render the dot in amber instead of success green. */
  readonly pending?: boolean;
}

/**
 * Build the signer-list block. Returns an empty string for an empty
 * list — the `{{signer_list_html}}` placeholder then collapses to nothing
 * without leaving an empty-card visual artifact.
 */
export function buildSignerListHtml(
  signers: ReadonlyArray<SignerFragment>,
  options?: BuildSignerListOptions,
): string {
  if (signers.length === 0) return '';
  const highlight = options?.highlightEmail?.toLowerCase();

  // Gmail namespace-prefixes every class in the shared <style> block
  // but also strips some class declarations during its render pass —
  // avatars end up invisible (white letter on white bg, no amber
  // background) and status pills lose their color. Inline the critical
  // paints on each element so the rendering is deterministic in Gmail,
  // Outlook, Apple Mail, and webmail clones alike.
  const AVATAR_STYLE = (status: SignerFragment['status']): string => {
    const bg = avatarBgFor(status);
    return (
      'display:inline-block;' +
      'width:28px;height:28px;line-height:28px;' +
      'border-radius:9999px;' +
      `background:${bg};` +
      'color:#FFFFFF !important;' +
      'font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;' +
      'font-size:11px;font-weight:700;' +
      'text-align:center;vertical-align:middle;' +
      'text-decoration:none;flex-shrink:0;'
    );
  };
  const STATUS_STYLE = (status: SignerFragment['status']): string => {
    const { bg, fg } = statusPillColors(status);
    return (
      'font-family:JetBrains Mono,ui-monospace,monospace;' +
      'font-size:10px;font-weight:600;letter-spacing:0.05em;' +
      'text-transform:uppercase;' +
      'padding:3px 8px;border-radius:9999px;' +
      `background:${bg};color:${fg};`
    );
  };
  const SIGNER_EMAIL_STYLE =
    'color:#64748B !important;font-size:12px;margin-top:1px;' +
    'text-decoration:none !important;pointer-events:none;';
  // An anchor wrapper is the most reliable way to defeat Gmail's
  // auto-linker: if the email is already inside an <a>, Gmail won't
  // re-wrap it with its own blue/underlined mailto. `display:
  // inline-block` on the <b> / <a> breaks `text-decoration`
  // inheritance so any parent underline stops at the boundary.
  const SIGNER_EMAIL_ANCHOR_STYLE =
    'display:inline-block;color:#64748B !important;' +
    'font-family:Inter,-apple-system,BlinkMacSystemFont,Segoe UI,Arial,sans-serif;' +
    'font-size:12px;font-weight:400;' +
    'text-decoration:none !important;pointer-events:none;';

  // Row layout — table, not flex. Gmail's mobile client drops flex
  // `gap`, doesn't always constrain middle columns on tight viewports,
  // and Outlook desktop falls back to Word's legacy engine which
  // doesn't understand flex at all. A three-column table renders
  // identically in every client and auto-sizes without overflow
  // artifacts (the 360px mobile Gmail screenshot showed the email
  // text bleeding under the status pill before this change).
  const rows = signers
    .map((s) => {
      const initials = initialsOf(s.name);
      const avatarClass = avatarClassFor(s.status);
      const statusClass = statusClassFor(s.status);
      const statusLabel = statusLabelFor(s.status, s.completedLabel);
      const isSelf = highlight !== undefined && s.email.toLowerCase() === highlight;
      const nameSuffix = isSelf
        ? ' <span style="color:#64748B;font-weight:400;white-space:nowrap;">(that\'s you)</span>'
        : '';
      // Layout: 2-column row (avatar | name + email + pill). Keeping
      // the pill under the email instead of in its own right column
      // lets the whole row shrink to any viewport width without the
      // pill falling off-screen on mobile Gmail (tested at 360px).
      return (
        `<tr class="signer-row">` +
        `<td style="padding:12px 12px 12px 14px;width:28px;vertical-align:top;line-height:0;">` +
        `<span class="avatar ${avatarClass}" style="${AVATAR_STYLE(s.status)}">${escapeHtml(initials)}</span>` +
        `</td>` +
        `<td class="signer-meta" style="padding:10px 14px 12px 0;vertical-align:top;font-family:Inter,-apple-system,Segoe UI,Arial,sans-serif;">` +
        `<div class="signer-name" style="font-weight:600;color:#0B1220;font-size:13px;line-height:1.35;overflow-wrap:anywhere;">${escapeHtml(s.name)}${nameSuffix}</div>` +
        // Pre-wrap in an inline-styled anchor so Gmail skips its
        // auto-linker. `display: inline-block` on the anchor breaks
        // `text-decoration` inheritance so any parent underline
        // doesn't reach inside.
        `<div class="signer-email" style="${SIGNER_EMAIL_STYLE}overflow-wrap:anywhere;">` +
        `<a href="mailto:${escapeHtml(s.email)}" style="${SIGNER_EMAIL_ANCHOR_STYLE}">${escapeHtml(s.email)}</a>` +
        `</div>` +
        `<div style="margin-top:8px;">` +
        `<span class="signer-status ${statusClass}" style="${STATUS_STYLE(s.status)}">${escapeHtml(statusLabel)}</span>` +
        `</div>` +
        `</td>` +
        `</tr>`
      );
    })
    .join('');

  return (
    `<table role="presentation" class="signers" cellspacing="0" cellpadding="0" border="0" ` +
    `style="margin:18px 0 14px;border:1px solid #E2E8F0;border-radius:12px;border-collapse:separate;width:100%;">` +
    rows +
    `</table>`
  );
}

/**
 * Build the timeline block. Returns an empty string for an empty list.
 */
export function buildTimelineHtml(events: ReadonlyArray<TimelineEventFragment>): string {
  if (events.length === 0) return '';
  const items = events
    .map((e) => {
      const liClass = e.pending === true ? ' class="pending"' : '';
      const timeHtml = e.at.length > 0 ? `<time>${escapeHtml(e.at)}</time>` : '';
      return `<li${liClass}>${protectEmailsInLabel(e.label)}${timeHtml}</li>`;
    })
    .join('');
  return `<ul class="timeline">${items}</ul>`;
}

/**
 * HTML-escape a label AND auto-wrap any bare email address in an
 * inline-styled anchor so Gmail's auto-linker leaves it alone. Timeline
 * labels like "Envelope sent by eliranazulay@gmail.com" would otherwise
 * get blue-underlined by Gmail's mailto auto-wrap.
 *
 * RFC 5322 is not supported in full — this targets the shape Gmail's
 * auto-linker uses (`local@domain.tld`). Addresses that appear inside a
 * dynamic value will still be caught because `escapeHtml` runs first on
 * the non-email segments, preserving user-controlled content safely.
 */
function protectEmailsInLabel(label: string): string {
  const EMAIL = /([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g;
  const parts = label.split(EMAIL);
  return parts
    .map((part, i) => {
      // Odd indices are the captured emails; even indices are the
      // surrounding text that still needs escaping.
      if (i % 2 === 1) {
        const escaped = escapeHtml(part);
        return (
          `<a href="mailto:${escaped}" style="display:inline-block;color:inherit;font-weight:inherit;font-family:inherit;font-size:inherit;text-decoration:none;pointer-events:none;">` +
          escaped +
          `</a>`
        );
      }
      return escapeHtml(part);
    })
    .join('');
}

// --- mappers ---------------------------------------------------------------

/**
 * Minimal signer shape that the callers (envelopes/sealing/signing
 * services) all carry. Kept local so this module doesn't depend on the
 * NestJS layer.
 */
export interface SignerSnapshot {
  readonly name: string;
  readonly email: string;
  readonly status: 'awaiting' | 'viewing' | 'completed' | 'declined';
  readonly signed_at: string | null;
}

/**
 * Convenience wrapper — map a list of backend signers straight to the
 * signer-list HTML fragment. For the `expired_to_sender` case, pass
 * `asExpiredWhenUnsigned: true` so unsigned rows render as "Did not
 * sign" (status-expired) instead of "Pending" (status-pending).
 */
export function buildSignerListHtmlFromSigners(
  signers: ReadonlyArray<SignerSnapshot>,
  options?: BuildSignerListOptions & { readonly asExpiredWhenUnsigned?: boolean },
): string {
  const fragments: SignerFragment[] = signers.map((s) => {
    const base: SignerFragment = {
      name: s.name,
      email: s.email,
      status: mapSignerStatus(s.status, options?.asExpiredWhenUnsigned === true),
      ...(s.signed_at !== null ? { completedLabel: formatSignedDate(s.signed_at) } : {}),
    };
    return base;
  });
  const passOpts =
    options?.highlightEmail !== undefined ? { highlightEmail: options.highlightEmail } : undefined;
  return buildSignerListHtml(fragments, passOpts);
}

function mapSignerStatus(
  backend: SignerSnapshot['status'],
  asExpiredWhenUnsigned: boolean,
): SignerFragment['status'] {
  if (backend === 'completed') return 'signed';
  if (backend === 'declined') return 'declined';
  if (asExpiredWhenUnsigned) return 'expired';
  return backend === 'viewing' ? 'waiting' : 'pending';
}

/** "2026-04-22T14:18:07.000Z" → "Apr 22". */
function formatSignedDate(iso: string): string {
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
  return `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// --- helpers ---------------------------------------------------------------

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

function avatarClassFor(status: SignerFragment['status']): string {
  switch (status) {
    case 'signed':
      return 'avatar-success';
    case 'pending':
      return 'avatar-amber';
    case 'waiting':
    case 'declined':
    case 'expired':
    default:
      return 'avatar-slate';
  }
}

/** Inline background color so Gmail can't strip the amber/green/slate
 *  ring that the status semantic depends on. Mirrors the `.avatar-*`
 *  classes in `_email.css`. */
function avatarBgFor(status: SignerFragment['status']): string {
  switch (status) {
    case 'signed':
      return '#10B981';
    case 'pending':
      return '#F59E0B';
    case 'waiting':
    case 'expired':
      return '#64748B';
    case 'declined':
      return '#EF4444';
    default:
      return '#4F46E5';
  }
}

/** Background + foreground color pair for the status pill. Mirrors the
 *  `.status-*` classes in `_email.css`. */
function statusPillColors(status: SignerFragment['status']): { bg: string; fg: string } {
  switch (status) {
    case 'signed':
      return { bg: '#ECFDF5', fg: '#047857' };
    case 'pending':
      return { bg: '#FEF3C7', fg: '#92400E' };
    case 'declined':
      return { bg: '#FEE2E2', fg: '#991B1B' };
    case 'expired':
    case 'waiting':
    default:
      return { bg: '#F1F5F9', fg: '#475569' };
  }
}

function statusClassFor(status: SignerFragment['status']): string {
  switch (status) {
    case 'signed':
      return 'status-signed';
    case 'pending':
      return 'status-pending';
    case 'declined':
      return 'status-declined';
    case 'expired':
      return 'status-expired';
    case 'waiting':
    default:
      return 'status-waiting';
  }
}

function statusLabelFor(status: SignerFragment['status'], completedLabel?: string): string {
  switch (status) {
    case 'signed':
      return completedLabel !== undefined && completedLabel.length > 0
        ? `Signed · ${completedLabel}`
        : 'Signed';
    case 'pending':
      return 'Pending';
    case 'waiting':
      return 'Waiting';
    case 'declined':
      return 'Declined';
    case 'expired':
      return 'Did not sign';
    default:
      return status;
  }
}

const ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(input: string): string {
  return input.replace(/[&<>"']/g, (ch) => ESCAPE_MAP[ch] ?? ch);
}
