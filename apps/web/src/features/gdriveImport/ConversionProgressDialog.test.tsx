import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ThemeProvider } from 'styled-components';
import { seald } from '@/styles/theme';
import { ConversionProgressDialog } from './ConversionProgressDialog';

function renderDialog(props: Partial<React.ComponentProps<typeof ConversionProgressDialog>> = {}) {
  return render(
    <ThemeProvider theme={seald}>
      <ConversionProgressDialog
        open
        fileName="Notes"
        onCancel={props.onCancel ?? vi.fn()}
        {...props}
      />
    </ThemeProvider>,
  );
}

describe('ConversionProgressDialog', () => {
  it('renders an indeterminate progress bar (no fake percentage)', () => {
    renderDialog();
    const progress = screen.getByRole('progressbar');
    // ARIA: no aria-valuenow → indeterminate.
    expect(progress.getAttribute('aria-valuenow')).toBeNull();
    expect(progress.getAttribute('aria-valuemin')).toBeNull();
    expect(progress.getAttribute('aria-valuemax')).toBeNull();
  });

  it('shows the file name', () => {
    renderDialog({ fileName: 'Acme NDA.docx' });
    expect(screen.getByText(/Acme NDA\.docx/)).toBeInTheDocument();
  });

  it('Cancel button calls onCancel', () => {
    const onCancel = vi.fn();
    renderDialog({ onCancel });
    fireEvent.click(screen.getByRole('button', { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('returns null when not open', () => {
    const { container } = renderDialog({ open: false });
    expect(container.firstChild).toBeNull();
  });
});
