import { act, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '../test/renderWithProviders';
import {
  publishNotice,
  raiseSessionExpired,
  resetSystemState,
  getSystemState,
} from '../lib/system/systemStore';
import { SystemOverlays } from './SystemOverlays';

afterEach(resetSystemState);

function Where() {
  const loc = useLocation();
  return <div data-testid="where">{`${loc.pathname}${loc.search}`}</div>;
}

function renderAt(path: string, signOut = vi.fn().mockResolvedValue(undefined)) {
  renderWithProviders(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/document/:id" element={<SystemOverlays />} />
        <Route path="/signin" element={<Where />} />
      </Routes>
    </MemoryRouter>,
    { auth: { signOut } },
  );
  return signOut;
}

describe('SystemOverlays', () => {
  it('shows nothing until something happens', () => {
    renderAt('/document/abc');
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('opens the signed-out dialog and returns to the current page after sign-in', async () => {
    const signOut = renderAt('/document/abc?x=1');
    act(() => {
      raiseSessionExpired();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId('where')).toHaveTextContent(
      '/signin?next=%2Fdocument%2Fabc%3Fx%3D1',
    );
    expect(getSystemState().sessionExpired).toBe(false);
  });

  it('does not offer a return to a path the validator would refuse', async () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/m/send']}>
        <Routes>
          <Route path="/m/send" element={<SystemOverlays />} />
          <Route path="/signin" element={<Where />} />
        </Routes>
      </MemoryRouter>,
    );
    act(() => {
      raiseSessionExpired();
    });
    await userEvent.click(screen.getByRole('button', { name: 'Sign in again' }));
    expect(await screen.findByTestId('where')).toHaveTextContent(/^\/signin$/);
  });

  it('does not show the dialog for a guest or signed-out visitor', () => {
    renderWithProviders(
      <MemoryRouter initialEntries={['/document/abc']}>
        <Routes>
          <Route path="/document/:id" element={<SystemOverlays />} />
        </Routes>
      </MemoryRouter>,
      { auth: { user: null, guest: true } },
    );
    act(() => {
      raiseSessionExpired();
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });

  it('shows a queued toast with its action and dismisses on use', async () => {
    renderAt('/document/abc');
    const retry = vi.fn();
    act(() => {
      publishNotice({
        title: 'Upload failed',
        tone: 'error',
        action: { label: 'Retry', onClick: retry },
      });
    });
    expect(screen.getByRole('alert')).toHaveTextContent('Upload failed');
    await userEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(retry).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Upload failed')).not.toBeInTheDocument();
  });
});
