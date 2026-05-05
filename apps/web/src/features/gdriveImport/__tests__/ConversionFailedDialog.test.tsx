import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { seald } from '@/styles/theme';
import { ConversionFailedDialog, MESSAGES } from '../ConversionFailedDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConversionFailedDialog>> = {}) {
  return render(
    <ThemeProvider theme={seald}>
      <ConversionFailedDialog
        open
        errorCode="conversion-failed"
        onRetry={props.onRetry ?? vi.fn()}
        onClose={props.onClose ?? vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe('ConversionFailedDialog', () => {
  it('shows the message for the named error code', () => {
    renderDialog({ errorCode: 'unsupported-mime' });
    expect(screen.getByText(MESSAGES['unsupported-mime'])).toBeInTheDocument();
  });

  it('renders Try again button that calls onRetry', () => {
    const onRetry = vi.fn();
    renderDialog({ onRetry });
    fireEvent.click(screen.getByRole('button', { name: /try again/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders Close button that calls onClose', () => {
    const onClose = vi.fn();
    renderDialog({ onClose });
    fireEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it.each([
    'unsupported-mime',
    'file-too-large',
    'token-expired',
    'oauth-declined',
    'conversion-failed',
    'rate-limited',
  ] as const)('has a copy entry for %s', (code) => {
    expect(MESSAGES[code as keyof typeof MESSAGES]).toBeTruthy();
  });

  it('returns null when not open', () => {
    const { container } = renderDialog({ open: false });
    expect(container.firstChild).toBeNull();
  });
});
