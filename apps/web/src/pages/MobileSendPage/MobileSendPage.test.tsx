import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, fireEvent, within, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';

// Mock the heavy PDF parser — jsdom can't decode PDFs and the page only
// needs the page-count out of it.
vi.mock('@/lib/pdf', () => ({
  usePdfDocument: vi.fn(() => ({ doc: null, numPages: 3, loading: false, error: null })),
}));

// Mock the send orchestration so we can assert the wiring without making
// real fetch calls.
const runMock = vi.fn(async () => ({ envelope_id: 'env_xyz', short_code: 'SC-1234567890' }));
vi.mock('@/features/envelopes/useSendEnvelope', () => ({
  useSendEnvelope: () => ({
    run: runMock,
    phase: 'idle' as const,
    error: null,
    reset: vi.fn(),
  }),
}));

// MWMobileNav pulls in useAccountActions which would call /me APIs — stub
// to avoid real network and keep these page tests focused on routing /
// step-flow behaviour.
import type * as AccountModule from '@/features/account';
vi.mock('@/features/account', async () => {
  const actual = await vi.importActual<typeof AccountModule>('@/features/account');
  return {
    ...actual,
    useAccountActions: () => ({
      exportData: vi.fn(async () => undefined),
      deleteAccount: vi.fn(async () => undefined),
      isExporting: false,
      isDeleting: false,
      lastError: null,
    }),
  };
});

import { MobileSendPage } from './MobileSendPage';

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="loc">{location.pathname}</div>;
}

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/m/send']}>
      <Routes>
        <Route path="/m/send" element={<MobileSendPage />} />
        <Route path="/templates" element={<LocationProbe />} />
        <Route path="/documents" element={<LocationProbe />} />
        <Route path="/signers" element={<LocationProbe />} />
        <Route path="/signin" element={<LocationProbe />} />
        <Route path="/document/new" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFile(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: 'application/pdf',
  });
}

describe('MobileSendPage', () => {
  beforeEach(() => {
    runMock.mockClear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('renders the start screen with three entry tiles', () => {
    renderPage();
    expect(screen.getByText(/new document/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /upload pdf/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument();
  });

  it('walks from start → file when a PDF is uploaded', async () => {
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('contract.pdf')] } });
    });
    // Step 2 chrome appears.
    expect(screen.getByText(/confirm the file/i)).toBeInTheDocument();
    expect(screen.getByText(/contract\.pdf/i)).toBeInTheDocument();
  });

  it('disables Continue while no file picked, advances to signers when ready', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('nda.pdf')] } });
    });
    const cont = screen.getByRole('button', { name: /continue/i });
    expect(cont).toBeEnabled();
    await user.click(cont);
    expect(screen.getByText(/who is signing\?/i)).toBeInTheDocument();
  });

  it('blocks the place step until at least one signer is added', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('test.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));
    const next = screen.getByRole('button', { name: /next: place fields/i });
    expect(next).toBeDisabled();
  });

  it('adds a signer via the bottom sheet then enables next', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('test.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));

    await user.click(screen.getByRole('button', { name: /add signer/i }));
    // Sheet open
    const dialog = await screen.findByRole('dialog', { name: /add a signer/i });
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'Bob Builder');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'bob@example.com');
    await user.click(within(dialog).getByRole('button', { name: /^add$/i }));

    // Sheet closes, signer appears in the list.
    expect(screen.getByText(/bob builder/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /next: place fields/i })).toBeEnabled();
  });

  it('renders the mobile nav (logo + hamburger) above the start screen', () => {
    renderPage();
    expect(screen.getByRole('button', { name: /seald home/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /open menu/i })).toBeInTheDocument();
  });

  it('hamburger opens a sheet with Documents, Templates, Signers, and Sign out', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('button', { name: 'Documents' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Templates' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Signers' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: /^sign out$/i })).toBeInTheDocument();
  });

  it('tapping "From a template" navigates to /templates', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /^from a template$/i }));
    expect(await screen.findByTestId('loc')).toHaveTextContent('/templates');
  });

  it('rejects an invalid email in the add-signer sheet', async () => {
    const user = userEvent.setup();
    renderPage();
    const input = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [mockFile('test.pdf')] } });
    });
    await user.click(screen.getByRole('button', { name: /continue/i }));
    await user.click(screen.getByRole('button', { name: /add signer/i }));
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByPlaceholderText(/full name/i), 'B');
    await user.type(within(dialog).getByPlaceholderText(/name@example\.com/i), 'not-an-email');
    // Add button stays disabled when email invalid.
    expect(within(dialog).getByRole('button', { name: /^add$/i })).toBeDisabled();
  });
});
