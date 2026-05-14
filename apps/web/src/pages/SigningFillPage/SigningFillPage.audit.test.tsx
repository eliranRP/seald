import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import { MOCK_ENVELOPE_ID, createSigningApiMock } from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

// Stub pdfjs-dist so DocumentPageCanvas does not try to hit /sign/pdf in jsdom.
vi.mock('pdfjs-dist', () => ({
  getDocument: () => ({ promise: Promise.reject(new Error('jsdom-stub')) }),
  GlobalWorkerOptions: { workerSrc: '' },
}));
vi.mock('pdfjs-dist/build/pdf.worker.min.mjs?url', () => ({ default: '' }));

// eslint-disable-next-line import/first
import { signApiClient } from '../../lib/api/signApiClient';
// eslint-disable-next-line import/first
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
      tc_accepted_at: null,
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

  it('renders the canvas at the default 560 px on a desktop viewport', async () => {
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
    expect(canvasNode?.getAttribute('data-canvas-width')).toBe('560');
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

/* ---------------------------------------------------------------------- */
/* [MEDIUM] item 4 — WithdrawBtn mobile overflow menu                      */
/* ---------------------------------------------------------------------- */

describe('SigningFillPage — mobile overflow menu (audit item 4)', () => {
  it('shows a kebab "More actions" button on mobile that opens a menu with Decline + Withdraw', async () => {
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

    const kebab = await screen.findByRole('button', { name: /more actions/i });
    await userEvent.click(kebab);

    // Menu items render in a role="menu" container.
    const menu = await screen.findByRole('menu', { name: /more actions/i });
    expect(within(menu).getByRole('menuitem', { name: /decline/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /withdraw consent/i })).toBeInTheDocument();
    expect(within(menu).getByRole('menuitem', { name: /need help/i })).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------- */
/* [MEDIUM] item 5 — Mobile "Fields" panel                                 */
/* ---------------------------------------------------------------------- */

describe('SigningFillPage — mobile fields panel (audit item 5)', () => {
  it('opens a Fields panel listing every field on the active page with status', async () => {
    Object.defineProperty(window, 'innerWidth', { value: 375, writable: true, configurable: true });
    window.dispatchEvent(new Event('resize'));
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'a',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 50,
            required: true,
            value_text: null,
            filled_at: null,
            link_id: 'Full name',
          },
          {
            id: 'b',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 400,
            required: false,
            value_text: null,
            filled_at: null,
            link_id: 'Notes',
          },
        ]),
      ),
    );
    renderFill();

    const toggle = await screen.findByRole('button', { name: /^fields$/i });
    await userEvent.click(toggle);

    const panel = await screen.findByRole('dialog', { name: /fields on this page/i });
    expect(within(panel).getByRole('button', { name: /full name/i })).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: /notes/i })).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------- */
/* [MEDIUM] item 6 — Mobile progress label collapses count                 */
/* ---------------------------------------------------------------------- */

describe('SigningFillPage — mobile progress label (audit item 6)', () => {
  it('embeds the count inside the progress label on mobile ("0 of 1 · 0%")', async () => {
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

    // On mobile the progress bar's aria-label is "0 of 1 · 0%" and the
    // separate "0/1" ProgressCount block disappears.
    const bar = await screen.findByRole('progressbar', { name: /0 of 1 · 0%/i });
    expect(bar).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------- */
/* [LOW] item 8 — NextBtn aria-label                                       */
/* ---------------------------------------------------------------------- */

describe('SigningFillPage — Next button accessible name (audit item 8)', () => {
  it('NextBtn carries an aria-label describing the next field and its page', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'a',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 50,
            required: true,
            value_text: null,
            filled_at: null,
            link_id: 'Job title',
          },
        ]),
      ),
    );
    renderFill();

    const next = await screen.findByRole('button', {
      name: /next field: job title on page 1/i,
    });
    expect(next).toBeInTheDocument();
  });
});

/* ---------------------------------------------------------------------- */
/* [LOW] item 9 — Optional-fields submit prompt                            */
/* ---------------------------------------------------------------------- */

describe('SigningFillPage — review prompt for optional fields (audit item 9)', () => {
  it('opens a dialog when Review is clicked with optional fields blank', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    // 1 required (filled), 2 optional (blank) → clicking Review must
    // confirm the user wants to skip those optionals.
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'r1',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 50,
            required: true,
            value_text: 'done',
            filled_at: '2026-05-01T00:00:00Z',
            link_id: 'req',
          },
          {
            id: 'o1',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 100,
            required: false,
            value_text: null,
            filled_at: null,
            link_id: 'opt1',
          },
          {
            id: 'o2',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 200,
            required: false,
            value_text: null,
            filled_at: null,
            link_id: 'opt2',
          },
        ]),
      ),
    );
    renderFill();

    const review = await screen.findByRole('button', { name: /review & finish/i });
    await userEvent.click(review);

    const dialog = await screen.findByRole('dialog', { name: /optional fields blank/i });
    expect(within(dialog).getByText(/you have 2 optional fields blank/i)).toBeInTheDocument();
    // Two CTAs: continue OR fill now.
    expect(within(dialog).getByRole('button', { name: /continue to review/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /fill them now/i })).toBeInTheDocument();
  });

  it('does NOT open the dialog when no optional fields exist', async () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 1440,
      writable: true,
      configurable: true,
    });
    get.mockResolvedValue(
      okResponse(
        makeFixture([
          {
            id: 'r1',
            signer_id: 'signer-audit',
            kind: 'text',
            page: 1,
            x: 20,
            y: 50,
            required: true,
            value_text: 'done',
            filled_at: '2026-05-01T00:00:00Z',
            link_id: 'req',
          },
        ]),
      ),
    );
    renderFill();

    const review = await screen.findByRole('button', { name: /review & finish/i });
    await userEvent.click(review);

    // The pathname-probe should flip immediately to /review when no
    // confirmation is required.
    // no semantic role: __pathname__ is a test-only sentinel probe (rule 4.6 escape hatch)
    expect(screen.getByTestId('__pathname__').textContent).toBe(`/sign/${MOCK_ENVELOPE_ID}/review`);
  });
});
