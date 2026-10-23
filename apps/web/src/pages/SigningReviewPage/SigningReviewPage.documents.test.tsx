import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import * as flagsModule from 'shared';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import {
  MOCK_ENVELOPE_ID,
  MOCK_SIGNER_ID,
  createSigningApiMock,
  makeSignMeResponse,
} from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

import { signApiClient } from '../../lib/api/signApiClient';
import { SigningReviewPage } from './SigningReviewPage';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

function filled(id: string, documentId: string, label: string) {
  return {
    id,
    signer_id: MOCK_SIGNER_ID,
    kind: 'text',
    link_id: label,
    page: 1,
    x: 0.1,
    y: 0.1,
    required: true,
    value_text: `value ${id}`,
    filled_at: '2026-04-24T00:00:00Z',
    document_id: documentId,
  };
}

// API order mixes the documents; the review groups them by document order.
const TWO_DOCS = makeSignMeResponse({
  documents: [
    { id: DOC_A, ord: 1, title: 'Master agreement', original_pages: 2 },
    { id: DOC_B, ord: 2, title: 'Side letter', original_pages: 1 },
  ],
  fields: [
    filled('b-1', DOC_B, 'Clause'),
    filled('a-1', DOC_A, 'Clause'),
    filled('a-2', DOC_A, 'Address'),
  ],
});

function okResponse<T>(data: T) {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} };
}

function renderReview() {
  return renderSigningRoute(<SigningReviewPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/review`,
    path: '/sign/:envelopeId/review',
  });
}

function setFlag(on: boolean): void {
  vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
    (flag: string) => on && flag === 'multiDocumentEnvelopes',
  );
}

beforeEach(() => {
  get.mockReset();
  get.mockResolvedValue(okResponse(TWO_DOCS));
  window.sessionStorage.clear();
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('SigningReviewPage with several documents', () => {
  it('groups the filled fields by document and names the document on each row', async () => {
    setFlag(true);
    renderReview();

    const rows = await screen.findAllByTestId(/^review-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'review-row-a-1',
      'review-row-a-2',
      'review-row-b-1',
    ]);
    expect(within(rows[0]!).getByText(/Master agreement/)).toBeInTheDocument();
    expect(within(rows[2]!).getByText(/Side letter/)).toBeInTheDocument();
    // Two "Clause" rows exist; the Edit buttons say which document each belongs to.
    expect(screen.getByRole('button', { name: 'Edit Clause in Master agreement' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Edit Clause in Side letter' })).toBeVisible();
  });

  it('keeps the plain list with the flag off', async () => {
    setFlag(false);
    renderReview();
    const rows = await screen.findAllByTestId(/^review-row-/);
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'review-row-b-1',
      'review-row-a-1',
      'review-row-a-2',
    ]);
    expect(screen.queryByText(/Master agreement/)).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Edit Clause' })).toHaveLength(2);
  });
});
