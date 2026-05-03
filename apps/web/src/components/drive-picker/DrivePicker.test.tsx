import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { seald } from '@/styles/theme';

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  },
}));

// eslint-disable-next-line import/first
import { apiClient } from '@/lib/api/apiClient';
// eslint-disable-next-line import/first
import { DrivePicker, PICKER_HEIGHT_PX, PICKER_WIDTH_PX } from './index';
// eslint-disable-next-line import/first
import type { DriveFile } from './index';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const PDF_FILE: DriveFile = {
  id: 'f-pdf',
  name: 'Acme MSA - signed.pdf',
  mimeType: 'application/pdf',
  modifiedTime: '2026-04-28T12:00:00Z',
  size: '14000',
};

const DOC_FILE: DriveFile = {
  id: 'f-doc',
  name: '2026 NDA template.gdoc',
  mimeType: 'application/vnd.google-apps.document',
  modifiedTime: '2026-05-01T00:00:00Z',
};

const DOCX_FILE: DriveFile = {
  id: 'f-docx',
  name: 'Vendor agreement.docx',
  mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  modifiedTime: '2026-04-01T00:00:00Z',
};

const UNSUPPORTED: DriveFile = {
  id: 'f-evil',
  name: 'malware.exe',
  mimeType: 'application/x-msdownload',
};

function buildQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderPicker(propsOverride: Partial<React.ComponentProps<typeof DrivePicker>> = {}) {
  const onClose = vi.fn();
  const onPick = vi.fn();
  const onReconnect = vi.fn();
  const qc = buildQueryClient();
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return (
      <ThemeProvider theme={seald}>
        <QueryClientProvider client={qc}>{children}</QueryClientProvider>
      </ThemeProvider>
    );
  }
  const utils = render(
    <DrivePicker
      open
      onClose={onClose}
      onPick={onPick}
      accountId={ACCOUNT_ID}
      mimeFilter="all"
      onReconnect={onReconnect}
      {...propsOverride}
    />,
    { wrapper: Wrapper },
  );
  return { ...utils, onClose, onPick, onReconnect, qc };
}

beforeEach(() => {
  get.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DrivePicker — open/close + accessibility', () => {
  it('renders nothing when open=false', () => {
    get.mockResolvedValue({ data: { files: [] }, status: 200 });
    const { onClose, onPick } = (() => {
      const oc = vi.fn();
      const op = vi.fn();
      const qc = buildQueryClient();
      render(
        <ThemeProvider theme={seald}>
          <QueryClientProvider client={qc}>
            <DrivePicker
              open={false}
              onClose={oc}
              onPick={op}
              accountId={ACCOUNT_ID}
              mimeFilter="all"
            />
          </QueryClientProvider>
        </ThemeProvider>,
      );
      return { onClose: oc, onPick: op };
    })();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(onPick).not.toHaveBeenCalled();
  });

  it('renders the dialog with the locked 760×600 dimensions', async () => {
    get.mockResolvedValue({ data: { files: [PDF_FILE] }, status: 200 });
    renderPicker();
    const dialog = await screen.findByRole('dialog', { name: /pick from google drive/i });
    expect(dialog).toBeInTheDocument();
    // The hard-locked design constants must remain 760×600 (Phase 3
    // watchpoint #4). Asserting the constants directly here means a PR
    // touching the styles file will fail this test if the values drift.
    expect(PICKER_WIDTH_PX).toBe(760);
    expect(PICKER_HEIGHT_PX).toBe(600);
  });

  it('Escape closes the dialog', async () => {
    get.mockResolvedValue({ data: { files: [PDF_FILE] }, status: 200 });
    const { onClose } = renderPicker();
    await screen.findByRole('dialog');
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('clicking the backdrop closes; clicking the card does not', async () => {
    get.mockResolvedValue({ data: { files: [PDF_FILE] }, status: 200 });
    const { onClose } = renderPicker();
    const dialog = await screen.findByRole('dialog');
    // Click on the dialog itself — should NOT close.
    fireEvent.click(dialog);
    expect(onClose).not.toHaveBeenCalled();
    // Click on the backdrop wrapper (parent of the dialog) — SHOULD close.
    const backdrop = dialog.parentElement!;
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });

  it('Tab cycles focus inside the dialog (focus trap)', async () => {
    get.mockResolvedValue({ data: { files: [PDF_FILE] }, status: 200 });
    renderPicker();
    const dialog = await screen.findByRole('dialog');
    const focusables = within(dialog).getAllByRole('button');
    // The Cancel + close-picker + Use this file buttons should all be
    // present; trap should mean the last button's Tab wraps to the
    // first focusable (the search input).
    expect(focusables.length).toBeGreaterThanOrEqual(2);
    const last = focusables[focusables.length - 1]!;
    last.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    // Trap fires preventDefault + focuses first focusable (the
    // search input). We assert focus moved off `last` rather than
    // asserting the exact next element so the test is robust to
    // additions of new focusable rows.
    expect(document.activeElement).not.toBe(last);
  });
});

describe('DrivePicker — file list interactions', () => {
  it('clicking a row selects it and Use this file fires onPick', async () => {
    get.mockResolvedValue({ data: { files: [PDF_FILE, DOC_FILE] }, status: 200 });
    const { onPick } = renderPicker();
    const row = await screen.findByRole('option', { name: /acme msa - signed/i });
    await userEvent.click(row);
    expect(row).toHaveAttribute('aria-selected', 'true');
    await userEvent.click(screen.getByRole('button', { name: /^use this file$/i }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(PDF_FILE);
  });

  it('Use this file is disabled until something is picked', async () => {
    get.mockResolvedValue({ data: { files: [PDF_FILE] }, status: 200 });
    renderPicker();
    await screen.findByRole('option', { name: /acme msa/i });
    expect(screen.getByRole('button', { name: /^use this file$/i })).toBeDisabled();
  });

  it('strips client-side any file outside the supported MIME allow-list', async () => {
    get.mockResolvedValue({
      data: { files: [PDF_FILE, UNSUPPORTED, DOCX_FILE] },
      status: 200,
    });
    renderPicker();
    await screen.findByRole('option', { name: /acme msa/i });
    expect(screen.getByRole('option', { name: /vendor agreement\.docx/i })).toBeInTheDocument();
    // The unsupported entry must NEVER reach the DOM, even though the
    // server (in this test) returned it. Defence in depth.
    expect(screen.queryByRole('option', { name: /malware\.exe/i })).toBeNull();
  });

  it('renders the empty-folder state when there are no files', async () => {
    get.mockResolvedValue({ data: { files: [] }, status: 200 });
    renderPicker();
    expect(await screen.findByText(/this folder is empty/i)).toBeInTheDocument();
  });

  it('renders the no-results state when the search filters everything out', async () => {
    get.mockResolvedValue({ data: { files: [PDF_FILE, DOC_FILE] }, status: 200 });
    renderPicker();
    const search = await screen.findByRole('searchbox', { name: /search drive files/i });
    await userEvent.type(search, 'zzzzznope');
    expect(await screen.findByText(/no files match/i)).toBeInTheDocument();
  });
});

describe('DrivePicker — token-expired flow', () => {
  it('shows the Reconnect CTA on HTTP 401 and single-flights repeated clicks', async () => {
    const apiError = Object.assign(new Error('reconnect_required'), { status: 401 });
    get.mockRejectedValue(apiError);

    let release: (() => void) | undefined;
    const onReconnect = vi.fn().mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = () => resolve();
        }),
    );
    renderPicker({ onReconnect });

    const reconnectBtn = await screen.findByRole('button', { name: /^reconnect$/i });
    // Three rapid clicks — only one consent popup must be in flight.
    await userEvent.click(reconnectBtn);
    await userEvent.click(reconnectBtn);
    await userEvent.click(reconnectBtn);
    expect(onReconnect).toHaveBeenCalledTimes(1);
    // Resolve the in-flight reconnect; the next click is now allowed.
    release?.();
    await waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(1));
  });
});
