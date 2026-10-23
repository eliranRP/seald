import type { ApprovalDetail, ApprovalKind, ApprovalSummary } from 'shared';
import { ENVELOPE_ID, fakeDetail, fakeSummary } from '../fixtures';

/** WP-45: an owner action as the card sees it. Fake values only. */
const FACTS: Partial<Record<ApprovalKind, ApprovalSummary['facts']>> = {
  account_delete: [{ label: 'Account', value: 'owner@example.test' }],
  account_export: [{ label: 'Account', value: 'owner@example.test' }],
  api_key_create: [
    { label: 'Name', value: 'Zapier' },
    { label: 'Scopes', value: 'envelopes:read, envelopes:write' },
    { label: 'Expires', value: '90 days after you approve' },
  ],
  api_key_revoke: [
    { label: 'Key', value: 'Zapier' },
    { label: 'Key ending', value: 'abcdefgh' },
  ],
  approval_required_toggle: [
    { label: 'Key', value: 'Key 2' },
    { label: 'Ask before each send', value: 'Off' },
  ],
  automation_rotate_secret: [{ label: 'Old secret', value: 'Keeps working for 24 hours' }],
  oauth_grant_revoke: [
    { label: 'App', value: 'Claude' },
    { label: 'Website', value: 'claude.ai' },
  ],
  envelope_sign_as_signer: [
    { label: 'Signing as', value: 'Maya Owner <owner@example.test>' },
    { label: 'Signature · page 1', value: 'Your signature, adopted on this page' },
    { label: 'Initials · page 2', value: 'Your initials, adopted on this page' },
    { label: 'Date · page 2', value: '2026-10-23' },
  ],
};

const LABELS: Partial<Record<ApprovalKind, string>> = {
  account_delete: 'Delete your Seald account',
  account_export: 'Export your Seald data',
  api_key_create: 'Create an API key',
  api_key_revoke: 'Revoke an API key',
  approval_required_toggle: 'Stop asking before each send',
  automation_rotate_secret: 'Rotate a webhook signing secret',
  oauth_grant_revoke: 'Disconnect an app',
  envelope_sign_as_signer: 'Sign as yourself',
};

/** Obviously fake, low-entropy secret for the show-once sheet. */
export const FAKE_KEY_SECRET = `seald_live_${'x'.repeat(43)}`;

export function fakeOwnerDetail(
  kind: ApprovalKind,
  overrides: Partial<ApprovalDetail> = {},
): ApprovalDetail {
  const signs = kind === 'envelope_sign_as_signer';
  return fakeDetail({
    kind,
    approve_requires: 'session',
    envelope_id: signs ? ENVELOPE_ID : null,
    summary: fakeSummary({
      kind,
      action_label: LABELS[kind] ?? 'Approve',
      title: signs ? 'Services agreement' : null,
      recipients: [],
      page_count: signs ? 3 : null,
      facts: FACTS[kind] ?? [],
    }),
    ...overrides,
  });
}
