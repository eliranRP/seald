import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { seald } from '@/styles/theme';

vi.mock('./pickerCredentialsApi', () => ({
  fetchPickerCredentials: vi.fn(),
}));

vi.mock('./useGoogleApi', () => ({
  useGoogleApi: vi.fn(),
}));

// eslint-disable-next-line import/first
import { fetchPickerCredentials } from './pickerCredentialsApi';
// eslint-disable-next-line import/first
import { useGoogleApi } from './useGoogleApi';
// eslint-disable-next-line import/first
import { DrivePicker } from './DrivePicker';
// eslint-disable-next-line import/first
import type { PickerCallbackData } from './google-picker-types';

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';

const fetchMock = fetchPickerCredentials as unknown as ReturnType<typeof vi.fn>;
const useGoogleApiMock = useGoogleApi as unknown as ReturnType<typeof vi.fn>;

interface PickerSpyState {
  readonly setOAuthToken: ReturnType<typeof vi.fn>;
  readonly setDeveloperKey: ReturnType<typeof vi.fn>;
  readonly setAppId: ReturnType<typeof vi.fn>;
  readonly addView: ReturnType<typeof vi.fn>;
  readonly setCallback: ReturnType<typeof vi.fn>;
  readonly build: ReturnType<typeof vi.fn>;
  readonly setVisible: ReturnType<typeof vi.fn>;
  readonly setMimeTypes: ReturnType<typeof vi.fn>;
  readonly docsViewCtor: ReturnType<typeof vi.fn>;
  readonly pickerBuilderCtor: ReturnType<typeof vi.fn>;
  triggerCallback: (data: PickerCallbackData) => void;
}

let pickerSpy: PickerSpyState;

function installGooglePickerStub(): PickerSpyState {
  let registered: ((data: PickerCallbackData) => void) | null = null;
  const setVisible = vi.fn();
  const docsViewBuilder: { setMimeTypes: ReturnType<typeof vi.fn> } = {
    setMimeTypes: vi.fn(),
  };
  docsViewBuilder.setMimeTypes.mockReturnValue(docsViewBuilder);
  const setMimeTypes = docsViewBuilder.setMimeTypes;

  function DocsViewCtorImpl(this: unknown): unknown {
    return docsViewBuilder;
  }
  const docsViewCtor = vi.fn(DocsViewCtorImpl as () => unknown);

  const builder = {
    setOAuthToken: vi.fn(),
    setDeveloperKey: vi.fn(),
    setAppId: vi.fn(),
    addView: vi.fn(),
    setCallback: vi.fn(function setCallbackImpl(cb: (data: PickerCallbackData) => void) {
      registered = cb;
      return builder;
    }),
    build: vi.fn().mockReturnValue({ setVisible }),
  };
  builder.setOAuthToken.mockReturnValue(builder);
  builder.setDeveloperKey.mockReturnValue(builder);
  builder.setAppId.mockReturnValue(builder);
  builder.addView.mockReturnValue(builder);

  function PickerBuilderCtorImpl(this: unknown): unknown {
    return builder;
  }
  const pickerBuilderCtor = vi.fn(PickerBuilderCtorImpl as () => unknown);

  (window as unknown as { google: unknown }).google = {
    picker: {
      PickerBuilder: pickerBuilderCtor,
      DocsView: docsViewCtor,
      ViewId: { DOCS: 'DOCS' },
      Action: { PICKED: 'picked', CANCEL: 'cancel', LOADED: 'loaded' },
    },
  };

  return {
    setOAuthToken: builder.setOAuthToken,
    setDeveloperKey: builder.setDeveloperKey,
    setAppId: builder.setAppId,
    addView: builder.addView,
    setCallback: builder.setCallback,
    build: builder.build,
    setVisible,
    setMimeTypes,
    docsViewCtor,
    pickerBuilderCtor,
    triggerCallback: (data) => {
      if (!registered) throw new Error('callback not registered yet');
      registered(data);
    },
  };
}

interface RenderOptions {
  readonly open?: boolean;
  readonly mimeFilter?: 'pdf' | 'doc' | 'docx' | 'all';
  readonly accountId?: string;
}

function renderPicker(opts: RenderOptions = {}) {
  const onClose = vi.fn();
  const onPick = vi.fn();
  const onReconnect = vi.fn();
  function Wrapper({ children }: { readonly children: ReactNode }) {
    return <ThemeProvider theme={seald}>{children}</ThemeProvider>;
  }
  const utils = render(
    <DrivePicker
      open={opts.open ?? true}
      onClose={onClose}
      onPick={onPick}
      accountId={opts.accountId ?? ACCOUNT_ID}
      mimeFilter={opts.mimeFilter ?? 'pdf'}
      onReconnect={onReconnect}
    />,
    { wrapper: Wrapper },
  );
  return { ...utils, onClose, onPick, onReconnect };
}

beforeEach(() => {
  fetchMock.mockReset();
  useGoogleApiMock.mockReset();
  // Default: ready, no error.
  useGoogleApiMock.mockReturnValue({ ready: true, error: null, retry: vi.fn() });
  pickerSpy = installGooglePickerStub();
});

afterEach(() => {
  delete (window as unknown as { google?: unknown }).google;
});

describe('DrivePicker — closed', () => {
  it('renders nothing when open=false and does not fetch credentials', () => {
    fetchMock.mockResolvedValue({ accessToken: 'x', developerKey: 'y', appId: 'z' });
    renderPicker({ open: false });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('DrivePicker — happy path', () => {
  it('fetches credentials and constructs the Google picker on open', async () => {
    fetchMock.mockResolvedValue({
      accessToken: 'at-fresh',
      developerKey: 'dev-key',
      appId: 'app-id',
    });
    renderPicker({ accountId: 'owned-acct', mimeFilter: 'pdf' });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('owned-acct'));
    await waitFor(() => expect(pickerSpy.pickerBuilderCtor).toHaveBeenCalledTimes(1));
    expect(pickerSpy.setOAuthToken).toHaveBeenCalledWith('at-fresh');
    expect(pickerSpy.setDeveloperKey).toHaveBeenCalledWith('dev-key');
    expect(pickerSpy.setAppId).toHaveBeenCalledWith('app-id');
    expect(pickerSpy.setVisible).toHaveBeenCalledWith(true);
  });

  it('mimeFilter="pdf" configures a single application/pdf view', async () => {
    fetchMock.mockResolvedValue({ accessToken: 'a', developerKey: 'b', appId: 'c' });
    renderPicker({ mimeFilter: 'pdf' });
    await waitFor(() => expect(pickerSpy.setVisible).toHaveBeenCalled());
    const mimeCalls = pickerSpy.setMimeTypes.mock.calls.map((c: unknown[]) => c[0]);
    expect(mimeCalls).toEqual(['application/pdf']);
  });

  it('mimeFilter="all" configures pdf + gdoc + docx views', async () => {
    fetchMock.mockResolvedValue({ accessToken: 'a', developerKey: 'b', appId: 'c' });
    renderPicker({ mimeFilter: 'all' });
    await waitFor(() => expect(pickerSpy.setVisible).toHaveBeenCalled());
    const mimeCalls = pickerSpy.setMimeTypes.mock.calls.map((c: unknown[]) => c[0]);
    expect(mimeCalls).toEqual([
      'application/pdf',
      'application/vnd.google-apps.document',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ]);
  });

  it('callback action="picked" forwards the doc to onPick + closes', async () => {
    fetchMock.mockResolvedValue({ accessToken: 'a', developerKey: 'b', appId: 'c' });
    const { onPick, onClose } = renderPicker();
    await waitFor(() => expect(pickerSpy.setVisible).toHaveBeenCalled());
    pickerSpy.triggerCallback({
      action: 'picked',
      docs: [{ id: 'doc-42', name: 'Acme.pdf', mimeType: 'application/pdf' }],
    });
    expect(onPick).toHaveBeenCalledWith({
      id: 'doc-42',
      name: 'Acme.pdf',
      mimeType: 'application/pdf',
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('callback action="cancel" closes without onPick', async () => {
    fetchMock.mockResolvedValue({ accessToken: 'a', developerKey: 'b', appId: 'c' });
    const { onPick, onClose } = renderPicker();
    await waitFor(() => expect(pickerSpy.setVisible).toHaveBeenCalled());
    pickerSpy.triggerCallback({ action: 'cancel' });
    expect(onPick).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe('DrivePicker — error states', () => {
  it('401 from credentials triggers onReconnect + onClose; picker is NOT built', async () => {
    const err = Object.assign(new Error('reconnect_required'), { status: 401 });
    fetchMock.mockRejectedValue(err);
    const { onReconnect, onClose } = renderPicker();
    await waitFor(() => expect(onReconnect).toHaveBeenCalledTimes(1));
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(pickerSpy.pickerBuilderCtor).not.toHaveBeenCalled();
  });

  it('503 from credentials renders "not configured" notice + Close button', async () => {
    const err = Object.assign(new Error('service_unavailable'), { status: 503 });
    fetchMock.mockRejectedValue(err);
    const { onClose } = renderPicker();
    expect(
      await screen.findByRole('heading', { name: /drive picker is not configured/i }),
    ).toBeInTheDocument();
    expect(pickerSpy.pickerBuilderCtor).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('gapi load failure renders Retry button that re-attempts the load', async () => {
    fetchMock.mockResolvedValue({ accessToken: 'a', developerKey: 'b', appId: 'c' });
    const retry = vi.fn();
    useGoogleApiMock.mockReturnValue({ ready: false, error: new Error('load failed'), retry });
    renderPicker();
    const retryBtn = await screen.findByRole('button', { name: /retry/i });
    await userEvent.click(retryBtn);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('while loading, renders an aria-live="polite" status indicator', () => {
    fetchMock.mockResolvedValue({ accessToken: 'a', developerKey: 'b', appId: 'c' });
    useGoogleApiMock.mockReturnValue({ ready: false, error: null, retry: vi.fn() });
    renderPicker();
    const status = screen.getByRole('status');
    expect(status).toHaveAttribute('aria-live', 'polite');
  });
});
