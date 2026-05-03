import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setTemplates } from '../../features/templates';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';
import * as flagsModule from 'shared';

vi.mock('../../routes/settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: vi.fn(),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: vi.fn(),
  useDisconnectGDrive: vi.fn(),
}));

import * as gdriveAccountsHook from '../../routes/settings/integrations/useGDriveAccounts';

vi.mock('../../components/drive-picker', () => ({
  DrivePicker: (props: {
    open: boolean;
    onClose: () => void;
    onPick: (file: { id: string; name: string; mimeType: string }) => void;
  }): JSX.Element | null => {
    if (!props.open) return null;
    return (
      <div data-testid="drive-picker-stub">
        <button type="button" onClick={props.onClose}>
          Close stub picker
        </button>
      </div>
    );
  },
  PICKER_HEIGHT_PX: 600,
  PICKER_WIDTH_PX: 760,
}));

import { UseTemplatePage } from './UseTemplatePage';

const SAMPLE = TEMPLATES[0]!;

function renderAt(path: string) {
  return renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/templates/:id/use" element={<UseTemplatePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe('UseTemplatePage Drive integration (WT-E)', () => {
  let isFeatureEnabledSpy: ReturnType<typeof vi.spyOn>;
  const useGDriveAccountsMock = vi.mocked(gdriveAccountsHook.useGDriveAccounts);

  beforeEach(() => {
    setTemplates(TEMPLATES);
    isFeatureEnabledSpy = vi.spyOn(flagsModule, 'isFeatureEnabled');
    useGDriveAccountsMock.mockReset();
  });
  afterEach(() => {
    setTemplates([]);
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

  function gotoStep1Upload() {
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    // Step 1 starts with the segmented chooser; flip to "Upload a new one"
    // so the replace-with row exposes the Drive button.
    fireEvent.click(screen.getByRole('radio', { name: /upload a new one/i }));
  }

  it('hides the Drive button entirely when feature flag is OFF', () => {
    isFeatureEnabledSpy.mockReturnValue(false);
    mockAccounts(true);
    gotoStep1Upload();
    expect(
      screen.queryByRole('button', { name: /pick from google drive/i }),
    ).not.toBeInTheDocument();
  });

  it('shows the Drive button enabled when flag on AND account connected', () => {
    isFeatureEnabledSpy.mockReturnValue(true);
    mockAccounts(true);
    gotoStep1Upload();
    const cta = screen.getByRole('button', { name: /pick from google drive/i });
    expect(cta).toBeEnabled();
  });

  it('shows an enabled "Connect Drive in Settings" button when no account is connected', () => {
    // Phase 6.A iter-1 LOCAL bug companion (see DriveSourceCard
    // post-fix rationale + the Gherkin spec at
    // `apps/web/e2e/features/gdrive/disabled-cta.feature`). Pre-fix
    // this surface rendered a disabled button with a `title` tooltip
    // — invisible to screen readers, non-focusable, and unreachable
    // on touch. Post-fix it's an enabled button whose label includes
    // "Connect" and which navigates to /settings/integrations.
    isFeatureEnabledSpy.mockReturnValue(true);
    mockAccounts(false);
    gotoStep1Upload();
    const cta = screen.getByRole('button', { name: /connect.*settings/i });
    expect(cta).toBeEnabled();
    expect(cta.getAttribute('title')).toBeNull();
    expect(screen.queryByRole('button', { name: /pick from google drive/i })).toBeNull();
  });

  it('opens the picker when the active CTA is clicked', () => {
    isFeatureEnabledSpy.mockReturnValue(true);
    mockAccounts(true);
    gotoStep1Upload();
    expect(screen.queryByTestId('drive-picker-stub')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /pick from google drive/i }));
    expect(screen.getByTestId('drive-picker-stub')).toBeInTheDocument();
  });
});
