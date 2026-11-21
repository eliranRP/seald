import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { seald } from '../styles/theme';
import * as conversionApi from '../features/gdriveImport/conversionApi';

const connectMutateMock = vi.fn();
vi.mock('./settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: vi.fn(),
  useConnectGDrive: () => ({ mutate: connectMutateMock }),
  useReconnectGDrive: () => ({ mutate: vi.fn() }),
}));

import * as gdriveAccountsHook from './settings/integrations/useGDriveAccounts';

vi.mock('../features/gdriveImport/conversionApi', async (orig) => {
  const real = await orig<typeof conversionApi>();
  return {
    ...real,
    startConversion: vi.fn(),
    pollConversion: vi.fn(),
    cancelConversion: vi.fn(),
    fetchConvertedPdf: vi.fn(),
  };
});

// The picker stub offers two files so a test can pick again.
vi.mock('@/components/drive-picker', () => ({
  DrivePicker: (props: {
    open: boolean;
    onPick: (file: { id: string; name: string; mimeType: string }) => void;
  }): JSX.Element | null => {
    if (!props.open) return null;
    return (
      <div>
        <button
          type="button"
          onClick={() => props.onPick({ id: 'd-1', name: 'First', mimeType: 'application/pdf' })}
        >
          Pick first
        </button>
        <button
          type="button"
          onClick={() => props.onPick({ id: 'd-2', name: 'Second', mimeType: 'application/pdf' })}
        >
          Pick second
        </button>
      </div>
    );
  },
}));

import { DriveDocumentImport } from './DriveDocumentImport';

const startConversion = vi.mocked(conversionApi.startConversion);
const pollConversion = vi.mocked(conversionApi.pollConversion);
const fetchConvertedPdf = vi.mocked(conversionApi.fetchConvertedPdf);
const useGDriveAccountsMock = vi.mocked(gdriveAccountsHook.useGDriveAccounts);

function mockAccounts(connected: boolean) {
  useGDriveAccountsMock.mockReturnValue({
    data: connected ? [{ id: 'acct-1', email: 'jamie@example.com' }] : [],
    isSuccess: true,
  } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);
}

async function flush(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

function renderImport(onFile = vi.fn(), onClose = vi.fn(), onRetry = vi.fn()) {
  const view = render(
    <ThemeProvider theme={seald}>
      <DriveDocumentImport open onClose={onClose} onRetry={onRetry} onFile={onFile} />
    </ThemeProvider>,
  );
  return { ...view, onFile, onClose, onRetry };
}

beforeEach(() => {
  vi.useFakeTimers();
  startConversion.mockReset();
  pollConversion.mockReset();
  fetchConvertedPdf.mockReset();
  connectMutateMock.mockClear();
  startConversion.mockResolvedValue({ jobId: 'job-1', status: 'pending' });
  pollConversion.mockResolvedValue({ jobId: 'job-1', status: 'done', assetUrl: 'https://x/pdf' });
  fetchConvertedPdf.mockResolvedValue(new Blob([new Uint8Array([0x25])]));
  mockAccounts(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('DriveDocumentImport', () => {
  it('imports the picked file, shows the overlay, then hands the PDF over', async () => {
    const { onFile, onClose } = renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Pick first' }));
    expect(onClose).toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Importing from Google Drive' })).toBeInTheDocument();
    expect(screen.getByText('First')).toBeInTheDocument();
    await flush();
    expect(screen.getByText('Import complete')).toBeInTheDocument();
    expect(onFile).not.toHaveBeenCalled();
    await flush(800);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect((onFile.mock.calls[0]?.[0] as File).name).toBe('First.pdf');
    expect(screen.queryByRole('dialog', { name: 'Importing from Google Drive' })).toBeNull();
  });

  it('a second import inside the done window does not hand over the first file', async () => {
    const { onFile } = renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Pick first' }));
    await flush();
    expect(screen.getByText('Import complete')).toBeInTheDocument();
    startConversion.mockResolvedValue({ jobId: 'job-2', status: 'pending' });
    fireEvent.click(screen.getByRole('button', { name: 'Pick second' }));
    await flush(800);
    expect(onFile).toHaveBeenCalledTimes(1);
    expect((onFile.mock.calls[0]?.[0] as File).name).toBe('Second.pdf');
  });

  it('shows the failure dialog and reopens the picker on retry', async () => {
    pollConversion.mockResolvedValue({
      jobId: 'job-1',
      status: 'failed',
      errorCode: 'conversion-failed',
    });
    const { onRetry, onFile } = renderImport();
    fireEvent.click(screen.getByRole('button', { name: 'Pick first' }));
    await flush();
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(screen.queryByRole('dialog', { name: 'Importing from Google Drive' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(onFile).not.toHaveBeenCalled();
  });

  it('starts the OAuth popup instead when no account is connected', () => {
    mockAccounts(false);
    const { onClose } = renderImport();
    expect(connectMutateMock).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalled();
  });
});
