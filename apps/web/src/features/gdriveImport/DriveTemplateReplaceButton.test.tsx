import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { seald } from '@/styles/theme';
import { DriveTemplateReplaceButton } from './DriveTemplateReplaceButton';

/**
 * RED gate for the same Phase 6.A iter-1 LOCAL bug as
 * `DriveSourceCard.test.tsx`, but for the `/templates/:id/use`
 * Step 1 "Upload a new one" surface. Same a11y failure pattern, same
 * post-fix contract (visible "Connect Drive in Settings" label that
 * navigates to `/settings/integrations`). See Gherkin spec at
 * `apps/web/e2e/features/gdrive/disabled-cta.feature`.
 */

function renderButton(
  props: Partial<React.ComponentProps<typeof DriveTemplateReplaceButton>> = {},
) {
  return render(
    <ThemeProvider theme={seald}>
      <MemoryRouter initialEntries={['/templates/x/use']}>
        <Routes>
          <Route
            path="/templates/x/use"
            element={
              <DriveTemplateReplaceButton
                connected={props.connected ?? false}
                onPickDrive={props.onPickDrive ?? vi.fn()}
              />
            }
          />
          <Route path="/settings/integrations" element={<div>integrations-page</div>} />
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  );
}

describe('DriveTemplateReplaceButton', () => {
  describe('when connected=false', () => {
    it('renders an enabled button with "Connect" in its accessible name', () => {
      renderButton({ connected: false });
      const cta = screen.getByRole('button', { name: /connect.*settings/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toBeEnabled();
    });

    it('does NOT rely on the native `title` attribute for the connect-in-settings hint', () => {
      renderButton({ connected: false });
      const cta = screen.getByRole('button', { name: /connect.*settings/i });
      expect(cta.getAttribute('title')).toBeNull();
    });

    it('navigates to /settings/integrations when activated', async () => {
      renderButton({ connected: false });
      await userEvent.click(screen.getByRole('button', { name: /connect.*settings/i }));
      expect(await screen.findByText('integrations-page')).toBeInTheDocument();
    });

    it('does NOT call onPickDrive when the user activates the connect CTA', async () => {
      const onPickDrive = vi.fn();
      renderButton({ connected: false, onPickDrive });
      await userEvent.click(screen.getByRole('button', { name: /connect.*settings/i }));
      expect(onPickDrive).not.toHaveBeenCalled();
    });
  });

  describe('when connected=true', () => {
    it('renders the Pick from Google Drive button enabled', () => {
      renderButton({ connected: true });
      const pick = screen.getByRole('button', { name: /pick from google drive/i });
      expect(pick).toBeEnabled();
    });

    it('calls onPickDrive when clicked', async () => {
      const onPickDrive = vi.fn();
      renderButton({ connected: true, onPickDrive });
      await userEvent.click(screen.getByRole('button', { name: /pick from google drive/i }));
      expect(onPickDrive).toHaveBeenCalledTimes(1);
    });
  });
});
