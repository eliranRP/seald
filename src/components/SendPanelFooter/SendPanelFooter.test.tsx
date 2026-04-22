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
});
