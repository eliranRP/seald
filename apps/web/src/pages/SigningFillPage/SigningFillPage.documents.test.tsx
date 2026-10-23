import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import * as flagsModule from 'shared';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import {
  MOCK_ENVELOPE_ID,
  MOCK_SIGNER_ID,
  createSigningApiMock,
  makeSignMeResponse,
} from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({
    promise: Promise.reject(new Error('jsdom-stub')),
    destroy: () => Promise.resolve(),
  }),
  GlobalWorkerOptions: { workerSrc: '' },
}));

import { signApiClient } from '../../lib/api/signApiClient';
import { SigningFillPage } from './SigningFillPage';

const get = signApiClient.get as unknown as ReturnType<typeof vi.fn>;

const DOC_A = '11111111-1111-4111-8111-111111111111';
const DOC_B = '22222222-2222-4222-8222-222222222222';

function okResponse<T>(data: T) {
  return { data, status: 200, statusText: 'OK', headers: {}, config: {} };
}

/** Two documents: A holds an optional text field, B holds the one required signature. */
function twoDocumentResponse() {
  const base = makeSignMeResponse();
  return {
    ...base,
    signer: { ...base.signer, tc_accepted_at: '2026-04-24T00:00:00Z' },
    documents: [
      { id: DOC_A, ord: 1, title: 'Master agreement', original_pages: 2 },
      { id: DOC_B, ord: 2, title: 'Side letter', original_pages: 1 },
    ],
    fields: [
      {
        id: 'f-a-text',
        signer_id: MOCK_SIGNER_ID,
        kind: 'text',
        page: 1,
        x: 0.1,
        y: 0.2,
        required: false,
        value_text: null,
        filled_at: null,
        document_id: DOC_A,
      },
      {
        id: 'f-b-sig',
        signer_id: MOCK_SIGNER_ID,
        kind: 'signature',
        page: 1,
        x: 0.1,
        y: 0.5,
        required: true,
        value_text: null,
        filled_at: null,
        document_id: DOC_B,
      },
    ],
  };
}

function renderFill() {
  return renderSigningRoute(<SigningFillPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/fill`,
    path: '/sign/:envelopeId/fill',
  });
}

function setFlag(on: boolean): void {
  vi.spyOn(flagsModule, 'isFeatureEnabled').mockImplementation(
    (flag: string) => on && flag === 'multiDocumentEnvelopes',
  );
}

beforeEach(() => {
  get.mockReset();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SigningFillPage with several documents', () => {
  it('shows a document rail, and only the fields of the document on screen', async () => {
    setFlag(true);
    get.mockImplementation(async (url: string) =>
      url === '/sign/pdf'
        ? okResponse({ url: 'https://example.test/a.pdf' })
        : okResponse(twoDocumentResponse()),
    );
    renderFill();

    const rail = await screen.findByRole('navigation', { name: /documents to sign/i });
    const buttons = within(rail).getAllByRole('button');
    expect(buttons).toHaveLength(2);
    expect(buttons[0]).toHaveAttribute('aria-current', 'true');
    expect(buttons[0]).toHaveAccessibleName(/master agreement, document 1 of 2, done/i);
    expect(buttons[1]).toHaveAccessibleName(/side letter, document 2 of 2, 1 left/i);

    // Document A's optional text field is on screen; document B's signature is not.
    expect(await screen.findByRole('button', { name: /text \(optional\)/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^sign here/i })).not.toBeInTheDocument();
  });

  it('switches document from the rail and asks the API for that document PDF', async () => {
    setFlag(true);
    get.mockImplementation(async (url: string) =>
      url === '/sign/pdf'
        ? okResponse({ url: 'https://example.test/x.pdf' })
        : okResponse(twoDocumentResponse()),
    );
    renderFill();

    const rail = await screen.findByRole('navigation', { name: /documents to sign/i });
    await userEvent.click(within(rail).getByRole('button', { name: /side letter/i }));

    expect(
      await screen.findByRole('button', { name: /sign here \(required\)/i }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /text \(optional\)/i })).not.toBeInTheDocument();
    await waitFor(() => {
      const pdfCalls = get.mock.calls.filter((c) => c[0] === '/sign/pdf');
      expect(
        pdfCalls.some(
          (c) => (c[1] as { params?: { document_id?: string } })?.params?.document_id === DOC_B,
        ),
      ).toBe(true);
    });
  });

  it('"Next field" jumps to a required field on another document', async () => {
    setFlag(true);
    get.mockImplementation(async (url: string) =>
      url === '/sign/pdf'
        ? okResponse({ url: 'https://example.test/x.pdf' })
        : okResponse(twoDocumentResponse()),
    );
    renderFill();

    // The only required field is the signature on the second document.
    await userEvent.click(await screen.findByRole('button', { name: 'Next' }));

    const rail = screen.getByRole('navigation', { name: /documents to sign/i });
    await waitFor(() => {
      expect(within(rail).getByRole('button', { name: /side letter/i })).toHaveAttribute(
        'aria-current',
        'true',
      );
    });
    expect(
      await screen.findByRole('button', { name: /sign here \(required\)/i }),
    ).toBeInTheDocument();
  });

  it('renders no rail and no document names with the flag off', async () => {
    setFlag(false);
    get.mockImplementation(async (url: string) =>
      url === '/sign/pdf'
        ? okResponse({ url: 'https://example.test/x.pdf' })
        : okResponse(twoDocumentResponse()),
    );
    renderFill();

    await screen.findByRole('progressbar');
    expect(
      screen.queryByRole('navigation', { name: /documents to sign/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next' })).toBeInTheDocument();
  });
});
