import { describe, it, expect, vi } from 'vitest';
import { createRef } from 'react';
import { axe } from 'vitest-axe';
import { renderWithTheme } from '../../test/renderWithTheme';
import { SendPanelFooter } from './SendPanelFooter';

describe('SendPanelFooter', () => {
  it('renders the disabled hint and a disabled CTA when fieldCount=0', () => {
    const { getByRole, getByText } = renderWithTheme(
      <SendPanelFooter fieldCount={0} signerCount={1} onSend={() => {}} />,
    );
    expect(getByText('Place at least one field to enable sending')).toBeDefined();
    const button = getByRole('button', { name: 'Send to Sign' }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
  });

  it('renders singular copy when fieldCount=1', () => {
    const { container } = renderWithTheme(
      <SendPanelFooter fieldCount={1} signerCount={3} onSend={() => {}} />,
    );
    expect(container.textContent).toMatch(/1\s*field\s*·\s*3\s*signers/);
  });

  it('renders plural copy when fieldCount>=2', () => {
    const { container } = renderWithTheme(
      <SendPanelFooter fieldCount={4} signerCount={2} onSend={() => {}} />,
    );
    expect(container.textContent).toMatch(/4\s*fields\s*·\s*2\s*signers/);
  });

  it('renders singular "signer" when signerCount=1', () => {
    const { container } = renderWithTheme(
      <SendPanelFooter fieldCount={2} signerCount={1} onSend={() => {}} />,
    );
    expect(container.textContent).toMatch(/2\s*fields\s*·\s*1\s*signer(?!s)/);
  });

  it('fires onSend when the enabled CTA is clicked', () => {
    const onSend = vi.fn();
    const { getByRole } = renderWithTheme(
      <SendPanelFooter fieldCount={2} signerCount={1} onSend={onSend} />,
    );
    (getByRole('button', { name: 'Send to Sign' }) as HTMLButtonElement).click();
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it('does NOT fire onSend when the disabled CTA is clicked', () => {
    const onSend = vi.fn();
    const { getByRole } = renderWithTheme(
      <SendPanelFooter fieldCount={0} signerCount={1} onSend={onSend} />,
    );
    (getByRole('button', { name: 'Send to Sign' }) as HTMLButtonElement).click();
    expect(onSend).toHaveBeenCalledTimes(0);
  });

  it('fires onSaveDraft when the "Save as draft" button is clicked', () => {
    const onSaveDraft = vi.fn();
    const { getByRole } = renderWithTheme(
      <SendPanelFooter
        fieldCount={1}
        signerCount={1}
        onSend={() => {}}
        onSaveDraft={onSaveDraft}
      />,
    );
    (getByRole('button', { name: 'Save as draft' }) as HTMLButtonElement).click();
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  it('does not render the draft button when onSaveDraft is undefined', () => {
    const { queryByRole } = renderWithTheme(
      <SendPanelFooter fieldCount={1} signerCount={1} onSend={() => {}} />,
    );
    expect(queryByRole('button', { name: 'Save as draft' })).toBeNull();
  });

  it('forwards ref to the root element', () => {
    const ref = createRef<HTMLDivElement>();
    renderWithTheme(<SendPanelFooter ref={ref} fieldCount={0} signerCount={1} onSend={() => {}} />);
    expect(ref.current).toBeInstanceOf(HTMLDivElement);
    expect(ref.current?.getAttribute('role')).toBe('group');
  });

  it('has no axe violations in the enabled state', async () => {
    const { container } = renderWithTheme(
      <SendPanelFooter fieldCount={3} signerCount={2} onSend={() => {}} onSaveDraft={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  it('has no axe violations in the disabled state', async () => {
    const { container } = renderWithTheme(
      <SendPanelFooter fieldCount={0} signerCount={1} onSend={() => {}} />,
    );
    expect(await axe(container)).toHaveNoViolations();
  });

  // Regression: the seald API rejects envelopes that don't carry a
  // signature with `signer_without_signature_field`. The Send CTA
  // must stay disabled (and surface a specific hint) when fields
  // are placed but none are signatures, so the user never reaches
  // that error.
  describe('signature gating (regression)', () => {
    it('disables Send when fields exist but none are signatures', () => {
      const onSend = vi.fn();
      const { getByRole, getByText } = renderWithTheme(
        <SendPanelFooter fieldCount={3} signatureFieldCount={0} signerCount={2} onSend={onSend} />,
      );
      expect(getByText(/place at least one signature field/i)).toBeDefined();
      const button = getByRole('button', { name: 'Send to Sign' }) as HTMLButtonElement;
      expect(button.disabled).toBe(true);
      button.click();
      expect(onSend).toHaveBeenCalledTimes(0);
    });

    it('enables Send once at least one signature field is added', () => {
      const onSend = vi.fn();
      const { getByRole } = renderWithTheme(
        <SendPanelFooter fieldCount={3} signatureFieldCount={1} signerCount={2} onSend={onSend} />,
      );
      const button = getByRole('button', { name: 'Send to Sign' }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
      button.click();
      expect(onSend).toHaveBeenCalledTimes(1);
    });

    it('still disabled with the generic hint when fieldCount=0 (signature gate is a stricter overlay)', () => {
      const { getByRole, getByText } = renderWithTheme(
        <SendPanelFooter
          fieldCount={0}
          signatureFieldCount={0}
          signerCount={2}
          onSend={() => {}}
        />,
      );
      expect(getByText(/place at least one field/i)).toBeDefined();
      expect((getByRole('button', { name: 'Send to Sign' }) as HTMLButtonElement).disabled).toBe(
        true,
      );
    });

    it('preserves legacy behaviour when signatureFieldCount is omitted', () => {
      // Templates flow + any pre-existing host that doesn't opt into
      // the gate must still see the original "≥ 1 field" semantics.
      const onSend = vi.fn();
      const { getByRole } = renderWithTheme(
        <SendPanelFooter fieldCount={1} signerCount={1} onSend={onSend} />,
      );
      const button = getByRole('button', { name: 'Send to Sign' }) as HTMLButtonElement;
      expect(button.disabled).toBe(false);
    });
  });
});
