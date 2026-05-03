import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import * as flagsModule from 'shared';

vi.mock('./settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: vi.fn(),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: vi.fn(),
  useDisconnectGDrive: vi.fn(),
}));

import * as gdriveAccountsHook from './settings/integrations/useGDriveAccounts';

vi.mock('../lib/pdf', () => ({
  usePdfDocument: () => ({ doc: null, numPages: 0, loading: false, error: null }),
}));

// Stub the picker so we don't need to drive the full Drive modal here.
vi.mock('../components/drive-picker', () => ({
  DrivePicker: (props: {
    open: boolean;
    onClose: () => void;
    onPick: (file: { id: string; name: string; mimeType: string }) => void;
  }): JSX.Element | null => {
    if (!props.open) return null;
    return (
      <div data-testid="drive-picker-stub">
        <button
          type="button"
          onClick={() =>
            props.onPick({
              id: 'drive-1',
              name: 'Stub.pdf',
              mimeType: 'application/pdf',
            })
          }
        >
          Pick stub file
        </button>
        <button type="button" onClick={props.onClose}>
          Close picker
        </button>
      </div>
    );
  },
  PICKER_HEIGHT_PX: 600,
  PICKER_WIDTH_PX: 760,
}));

import { UploadRoute } from './UploadRoute';

function renderRoute() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/document/new']}>
      <Routes>
        <Route path="/document/new" element={<UploadRoute />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UploadRoute Drive integration (WT-E)', () => {
  let isFeatureEnabledSpy: ReturnType<typeof vi.spyOn>;
  const useGDriveAccountsMock = vi.mocked(gdriveAccountsHook.useGDriveAccounts);

  beforeEach(() => {
    isFeatureEnabledSpy = vi.spyOn(flagsModule, 'isFeatureEnabled');
    useGDriveAccountsMock.mockReset();
  });
  afterEach(() => {
    isFeatureEnabledSpy.mockRestore();
  });

  function mockAccounts(connected: boolean) {
    useGDriveAccountsMock.mockReturnValue({
      data: connected
        ? [{ id: 'acct-1', email: 'jamie@example.com', connectedAt: '', lastUsedAt: null }]
        : [],
      isLoading: false,
      isError: false,
    } as unknown as ReturnType<typeof gdriveAccountsHook.useGDriveAccounts>);
  }

  it('hides the Drive card entirely when feature.gdriveIntegration is OFF', () => {
    isFeatureEnabledSpy.mockReturnValue(false);
    mockAccounts(true);
    renderRoute();
    expect(
      screen.queryByRole('button', { name: /pick from google drive/i }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /connect google drive/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/from google drive/i)).not.toBeInTheDocument();
  });

  it('shows the Drive card with active CTA when flag is on AND an account is connected', () => {
    isFeatureEnabledSpy.mockReturnValue(true);
    mockAccounts(true);
    renderRoute();
    const cta = screen.getByRole('button', { name: /pick from google drive/i });
    expect(cta).toBeEnabled();
  });

  it('shows an enabled "Connect Drive in Settings" CTA when flag is on but no account', () => {
    // Phase 6.A iter-1 LOCAL bug: pre-fix this surface rendered a
    // `<button disabled title="…">` — an a11y dead-end (native title
    // not announced for disabled buttons; not focusable; touch users
    // see nothing). Post-fix the not-connected branch renders an
    // enabled button whose visible label + accessible name include
    // "Connect" and that navigates to /settings/integrations on
    // activation. See `DriveSourceCard.test.tsx` and the Gherkin spec
    // at `apps/web/e2e/features/gdrive/disabled-cta.feature`.
    isFeatureEnabledSpy.mockReturnValue(true);
    mockAccounts(false);
    renderRoute();
    const cta = screen.getByRole('button', { name: /connect.*settings/i });
    expect(cta).toBeEnabled();
    expect(cta.getAttribute('title')).toBeNull();
    // The legacy "Pick from Google Drive" label must be gone in the
    // not-connected state — otherwise the user is misled into
    // expecting the picker to open.
    expect(screen.queryByRole('button', { name: /pick from google drive/i })).toBeNull();
  });

  it('opens the picker when the active CTA is clicked', () => {
    isFeatureEnabledSpy.mockReturnValue(true);
    mockAccounts(true);
    renderRoute();
    expect(screen.queryByTestId('drive-picker-stub')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /pick from google drive/i }));
    expect(screen.getByTestId('drive-picker-stub')).toBeInTheDocument();
  });
});
