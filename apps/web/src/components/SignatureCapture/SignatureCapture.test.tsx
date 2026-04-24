import { describe, it, expect, vi, beforeEach } from 'vitest';
import userEvent from '@testing-library/user-event';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SignatureCapture } from './SignatureCapture';

beforeEach(() => {
  // jsdom does not implement HTMLCanvasElement.prototype.toBlob; stub it.
  HTMLCanvasElement.prototype.toBlob = function toBlobStub(cb: BlobCallback) {
    cb(new Blob(['fake'], { type: 'image/png' }));
  };
});

describe('SignatureCapture', () => {
  it('renders nothing when closed', () => {
    const { queryByRole } = renderWithTheme(
      <SignatureCapture
        open={false}
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(queryByRole('dialog')).toBeNull();
  });

  it('defaults to type tab; switching tabs updates aria-selected', async () => {
    const { getByRole } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    const typeTab = getByRole('tab', { name: /type/i });
    expect(typeTab).toHaveAttribute('aria-selected', 'true');
    const drawTab = getByRole('tab', { name: /draw/i });
    await userEvent.click(drawTab);
    expect(drawTab).toHaveAttribute('aria-selected', 'true');
  });

  it('type tab: Apply emits a typed SignatureCaptureResult', async () => {
    const onApply = vi.fn();
    const { getByRole } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={onApply}
      />,
    );
    await userEvent.click(getByRole('button', { name: /apply/i }));
    await vi.waitFor(() => expect(onApply).toHaveBeenCalledTimes(1));
    const result = onApply.mock.calls[0]?.[0];
    expect(result.format).toBe('typed');
    expect(result.font).toBe('Caveat');
    expect(result.blob).toBeInstanceOf(Blob);
  });

  it('Apply is disabled when typed name is empty', async () => {
    const { getByRole, getByLabelText } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    const input = getByLabelText(/your full name/i);
    await userEvent.clear(input);
    expect(getByRole('button', { name: /apply/i })).toBeDisabled();
  });

  it('Escape fires onCancel', async () => {
    const onCancel = vi.fn();
    renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={onCancel}
        onApply={() => {}}
      />,
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('Cancel button fires onCancel', async () => {
    const onCancel = vi.fn();
    const { getAllByRole } = renderWithTheme(
      <SignatureCapture
        open
        kind="signature"
        defaultName="Maya Raskin"
        onCancel={onCancel}
        onApply={() => {}}
      />,
    );
    // Two buttons match "cancel" (the X icon close + the footer Cancel).
    // Click the last one (footer).
    const cancels = getAllByRole('button', { name: /^cancel$/i });
    await userEvent.click(cancels[cancels.length - 1]!);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('renders without axe violations', async () => {
    const { container } = renderWithTheme(
      <SignatureCapture
        open
        kind="initials"
        defaultName="Maya Raskin"
        onCancel={() => {}}
        onApply={() => {}}
      />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });
});
