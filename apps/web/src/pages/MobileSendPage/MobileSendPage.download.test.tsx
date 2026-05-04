import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { renderWithProviders } from '@/test/renderWithProviders';

vi.mock('@/lib/pdf', () => ({
  usePdfDocument: vi.fn(() => ({ doc: null, numPages: 3, loading: false, error: null })),
}));

const runMock = vi.fn(async () => ({ envelope_id: 'env_xyz', short_code: 'SC-1234567890' }));
vi.mock('@/features/envelopes/useSendEnvelope', () => ({
  useSendEnvelope: () => ({
    run: runMock,
    phase: 'idle' as const,
    error: null,
    reset: vi.fn(),
  }),
}));

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

function renderPage() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/m/send']}>
      <Routes>
        <Route path="/m/send" element={<MobileSendPage />} />
      </Routes>
    </MemoryRouter>,
  );
}

function mockFile(name: string): File {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], name, {
    type: 'application/pdf',
  });
}

describe('MobileSendPage — Download original PDF', () => {
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let clickSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    runMock.mockClear();
    createObjectURL = vi.fn(() => 'blob:mock-url');
    revokeObjectURL = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', {
      value: createObjectURL,
      configurable: true,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      value: revokeObjectURL,
      configurable: true,
    });
    clickSpy = vi.fn();
    HTMLAnchorElement.prototype.click = clickSpy as unknown as () => void;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not show the download item before a file is picked', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).queryByRole('button', { name: /download original pdf/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the download item after a file is picked, and downloads the original blob on click', async () => {
    const user = userEvent.setup();
    renderPage();

    // Pick a PDF — the start step exposes a labelled file input (rule 4.6).
    const file = mockFile('Lease.pdf');
    const fileInput = screen.getByLabelText(/pdf file/i) as HTMLInputElement;
    await user.upload(fileInput, file);

    // Open the hamburger drawer.
    await user.click(screen.getByRole('button', { name: /open menu/i }));
    const dialog = screen.getByRole('dialog');

    const dlBtn = within(dialog).getByRole('button', { name: /download original pdf/i });
    await user.click(dlBtn);

    // The local File should be wrapped into an object URL (no fetch) and
    // a hidden anchor click triggered with the .pdf filename.
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    const anchor = clickSpy.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.download).toMatch(/lease\.pdf$/i);
  });
});
