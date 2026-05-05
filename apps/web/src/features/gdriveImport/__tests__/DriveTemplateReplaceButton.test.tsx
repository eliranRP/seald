import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter } from 'react-router-dom';
import { seald } from '@/styles/theme';
import { DriveTemplateReplaceButton } from '../DriveTemplateReplaceButton';

/**
 * Flow-continuity contract for the Use Template wizard's Step 1
 * "Upload a new one" replace-with row.
 *
 *   - connected=true  -> "Pick from Google Drive" calls `onPickDrive`.
 *   - connected=false -> "Connect Google Drive" calls `onConnect`.
 *
 * Pre-fix the disconnected branch said "Connect Drive in Settings" and
 * navigated to `/settings/integrations`, breaking the user out of the
 * template flow. Post-fix the caller wires `onConnect` to
 * `useConnectGDrive().mutate()` so the OAuth popup opens inline; the
 * AppShell-mounted message listener flips the accounts query to
 * "connected" without leaving the flow. Mirrors `DriveSourceCard`.
 */
function renderButton(
  props: Partial<React.ComponentProps<typeof DriveTemplateReplaceButton>> = {},
) {
  return render(
    <ThemeProvider theme={seald}>
      <MemoryRouter>
        <DriveTemplateReplaceButton
          connected={props.connected ?? false}
          onPickDrive={props.onPickDrive ?? vi.fn()}
          onConnect={props.onConnect ?? vi.fn()}
        />
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('DriveTemplateReplaceButton', () => {
  describe('when connected=false', () => {
    it('renders an enabled "Connect Google Drive" button', () => {
      renderButton({ connected: false });
      const cta = screen.getByRole('button', { name: /connect google drive/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toBeEnabled();
    });

    it('does NOT rely on the native `title` attribute for the connect hint', () => {
      renderButton({ connected: false });
      const cta = screen.getByRole('button', { name: /connect google drive/i });
      expect(cta.getAttribute('title')).toBeNull();
    });

    it('calls onConnect (not onPickDrive) when activated — connect happens inline, no navigation', async () => {
      const onConnect = vi.fn();
      const onPickDrive = vi.fn();
      renderButton({ connected: false, onConnect, onPickDrive });
      await userEvent.click(screen.getByRole('button', { name: /connect google drive/i }));
      expect(onConnect).toHaveBeenCalledTimes(1);
      expect(onPickDrive).not.toHaveBeenCalled();
    });
  });

  describe('when connected=true', () => {
    it('renders the Pick from Google Drive button enabled', () => {
      renderButton({ connected: true });
      const pick = screen.getByRole('button', { name: /pick from google drive/i });
      expect(pick).toBeEnabled();
    });

    it('calls onPickDrive (not onConnect) when clicked', async () => {
      const onPickDrive = vi.fn();
      const onConnect = vi.fn();
      renderButton({ connected: true, onPickDrive, onConnect });
      await userEvent.click(screen.getByRole('button', { name: /pick from google drive/i }));
      expect(onPickDrive).toHaveBeenCalledTimes(1);
      expect(onConnect).not.toHaveBeenCalled();
    });
  });
});
