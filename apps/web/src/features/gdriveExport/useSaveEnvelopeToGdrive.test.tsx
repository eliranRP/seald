import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ApiError } from '@/lib/api/apiClient';
import type * as EnvelopesModule from '@/features/envelopes';

type Envelope = EnvelopesModule.Envelope;

vi.mock('@/lib/api/apiClient', () => ({
  apiClient: { get: vi.fn(), post: vi.fn() },
}));
vi.mock('@/components/drive-picker/pickerCredentialsApi', () => ({
  fetchPickerCredentials: vi.fn(),
}));
vi.mock('@/features/envelopes', async (importOriginal) => {
  const actual = await importOriginal<typeof EnvelopesModule>();
  return { ...actual, saveEnvelopeToGdrive: vi.fn() };
});
vi.mock('./connectGdriveViaPopup', () => ({ connectGdriveViaPopup: vi.fn() }));
vi.mock('./openFolderPicker', () => ({ openFolderPicker: vi.fn() }));

// eslint-disable-next-line import/first
import { apiClient } from '@/lib/api/apiClient';
// eslint-disable-next-line import/first
import { fetchPickerCredentials } from '@/components/drive-picker/pickerCredentialsApi';
// eslint-disable-next-line import/first
import { saveEnvelopeToGdrive } from '@/features/envelopes';
// eslint-disable-next-line import/first
import { connectGdriveViaPopup } from './connectGdriveViaPopup';
// eslint-disable-next-line import/first
import { openFolderPicker } from './openFolderPicker';
// eslint-disable-next-line import/first
import { useSaveEnvelopeToGdrive } from './useSaveEnvelopeToGdrive';

const get = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const fetchCreds = fetchPickerCredentials as unknown as ReturnType<typeof vi.fn>;
const saveApi = saveEnvelopeToGdrive as unknown as ReturnType<typeof vi.fn>;
const connectPopup = connectGdriveViaPopup as unknown as ReturnType<typeof vi.fn>;
const pickFolder = openFolderPicker as unknown as ReturnType<typeof vi.fn>;

function wrapper({ children }: { readonly children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function makeEnvelope(over: Partial<Envelope> = {}): Envelope {
  return {
    id: 'env-1',
    owner_id: 'u',
    title: 'Deal',
    short_code: 'AB-CDEF-1234',
    status: 'completed',
    original_pages: 4,
    expires_at: '2030-01-01T00:00:00Z',
    tc_version: '1',
    privacy_version: '1',
    sent_at: '2026-04-01T00:00:00Z',
    completed_at: '2026-04-02T00:00:00Z',
    signers: [],
    fields: [],
    tags: [],
    created_at: '2026-04-01T00:00:00Z',
    updated_at: '2026-04-02T00:00:00Z',
    gdriveExport: { connected: true, lastFolder: null, lastPushedAt: null },
    ...over,
  };
}

const ACCOUNT = {
  id: 'acc-1',
  email: 'a@example.com',
  connectedAt: '2026-05-01T00:00:00Z',
  lastUsedAt: '2026-05-10T00:00:00Z',
};
const CREDS = { accessToken: 'tok', developerKey: 'devkey', appId: 'appid' };
const SAVE_RESULT = {
  folder: { id: 'f1', name: 'Acme', webViewLink: 'https://drive.google.com/drive/folders/f1' },
  files: [
    { kind: 'sealed' as const, fileId: 's1', name: 'Deal (sealed).pdf', webViewLink: 'l1' },
    { kind: 'audit' as const, fileId: 'a1', name: 'Deal (audit trail).pdf', webViewLink: 'l2' },
  ],
  pushedAt: '2026-05-12T00:00:00.000Z',
};

beforeEach(() => {
  get.mockReset();
  fetchCreds.mockReset();
  saveApi.mockReset();
  connectPopup.mockReset();
  pickFolder.mockReset();
  get.mockResolvedValue({ data: [ACCOUNT] });
  fetchCreds.mockResolvedValue(CREDS);
});

describe('useSaveEnvelopeToGdrive', () => {
  it('connected + folder picked → calls saveEnvelopeToGdrive and returns "saved"', async () => {
    pickFolder.mockResolvedValue({ id: 'f1', name: 'Acme' });
    saveApi.mockResolvedValue(SAVE_RESULT);
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope());
    });

    expect(connectPopup).not.toHaveBeenCalled();
    expect(fetchCreds).toHaveBeenCalledWith('acc-1');
    expect(pickFolder).toHaveBeenCalledWith(CREDS, { parentFolderId: null });
    expect(saveApi).toHaveBeenCalledWith('env-1', { folderId: 'f1', folderName: 'Acme' });
    expect(outcome).toEqual({ kind: 'saved', result: SAVE_RESULT });
  });

  it('seeds the picker with the last-used folder id', async () => {
    pickFolder.mockResolvedValue({ id: 'f2', name: 'New' });
    saveApi.mockResolvedValue({
      ...SAVE_RESULT,
      folder: { id: 'f2', name: 'New', webViewLink: 'l' },
    });
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });
    await act(async () => {
      await result.current.save(
        makeEnvelope({
          gdriveExport: {
            connected: true,
            lastFolder: { id: 'fOld', name: 'Old' },
            lastPushedAt: '2026-05-01T00:00:00Z',
          },
        }),
      );
    });
    expect(pickFolder).toHaveBeenCalledWith(CREDS, { parentFolderId: 'fOld' });
  });

  it('not connected → opens the OAuth popup first, then continues', async () => {
    get
      .mockResolvedValueOnce({ data: [] }) // first listAccounts → none
      .mockResolvedValueOnce({ data: [ACCOUNT] }); // after popup connect
    connectPopup.mockResolvedValue(true);
    pickFolder.mockResolvedValue({ id: 'f1', name: 'Acme' });
    saveApi.mockResolvedValue(SAVE_RESULT);
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });

    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope({ gdriveExport: { connected: false } }));
    });
    expect(connectPopup).toHaveBeenCalledTimes(1);
    expect(saveApi).toHaveBeenCalled();
    expect(outcome).toEqual({ kind: 'saved', result: SAVE_RESULT });
  });

  it('not connected + popup canceled → returns "connect-needed" without saving', async () => {
    get.mockResolvedValue({ data: [] });
    connectPopup.mockResolvedValue(false);
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope({ gdriveExport: { connected: false } }));
    });
    expect(outcome).toEqual({ kind: 'connect-needed' });
    expect(saveApi).not.toHaveBeenCalled();
  });

  it('folder picker dismissed → returns "canceled" without saving', async () => {
    pickFolder.mockResolvedValue(null);
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope());
    });
    expect(outcome).toEqual({ kind: 'canceled' });
    expect(saveApi).not.toHaveBeenCalled();
  });

  it('maps the API error code → outcome (token-expired → reconnect-needed)', async () => {
    pickFolder.mockResolvedValue({ id: 'f1', name: 'Acme' });
    const err: ApiError = Object.assign(new Error('reconnect_required'), {
      status: 409,
      code: 'token-expired',
    });
    saveApi.mockRejectedValue(err);
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope());
    });
    expect(outcome).toEqual({ kind: 'reconnect-needed' });
  });

  it('maps rate-limited with retryAfter', async () => {
    pickFolder.mockResolvedValue({ id: 'f1', name: 'Acme' });
    const err: ApiError = Object.assign(new Error('gdrive_rate_limited'), {
      status: 429,
      code: 'rate-limited',
      retryAfter: 12,
    });
    saveApi.mockRejectedValue(err);
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope());
    });
    expect(outcome).toEqual({ kind: 'rate-limited', retryAfterSeconds: 12 });
  });

  it('returns "picker-not-configured" when credentials endpoint 503s', async () => {
    fetchCreds.mockRejectedValue(
      Object.assign(new Error('gdrive_picker_not_configured'), { status: 503 }),
    );
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope());
    });
    expect(outcome).toEqual({ kind: 'picker-not-configured' });
  });

  it('returns "partial" when the save result carries an error', async () => {
    pickFolder.mockResolvedValue({ id: 'f1', name: 'Acme' });
    const partial = {
      ...SAVE_RESULT,
      files: [SAVE_RESULT.files[0]!],
      error: { kind: 'audit' as const, code: 'drive-upstream-error' },
    };
    saveApi.mockResolvedValue(partial);
    const { result } = renderHook(() => useSaveEnvelopeToGdrive(), { wrapper });
    let outcome;
    await act(async () => {
      outcome = await result.current.save(makeEnvelope());
    });
    expect(outcome).toEqual({ kind: 'partial', result: partial });
  });
});
