import { describe, it, expect, vi, beforeEach } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test/renderWithProviders';
import { MobileDrivePicker } from './MobileDrivePicker';
import { setSignerReporter, type SignerEvent } from '@/features/signing/telemetry';

import type * as ApiClientModule from '@/lib/api/apiClient';
import type * as GDriveImportModule from '@/features/gdriveImport';

// Mock the apiClient at the module boundary so the picker's React-Query
// call resolves with whatever each test wants — no real network.
vi.mock('@/lib/api/apiClient', async () => {
  const actual = await vi.importActual<typeof ApiClientModule>('@/lib/api/apiClient');
  return {
    ...actual,
    apiClient: {
      get: vi.fn(),
      post: vi.fn(),
      delete: vi.fn(),
    },
  };
});

// Stub useDriveImport so the conversion side-effect is a deterministic
// callback into the test, not the real polling loop.
vi.mock('@/features/gdriveImport', async () => {
  const actual = await vi.importActual<typeof GDriveImportModule>('@/features/gdriveImport');
  return {
    ...actual,
    useDriveImport: ({ onReady }: { onReady: (file: File) => void }) => ({
      state: { kind: 'idle' as const },
      beginImport: vi.fn((file: { name: string }) => {
        onReady(new File(['hi'], `${file.name}.pdf`, { type: 'application/pdf' }));
      }),
      cancelImport: vi.fn(async () => undefined),
      reset: vi.fn(),
    }),
  };
});

import { apiClient } from '@/lib/api/apiClient';

const apiGetMock = apiClient.get as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  apiGetMock.mockReset();
});

function renderPicker(overrides: Partial<React.ComponentProps<typeof MobileDrivePicker>> = {}) {
  return renderWithProviders(
    <MobileDrivePicker
      open
      accountId="acct-1"
      onClose={overrides.onClose ?? vi.fn()}
      onPick={overrides.onPick ?? vi.fn()}
      onReconnect={overrides.onReconnect ?? vi.fn()}
    />,
  );
}

describe('MobileDrivePicker', () => {
  it('renders the empty state when the API returns zero files', async () => {
    apiGetMock.mockResolvedValueOnce({ data: { files: [] } });
    renderPicker();
    expect(await screen.findByText(/no files in this folder/i)).toBeInTheDocument();
  });

  it('emits file_selected telemetry and hands the converted file to onPick', async () => {
    const events: SignerEvent[] = [];
    setSignerReporter((e) => events.push(e));
    apiGetMock.mockResolvedValueOnce({
      data: {
        files: [
          {
            id: 'file-1',
            name: 'MSA',
            mimeType: 'application/pdf',
            modifiedTime: '2026-04-24T00:00:00Z',
          },
        ],
      },
    });
    const onPick = vi.fn();
    const user = userEvent.setup();
    renderPicker({ onPick });
    const row = await screen.findByRole('button', { name: /import file msa/i });
    await user.click(row);
    await waitFor(() => expect(onPick).toHaveBeenCalledTimes(1));
    const firstCall = onPick.mock.calls[0];
    if (!firstCall) throw new Error('onPick was not called');
    const file: File = firstCall[0];
    expect(file.name).toBe('MSA.pdf');
    const types = events.map((e) => e.type);
    expect(types).toContain('mobile.gdrive.file_selected');
    expect(types).toContain('mobile.gdrive.converted');
    setSignerReporter(() => {
      /* reset */
    });
  });

  it('renders the re-authorize state when the list endpoint returns 401', async () => {
    const err = Object.assign(new Error('Unauthorized'), { status: 401 });
    apiGetMock.mockRejectedValueOnce(err);
    const onReconnect = vi.fn();
    const user = userEvent.setup();
    renderPicker({ onReconnect });
    const cta = await screen.findByRole('button', { name: /re-authorize/i });
    await user.click(cta);
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });

  it('emits picker_open telemetry exactly once on first mount', async () => {
    const events: SignerEvent[] = [];
    setSignerReporter((e) => events.push(e));
    apiGetMock.mockResolvedValueOnce({ data: { files: [] } });
    renderPicker();
    await screen.findByText(/no files in this folder/i);
    const opens = events.filter((e) => e.type === 'mobile.gdrive.picker_open');
    expect(opens).toHaveLength(1);
    setSignerReporter(() => {
      /* reset */
    });
  });
});
