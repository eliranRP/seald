export interface MailLinkTarget {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  /** mailto links stay in the same tab; web inboxes open a new one. */
  readonly external: boolean;
}

const GMAIL_DOMAINS = new Set(['gmail.com', 'googlemail.com']);
const OUTLOOK_DOMAINS = new Set(['outlook.com', 'hotmail.com', 'live.com', 'msn.com']);

const GMAIL: MailLinkTarget = {
  id: 'gmail',
  label: 'Open Gmail',
  href: 'https://mail.google.com/',
  external: true,
};
const OUTLOOK: MailLinkTarget = {
  id: 'outlook',
  label: 'Open Outlook',
  href: 'https://outlook.live.com/mail/',
  external: true,
};
/** No address in the href: the link opens a blank compose, nothing leaks. */
const MAIL_APP: MailLinkTarget = {
  id: 'app',
  label: 'Open email app',
  href: 'mailto:',
  external: false,
};

/**
 * Deep links for the check-email screen. Gmail / Outlook buttons only show
 * when the address domain matches; every other domain gets one generic
 * "Open email app" button.
 */
export function mailLinksFor(email: string): readonly MailLinkTarget[] {
  const domain = email.split('@')[1]?.trim().toLowerCase() ?? '';
  if (GMAIL_DOMAINS.has(domain)) return [GMAIL];
  if (OUTLOOK_DOMAINS.has(domain)) return [OUTLOOK];
  return [MAIL_APP];
}
