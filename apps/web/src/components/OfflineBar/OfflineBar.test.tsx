import { act, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { OfflineBar } from './OfflineBar';

describe('OfflineBar', () => {
  it('renders nothing when idle', () => {
    renderWithTheme(<OfflineBar phase="idle" />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('says the user is offline', () => {
    renderWithTheme(<OfflineBar phase="offline" />);
    expect(screen.getByRole('status')).toHaveTextContent("You're offline · changes will sync");
  });

  it('says it is reconnecting', () => {
    renderWithTheme(<OfflineBar phase="reconnecting" />);
    expect(screen.getByRole('status')).toHaveTextContent('Reconnecting');
  });

  it('says back online', () => {
    renderWithTheme(<OfflineBar phase="back" />);
    expect(screen.getByRole('status')).toHaveTextContent('Back online');
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(<OfflineBar phase="offline" />);
    expect(await axe(container)).toHaveNoViolations();
  });

  describe('following the browser', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
    });
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('appears on the offline event and walks back to online', async () => {
      renderWithTheme(<OfflineBar />);
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
      act(() => {
        window.dispatchEvent(new Event('offline'));
      });
      expect(screen.getByRole('status')).toHaveTextContent(/offline/i);
      act(() => {
        window.dispatchEvent(new Event('online'));
      });
      expect(await screen.findByText('Back online')).toBeInTheDocument();
    });
  });
});
