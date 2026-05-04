import type { JSX } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import * as flagsModule from 'shared';
import { renderWithProviders } from '../../test/renderWithProviders';
import { setTemplates } from '../../features/templates';
import { SAMPLE_TEMPLATES as TEMPLATES } from '../../test/templateFixtures';

const connectMutateMock = vi.fn();
vi.mock('../../routes/settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: vi.fn(),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: () => ({ mutate: connectMutateMock }),
  useDisconnectGDrive: vi.fn(),
  useGDriveOAuthMessageListener: vi.fn(),
}));

import * as gdriveAccountsHook from '../../routes/settings/integrations/useGDriveAccounts';

vi.mock('../../components/drive-picker', () => ({
  DrivePicker: (props: { open: boolean }): JSX.Element | null => {
    if (!props.open) return null;
    return <div data-testid="drive-picker-stub" />;
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

/**
 * Layout-parity test (parent: fix/web-templates-upload-layout-parity).
 *
 * The Sign flow's UploadPage hosts the "Pick from Google Drive" /
 * "Connect Google Drive" CTA INSIDE the dropzone, alongside the
 * "Start from a template" link, in the secondary-actions row
 * (TemplatePromptDivider). Pre-fix the Templates flow showed the
 * Drive CTA as a wide standalone card BELOW the dropzone — visually
 * inconsistent and treating Drive as a heavier affordance than
 * the primary "Choose file" button.
 *
 * Both surfaces (the wizard-`new` mode upload screen and the
 * `using` mode "Upload a new one" branch) must place the Drive CTA
 * INSIDE the same accessible region as the dropzone.
 */
describe('UseTemplatePage layout parity with Sign flow', () => {
  let isFeatureEnabledSpy: ReturnType<typeof vi.spyOn>;
  const useGDriveAccountsMock = vi.mocked(gdriveAccountsHook.useGDriveAccounts);

  beforeEach(() => {
    setTemplates(TEMPLATES);
    isFeatureEnabledSpy = vi.spyOn(flagsModule, 'isFeatureEnabled');
    useGDriveAccountsMock.mockReset();
    isFeatureEnabledSpy.mockReturnValue(true);
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

  it('new-template upload screen renders the "Upload an example document" hero copy', () => {
    mockAccounts(true);
    renderAt('/templates/new/use');
    expect(
      screen.getByRole('heading', { level: 1, name: /upload an example document/i }),
    ).toBeInTheDocument();
    expect(screen.getByText(/representative copy works best/i)).toBeInTheDocument();
    expect(screen.getByText(/drop a sample pdf/i)).toBeInTheDocument();
    expect(screen.getByText(/up to 25 mb/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /choose file/i })).toBeInTheDocument();
  });

  it('new-template upload screen places "Pick from Google Drive" INSIDE the dropzone region', () => {
    mockAccounts(true);
    renderAt('/templates/new/use');
    const region = screen.getByRole('region', { name: /upload a pdf/i });
    const driveCta = within(region).getByRole('button', {
      name: /pick from google drive/i,
    });
    expect(driveCta).toBeInTheDocument();
    // The CTA must NOT be a wide standalone card sibling of the dropzone:
    // the only Drive button on the page should be the inline one.
    const allDriveButtons = screen.getAllByRole('button', {
      name: /pick from google drive/i,
    });
    expect(allDriveButtons).toHaveLength(1);
  });

  it('new-template upload screen places "Connect Google Drive" INSIDE the dropzone region when no account', () => {
    mockAccounts(false);
    renderAt('/templates/new/use');
    const region = screen.getByRole('region', { name: /upload a pdf/i });
    const connectCta = within(region).getByRole('button', {
      name: /connect google drive/i,
    });
    expect(connectCta).toBeInTheDocument();
    expect(connectCta).toBeEnabled();
    fireEvent.click(connectCta);
    expect(connectMutateMock).toHaveBeenCalledTimes(1);
  });

  it('using-template "Upload a new one" branch places "Pick from Google Drive" INSIDE the dropzone region', () => {
    mockAccounts(true);
    renderAt(`/templates/${encodeURIComponent(SAMPLE.id)}/use`);
    fireEvent.click(screen.getByRole('radio', { name: /upload a new one/i }));
    const region = screen.getByRole('region', { name: /upload a pdf/i });
    const driveCta = within(region).getByRole('button', {
      name: /pick from google drive/i,
    });
    expect(driveCta).toBeInTheDocument();
    const allDriveButtons = screen.getAllByRole('button', {
      name: /pick from google drive/i,
    });
    expect(allDriveButtons).toHaveLength(1);
  });
});
