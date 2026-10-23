import type { ApprovalKind, ApprovalSummary } from 'shared';

/**
 * WP-45 approval-page copy and the facts the sign-as-signer page reads.
 * Fixed sentences only; titles, names and key names are data.
 */

/** The warning each owner action shows above Approve. */
export const OWNER_ACTION_WARNINGS: Readonly<Partial<Record<ApprovalKind, string>>> = {
  account_delete:
    // The same warning the account menu's Delete shows (useAccountActions).
    'This will permanently delete your account, every envelope you sent, and every contact / template you saved. Your API keys stop working. This cannot be undone.',
  account_export:
    'After you approve, download the file here. It holds your account data, so keep it somewhere safe. It is never sent to the app that asked.',
  api_key_create:
    'Approving creates the key and shows it once on this page. Copy it into the app you trust. Seald does not show it again or send it to the app that asked.',
  api_key_revoke: 'Any app using this key stops working at once. This cannot be undone.',
  oauth_grant_revoke:
    'This app loses access to your Seald account at once. To use it again, connect it again.',
  approval_required_toggle:
    'With this off, an app using this key can send documents for signature without asking you each time. Seald still asks before it sends to anyone you have not sent to before. You are responsible for sends made with your keys (Terms §4.1).',
  automation_rotate_secret:
    'Approving creates a new signing secret and shows it once on this page. The old secret keeps working for 24 hours, so update the receiving app before then.',
  envelope_sign_as_signer:
    'You are signing this document yourself, here. Seald applies your signature only when you approve. The app that asked does not sign.',
};

/** Fact labels the server writes for `envelope_sign_as_signer` (sign-as-signer-kind.ts). */
const SIGNING_AS = 'Signing as';
const SIGNATURE_PREFIX = 'Signature · ';
const INITIALS_PREFIX = 'Initials · ';

export interface SignerFacts {
  readonly name: string;
  readonly email: string;
  readonly needsSignature: boolean;
  readonly needsInitials: boolean;
}

/** "Maya Raskin <maya@example.com>" → name and email, plus which images the page must collect. */
export function signerFacts(summary: ApprovalSummary): SignerFacts {
  const facts = summary.facts ?? [];
  const who = facts.find((f) => f.label === SIGNING_AS)?.value ?? '';
  const match = /^(.*) <([^>]+)>$/.exec(who);
  return {
    name: match?.[1] ?? '',
    email: match?.[2] ?? summary.approver_email,
    needsSignature: facts.some((f) => f.label.startsWith(SIGNATURE_PREFIX)),
    needsInitials: facts.some((f) => f.label.startsWith(INITIALS_PREFIX)),
  };
}

/** The typed confirmation matches the account email, ignoring case and spaces at the ends. */
export function emailMatches(typed: string, accountEmail: string): boolean {
  return typed.trim().toLowerCase() === accountEmail.trim().toLowerCase();
}

/** A captured PNG as base64, for the Approve body. */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = typeof reader.result === 'string' ? reader.result : '';
      resolve(url.slice(url.indexOf(',') + 1));
    };
    reader.onerror = () => {
      reject(reader.error ?? new Error('read_failed'));
    };
    reader.readAsDataURL(blob);
  });
}
