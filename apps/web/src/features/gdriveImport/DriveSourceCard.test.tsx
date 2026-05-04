import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import { seald } from '@/styles/theme';
import { DriveSourceCard } from './DriveSourceCard';

/**
 * Discoverability + flow-continuity contract for the New Document
 * (Sign) flow's "From Google Drive" source card.
 *
 *   - connected=true  -> "Pick from Google Drive" calls `onPickDrive`.
 *   - connected=false -> "Connect Google Drive" calls `onConnect`.
 *
 * Pre-fix the disconnected branch said "Connect Drive in Settings" and
 * navigated to `/settings/integrations`, which broke the user out of
 * the upload flow. The OAuth-popup bridge (BroadcastChannel — Bug I)
 * already lets us open the consent flow inline, so the card now just
 * calls a caller-supplied `onConnect`. The caller (UploadRoute) wires
 * that to `useConnectGDrive().mutate()` and the AppShell-mounted
 * message listener flips the accounts query to "connected" the moment
 * the popup posts back — the card auto-flips to its connected state.
 */
function renderCard(props: Partial<React.ComponentProps<typeof DriveSourceCard>> = {}) {
  return render(
    <ThemeProvider theme={seald}>
      <MemoryRouter>
        <DriveSourceCard
          connected={props.connected ?? false}
          onPickDrive={props.onPickDrive ?? vi.fn()}
          onConnect={props.onConnect ?? vi.fn()}
        />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('DriveSourceCard', () => {
  describe('when connected=false', () => {
    it('renders an enabled "Connect Google Drive" button (no disabled+title dead-end)', () => {
      renderCard({ connected: false });
      const cta = screen.getByRole('button', { name: /connect google drive/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toBeEnabled();
    });

    it('does NOT rely on the native `title` attribute for the connect hint', () => {
      renderCard({ connected: false });
      const cta = screen.getByRole('button', { name: /connect google drive/i });
      expect(cta.getAttribute('title')).toBeNull();
    });

    it('calls onConnect (not onPickDrive) when activated — connect happens inline, no navigation', async () => {
      const onConnect = vi.fn();
      const onPickDrive = vi.fn();
      renderCard({ connected: false, onConnect, onPickDrive });
      const cta = screen.getByRole('button', { name: /connect google drive/i });
      await userEvent.click(cta);
      expect(onConnect).toHaveBeenCalledTimes(1);
      expect(onPickDrive).not.toHaveBeenCalled();
    });
  });

  describe('when connected=true', () => {
    it('renders the Pick from Google Drive button enabled', () => {
      renderCard({ connected: true });
      const pick = screen.getByRole('button', { name: /pick from google drive/i });
      expect(pick).toBeEnabled();
    });

    it('calls onPickDrive (not onConnect) when clicked', async () => {
      const onPickDrive = vi.fn();
      const onConnect = vi.fn();
      renderCard({ connected: true, onPickDrive, onConnect });
      await userEvent.click(screen.getByRole('button', { name: /pick from google drive/i }));
      expect(onPickDrive).toHaveBeenCalledTimes(1);
      expect(onConnect).not.toHaveBeenCalled();
    });
  });
});
