import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { seald } from '../../styles/theme';

vi.mock('../../lib/api/verifyApiClient', () => ({
  verifyApiClient: { get: vi.fn() },
}));

const hashFile = vi.hoisted(() => vi.fn<(file: Blob) => Promise<string>>());
vi.mock('../../features/verify/model/sha256', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return { ...actual, sha256Hex: hashFile };
});

import { verifyApiClient } from '../../lib/api/verifyApiClient';
import { VerifyPage } from './VerifyPage';
import type { MatchedFile } from './FileCompare';
import type { VerifyResponse } from '../../features/verify';

const get = verifyApiClient.get as unknown as ReturnType<typeof vi.fn>;
const CODE = 'u82ZmvdxwG3CU';
const SEALED_HASH = 'cafebabedeadbeef1234567890abcdef1234567890abcdef1234567890abcdef';

function LocationProbe() {
  const loc = useLocation();
  return <div data-testid="probe">{loc.pathname}</div>;
}

function renderAt(path: string, state?: { matchedFile: MatchedFile }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  const entry = state ? { pathname: path, state } : path;
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[entry]}>
            <Routes>
              <Route path="/verify" element={children as React.ReactElement} />
              <Route path="/verify/:shortCode" element={children as React.ReactElement} />
            </Routes>
            <LocationProbe />
          </MemoryRouter>
        </QueryClientProvider>
      </ThemeProvider>
    );
  }
  return render(<VerifyPage />, { wrapper: Wrapper });
}

const SIGNED: VerifyResponse = {
  envelope: {
    id: '804a6c00-2ad9-4590-9269-de3e13f61e62',
    title: 'NDA — Quill Capital',
    short_code: CODE,
    status: 'completed',
    original_pages: 4,
    original_sha256: '7a8afa33b5b077e0486f08fc301e6865caf7b8ea0ea256505df80ea6034c1261',
    sealed_sha256: SEALED_HASH,
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-25T21:20:50Z',
    completed_at: '2026-04-25T21:21:08Z',
    expires_at: '2026-05-25T21:20:50Z',
    sealed_at: '2026-04-25T21:21:07Z',
    tsa_name: 'DigiCert TSA',
    event_count: 11,
    seal: { level: 'B-LTA', timestamped: true },
  },
  signers: [
    {
      id: 's1',
      name: 'Eliran Azulay',
      email: 'e@example.com',
      role: 'signer',
      status: 'completed',
      signed_at: '2026-04-25T21:20:55Z',
      declined_at: null,
    },
    {
      id: 's2',
      name: 'Hannah Wills',
      email: 'h@example.com',
      role: 'signer',
      status: 'completed',
      signed_at: '2026-04-25T21:21:05Z',
      declined_at: null,
    },
  ],
  events: [
    {
      id: 'e1',
      actor_kind: 'sender',
      event_type: 'created',
      signer_id: null,
      created_at: '2026-04-25T21:20:50Z',
    },
  ],
  chain_intact: true,
  sealed_url: 'https://signed.example/sealed.pdf',
  audit_url: 'https://signed.example/audit.pdf',
};

function withEnvelope(patch: Partial<VerifyResponse['envelope']>): VerifyResponse {
  return { ...SIGNED, envelope: { ...SIGNED.envelope, ...patch } };
}

function pdf(name = 'copy.pdf', size = 2048): File {
  const file = new File(['%PDF-1.7'], name, { type: 'application/pdf' });
  Object.defineProperty(file, 'size', { value: size });
  return file;
}

beforeEach(() => {
  get.mockReset();
  hashFile.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('VerifyPage result', () => {
  it('shows the Authentic verdict, signers, chips and a collapsed details card', async () => {
    get.mockResolvedValueOnce({ data: SIGNED });
    renderAt(`/verify/${CODE}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Authentic' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'NDA — Quill Capital' })).toBeInTheDocument();
    expect(screen.getByText('2 of 2 signed · Sealed Apr 25, 2026')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Eliran Azulay' })).toBeInTheDocument();
    expect(screen.getByText(/Unchanged since seal/)).toBeInTheDocument();
    expect(screen.getByText(/Audit chain intact/)).toBeInTheDocument();
    expect(screen.getByText(/PAdES B-LTA/)).toBeInTheDocument();
    expect(screen.getByText(/Timestamped/)).toBeInTheDocument();
    expect(screen.getByText('Verification by Seald')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /technical details/i })).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    expect(screen.queryByLabelText('Sealed SHA-256 hash')).not.toBeInTheDocument();
  });

  it('claims no PAdES level or timestamp the API did not read from the sealed file', async () => {
    get.mockResolvedValueOnce({
      data: { ...SIGNED, envelope: { ...SIGNED.envelope, seal: null } },
    });
    renderAt(`/verify/${CODE}`);
    expect(await screen.findByRole('heading', { level: 1, name: 'Authentic' })).toBeInTheDocument();
    expect(screen.queryByText(/PAdES/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Timestamped/)).not.toBeInTheDocument();
  });

  it('shows the level the seal degraded to, without Timestamped', async () => {
    get.mockResolvedValueOnce({
      data: {
        ...SIGNED,
        envelope: { ...SIGNED.envelope, seal: { level: 'B-B', timestamped: false } },
      },
    });
    renderAt(`/verify/${CODE}`);
    expect(await screen.findByText(/PAdES B-B/)).toBeInTheDocument();
    expect(screen.queryByText(/Timestamped/)).not.toBeInTheDocument();
  });

  it('opens the technical details with full hashes, timestamp and event count', async () => {
    get.mockResolvedValueOnce({ data: SIGNED });
    renderAt(`/verify/${CODE}`);
    const toggle = await screen.findByRole('button', { name: /technical details/i });

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByLabelText('Sealed SHA-256 hash')).toHaveTextContent(SEALED_HASH);
    expect(screen.getByLabelText('Original SHA-256 hash')).toHaveTextContent(
      SIGNED.envelope.original_sha256 ?? '',
    );
    expect(screen.getByText('Apr 25, 2026 21:21:07 UTC · DigiCert TSA')).toBeInTheDocument();
    expect(screen.getByText('11 · hash-chained')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /audit trail pdf/i })).toHaveAttribute(
      'href',
      'https://signed.example/audit.pdf',
    );
    expect(screen.getByRole('link', { name: /sealed pdf/i })).toHaveAttribute(
      'href',
      'https://signed.example/sealed.pdf',
    );
  });

  it('copies a hash and flashes a "Copied" toast', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    get.mockResolvedValueOnce({ data: SIGNED });
    renderAt(`/verify/${CODE}`);
    fireEvent.click(await screen.findByRole('button', { name: /technical details/i }));

    fireEvent.click(screen.getByRole('button', { name: 'Copy sealed hash' }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(SEALED_HASH));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
  });

  it('copies the public link from the header', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    get.mockResolvedValueOnce({ data: SIGNED });
    renderAt(`/verify/${CODE}`);

    fireEvent.click(await screen.findByRole('button', { name: /copy link/i }));

    await waitFor(() =>
      expect(writeText).toHaveBeenCalledWith(`https://seald.nromomentum.com/verify/${CODE}`),
    );
    expect(await screen.findByText('Link copied')).toBeInTheDocument();
  });

  it('does not throw and shows no toast when the clipboard is unavailable', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
    get.mockResolvedValueOnce({ data: SIGNED });
    renderAt(`/verify/${CODE}`);
    fireEvent.click(await screen.findByRole('button', { name: /copy link/i }));
    await act(async () => {});
    expect(screen.queryByText('Link copied')).not.toBeInTheDocument();
  });

  it('shows Tampered with the details open when the audit chain is broken', async () => {
    get.mockResolvedValueOnce({ data: { ...SIGNED, chain_intact: false } });
    renderAt(`/verify/${CODE}`);

    expect(await screen.findByRole('heading', { level: 1, name: 'Tampered' })).toBeInTheDocument();
    expect(screen.getByText('The audit trail was changed after sealing.')).toBeInTheDocument();
    expect(screen.getByText(/Audit chain broken/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /technical details/i })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
    expect(screen.getByTestId('verify-dropzone')).toBeInTheDocument();
  });

  it('shows In progress with who is awaited and no compare card', async () => {
    get.mockResolvedValueOnce({
      data: {
        ...withEnvelope({ status: 'awaiting_others', completed_at: null, sealed_sha256: null }),
        signers: [
          SIGNED.signers[0]!,
          { ...SIGNED.signers[1]!, status: 'awaiting', signed_at: null },
        ],
        sealed_url: null,
      },
    });
    renderAt(`/verify/${CODE}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'In progress' }),
    ).toBeInTheDocument();
    expect(screen.getByText('1 of 2 signed · not sealed yet')).toBeInTheDocument();
    expect(screen.getByText(/Waiting on Hannah/)).toBeInTheDocument();
    expect(screen.queryByTestId('verify-dropzone')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /technical details/i }));
    expect(screen.getByText('Envelope ID')).toBeInTheDocument();
    expect(screen.queryByText('Sealed SHA-256')).not.toBeInTheDocument();
  });

  it.each([
    [
      'declined',
      { status: 'declined', completed_at: null, sealed_sha256: null },
      'Declined by Eliran · Apr 25, 2026',
      'Declined',
    ],
    [
      'expired',
      { status: 'expired', completed_at: null, sealed_sha256: null },
      'Expired May 25, 2026',
      'Expired',
    ],
    [
      'canceled',
      { status: 'canceled', completed_at: null, sealed_sha256: null },
      'Withdrawn by sender',
      'Withdrawn',
    ],
  ] as const)('shows Not sealed for a %s envelope', async (_name, patch, meta, chip) => {
    const data = withEnvelope(patch);
    get.mockResolvedValueOnce({
      data: {
        ...data,
        signers: [
          { ...data.signers[0]!, status: 'declined', declined_at: '2026-04-25T21:21:00Z' },
          data.signers[1]!,
        ],
        sealed_url: null,
      },
    });
    renderAt(`/verify/${CODE}`);

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Not sealed' }),
    ).toBeInTheDocument();
    expect(screen.getByText(meta)).toBeInTheDocument();
    expect(within(screen.getByLabelText('Checks')).getByText(new RegExp(chip))).toBeInTheDocument();
    expect(screen.queryByTestId('verify-dropzone')).not.toBeInTheDocument();
  });
});

describe('VerifyPage compare a copy', () => {
  async function openCompare() {
    get.mockResolvedValueOnce({ data: SIGNED });
    renderAt(`/verify/${CODE}`);
    await screen.findByTestId('verify-dropzone');
    return screen.getByLabelText('Choose a PDF to compare');
  }

  it('says the file matches when its SHA-256 equals the sealed hash', async () => {
    hashFile.mockResolvedValueOnce(SEALED_HASH);
    const input = await openCompare();

    await userEvent.upload(input, pdf('NDA-signed.pdf', 290_816));

    expect(await screen.findByText(/Matches the sealed copy/)).toBeInTheDocument();
    expect(screen.getByText('NDA-signed.pdf · 284 KB')).toBeInTheDocument();
    // The verdict above is untouched.
    expect(screen.getByRole('heading', { level: 1, name: 'Authentic' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Check another' }));
    expect(screen.getByTestId('verify-dropzone')).toBeInTheDocument();
  });

  it("says it doesn't match when the hash differs", async () => {
    hashFile.mockResolvedValueOnce('0'.repeat(64));
    const input = await openCompare();

    await userEvent.upload(input, pdf());

    expect(await screen.findByText(/Doesn't match/)).toBeInTheDocument();
    expect(
      screen.getByText("This file was changed after sealing, or it's a different document."),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Authentic' })).toBeInTheDocument();
  });

  it('shows a progress row while the file is being hashed', async () => {
    let finish: (hash: string) => void = () => {};
    hashFile.mockReturnValueOnce(new Promise<string>((resolve) => (finish = resolve)));
    const input = await openCompare();

    await userEvent.upload(input, pdf('slow.pdf'));

    expect(await screen.findByText('Checking slow.pdf…')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toBeInTheDocument();
    await act(async () => finish(SEALED_HASH));
    expect(await screen.findByText(/Matches the sealed copy/)).toBeInTheDocument();
  });

  it('refuses a non-PDF without hashing it', async () => {
    const input = await openCompare();

    fireEvent.change(input, {
      target: { files: [new File(['x'], 'notes.txt', { type: 'text/plain' })] },
    });

    expect(await screen.findByText(/not a PDF/i)).toBeInTheDocument();
    expect(hashFile).not.toHaveBeenCalled();
  });

  it('refuses a file over 25 MB without hashing it', async () => {
    const input = await openCompare();

    fireEvent.change(input, { target: { files: [pdf('big.pdf', 26 * 1024 * 1024)] } });

    expect(await screen.findByText(/over 25 MB/i)).toBeInTheDocument();
    expect(hashFile).not.toHaveBeenCalled();
  });

  it('compares a dropped file and highlights the zone while dragging', async () => {
    hashFile.mockResolvedValueOnce(SEALED_HASH);
    await openCompare();
    const zone = screen.getByTestId('verify-dropzone');

    fireEvent.dragOver(zone);
    expect(within(zone).getByText('Drop to compare')).toBeInTheDocument();
    fireEvent.drop(zone, { dataTransfer: { files: [pdf()] } });

    expect(await screen.findByText(/Matches the sealed copy/)).toBeInTheDocument();
  });

  it('shows the match row on arrival from the entry page', async () => {
    get.mockResolvedValueOnce({ data: SIGNED });
    renderAt(`/verify/${CODE}`, { matchedFile: { name: 'from-entry.pdf', size: 4096 } });

    expect(await screen.findByText(/Matches the sealed copy/)).toBeInTheDocument();
    expect(screen.getByText('from-entry.pdf · 4 KB')).toBeInTheDocument();
  });
});

describe('VerifyPage entry', () => {
  it('renders the entry page and explains a short code instead of disabling Verify', async () => {
    renderAt('/verify');

    expect(screen.getByRole('heading', { name: 'Verify a document' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /copy link/i })).not.toBeInTheDocument();
    const verify = screen.getByRole('button', { name: 'Verify' });
    expect(verify).toBeEnabled();

    // The label stays visible above the field, not only as a placeholder.
    const field = screen.getByLabelText('Verification code');
    expect(screen.getByText('Verification code', { selector: 'label' })).toBeVisible();
    fireEvent.change(field, { target: { value: CODE.slice(0, 12) } });
    fireEvent.click(verify);
    expect(screen.getByRole('alert')).toHaveTextContent('Enter all 13 characters (12 so far).');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(field).toHaveFocus();
    expect(get).not.toHaveBeenCalled();

    fireEvent.change(field, { target: { value: CODE } });
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the code case and strips spaces from a pasted code', () => {
    renderAt('/verify');
    const field = screen.getByLabelText('Verification code');
    fireEvent.paste(field, { clipboardData: { getData: () => ` ${CODE} ` } });
    expect(field).toHaveValue(CODE);
  });

  it('goes to the result page when the code is submitted', async () => {
    get.mockResolvedValue({ data: SIGNED });
    renderAt('/verify');
    fireEvent.change(screen.getByLabelText('Verification code'), { target: { value: CODE } });

    fireEvent.click(screen.getByRole('button', { name: 'Verify' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Authentic' })).toBeInTheDocument();
    expect(screen.getByTestId('probe')).toHaveTextContent(`/verify/${CODE}`);
  });

  it('finds the envelope by the hash of a dropped PDF and shows it matched', async () => {
    hashFile.mockResolvedValue(SEALED_HASH);
    get.mockImplementation((url: string) =>
      Promise.resolve({
        data: url.startsWith('/verify/by-hash/') ? { short_code: CODE } : SIGNED,
      }),
    );
    renderAt('/verify');

    await userEvent.upload(screen.getByLabelText('Choose the sealed PDF'), pdf('sealed.pdf', 4096));

    expect(await screen.findByRole('heading', { level: 1, name: 'Authentic' })).toBeInTheDocument();
    expect(get).toHaveBeenCalledWith(`/verify/by-hash/${SEALED_HASH}`, undefined);
    expect(await screen.findByText(/Matches the sealed copy/)).toBeInTheDocument();
    expect(screen.getByText('sealed.pdf · 4 KB')).toBeInTheDocument();
  });

  it('says so when no sealed document has the dropped file hash', async () => {
    hashFile.mockResolvedValue('1'.repeat(64));
    get.mockRejectedValue(Object.assign(new Error('envelope_not_found'), { status: 404 }));
    renderAt('/verify');

    await userEvent.upload(screen.getByLabelText('Choose the sealed PDF'), pdf());

    expect(await screen.findByText(/No sealed document matches this file\./)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Use the signed PDF you downloaded');
  });

  it('lands on the entry page with the field marked when the code is unknown', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('envelope_not_found'), { status: 404 }));
    renderAt('/verify/missingcode01');

    expect(await screen.findByText(/No document with this code/)).toBeInTheDocument();
    const field = screen.getByLabelText('Verification code');
    expect(field).toHaveValue('missingcode01');
    expect(field).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(field, { target: { value: 'missingcode0' } });
    expect(screen.queryByText(/No document with this code/)).not.toBeInTheDocument();
  });
});

describe('VerifyPage loading and errors', () => {
  it('marks the loading skeleton busy for assistive tech', () => {
    get.mockReturnValue(new Promise(() => {}));
    renderAt(`/verify/${CODE}`);
    expect(screen.getByLabelText(/loading verification/i)).toHaveAttribute('aria-busy', 'true');
  });

  it('shows human copy, never the raw server text, for non-404 failures', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error('Internal Server Error'), { status: 500 }));
    renderAt(`/verify/${CODE}`);
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(screen.queryByText('Internal Server Error')).not.toBeInTheDocument();
    expect(screen.getByText(/Try again in a moment/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('reads a request that never reached the server as a connection problem', async () => {
    get.mockRejectedValueOnce(new Error('Network Error'));
    renderAt(`/verify/${CODE}`);
    expect(await screen.findByText(/Check your connection and try again/)).toBeInTheDocument();
    expect(screen.queryByText('Network Error')).not.toBeInTheDocument();
  });

  it('shows the default error copy when the failure has no message', async () => {
    get.mockRejectedValueOnce(Object.assign(new Error(''), { status: 500 }));
    renderAt(`/verify/${CODE}`);
    expect(await screen.findByText(/Try again in a moment/)).toBeInTheDocument();
  });

  describe('timeouts', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: false });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('switches to "Still working…" after 5 seconds', async () => {
      get.mockReturnValue(new Promise(() => {}));
      renderAt(`/verify/${CODE}`);
      expect(screen.queryByText(/still working/i)).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      expect(screen.getByText(/still working/i)).toBeInTheDocument();
    });

    it('offers Retry after 15 seconds and refetches on click', async () => {
      get.mockImplementation(() => new Promise(() => {}));
      renderAt(`/verify/${CODE}`);
      expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
      await act(async () => {
        await vi.advanceTimersByTimeAsync(15_000);
      });
      const retry = screen.getByRole('button', { name: /retry/i });
      expect(get).toHaveBeenCalledTimes(1);
      vi.useRealTimers();
      fireEvent.click(retry);
      await waitFor(() => expect(get).toHaveBeenCalledTimes(2));
    });
  });
});
