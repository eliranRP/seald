import { describe, it, expect, vi } from 'vitest';
import userEvent from '@testing-library/user-event';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SendingOverlay } from './SendingOverlay';
import type { SendingOverlaySigner } from './SendingOverlay.types';

const SIGNERS: ReadonlyArray<SendingOverlaySigner> = [
  { id: 'sgn-1', name: 'Ada Lovelace', email: 'ada@example.com' },
  { id: 'sgn-2', name: 'Linus Torvalds', email: 'linus@example.com' },
];

function defaultProps(
  overrides: Record<string, unknown> = {},
): React.ComponentProps<typeof SendingOverlay> {
  return {
    open: true,
    phase: 'creating',
    error: null,
    signers: SIGNERS,
    fieldCount: 3,
    envelopeCode: 'DOC-8F3A',
    onCancel: () => {},
    onViewEnvelope: () => {},
    onRetry: () => {},
    ...overrides,
  } as React.ComponentProps<typeof SendingOverlay>;
}

describe('SendingOverlay', () => {
  it('renders nothing when open is false', () => {
    const { container } = renderWithTheme(<SendingOverlay {...defaultProps({ open: false })} />);
    expect(container.firstChild).toBeNull();
  });

  it('exposes the modal as role=dialog with aria-modal and aria-live', () => {
    const { getByRole } = renderWithTheme(<SendingOverlay {...defaultProps()} />);
    const dialog = getByRole('dialog');
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog).toHaveAttribute('aria-live', 'polite');
  });

  it("shows the 'Sealing your envelope' kicker while in flight", () => {
    const { getByText } = renderWithTheme(
      <SendingOverlay {...defaultProps({ phase: 'creating' })} />,
    );
    expect(getByText('Sealing your envelope')).toBeInTheDocument();
  });

  it("shows the 'Delivered' kicker and 100% on phase=done", () => {
    const { getByText } = renderWithTheme(<SendingOverlay {...defaultProps({ phase: 'done' })} />);
    expect(getByText('Delivered')).toBeInTheDocument();
    expect(getByText('100%')).toBeInTheDocument();
  });

  it('shows an alert role with the error message and a "Try again" button on phase=error', () => {
    const onRetry = vi.fn();
    const { getByRole } = renderWithTheme(
      <SendingOverlay
        {...defaultProps({ phase: 'error', error: 'upload_failed: 413', onRetry })}
      />,
    );
    expect(getByRole('alert')).toHaveTextContent('upload_failed: 413');
    expect(getByRole('button', { name: 'Try again' })).toBeInTheDocument();
  });

  it('clicking Try again on error invokes onRetry', async () => {
    const onRetry = vi.fn();
    const { getByRole } = renderWithTheme(
      <SendingOverlay {...defaultProps({ phase: 'error', error: 'boom', onRetry })} />,
    );
    await userEvent.click(getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('clicking Cancel while in flight invokes onCancel', async () => {
    const onCancel = vi.fn();
    const { getByRole } = renderWithTheme(
      <SendingOverlay {...defaultProps({ phase: 'uploading', onCancel })} />,
    );
    await userEvent.click(getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('clicking View envelope after success invokes onViewEnvelope', async () => {
    const onViewEnvelope = vi.fn();
    const { getByRole } = renderWithTheme(
      <SendingOverlay {...defaultProps({ phase: 'done', onViewEnvelope })} />,
    );
    await userEvent.click(getByRole('button', { name: /View envelope/i }));
    expect(onViewEnvelope).toHaveBeenCalledTimes(1);
  });

  it('shows the meta line with envelope code, field count, and signer count', () => {
    const { getByText } = renderWithTheme(
      <SendingOverlay
        {...defaultProps({ phase: 'creating', envelopeCode: 'DOC-8F3A', fieldCount: 1 })}
      />,
    );
    // Single field + 2 signers => "1 field · 2 signers"
    expect(getByText(/DOC-8F3A · 1 field · 2 signers/)).toBeInTheDocument();
  });

  it('the overall progress percentage advances as the phase advances', () => {
    const { getByText, rerender } = renderWithTheme(
      <SendingOverlay {...defaultProps({ phase: 'creating' })} />,
    );
    // creating is index 0 of 5 -> 0%
    expect(getByText('0%')).toBeInTheDocument();

    rerender(<SendingOverlay {...defaultProps({ phase: 'adding-signers' })} />);
    // index 2 / 5 -> 40%
    expect(getByText('40%')).toBeInTheDocument();

    rerender(<SendingOverlay {...defaultProps({ phase: 'sending' })} />);
    // index 4 / 5 -> 80%
    expect(getByText('80%')).toBeInTheDocument();
  });
});
