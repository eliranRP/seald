import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderSigningRoute } from '../../test/renderSigningRoute';
import {
  MOCK_ENVELOPE_ID,
  MOCK_SIGNER_ID,
  createSigningApiMock,
  makeSignMeResponse,
} from '../../test/signingApiMock';

vi.mock('../../lib/api/signApiClient', () => createSigningApiMock());

// Stub pdfjs-dist so DocumentPageCanvas doesn't try to hit /sign/pdf in jsdom.
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

/** A signer who already gave consent in this session (no consent bar). */
function started(overrides: Record<string, unknown> = {}) {
  const base = makeSignMeResponse();
  return makeSignMeResponse({
    signer: { ...base.signer, tc_accepted_at: '2026-04-24T00:00:00Z' },
    ...overrides,
  });
}

function filled(id: string, kind: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    signer_id: MOCK_SIGNER_ID,
    kind,
    page: 1,
    x: 60,
    y: 100,
    required: true,
    value_text: 'x',
    filled_at: '2026-04-24T00:00:00Z',
    ...extra,
  };
}

function renderFill(state?: unknown) {
  return renderSigningRoute(<SigningFillPage />, {
    initialEntry: `/sign/${MOCK_ENVELOPE_ID}/fill`,
    path: '/sign/:envelopeId/fill',
    ...(state === undefined ? {} : { state }),
  });
}

function pathname(): string {
  // no semantic role: __pathname__ is a test-only sentinel probe from renderSigningRoute (rule 4.6 escape hatch)
  return screen.getByTestId('__pathname__').textContent ?? '';
}

async function openMenu(): Promise<void> {
  await userEvent.click(await screen.findByRole('button', { name: 'More' }));
}

// jsdom stub for canvas toBlob used by SignatureCapture.
beforeEach(() => {
  get.mockReset();
  post.mockReset();
  post.mockResolvedValue(okResponse({}));
  get.mockResolvedValue(okResponse(started()));
  HTMLCanvasElement.prototype.toBlob = function toBlobStub(cb: BlobCallback) {
    cb(new Blob(['fake'], { type: 'image/png' }));
  };
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SigningFillPage — consent', () => {
  beforeEach(() => {
    get.mockResolvedValue(okResponse(makeSignMeResponse()));
  });

  it('asks for the one consent first and keeps the fields still', async () => {
    renderFill();
    expect(await screen.findByText(/asked you to sign|have been asked to sign/i)).toBeVisible();
    // Start without the box ticked records nothing and says what is missing.
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));
    expect(post).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Tick the box to agree');
    expect(screen.queryByRole('region', { name: 'Signing progress' })).toBeNull();

    // A tap on a field does nothing yet.
    await userEvent.click(screen.getByRole('button', { name: /text \(required\)/i }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('a fresh link asks again even when the terms were accepted before', async () => {
    get.mockResolvedValue(okResponse(started()));
    renderFill({ fresh: true });
    expect(await screen.findByRole('button', { name: 'Start' })).toBeInTheDocument();
  });

  it('Start records the terms and the ESIGN acknowledgement, then opens the fields', async () => {
    renderFill();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'I agree to sign electronically' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/sign/accept-terms', undefined, expect.any(Object));
      expect(post).toHaveBeenCalledWith(
        '/sign/esign-disclosure',
        { disclosure_version: expect.stringMatching(/^esign_/) },
        expect.any(Object),
      );
    });
    const urls = post.mock.calls.map((c) => c[0]);
    expect(urls.indexOf('/sign/accept-terms')).toBeLessThan(urls.indexOf('/sign/esign-disclosure'));
    expect(await screen.findByRole('region', { name: 'Signing progress' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Start' })).toBeNull();
  });

  it('puts the signer name and today in the name and date fields once started', async () => {
    const base = makeSignMeResponse();
    get.mockResolvedValue(
      okResponse(
        makeSignMeResponse({
          fields: [
            ...base.fields,
            { ...filled('f-name', 'text', { link_id: 'name', value_text: null, filled_at: null }) },
            { ...filled('f-date', 'date', { value_text: null, filled_at: null, x: 200 }) },
          ],
        }),
      ),
    );
    renderFill();
    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'I agree to sign electronically' }),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Start' }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/fields/f-name',
        { value_text: 'Maya Raskin' },
        expect.any(Object),
      );
      expect(post).toHaveBeenCalledWith(
        '/sign/fields/f-date',
        { value_text: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) },
        expect.any(Object),
      );
    });
  });
});

describe('SigningFillPage — filling', () => {
  it('counts the required fields and tags the one to do next', async () => {
    renderFill();
    const bar = await screen.findByRole('region', { name: 'Signing progress' });
    expect(within(bar).getByText('0 of 2')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(screen.getByTestId('field-tag')).toHaveTextContent('Fill');
  });

  it('clicking a text field opens the drawer, Apply persists the value', async () => {
    post.mockResolvedValueOnce(
      okResponse({
        id: 'f-text',
        signer_id: MOCK_SIGNER_ID,
        kind: 'text',
        page: 1,
        x: 60,
        y: 300,
        required: true,
        value_text: 'Engineer',
        filled_at: '2026-04-24T00:00:00Z',
      }),
    );
    renderFill();

    await userEvent.click(await screen.findByRole('button', { name: /text \(required\)/i }));
    const input = await screen.findByRole('textbox', { name: /text/i });
    await userEvent.type(input, 'Engineer');
    const dialog = screen.getByRole('dialog', { name: /^text$/i });
    const apply = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    );
    expect(apply).toBeDefined();
    await userEvent.click(apply!);

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/fields/f-text',
        { value_text: 'Engineer' },
        expect.any(Object),
      );
    });
  });

  it('a signature field opens the sheet on the typed name; Sign posts multipart', async () => {
    post.mockResolvedValueOnce(okResponse(makeSignMeResponse().signer));
    renderFill();

    await userEvent.click(await screen.findByRole('button', { name: /sign here \(required\)/i }));

    const dialog = await screen.findByRole('dialog', { name: 'Your signature' });
    expect(within(dialog).getByRole('textbox', { name: /your full name/i })).toHaveValue(
      'Maya Raskin',
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign' }));

    await waitFor(() => {
      const sigCalls = post.mock.calls.filter((c) => c[0] === '/sign/signature');
      expect(sigCalls).toHaveLength(1);
      const body = sigCalls[0]![1] as FormData;
      expect(body).toBeInstanceOf(FormData);
      expect(body.get('format')).toBe('typed');
      expect(body.get('image')).toBeInstanceOf(Blob);
    });
  });

  it('a 401 mid-flow redirects the user back to /sign/:id', async () => {
    post.mockRejectedValueOnce(Object.assign(new Error('session_expired'), { status: 401 }));

    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: /text \(required\)/i }));
    const input = await screen.findByRole('textbox', { name: /text/i });
    await userEvent.type(input, 'hi');
    const dialog = screen.getByRole('dialog', { name: /^text$/i });
    const apply = Array.from(dialog.querySelectorAll('button')).find(
      (b) => b.textContent === 'Apply',
    );
    await userEvent.click(apply!);

    await waitFor(() => {
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}`);
    });
  });

  it('a 413 signature upload surfaces a size-error banner (no redirect)', async () => {
    post.mockRejectedValueOnce(Object.assign(new Error('image_too_large'), { status: 413 }));

    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: /sign here \(required\)/i }));
    const dialog = await screen.findByRole('dialog', { name: 'Your signature' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(/too large/i);
  });
});

describe('SigningFillPage — finish', () => {
  beforeEach(() => {
    get.mockResolvedValue(
      okResponse(
        started({
          fields: [filled('f-sig', 'signature'), filled('f-text', 'text', { x: 300 })],
        }),
      ),
    );
  });

  it('turns the bar into Finish when everything required is done', async () => {
    renderFill();
    const bar = await screen.findByRole('region', { name: 'Signing progress' });
    expect(within(bar).getByText('2 of 2')).toBeInTheDocument();
    expect(within(bar).getByRole('button', { name: 'Finish' })).toBeInTheDocument();
  });

  it('Sign records the intent first, then submits, then opens the done page', async () => {
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finish signing' });
    expect(
      within(dialog).getByText(/you intend to sign this document electronically/i),
    ).toBeVisible();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign' }));

    await waitFor(() => {
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}/done`);
    });
    const urls = post.mock.calls.map((c) => c[0]);
    expect(urls).toEqual(['/sign/intent-to-sign', '/sign/submit']);
  });

  it('does not submit when the intent call fails', async () => {
    post.mockRejectedValueOnce(Object.assign(new Error('boom'), { status: 500 }));
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finish signing' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign' }));

    // A server fault reads as signer copy with a next step, never the raw text.
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'We could not submit right now. Please try again.',
    );
    expect(within(dialog).queryByText('boom')).toBeNull();
    expect(post.mock.calls.map((c) => c[0])).toEqual(['/sign/intent-to-sign']);
  });

  it('reads a dropped connection as a connection problem', async () => {
    post.mockRejectedValueOnce(new Error('Network Error'));
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finish signing' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Sign' }));
    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      "We couldn't reach Seald. Check your connection and try again.",
    );
  });

  it('Back closes the sheet and sends nothing', async () => {
    renderFill();
    await userEvent.click(await screen.findByRole('button', { name: 'Finish' }));
    const dialog = await screen.findByRole('dialog', { name: 'Finish signing' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Back' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });
});

describe('SigningFillPage — decline, not me, withdraw', () => {
  it('Decline sends the chip and the note as the reason and goes to /declined', async () => {
    post.mockResolvedValueOnce(okResponse({ status: 'declined', envelope_status: 'declined' }));
    renderFill();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline to sign?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Terms' }));
    await userEvent.type(within(dialog).getByRole('textbox'), 'Clause 4');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Decline to sign' }));

    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/decline',
        { reason: 'Terms: Clause 4' },
        expect.any(Object),
      );
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}/declined`);
    });
  });

  it('Cancel on the decline sheet sends nothing', async () => {
    renderFill();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Decline' }));
    const dialog = await screen.findByRole('dialog', { name: 'Decline to sign?' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep signing' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(post).not.toHaveBeenCalled();
  });

  it('Not me? declines as the wrong recipient after a confirm', async () => {
    post.mockResolvedValueOnce(okResponse({ status: 'declined', envelope_status: 'declined' }));
    renderFill();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Not me?' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: "This isn't me" }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith(
        '/sign/decline',
        { reason: 'not-the-recipient' },
        expect.any(Object),
      );
    });
  });

  it('Withdraw consent is in the menu, asks first, then POSTs and routes to /declined', async () => {
    post.mockResolvedValueOnce(
      okResponse({ status: 'consent_withdrawn', envelope_status: 'declined' }),
    );
    renderFill();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Withdraw consent' }));
    const dialog = await screen.findByRole('dialog', {
      name: 'Withdraw consent to sign electronically?',
    });
    expect(post).not.toHaveBeenCalled();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Withdraw consent' }));
    await waitFor(() => {
      expect(post).toHaveBeenCalledWith('/sign/withdraw-consent', undefined, expect.any(Object));
      expect(pathname()).toBe(`/sign/${MOCK_ENVELOPE_ID}/declined`);
    });
  });

  it('keeping the consent sends nothing', async () => {
    renderFill();
    await openMenu();
    await userEvent.click(screen.getByRole('menuitem', { name: 'Withdraw consent' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep signing' }));
    expect(post).not.toHaveBeenCalled();
  });
});
