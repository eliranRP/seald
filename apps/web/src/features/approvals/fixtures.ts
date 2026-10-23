import type { ApprovalCard, ApprovalDetail, ApprovalRecipient, ApprovalSummary } from 'shared';
import type { Envelope } from '@/features/envelopes';

/** Fake values for tests and stories. None is a real token or address. */
export const FAKE_TOKEN = 'a'.repeat(43);
export const FAKE_CSRF = 'c'.repeat(43);
export const APPROVAL_ID = '11111111-1111-4111-8111-111111111111';
export const ENVELOPE_ID = '22222222-2222-4222-8222-222222222222';

export const KNOWN_RECIPIENTS: ApprovalRecipient[] = [
  { name: 'Ada Lovelace', email: 'ada@example.test', is_new: false },
  { name: 'Grace Hopper', email: 'grace@example.test', is_new: false },
];

export const NEW_RECIPIENT: ApprovalRecipient = {
  name: 'Linus Torvalds',
  email: 'linus@example.test',
  is_new: true,
};

export const MANY_RECIPIENTS: ApprovalRecipient[] = [
  ...KNOWN_RECIPIENTS,
  { name: 'Alan Turing', email: 'alan@example.test', is_new: false },
  { name: 'Edsger Dijkstra', email: 'edsger@example.test', is_new: false },
  NEW_RECIPIENT,
];

export function fakeSummary(overrides: Partial<ApprovalSummary> = {}): ApprovalSummary {
  return {
    kind: 'envelope_send',
    action_label: 'Send for signature',
    title: 'Services agreement',
    recipients: KNOWN_RECIPIENTS,
    page_count: 3,
    key_name: 'Key 2',
    approver_email: 'owner@example.test',
    destination: null,
    ...overrides,
  };
}

export function fakeCard(overrides: Partial<ApprovalCard> = {}): ApprovalCard {
  return {
    state: 'pending',
    approval_id: APPROVAL_ID,
    summary: fakeSummary(),
    approve_requires: 'link',
    expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    fields_updated_at: null,
    result_slug: null,
    review_url: `${window.location.origin}/approve/${APPROVAL_ID}/review`,
    csrf: FAKE_CSRF,
    ...overrides,
  };
}

export function fakeDetail(overrides: Partial<ApprovalDetail> = {}): ApprovalDetail {
  return {
    id: APPROVAL_ID,
    kind: 'envelope_send',
    status: 'pending',
    summary: fakeSummary(),
    approve_requires: 'link',
    envelope_id: ENVELOPE_ID,
    requested_at: '2026-10-22T10:00:00.000Z',
    expires_at: new Date(Date.now() + 23 * 60 * 60 * 1000).toISOString(),
    decided_at: null,
    fields_updated_at: null,
    result_slug: null,
    result: null,
    ...overrides,
  };
}

const NOW = '2026-10-22T10:00:00.000Z';

type EnvelopeWithoutDocuments = Omit<Envelope, 'documents'>;

function baseEnvelope(): EnvelopeWithoutDocuments {
  return {
    id: ENVELOPE_ID,
    owner_id: '33333333-3333-4333-8333-333333333333',
    title: 'Services agreement',
    short_code: 'ABCDEFGHJKMNP',
    status: 'draft',
    original_pages: 2,
    expires_at: NOW,
    tc_version: '1',
    privacy_version: '1',
    sent_at: null,
    completed_at: null,
    signers: [
      {
        id: 's1',
        email: 'ada@example.test',
        name: 'Ada Lovelace',
        color: '#F472B6',
        role: 'signatory',
        signing_order: 1,
        status: 'awaiting',
        viewed_at: null,
        tc_accepted_at: null,
        signed_at: null,
        declined_at: null,
      },
      {
        id: 's2',
        email: 'grace@example.test',
        name: 'Grace Hopper',
        color: '#7DD3FC',
        role: 'signatory',
        signing_order: 2,
        status: 'awaiting',
        viewed_at: null,
        tc_accepted_at: null,
        signed_at: null,
        declined_at: null,
      },
    ],
    fields: [
      {
        id: 'f1',
        signer_id: 's1',
        kind: 'signature',
        page: 1,
        x: 0.1,
        y: 0.8,
        width: 0.3,
        height: 0.07,
        required: true,
        document_id: 'd1',
      },
      {
        id: 'f2',
        signer_id: 's2',
        kind: 'date',
        page: 1,
        x: 0.55,
        y: 0.8,
        width: 0.2,
        height: 0.04,
        required: true,
        document_id: 'd1',
      },
      {
        id: 'f3',
        signer_id: 's1',
        kind: 'initials',
        page: 2,
        x: 0.8,
        y: 0.9,
        width: 0.1,
        height: 0.05,
        required: true,
        document_id: 'd1',
      },
      {
        id: 'f4',
        signer_id: 's2',
        kind: 'signature',
        page: 1,
        x: 0.1,
        y: 0.5,
        width: 0.3,
        height: 0.07,
        required: true,
        document_id: 'd2',
      },
    ],
    tags: [],
    created_at: NOW,
    updated_at: NOW,
  };
}

/** Two signers, two documents (2 + 1 pages), four fields. */
export function fakeEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return {
    ...baseEnvelope(),
    documents: [
      {
        id: 'd1',
        ord: 1,
        title: 'Services agreement',
        original_pages: 2,
        original_sha256: null,
        sealed_sha256: null,
      },
      {
        id: 'd2',
        ord: 2,
        title: 'Schedule A',
        original_pages: 1,
        original_sha256: null,
        sealed_sha256: null,
      },
    ],
    ...overrides,
  };
}

/** The same envelope as a single-document draft with no document list. */
export function fakeSingleDocumentEnvelope(overrides: Partial<Envelope> = {}): Envelope {
  return { ...baseEnvelope(), ...overrides };
}
