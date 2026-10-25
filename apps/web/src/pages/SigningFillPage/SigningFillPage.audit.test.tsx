import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen } from '@testing-library/react';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID, createSigningApiMock } from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

// Stub pdfjs-dist so DocumentPageCanvas does not try to hit /sign/pdf in jsdom.
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
const post = signApiClient.post as unknown as ReturnType<typeof vi.fn>;

function okResponse<T>(data: T, status = 200) {
  return { data, status, statusText: 'OK', headers: {}, config: {} };
}

interface FieldFixture {
  readonly id: string;
  readonly signer_id: string;
  readonly kind: 'text' | 'signature' | 'date' | 'email' | 'name' | 'checkbox' | 'initials';
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly required: boolean;
  readonly value_text: string | null;
  readonly value_boolean?: boolean | null;
  readonly filled_at: string | null;
  readonly link_id?: string;
}

/** Build a custom SignMeResponse with explicit field placements. */
function makeFixture(fields: ReadonlyArray<FieldFixture>) {
  return {
    envelope: {
      id: MOCK_ENVELOPE_ID,
      title: 'Audit Doc',
      short_code: 'DOC-AUDIT-0001',
      status: 'awaiting_others',
      original_pages: 1,
      expires_at: '2030-01-01T00:00:00.000Z',
      tc_version: '2026-04-24',
      privacy_version: '2026-04-24',
    },
    signer: {
      id: 'signer-audit',
      email: 'maya@example.com',
      name: 'Maya Raskin',
      color: '#10B981',
      role: 'signatory',
      status: 'viewing',
      viewed_at: null,
      tc_accepted_at: '2026-04-24T00:00:00Z',
      signed_at: null,
      declined_at: null,
    },
    fields,
    other_signers: [],
  };
}

function renderFill() {
  return renderSigningRoute(<SigningFillPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/fill`,
    path: '/sign/:envelopeId/fill',
  });
}

beforeEach(() => {
  get.mockReset();
  post.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* ---------------------------------------------------------------------- */
/* [HIGH] item 1 — Mobile canvas overflow                                  */
/* ---------------------------------------------------------------------- */

describe('SigningFillPage — mobile canvas width (audit item 1)', () => {
  it('renders the canvas at <= viewport width on a 375 px iPhone', async () => {
    // jsdom defaults to window.innerWidth = 1024; force a 375 viewport
    // so the page picks the mobile canvas width branch.
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true });
    window.dispatchEvent(new Event('resize'));
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'f-text',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 60,
            y: 300,
            required: true,
            value_text: null,
            filled_at: null,
          },
        ]),
      ),
    );
    renderFill();

    // Wait for the document canvas to mount; the page panel carries
    // `data-r-page` and `data-canvas-width` once it renders.
    const pageNode = await screen.findByText('Audit Doc', { selector: 'div' });
    const canvasNode = pageNode.closest('[data-r-page]');
    expect(canvasNode).not.toBeNull();
    // The canvas page node carries a data-canvas-width attribute that
    // reflects the prop passed to <DocumentPageCanvas>. In styled-
    // components v6 the css `width:` is in a generated class, not an
    // inline style attribute, so we read the data attribute instead
    // (which is the actual rendered width in px).
    const widthAttr = canvasNode?.getAttribute('data-canvas-width');
    expect(widthAttr).not.toBeNull();
    const widthPx = Number.parseInt(widthAttr ?? '0', 10);
    expect(Number.isFinite(widthPx)).toBe(true);
    expect(widthPx).toBeLessThanOrEqual(375);
  });

  it('renders the page at the 640 px paper width on a desktop viewport', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    window.dispatchEvent(new Event('resize'));
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'f-text',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 60,
            y: 300,
            required: true,
            value_text: null,
            filled_at: null,
          },
        ]),
      ),
    );
    renderFill();

    const pageNode = await screen.findByText('Audit Doc', { selector: 'div' });
    const canvasNode = pageNode.closest('[data-r-page]');
    // Canvas `.paper` is 640 wide; fields are fractions, so they scale with it.
    expect(canvasNode?.getAttribute('data-canvas-width')).toBe('640');
  });
});

/* ---------------------------------------------------------------------- */
/* [HIGH] item 2 — Tab order by visual (y, x)                              */
/* ---------------------------------------------------------------------- */

describe('SigningFillPage — tab order follows visual (y, x) (audit item 2)', () => {
  it('orders fields by required-first then (y, x) so the top-left field is focused first via Tab', async () => {
    // API returns fields in [C, A, B] order; visual layout is:
    //   A: y=50,  x=20  (top-left, required)
    //   B: y=50,  x=300 (top-right, required)
    //   C: y=400, x=20  (bottom-left, required)
    // Reading order is A → B → C; current implementation tabs in
    // source order (C → A → B) which is wrong.
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'C',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 400,
            required: true,
            value_text: null,
            filled_at: null,
            link_id: 'C-label',
          },
          {
            id: 'A',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 50,
            required: true,
            value_text: null,
            filled_at: null,
            link_id: 'A-label',
          },
          {
            id: 'B',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 300,
            y: 50,
            required: true,
            value_text: null,
            filled_at: null,
            link_id: 'B-label',
          },
        ]),
      ),
    );
    renderFill();

    const fieldA = await screen.findByRole('button', { name: /A-label \(required\)/i });
    const fieldB = await screen.findByRole('button', { name: /B-label \(required\)/i });
    const fieldC = await screen.findByRole('button', { name: /C-label \(required\)/i });

    // In the DOM, fields are rendered in sorted reading order so
    // browser default tab navigation hits A → B → C. Assert document
    // order, not Tab keypresses (jsdom's focus tab semantics are
    // unreliable).
    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[data-kind="text"]'),
    );
    const idxA = buttons.indexOf(fieldA as HTMLButtonElement);
    const idxB = buttons.indexOf(fieldB as HTMLButtonElement);
    const idxC = buttons.indexOf(fieldC as HTMLButtonElement);
    expect(idxA).toBeGreaterThanOrEqual(0);
    expect(idxA).toBeLessThan(idxB);
    expect(idxB).toBeLessThan(idxC);
  });

  it('puts required fields before optional fields in tab order', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    // OPTIONAL field appears visually before the REQUIRED field, but
    // the audit specifies required-first then visual order.
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'optional-top',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 50,
            required: false,
            value_text: null,
            filled_at: null,
            link_id: 'optional-top',
          },
          {
            id: 'required-bottom',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 400,
            required: true,
            value_text: null,
            filled_at: null,
            link_id: 'required-bottom',
          },
        ]),
      ),
    );
    renderFill();

    const optional = await screen.findByRole('button', { name: /optional-top \(optional\)/i });
    const required = await screen.findByRole('button', { name: /required-bottom \(required\)/i });

    const buttons = Array.from(
      document.querySelectorAll<HTMLButtonElement>('button[data-kind="text"]'),
    );
    expect(buttons.indexOf(required as HTMLButtonElement)).toBeLessThan(
      buttons.indexOf(optional as HTMLButtonElement),
    );
  });
});
