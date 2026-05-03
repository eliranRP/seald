import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ThemeProvider } from 'styled-components';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { seald } from '@/styles/theme';
import { DriveSourceCard } from './DriveSourceCard';

/**
 * RED gate for the Phase 6.A iter-1 round-1 LOCAL bug:
 *
 *   When the gdrive feature flag is on but no Drive account is
 *   connected, `DriveSourceCard` rendered a `<button disabled
 *   title="Connect Google Drive in Settings to use this." />`. The
 *   `title` attribute is invisible to screen readers on a disabled
 *   button, the button isn't focusable, and there's no clickable path
 *   to `/settings/integrations` — a dead-end CTA.
 *
 * Post-fix: the not-connected branch renders an enabled, navigable
 * affordance whose accessible name says "Connect" and which routes to
 * `/settings/integrations` on activation. See Gherkin spec at
 * `apps/web/e2e/features/gdrive/disabled-cta.feature`.
 */

function renderCard(props: Partial<React.ComponentProps<typeof DriveSourceCard>> = {}) {
  return render(
    <ThemeProvider theme={seald}>
      <MemoryRouter initialEntries={['/document/new']}>
        <Routes>
          <Route
            path="/document/new"
            element={
              <DriveSourceCard
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

describe('DriveSourceCard', () => {
  describe('when connected=false', () => {
    it('renders an enabled button with "Connect" in its accessible name (no disabled+title dead-end)', () => {
      renderCard({ connected: false });
      const cta = screen.getByRole('button', { name: /connect.*settings/i });
      expect(cta).toBeInTheDocument();
      expect(cta).toBeEnabled();
    });

    it('does NOT rely on the native `title` attribute for the connect-in-settings hint', () => {
      renderCard({ connected: false });
      const cta = screen.getByRole('button', { name: /connect.*settings/i });
      // The fix replaces the title-tooltip pattern with a visible label.
      expect(cta.getAttribute('title')).toBeNull();
    });

    it('navigates to /settings/integrations when activated', async () => {
      renderCard({ connected: false });
      const cta = screen.getByRole('button', { name: /connect.*settings/i });
      await userEvent.click(cta);
      expect(await screen.findByText('integrations-page')).toBeInTheDocument();
    });

    it('does NOT call onPickDrive when the user activates the connect CTA', async () => {
      const onPickDrive = vi.fn();
      renderCard({ connected: false, onPickDrive });
      await userEvent.click(screen.getByRole('button', { name: /connect.*settings/i }));
      expect(onPickDrive).not.toHaveBeenCalled();
    });
  });

  describe('when connected=true', () => {
    it('renders the Pick from Google Drive button enabled', () => {
      renderCard({ connected: true });
      const pick = screen.getByRole('button', { name: /pick from google drive/i });
      expect(pick).toBeEnabled();
    });

    it('calls onPickDrive when clicked', async () => {
      const onPickDrive = vi.fn();
      renderCard({ connected: true, onPickDrive });
      await userEvent.click(screen.getByRole('button', { name: /pick from google drive/i }));
      expect(onPickDrive).toHaveBeenCalledTimes(1);
    });
  });
});
