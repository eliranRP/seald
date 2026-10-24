import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent } from '@testing-library/react';
import { axe } from 'vitest-axe';
import { Link } from 'lucide-react';
import { renderWithTheme } from '@/test/renderWithTheme';
import { Toast } from './Toast';

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('announces success politely with title and subtitle', () => {
    const { getByRole } = renderWithTheme(
      <Toast title="Template saved" subtitle="Reuse it any time." />,
    );
    const toast = getByRole('status');
    expect(toast).toHaveTextContent('Template saved');
    expect(toast).toHaveTextContent('Reuse it any time.');
    expect(toast).toHaveAttribute('aria-live', 'polite');
  });

  it('announces errors assertively', () => {
    const { getByRole } = renderWithTheme(<Toast tone="error" title="Upload failed" />);
    expect(getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  });

  it('renders the action and dismiss buttons', () => {
    const onUndo = vi.fn();
    const onClose = vi.fn();
    const { getByRole } = renderWithTheme(
      <Toast
        title="Sent to 3 signers"
        action={{ label: 'Undo', onClick: onUndo }}
        onClose={onClose}
      />,
    );
    fireEvent.click(getByRole('button', { name: 'Undo' }));
    fireEvent.click(getByRole('button', { name: 'Dismiss' }));
    expect(onUndo).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('auto-dismisses after duration and pauses while hovered', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    const { getByRole } = renderWithTheme(
      <Toast title="Link copied" icon={Link} duration={4000} onClose={onClose} />,
    );
    const toast = getByRole('status');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    fireEvent.mouseEnter(toast);
    act(() => {
      vi.advanceTimersByTime(10000);
    });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseLeave(toast);
    act(() => {
      vi.advanceTimersByTime(4000);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('stays without a duration', () => {
    vi.useFakeTimers();
    const onClose = vi.fn();
    renderWithTheme(<Toast title="Sticky" onClose={onClose} />);
    act(() => {
      vi.advanceTimersByTime(60000);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it('hides the glyph when icon is null', () => {
    const { getByRole } = renderWithTheme(<Toast title="Plain" icon={null} placement="inline" />);
    expect(getByRole('status').querySelector('svg')).toBeNull();
  });

  it('has no axe violations', async () => {
    const { container } = renderWithTheme(
      <Toast
        title="Sent"
        action={{ label: 'Undo', onClick: () => undefined }}
        onClose={() => undefined}
        placement="inline"
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
