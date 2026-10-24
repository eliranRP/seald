import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { renderWithProviders } from '../test/renderWithProviders';
import { NewTemplateRoute } from './NewTemplateRoute';

const connect = vi.hoisted(() => vi.fn());

vi.mock('./settings/integrations/useGDriveAccounts', () => ({
  useGDriveAccounts: () => ({ data: [], isLoading: false, isError: false }),
  GDRIVE_ACCOUNTS_KEY: ['integrations', 'gdrive', 'accounts'],
  useConnectGDrive: () => ({ mutate: connect }),
  useReconnectGDrive: () => ({ mutate: vi.fn() }),
  useDisconnectGDrive: vi.fn(),
  useGDriveOAuthMessageListener: vi.fn(),
}));

function Probe() {
  const loc = useLocation();
  const state = loc.state as { pendingFile?: File; templateRename?: string } | null;
  return (
    <output aria-label="location">
      {loc.pathname}|{state?.pendingFile?.name ?? ''}|{state?.templateRename ?? ''}
    </output>
  );
}

function renderRoute() {
  return renderWithProviders(
    <MemoryRouter initialEntries={['/templates/new']}>
      <Routes>
        <Route path="/templates/new" element={<NewTemplateRoute />} />
        <Route path="*" element={<Probe />} />
      </Routes>
    </MemoryRouter>,
  );
}

type FlagHost = { __SEALD_FEATURE_OVERRIDES__?: Record<string, boolean> };

beforeEach(() => {
  connect.mockClear();
});
afterEach(() => {
  delete (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__;
});

describe('NewTemplateRoute', () => {
  it('asks for a sample document', () => {
    renderRoute();
    expect(screen.getByRole('heading', { name: 'New template' })).toBeInTheDocument();
    expect(screen.getByText('Drop a sample PDF')).toBeInTheDocument();
  });

  it('opens the editor with the file, named after it', () => {
    renderRoute();
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], 'Mutual NDA.pdf', {
      type: 'application/pdf',
    });
    fireEvent.change(screen.getByLabelText(/choose pdf file/i), { target: { files: [pdf] } });
    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/templates/new/edit|Mutual NDA.pdf|Mutual NDA',
    );
  });

  it('shows the reason when a file is not accepted', () => {
    renderRoute();
    const txt = new File(['x'], 'notes.txt', { type: 'text/plain' });
    fireEvent.change(screen.getByLabelText(/choose pdf file/i), { target: { files: [txt] } });
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('goes back to the Templates list', async () => {
    renderRoute();
    await userEvent.click(screen.getByRole('button', { name: 'Templates' }));
    expect(screen.getByLabelText('location')).toHaveTextContent('/templates|');
  });

  it('offers Google Drive when the flag is on', async () => {
    (globalThis as unknown as FlagHost).__SEALD_FEATURE_OVERRIDES__ = { gdriveIntegration: true };
    renderRoute();
    await userEvent.click(screen.getByRole('button', { name: /google drive/i }));
    expect(connect).toHaveBeenCalledTimes(1);
  });
});
